package usn

import (
	"encoding/binary"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	FSCTL_CREATE_USN_JOURNAL    uint32 = 0x900f4
	FSCTL_READ_USN_JOURNAL       uint32 = 0x900f3
	FSCTL_DELETE_USN_JOURNAL     uint32 = 0x900f5

	FILE_CREATE               uint32 = 0x1000000
	FILE_DELETE               uint32 = 0x2000000
	FILE_RENAMED_OLD_NAME     uint32 = 0x4000000
	FILE_RENAMED_NEW_NAME     uint32 = 0x8000000
	DATA_OVERWRITE            uint32 = 0x1
	DATA_TRUNCATION           uint32 = 0x4
	FILE_ATTRIBUTE_DIRECTORY   uint32 = 0x10

	FILE_FLAG_BACKUP_SEMANTICS uint32 = 0x02000000
)

// usnJournalData describes the USN journal for a volume.
type usnJournalData struct {
	UsnJournalID     uint64
	FirstUsn         int64
	NextUsn          int64
	LowestValidUsn   int64
	MaxUsn           int64
	AllocationDelta  int64
}

// usnRecordV2 fixed-size header (64 bytes).
type usnRecordV2 struct {
	RecordLength              uint32
	MajorVersion              uint16
	MinorVersion              uint16
	FileReferenceNumber       uint64
	ParentFileReferenceNumber uint64
	Usn                       int64
	Timestamp                 int64
	Reason                    uint32
	SourceInfo                uint32
	FileAttributes            uint32
	FileNameLength            uint16
	FileNameOffset           uint16
}

// volumeCtx holds per-volume subscription state.
type volumeCtx struct {
	h         windows.Handle
	pr        *pathResolver
	journalID uint64
	nextUsn   int64
	roots     []string
	stopCh    chan struct{}
}

// VolumeManager manages USN subscriptions across multiple volumes.
type VolumeManager struct {
	volumes   map[string]*volumeCtx
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

// getVolumeLetter extracts "D:/" from "D:/Work/Sub" or "D:\Work\Sub".
func getVolumeLetter(fullPath string) string {
	norm := strings.ReplaceAll(fullPath, "\\", "/")
	if len(norm) >= 3 && norm[1] == ':' {
		return norm[:3]
	}
	return ""
}

// OpenVolume opens a volume by drive letter (e.g. "C:" -> "\\\\.\\C:").
func OpenVolume(driveLetter string) (windows.Handle, error) {
	vol := `\\.` + string(driveLetter[0]) + `:`
	return windows.CreateFile(
		windows.StringToUTF16Ptr(vol),
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE,
		nil,
		windows.OPEN_EXISTING,
		FILE_FLAG_BACKUP_SEMANTICS,
		0,
	)
}

// CreateJournal creates a USN journal on the volume. Idempotent.
func CreateJournal(h windows.Handle) (*usnJournalData, error) {
	data := &usnJournalData{AllocationDelta: 8 * 1024 * 1024}
	var bytesReturned uint32
	err := windows.DeviceIoControl(
		h,
		FSCTL_CREATE_USN_JOURNAL,
		nil,
		0,
		unsafe.Pointer(data),
		uint32(unsafe.Sizeof(*data)),
		&bytesReturned,
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("FSCTL_CREATE_USN_JOURNAL: %w", err)
	}
	return data, nil
}

// ReadJournalStart reads from the journal. Returns the next USN to read from.
func ReadJournalStart(h windows.Handle, pr *pathResolver, journalID uint64, startUsn int64) ([]UsnEvent, int64, error) {
	buf := make([]byte, 64*1024)
	var bytesReturned uint32

	input := struct {
		UsnJournalID      uint64
		StartUsn          int64
		ReasonMask        uint32
		ReturnOnlyOnClose uint32
		Timeout           uint64
		MaxUsn            uint64
		AllocationDelta   uint64
	}{
		UsnJournalID:      journalID,
		StartUsn:          startUsn,
		ReasonMask:        0xFFFFFFFF,
		ReturnOnlyOnClose: 0,
		Timeout:           0,
		MaxUsn:            0,
		AllocationDelta:   8 * 1024 * 1024,
	}

	err := windows.DeviceIoControl(
		h,
		FSCTL_READ_USN_JOURNAL,
		unsafe.Pointer(&input),
		uint32(unsafe.Sizeof(input)),
		unsafe.Pointer(&buf[0]),
		uint32(len(buf)),
		&bytesReturned,
		nil,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("FSCTL_READ_USN_JOURNAL: %w", err)
	}

	if bytesReturned < 8 {
		return nil, 0, nil
	}

	nextUsn := int64(binary.LittleEndian.Uint64(buf[:8]))
	events, err := parseUsnRecords(buf[8:bytesReturned], pr)
	return events, nextUsn, nil
}

func utf16ToString(b []byte) string {
	if len(b)%2 != 0 {
		b = b[:len(b)-1]
	}
	u16 := make([]uint16, len(b)/2)
	for i := range u16 {
		u16[i] = uint16(b[i*2]) | uint16(b[i*2+1])<<8
	}
	return strings.TrimRight(string(utf16.Decode(u16)), "\x00")
}

// parseUsnRecords parses raw USN record bytes into UsnEvent structs with full paths.
func parseUsnRecords(data []byte, pr *pathResolver) ([]UsnEvent, error) {
	var events []UsnEvent
	offset := 0

	for offset+64 <= len(data) {
		rec := (*usnRecordV2)(unsafe.Pointer(&data[offset]))
		recLen := int(rec.RecordLength)

		if recLen < 64 || offset+int(recLen) > len(data) {
			break
		}

		if rec.FileReferenceNumber == 0 {
			offset += int(recLen)
			continue
		}

		// Get the filename from USN record
		nameBytes := data[offset+int(rec.FileNameOffset) : offset+int(rec.FileNameOffset)+int(rec.FileNameLength)]
		name := utf16ToString(nameBytes)

		// Resolve full path via parent FRN cache
		fullPath := pr.resolvePathByParentFRN(rec.ParentFileReferenceNumber, name)
		// Normalize to forward slashes
		fullPath = strings.ReplaceAll(fullPath, "\\", "/")

		isDir := (rec.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0
		reason := rec.Reason
		ts := rec.Timestamp / 10000 // 1601 FILETIME → epoch ms

		if reason&FILE_RENAMED_OLD_NAME != 0 {
			events = append(events, UsnEvent{
				Event: "rename_old", Path: fullPath, Timestamp: ts, IsDirectory: isDir,
			})
		}
		if reason&FILE_RENAMED_NEW_NAME != 0 {
			events = append(events, UsnEvent{
				Event: "rename_new", Path: fullPath, Timestamp: ts, IsDirectory: isDir,
			})
		}
		if reason&FILE_CREATE != 0 {
			events = append(events, UsnEvent{Event: "created", Path: fullPath, Timestamp: ts, IsDirectory: isDir})
		}
		if reason&FILE_DELETE != 0 {
			events = append(events, UsnEvent{Event: "deleted", Path: fullPath, Timestamp: ts, IsDirectory: isDir})
		}
		if reason&(DATA_OVERWRITE|DATA_TRUNCATION) != 0 && !isDir {
			events = append(events, UsnEvent{Event: "modified", Path: fullPath, Timestamp: ts, IsDirectory: false})
		}

		offset += int(recLen)
	}

	return events, nil
}

// pathResolver resolves full paths from USN parent FRNs using a directory cache.
// Strategy: at startup, walk all monitored directories to build frn→path and parentFRN→path caches.
type pathResolver struct {
	volumeRoot string            // e.g. "D:/"
	volumeChar string            // e.g. "D:"
	volumeH    windows.Handle   // volume handle
	cache      map[uint64]string // parentFRN → directory path (with trailing "/")
}

func newPathResolver(h windows.Handle, volumeChar string, roots []string) *pathResolver {
	pr := &pathResolver{
		volumeRoot: volumeChar + "/",
		volumeChar: volumeChar,
		volumeH:    h,
		cache:      make(map[uint64]string),
	}
	// Seed: FRN 0 → root directory
	pr.cache[0] = pr.volumeRoot

	// Build the parentFRN→path cache by walking all monitored directories
	for _, root := range roots {
		pr.walkAndCache(root)
	}
	return pr
}

// walkAndCache recursively walks a directory tree, caching parentFRN→path for each directory.
// For each directory encountered:
//   1. Get its own FRN (fileReferenceNumber)
//   2. Get its parent's FRN (parentFileReferenceNumber) via NtQueryInformationFile(FileIdInformation)
//   3. Cache parentFRN→parentPath so USN events can resolve paths
func (pr *pathResolver) walkAndCache(dirPath string) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		childPath := filepath.Join(dirPath, entry.Name())
		childPathFS := filepath.ToSlash(childPath)

		// Get the child's FRN and its parent FRN via NtQueryInformationFile(FileIdInformation)
		frn, parentFRN := pr.getDirFRNs(childPath)
		if frn == 0 {
			continue
		}

		// Cache parentFRN → parentPath (dirPath with trailing "/")
		parentPathFS := filepath.ToSlash(dirPath)
		pr.cache[parentFRN] = parentPathFS + "/"
		// Also cache frn → childPath for reverse lookups
		pr.cache[frn] = childPathFS + "/"

		// Recurse into subdirectory
		pr.walkAndCache(childPath)
	}
}

// getDirFRNs returns the FRN and parent FRN for a directory by opening it and calling NtQueryInformationFile(FileIdInformation).
func (pr *pathResolver) getDirFRNs(dirPath string) (frn uint64, parentFRN uint64) {
	// Convert "D:/Work/Sub" to "\\.\D:\Work\Sub" for Windows API
	winPath := `\\.\` + pr.volumeChar + `\` + strings.ReplaceAll(filepath.ToSlash(dirPath), "/", `\`)

	h, err := windows.CreateFile(
		windows.StringToUTF16Ptr(winPath),
		0, // no specific access needed
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_FLAG_BACKUP_SEMANTICS,
		0,
	)
	if err != nil {
		return 0, 0
	}
	defer windows.CloseHandle(h)

	// NtQueryInformationFile with FileIdInformation (class 54) returns:
	//   bytes [0:8]   = FileReferenceNumber (FRN)
	//   bytes [8:16]  = VolumeSerialNumber
	buf := make([]byte, 32)
	var retLen uint32
	r1, _, _ := windows.NewLazyDLL("ntdll.dll").NewProc("NtQueryInformationFile").Call(
		uintptr(h),
		uintptr(unsafe.Pointer(&retLen)),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(32),
		uintptr(54), // FileIdInformation
	)
	if r1 != 0 || retLen < 16 {
		return 0, 0
	}

	frn = binary.LittleEndian.Uint64(buf[0:8])
	// The parent FRN is stored at bytes [8:16] in FileIdInformation
	parentFRN = binary.LittleEndian.Uint64(buf[8:16])
	return frn, parentFRN
}

// resolvePathByParentFRN resolves the full path for a file given its parent directory FRN and filename.
func (pr *pathResolver) resolvePathByParentFRN(parentFRN uint64, filename string) string {
	// Special case: FRN 0 means root
	if parentFRN == 0 {
		return pr.volumeRoot + filename
	}

	parentPath, ok := pr.cache[parentFRN]
	if ok {
		return parentPath + filename
	}

	// Fallback: return volumeRoot + filename
	return pr.volumeRoot + filename
}

// UsnWatcher is the Windows NTFS USN Journal implementation of FileWatcher.
type UsnWatcher struct {
	notifyCh chan UsnEvent
	vm       *VolumeManager
}

// NewUsnWatcher creates a new UsnWatcher.
func NewUsnWatcher(notifyCh chan UsnEvent) *UsnWatcher {
	return &UsnWatcher{notifyCh: notifyCh}
}

func (w *UsnWatcher) Start(dirs []string) {
	if w.vm != nil {
		w.vm.Stop()
	}
	w.vm = newVolumeManagerForWatcher(w.notifyCh, dirs)
}

func (w *UsnWatcher) Stop() {
	if w.vm != nil {
		w.vm.Stop()
		w.vm = nil
	}
}

func (w *UsnWatcher) UpdateDirs(dirs []string) {
	if w.vm != nil {
		w.vm.UpdateDirs(dirs)
	}
}

// newVolumeManagerForWatcher creates a VolumeManager and starts monitoring.
func newVolumeManagerForWatcher(notifyCh chan UsnEvent, dirs []string) *VolumeManager {
	vm := &VolumeManager{
		volumes:  make(map[string]*volumeCtx),
		notifyCh: notifyCh,
	}
	vm.UpdateDirs(dirs)
	return vm
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

func (vm *VolumeManager) Stop() {
	vm.rootsLock.Lock()
	defer vm.rootsLock.Unlock()
	for _, ctx := range vm.volumes {
		close(ctx.stopCh)
	}
	vm.volumes = make(map[string]*volumeCtx)
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
		pr:        newPathResolver(h, driveLetter, roots),
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

	pendingRenames := make(map[string]UsnEvent)

	for {
		select {
		case <-ctx.stopCh:
			windows.CloseHandle(ctx.h)
			return
		case <-ticker.C:
			events, nextUsn, err := ReadJournalStart(ctx.h, ctx.pr, ctx.journalID, ctx.nextUsn)
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
