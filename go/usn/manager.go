package usn

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/sys/windows"
)

// volumeCtx holds per-volume subscription state.
type volumeCtx struct {
	h         windows.Handle
	journalID uint64
	nextUsn   int64
	roots     []string // monitored root dirs on this volume (e.g. "D:/Work")
	stopCh    chan struct{}
}

// VolumeManager manages USN subscriptions across multiple volumes.
type VolumeManager struct {
	volumes   map[string]*volumeCtx // key: "D:/"
	roots     []string
	rootsLock sync.RWMutex
	notifyCh  chan UsnEvent
}

// NewVolumeManager creates a new volume manager.
func NewVolumeManager(notifyCh chan UsnEvent) *VolumeManager {
	return &VolumeManager{
		volumes:  make(map[string]*volumeCtx),
		roots:    []string{},
		notifyCh: notifyCh,
	}
}

// getVolumeLetter extracts "D:/" from "D:/Work/Sub".
func getVolumeLetter(fullPath string) string {
	if len(fullPath) >= 3 && fullPath[1] == ':' {
		return fullPath[:3]
	}
	return ""
}

// UpdateDirs reconfigures monitored directories. Idempotent.
func (vm *VolumeManager) UpdateDirs(dirs []string) {
	vm.rootsLock.Lock()
	defer vm.rootsLock.Unlock()

	byVol := make(map[string][]string)
	for _, d := range dirs {
		vol := getVolumeLetter(d)
		if vol == "" {
			continue
		}
		normalized := filepath.ToSlash(d)
		if !contains(byVol[vol], normalized) {
			byVol[vol] = append(byVol[vol], normalized)
		}
	}

	for vol, roots := range byVol {
		if _, ok := vm.volumes[vol]; !ok {
			ctx, err := vm.startVolume(vol, roots)
			if err != nil {
				fmt.Fprintf(os.Stderr, "ERROR starting volume %s: %v\n", vol, err)
				continue
			}
			vm.volumes[vol] = ctx
		} else {
			vm.volumes[vol].roots = roots
		}
	}

	for vol, ctx := range vm.volumes {
		if _, ok := byVol[vol]; !ok {
			close(ctx.stopCh)
		}
	}

	vm.roots = dirs
}

func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func (vm *VolumeManager) startVolume(vol string, roots []string) (*volumeCtx, error) {
	driveLetter := string(vol[0])
	h, err := OpenVolume(driveLetter)
	if err != nil {
		return nil, err
	}

	journal, err := CreateJournal(h)
	if err != nil {
		windows.CloseHandle(h)
		return nil, err
	}

	ctx := &volumeCtx{
		h:         h,
		journalID: journal.UsnJournalID,
		nextUsn:   journal.NextUsn,
		roots:     roots,
		stopCh:    make(chan struct{}),
	}

	go vm.readLoop(ctx)

	return ctx, nil
}

func (vm *VolumeManager) readLoop(ctx *volumeCtx) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	pendingRenames := make(map[string]UsnEvent) // path -> rename_new event waiting for old

	for {
		select {
		case <-ctx.stopCh:
			windows.CloseHandle(ctx.h)
			return
		case <-ticker.C:
			events, nextUsn, err := ReadJournalStart(ctx.h, ctx.journalID, ctx.nextUsn)
			if err != nil {
				continue
			}
			ctx.nextUsn = nextUsn

			for _, ev := range events {
				if !vm.shouldNotify(ev.Path, ctx.roots) {
					continue
				}

				if ev.Event == "rename_old" {
					pendingRenames[ev.Path] = ev
					continue
				}
				if ev.Event == "rename_new" {
					if oldEv, ok := pendingRenames[ev.Path]; ok {
						delete(pendingRenames, ev.Path)
						vm.notifyCh <- UsnEvent{
							Event:       "renamed",
							Path:        ev.Path,
							OldPath:     oldEv.Path,
							Volume:      getVolumeLetter(ev.Path),
							Timestamp:   ev.Timestamp,
							IsDirectory: ev.IsDirectory,
						}
					} else {
						vm.notifyCh <- ev
					}
					continue
				}

				mapped := ev.Event
				if ev.IsDirectory {
					switch ev.Event {
					case "created":
						mapped = "folder_created"
					case "deleted":
						mapped = "folder_deleted"
					}
				}

				vm.notifyCh <- UsnEvent{
					Event:       mapped,
					Path:        ev.Path,
					Volume:      getVolumeLetter(ev.Path),
					Timestamp:   ev.Timestamp,
					IsDirectory: ev.IsDirectory,
				}
			}
		}
	}
}

// shouldNotify returns true if the file path is under any monitored root.
func (vm *VolumeManager) shouldNotify(filePath string, roots []string) bool {
	norm := filepath.ToSlash(filePath)
	for _, root := range roots {
		if strings.HasPrefix(norm, root) {
			return true
		}
	}
	return false
}
