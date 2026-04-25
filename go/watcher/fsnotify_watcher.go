package watcher

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// UsnEvent represents a file system change event
// Event values: "created", "modified", "deleted", "renamed", "folder_created", "folder_deleted", "folder_renamed"
type UsnEvent struct {
	Event     string // matches TypeScript UsnEventType
	Path      string
	Volume    string
	OldPath   string
	Timestamp int64
}

// FileWatcher is the file system watcher interface
type FileWatcher interface {
	Start(dirs []string)
	Stop()
	UpdateDirs(dirs []string)
}

// FsnotifyWatcher implements FileWatcher using fsnotify
type FsnotifyWatcher struct {
	watcher    *fsnotify.Watcher
	notifyCh   chan UsnEvent
	roots      []string
	mu         sync.RWMutex
	watched    map[string]bool // path -> watching
}

// NewFsnotifyWatcher creates a new fsnotify-based watcher
func NewFsnotifyWatcher(notifyCh chan UsnEvent) *FsnotifyWatcher {
	return &FsnotifyWatcher{
		notifyCh: notifyCh,
		watched:  make(map[string]bool),
	}
}

// timestamp returns current time in milliseconds
func timestamp() int64 {
	return time.Now().UnixNano() / 1000000
}

// isDir checks if a path is a directory
func isDir(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}

// isDirFromName checks if the path looks like a directory (no extension or ends with /)
func isDirFromName(name string) bool {
	// If name ends with / or \, it's a directory
	if strings.HasSuffix(name, "/") || strings.HasSuffix(name, "\\") {
		return true
	}
	// Get extension
	ext := filepath.Ext(name)
	// Directories often have no extension or have trailing slash in fsnotify
	return ext == "" || ext == name
}

// Start starts watching the given directories
func (w *FsnotifyWatcher) Start(dirs []string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Stop existing watcher if any
	if w.watcher != nil {
		w.watcher.Close()
	}

	// Create new watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR creating watcher: %v\n", err)
		return
	}
	w.watcher = watcher

	// Start event pump in goroutine
	go w.eventPump()

	// Add directories to watch
	for _, dir := range dirs {
		dir = filepath.ToSlash(dir)
		volume := getVolumeLetter(dir)
		if volume == "" {
			fmt.Fprintf(os.Stderr, "WARN: cannot get volume for %s, skipping\n", dir)
			continue
		}

		// Add to roots
		if !contains(w.roots, dir) {
			w.roots = append(w.roots, dir)
		}

		// Watch directory
		if err := w.watcher.Add(dir); err != nil {
			fmt.Fprintf(os.Stderr, "ERROR adding watch %s: %v\n", dir, err)
		} else {
			w.watched[dir] = true
			fmt.Fprintf(os.Stderr, "DEBUG watching: %s\n", dir)
		}
	}
}

// Stop stops the watcher
func (w *FsnotifyWatcher) Stop() {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.watcher != nil {
		w.watcher.Close()
		w.watcher = nil
	}
}

// UpdateDirs updates the directories being watched
func (w *FsnotifyWatcher) UpdateDirs(dirs []string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.watcher == nil {
		return
	}

	// Remove unwatched directories
	for path := range w.watched {
		if !contains(dirs, path) {
			w.watcher.Remove(path)
			delete(w.watched, path)
		}
	}

	// Add new directories
	for _, dir := range dirs {
		dir = filepath.ToSlash(dir)
		if !w.watched[dir] {
			if err := w.watcher.Add(dir); err != nil {
				fmt.Fprintf(os.Stderr, "ERROR adding watch %s: %v\n", dir, err)
			} else {
				w.watched[dir] = true
			}
		}
	}
}

// eventPump pumps events from fsnotify to the notify channel
func (w *FsnotifyWatcher) eventPump() {
	for {
		select {
		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}

			// Get volume
			volume := getVolumeLetter(event.Name)

			// Convert fsnotify event to UsnEvent
			ev := UsnEvent{
				Path:      filepath.ToSlash(event.Name),
				Volume:    volume,
				Timestamp: timestamp(),
			}

			// Determine event type and check if it's a directory
			isDir := isDir(event.Name)

			switch {
			case event.Op&fsnotify.Create == fsnotify.Create:
				if isDir {
					ev.Event = "folder_created"
				} else {
					ev.Event = "created"
				}
			case event.Op&fsnotify.Write == fsnotify.Write:
				if !isDir {
					ev.Event = "modified"
				} else {
					ev.Event = "folder_created" // directory content changed
				}
			case event.Op&fsnotify.Remove == fsnotify.Remove:
				if isDir {
					ev.Event = "folder_deleted"
				} else {
					ev.Event = "deleted"
				}
			case event.Op&fsnotify.Rename == fsnotify.Rename:
				// For rename, we need to track old name - for now treat as file rename
				// The OldPath would need to be tracked via a map in a more complete implementation
				if isDir {
					ev.Event = "folder_renamed"
				} else {
					ev.Event = "renamed"
				}
			default:
				ev.Event = "modified"
			}

			// Send event
			select {
			case w.notifyCh <- ev:
			default:
				// Channel full, skip
			}

		case err := <-w.watcher.Errors:
			if err != nil {
				fmt.Fprintf(os.Stderr, "WATCHER ERROR: %v\n", err)
			}
		}
	}
}

// Helper functions

func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func getVolumeLetter(fullPath string) string {
	norm := strings.ReplaceAll(fullPath, "\\", "/")
	// Windows: D:/path
	if len(norm) >= 3 && norm[1] == ':' {
		return norm[:3]
	}
	// Unix/macOS: /Users/xxx or /home/xxx
	if strings.HasPrefix(norm, "/") {
		// Return root "/" for Unix systems (or first segment like "/Users")
		idx := strings.Index(norm[1:], "/")
		if idx == -1 {
			return norm // "/Users/xxx" -> "/Users/xxx" (whole path is volume)
		}
		return norm[:idx+1] // "/Users/xxx/Documents" -> "/Users"
	}
	return ""
}
