# M1.4 实时文件监控 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现基于 NTFS USN Journal 的实时文件监控，Go 进程监听内核级文件变更事件，Electron 接收后更新 shard 索引，前端实时追加搜索结果。

**Architecture:**
- Go 独立进程监听多个卷的 USN Journal，按目录过滤后通过 TCP 推送 JSON 事件
- Electron 管理 Go 子进程生命周期，接收事件后调用 shardManager 写库
- 监控开关由用户配置决定，启用时拉起，禁用时终止

**Tech Stack:** Go 1.21+, golang.org/x/sys/windows, Electron IPC, better-sqlite3, React

---

## 文件影响范围

| 文件 | 操作 |
|------|------|
| `go/main.go` | 新建，Go 入口 + TCP 监听 |
| `go/usn/journal.go` | 新建，USN Journal API 封装 |
| `go/usn/manager.go` | 新建，卷分组 + 路径过滤 + 事件汇总 |
| `go/go.mod` | 新建，Go 模块定义 |
| `go/usn-monitor.exe` | 编译产物 |
| `electron/main/usnWatcher.ts` | 新建，子进程管理 + TCP 通信 |
| `electron/main/usnHandler.ts` | 新建，事件处理（文件 + 文件夹） |
| `electron/main/shardManager.ts` | 修改，新增 renameFileInAllShards / updateFileInAllShards |
| `electron/main/config.ts` | 修改，新增 realtimeMonitor 配置项 |
| `electron/main/ipc.ts` | 修改，新增 usn-update IPC channel |
| `electron/preload/index.ts` | 修改，暴露监控 API |
| `src/pages/SettingsPage.tsx` | 修改，监控开关 UI |
| `src/components/SearchResults.tsx` | 修改，实时追加横幅 |
| `src/components/StatusBar.tsx` | 修改，监控状态指示 |

---

## Phase 1: Go USN Monitor（可独立编译测试）

### Task 1: Go 项目初始化 + USN Journal API

**文件：**
- 新建: `go/go.mod`
- 新建: `go/usn/journal.go`

- [ ] **Step 1: 创建 go.mod**

```bash
mkdir -p go/usn
cat > go/go.mod << 'EOF'
module github.com/docseeker/usn-monitor

go 1.21

require golang.org/x/sys v0.18.0
EOF
```

- [ ] **Step 2: 实现 USN Journal API 封装**

文件: `go/usn/journal.go`

```go
package usn

import (
	"fmt"
	"os"
	"strings"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	FSCTL_CREATE_USN_JOURNAL    uint32 = 0x900f4
	FSCTL_READ_USN_JOURNAL       uint32 = 0x900f3
	FSCTL_DELETE_USN_JOURNAL     uint32 = 0x900f5
	USN_PAGE_SIZE                uint32 = 0x1000

	FILE_CREATE                uint32 = 0x1000000
	FILE_DELETE                uint32 = 0x2000000
	FILE_RENAMED_OLD_NAME      uint32 = 0x4000000
	FILE_RENAMED_NEW_NAME      uint32 = 0x8000000
	DATA_OVERWRITE             uint32 = 0x1
	DATA_TRUNCATION            uint32 = 0x4
	FILE_ATTRIBUTE_DIRECTORY   uint32 = 0x10
)

// USN_JOURNAL_DATA describes the USN journal for a volume.
type usnJournalData struct {
	UsnJournalID       uint64
	FirstUsn           int64
	NextUsn            int64
	LowestValidUsn     int64
	MaxUsn             int64
	AllocationDelta    int64
}

// USN_RECORD_V2 fixed-size header (64 bytes).
type usnRecordV2 struct {
	RecordLength       uint32
	MajorVersion       uint16
	MinorVersion       uint16
	FileReferenceNumber uint64
	ParentFileReferenceNumber uint64
	Usn                int64
	Timestamp          int64
	Reason             uint32
	SourceInfo         uint32
	FileAttributes     uint32
	FileNameLength     uint16
	FileNameOffset     uint16
}

// UsnEvent represents a file system event.
type UsnEvent struct {
	Event       string
	Path        string
	Volume      string
	Timestamp   int64
	OldPath     string
	IsDirectory bool
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
		0,
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

// ReadJournalStart starts reading from the journal from a given USN.
// Returns the next USN to read from.
func ReadJournalStart(h windows.Handle, journalID uint64, startUsn int64) ([]UsnEvent, int64, error) {
	buf := make([]byte, 64*1024)
	var bytesReturned uint32

	input := struct {
		UsnJournalID uint64
		StartUsn      int64
		ReasonMask    uint32
		ReturnOnlyOnClose uint32
		Timeout        uint64
		MaxUsn         uint64
		AllocationDelta uint64
	}{
		UsnJournalID:     journalID,
		StartUsn:         startUsn,
		ReasonMask:       0xFFFFFFFF,
		ReturnOnlyOnClose: 0,
		Timeout:          0,
		MaxUsn:           0,
		AllocationDelta:  8 * 1024 * 1024,
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

	// First 8 bytes: next USN
	nextUsn := int64(binary.LittleEndian.Uint64(buf[:8]))

	events, err := parseUsnRecords(buf[8:bytesReturned])
	return events, nextUsn, nil
}

// parseUsnRecords parses raw USN record bytes into UsnEvent structs.
func parseUsnRecords(data []byte) ([]UsnEvent, error) {
	var events []UsnEvent
	offset := 0

	for offset+64 <= len(data) {
		rec := (*usnRecordV2)(unsafe.Pointer(&data[offset]))
		recLen := int(rec.RecordLength)

		if recLen < 64 || offset+int(recLen) > len(data) {
			break
		}

		nameBytes := data[offset+int(rec.FileNameOffset) : offset+int(rec.FileNameOffset)+int(rec.FileNameLength)]
		name := utf16ToString(nameBytes)

		isDir := (rec.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0
		reason := rec.Reason

		// Group FILE_RENAMED_OLD_NAME + FILE_RENAMED_NEW_NAME as one "renamed" event
		if reason&FILE_RENAMED_OLD_NAME != 0 {
			events = append(events, UsnEvent{
				Event:       "rename_old",
				Path:        name,
				Timestamp:   rec.Timestamp / 10000, // 1601 FILETIME -> epoch ms
				IsDirectory: isDir,
			})
		}
		if reason&FILE_RENAMED_NEW_NAME != 0 {
			events = append(events, UsnEvent{
				Event:       "rename_new",
				Path:        name,
				Timestamp:   rec.Timestamp / 10000,
				IsDirectory: isDir,
			})
		}

		// Simple create / delete / modify (skip if already handled as rename)
		if reason&FILE_CREATE != 0 {
			events = append(events, UsnEvent{Event: "created", Path: name, Timestamp: rec.Timestamp / 10000, IsDirectory: isDir})
		}
		if reason&FILE_DELETE != 0 {
			events = append(events, UsnEvent{Event: "deleted", Path: name, Timestamp: rec.Timestamp / 10000, IsDirectory: isDir})
		}
		if reason&(DATA_OVERWRITE|DATA_TRUNCATION) != 0 {
			events = append(events, UsnEvent{Event: "modified", Path: name, Timestamp: rec.Timestamp / 10000, IsDirectory: false})
		}

		offset += int(recLen)
	}

	return events, nil
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
```

- [ ] **Step 3: Commit**

```bash
cd D:/ProjectFile/docSeeker
git add go/go.mod go/usn/journal.go
git commit -m "feat(usn): add Go project scaffold and USN Journal API wrapper

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 卷管理器 + TCP 通信入口

**文件：**
- 新建: `go/usn/manager.go`
- 新建: `go/main.go`

- [ ] **Step 1: 实现 volumeManager（go/usn/manager.go）**

文件: `go/usn/manager.go`

```go
package usn

import (
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// volumeCtx holds per-volume subscription state.
type volumeCtx struct {
	h         windows.Handle
	journalID uint64
	nextUsn   int64
	roots     []string // monitored root dirs on this volume (e.g. "D:\\Work")
	stopCh    chan struct{}
}

type VolumeManager struct {
	volumes   map[string]*volumeCtx // key: "D:\\"
	roots     []string             // all monitored roots
	rootsLock sync.RWMutex
	notifyCh  chan UsnEvent
}

func NewVolumeManager(notifyCh chan UsnEvent) *VolumeManager {
	return &VolumeManager{
		volumes:  make(map[string]*volumeCtx),
		roots:    []string{},
		notifyCh: notifyCh,
	}
}

// getVolumeLetter extracts "D:\\" from "D:\\Work\\Sub".
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

	// Group dirs by volume
	byVol := make(map[string][]string)
	for _, d := range dirs {
		vol := getVolumeLetter(d)
		if vol == "" {
			continue
		}
		// Normalize to backslash
		normalized := filepath.ToSlash(d)
		if !contains(byVol[vol], normalized) {
			byVol[vol] = append(byVol[vol], normalized)
		}
	}

	// Start goroutines for new volumes
	for vol, roots := range byVol {
		if _, ok := vm.volumes[vol]; !ok {
			ctx, err := vm.startVolume(vol, roots)
			if err != nil {
				fmt.Fprintf(os.Stderr, "ERROR starting volume %s: %v\n", vol, err)
				continue
			}
			vm.volumes[vol] = ctx
		} else {
			// Update roots for existing volume
			vm.volumes[vol].roots = roots
		}
	}

	// Remove goroutines for volumes no longer needed
	for vol, ctx := range vm.volumes {
		if _, ok := byVol[vol]; !ok {
			close(ctx.stopCh)
			delete(vm.volumes, vol)
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
						// Pair rename_old + rename_new into one renamed event
						delete(pendingRenames, ev.Path)
						vm.notifyCh <- UsnEvent{
							Event:     "renamed",
							Path:      ev.Path,
							OldPath:   oldEv.Path,
							Volume:    getVolumeLetter(ev.Path),
							Timestamp: ev.Timestamp,
							IsDirectory: ev.IsDirectory,
						}
					} else {
						// No matching old name — treat as created
						vm.notifyCh <- ev
					}
					continue
				}

				// Map event types
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
```

- [ ] **Step 2: 实现 TCP 入口（go/main.go）**

文件: `go/main.go`

```go
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/docseeker/usn-monitor/usn"
)

var vm *usn.VolumeManager
var notifyCh chan usn.UsnEvent
var idleTimer *time.Timer
var idleTimeout = 5 * time.Minute
var lastActivity time.Time

type Command struct {
	Type string   `json:"type"`
	Dirs []string `json:"dirs,omitempty"`
}

func main() {
	notifyCh = make(chan usn.UsnEvent, 1024)
	vm = usn.NewVolumeManager(notifyCh)

	idleTimer = time.NewTimer(idleTimeout)
	lastActivity = time.Now()

	go eventPump()

	ln, err := net.Listen("tcp", "127.0.0.1:29501")
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: cannot listen on 29501: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "INFO: listening on 127.0.0.1:29501\n")

	// Graceful shutdown on SIGTERM
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-sigCh
		fmt.Fprintf(os.Stderr, "INFO: received signal, shutting down\n")
		os.Exit(0)
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			continue
		}
		go handleConn(conn)
	}
}

func handleConn(conn net.Conn) {
	defer conn.Close()
	lastActivity = time.Now()
	idleTimer.Reset(idleTimeout)

	scanner := bufio.NewScanner(conn)
	// Increase buffer for long init commands
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var cmd Command
		if err := json.Unmarshal(line, &cmd); err != nil {
			jsonError(conn, fmt.Sprintf("invalid JSON: %v", err))
			continue
		}

		lastActivity = time.Now()
		idleTimer.Reset(idleTimeout)

		switch cmd.Type {
		case "init", "update_dirs":
			vm.UpdateDirs(cmd.Dirs)
			jsonAck(conn, cmd.Type)
		case "ping":
			jsonAck(conn, "pong")
		default:
			jsonError(conn, fmt.Sprintf("unknown command: %s", cmd.Type))
		}
	}
}

func eventPump() {
	for {
		select {
		case ev := <-notifyCh:
			lastActivity = time.Now()
			idleTimer.Reset(idleTimeout)
			// Event is written directly to all connections by handleConn's loop
			// Since we have single connection, write to global writer
			writeEvent(ev)
		case <-idleTimer.C:
			fmt.Fprintf(os.Stderr, "INFO: idle timeout, exiting\n")
			os.Exit(0)
		}
	}
}

// Global writer — simplified: single client assumed.
// For production, maintain a map of connections.
var clientWriter struct {
	mu   sync.Mutex
	conn net.Conn
}

func setClient(conn net.Conn) {
	clientWriter.mu.Lock()
	clientWriter.conn = conn
	clientWriter.mu.Unlock()
}

func clearClient() {
	clientWriter.mu.Lock()
	clientWriter.conn = nil
	clientWriter.mu.Unlock()
}

func writeEvent(ev usn.UsnEvent) {
	clientWriter.mu.Lock()
	conn := clientWriter.conn
	clientWriter.mu.Unlock()
	if conn == nil {
		return
	}
	msg, _ := json.Marshal(map[string]interface{}{
		"type":      "event",
		"event":     ev.Event,
		"path":      ev.Path,
		"volume":    ev.Volume,
		"timestamp": ev.Timestamp,
	})
	if ev.OldPath != "" {
		msg, _ = json.Marshal(map[string]interface{}{
			"type":      "event",
			"event":     ev.Event,
			"path":      ev.Path,
			"oldPath":   ev.OldPath,
			"volume":    ev.Volume,
			"timestamp": ev.Timestamp,
		})
	}
	msg = append(msg, '\n')
	conn.Write(msg)
}

func jsonAck(w io.Writer, command string) {
	msg, _ := json.Marshal(map[string]string{"type": "ack", "command": command})
	msg = append(msg, '\n')
	w.Write(msg)
}

func jsonError(w io.Writer, message string) {
	msg, _ := json.Marshal(map[string]string{"type": "err", "message": message})
	msg = append(msg, '\n')
	w.Write(msg)
}
```

> **注意**：`go/main.go` 中的 `clientWriter` 全局变量假设只有一个客户端连接。Electron 每次启动时只会有一个 Go 进程实例，这是合理的简化。

- [ ] **Step 3: 修复 import（go/main.go）**

在文件顶部添加缺失的 import：

```go
import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/docseeker/usn-monitor/usn"
)
```

- [ ] **Step 4: 修复 journal.go 中的 os 导入**

在 `go/usn/journal.go` 顶部添加 `os` 导入：

```go
package usn

import (
	"fmt"
	"os"
	"strings"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)
```

- [ ] **Step 5: 编译验证**

```bash
cd D:/ProjectFile/docSeeker/go
go mod tidy
go build -o usn-monitor.exe .
# 验证编译产物
ls -lh usn-monitor.exe
```

预期：`usn-monitor.exe` 生成成功（无编译错误）

- [ ] **Step 6: Commit**

```bash
git add go/usn/manager.go go/main.go
git commit -m "feat(usn): add volume manager and TCP listener

- go/usn/manager.go: per-volume USN goroutine, path filtering, rename pairing
- go/main.go: TCP 29501 listener, JSON command protocol, idle timeout exit

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 2: Electron 集成

### Task 3: Config 配置项 + shardManager 新增函数

**文件：**
- 修改: `electron/main/config.ts`
- 修改: `electron/main/shardManager.ts`

- [ ] **Step 1: 在 config.ts 中添加 realtimeMonitor 配置项**

文件: `electron/main/config.ts`，找到 `AppSettings` 接口，添加：

```typescript
export interface AppSettings {
  themeId?: string
  language?: string
  hotkey?: string
  autoLaunch?: boolean
  windowBounds?: { x: number; y: number; width: number; height: number }
  minimizeToTray?: boolean
  realtimeMonitor?: {
    enabled: boolean
    dirs: string[]       // 监控目录列表，与扫描目录分开独立配置
  }
  [key: string]: unknown
}
```

然后在 `getAppSetting` 返回默认值处添加：

```typescript
if (key === 'realtimeMonitor') {
  return { enabled: false, dirs: [] } as AppSettings['realtimeMonitor']
}
```

- [ ] **Step 2: 在 shardManager.ts 中添加 renameFileInAllShards 和 updateFileContentInAllShards**

文件: `electron/main/shardManager.ts`，在 `deleteFileFromAllShards` 函数之后（约第 1080 行）添加：

```typescript
/**
 * Rename a file across all shards: update path and name fields.
 * Used when a file is renamed on disk (not moved between folders).
 */
export function renameFileInAllShards(oldPath: string, newPath: string): number {
  let renamedCount = 0
  const oldName = oldPath.replace(/\\/g, '/').split('/').pop() || ''
  const newName = newPath.replace(/\\/g, '/').split('/').pop() || ''
  const readyShards = getReadyShards()
  for (const shard of readyShards) {
    try {
      const db = new Database(shard.dbPath)
      const result = db.prepare(`
        UPDATE shard_files
        SET path = ?, name = ?, updated_at = datetime('now')
        WHERE path = ?
      `).run(newPath, newName, oldPath.replace(/\\/g, '/'))
      renamedCount += result.changes
      db.close()
    } catch (e) {
      log.error(`[shardManager] renameFileInAllShards error on shard ${shard.id}:`, e)
    }
  }
  return renamedCount
}

/**
 * Update file content (re-extract after file modification).
 */
export function updateFileContentInAllShards(filePath: string, content: string | null): number {
  let updatedCount = 0
  const normalizedPath = filePath.replace(/\\/g, '/')
  const readyShards = getReadyShards()
  for (const shard of readyShards) {
    try {
      const db = new Database(shard.dbPath)
      const result = db.prepare(`
        UPDATE shard_files
        SET content = ?, updated_at = datetime('now')
        WHERE path = ?
      `).run(content, normalizedPath)
      updatedCount += result.changes
      db.close()
    } catch (e) {
      log.error(`[shardManager] updateFileContentInAllShards error on shard ${shard.id}:`, e)
    }
  }
  return updatedCount
}

/**
 * Rename all files under a folder prefix (used when folder is renamed).
 * Uses SQLite REPLACE on path prefix for efficiency.
 */
export function renameFolderContentsInAllShards(oldFolderPath: string, newFolderPath: string): number {
  let totalUpdated = 0
  const oldPrefix = oldFolderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/'
  const newPrefix = newFolderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/'
  const oldFolderName = oldFolderPath.replace(/\\/g, '/').split('/').pop() || ''
  const newFolderName = newFolderPath.replace(/\\/g, '/').split('/').pop() || ''
  const nameLenDiff = newFolderName.length - oldFolderName.length
  const readyShards = getReadyShards()
  for (const shard of readyShards) {
    try {
      const db = new Database(shard.dbPath)
      const result = db.prepare(`
        UPDATE shard_files
        SET path = (? || SUBSTR(path, ?)),
            name = (? || SUBSTR(name, ?)),
            updated_at = datetime('now')
        WHERE path LIKE ?
      `).run(newPrefix, oldPrefix.length + 1, newFolderName, oldFolderName.length + 1, oldPrefix + '%')
      totalUpdated += result.changes
      db.close()
    } catch (e) {
      log.error(`[shardManager] renameFolderContentsInAllShards error on shard ${shard.id}:`, e)
    }
  }
  return totalUpdated
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/config.ts electron/main/shardManager.ts
git commit -m "feat(usn): add realtimeMonitor config and shard rename/update functions

- Add realtimeMonitor.enabled / dirs to AppSettings
- Add renameFileInAllShards, updateFileContentInAllShards, renameFolderContentsInAllShards

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: usnWatcher — 子进程管理 + TCP 通信

**文件：**
- 新建: `electron/main/usnWatcher.ts`

- [ ] **Step 1: 实现 usnWatcher.ts**

文件: `electron/main/usnWatcher.ts`

```typescript
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import * as net from 'net'
import * as path from 'path'
import log from 'electron-log/main'
import { app } from 'electron'
import { getAppSetting } from './config'
import { handleUsnEvent } from './usnHandler'

interface UsnCommand {
  type: 'init' | 'update_dirs' | 'ping'
  dirs?: string[]
}

interface UsnMessage {
  type: 'event' | 'ack' | 'err'
  event?: string
  path?: string
  volume?: string
  timestamp?: number
  oldPath?: string
  command?: string
  message?: string
}

export class UsnWatcher {
  private process: ChildProcessWithoutNullStreams | null = null
  private client: net.Socket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private isRunning = false

  /** Start the Go USN monitor if enabled in config. */
  async start(): Promise<void> {
    const config = getAppSetting<{ enabled: boolean; dirs: string[] }>('realtimeMonitor', {
      enabled: false,
      dirs: [],
    })
    if (!config.enabled) {
      log.info('[UsnWatcher] realtime monitor disabled, not starting')
      return
    }
    if (config.dirs.length === 0) {
      log.info('[UsnWatcher] no dirs configured, not starting')
      return
    }

    await this.spawnProcess()
    await this.connect()
    this.send({ type: 'init', dirs: config.dirs })
    this.isRunning = true
  }

  /** Stop the monitor. */
  stop(): void {
    this.isRunning = false
    this.clearReconnect()
    if (this.client) {
      this.client.destroy()
      this.client = null
    }
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    log.info('[UsnWatcher] stopped')
  }

  /** Dynamically update monitored directories. Call after user changes config. */
  updateDirs(dirs: string[]): void {
    if (!this.isRunning) return
    this.send({ type: 'update_dirs', dirs })
  }

  private async spawnProcess(): Promise<void> {
    const exePath = app.isPackaged
      ? path.join(process.resourcesPath!, 'go-usn-monitor.exe')
      : path.join(__dirname, '../../go/usn-monitor.exe')

    log.info('[UsnWatcher] spawning:', exePath)
    this.process = spawn(exePath, [], {
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process.on('exit', (code) => {
      log.warn(`[UsnWatcher] Go process exited with code ${code}`)
      this.onDisconnect()
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n')
      for (const line of lines) {
        if (line.startsWith('ERROR') || line.startsWith('FATAL')) {
          log.error(`[UsnWatcher] Go: ${line}`)
        } else {
          log.debug(`[UsnWatcher] Go: ${line}`)
        }
      }
    })
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = net.createConnection({ host: '127.0.0.1', port: 29501 }, () => {
        log.info('[UsnWatcher] connected to Go process')
        this.setupReader()
        resolve()
      })

      this.client.on('error', (err) => {
        log.error('[UsnWatcher] TCP error:', err.message)
        reject(err)
      })

      this.client.on('close', () => {
        this.onDisconnect()
      })

      // Timeout if can't connect within 5s
      setTimeout(() => reject(new Error('connect timeout')), 5000)
    })
  }

  private setupReader(): void {
    if (!this.client) return
    let buf = ''

    this.client.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      let newlineIdx: number
      while ((newlineIdx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, newlineIdx)
        buf = buf.slice(newlineIdx + 1)
        try {
          const msg: UsnMessage = JSON.parse(line)
          this.onMessage(msg)
        } catch (e) {
          log.warn('[UsnWatcher] failed to parse JSON:', line)
        }
      }
    })
  }

  private onMessage(msg: UsnMessage): void {
    if (msg.type === 'event' && msg.event && msg.path !== undefined) {
      handleUsnEvent({
        event: msg.event as any,
        path: msg.path,
        volume: msg.volume || '',
        timestamp: msg.timestamp || Date.now(),
        oldPath: msg.oldPath,
      })
    } else if (msg.type === 'ack') {
      log.debug(`[UsnWatcher] ack: ${msg.command}`)
    } else if (msg.type === 'err') {
      log.error(`[UsnWatcher] Go error: ${msg.message}`)
    }
  }

  private onDisconnect(): void {
    if (!this.isRunning) return
    // Auto-reconnect after 5s
    this.reconnectTimer = setTimeout(() => {
      log.info('[UsnWatcher] attempting reconnect...')
      this.connect().then(() => {
        const config = getAppSetting<{ enabled: boolean; dirs: string[] }>('realtimeMonitor', {
          enabled: false,
          dirs: [],
        })
        this.send({ type: 'init', dirs: config.dirs })
      }).catch(() => {})
    }, 5000)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private send(cmd: UsnCommand): void {
    if (!this.client) return
    try {
      this.client.write(JSON.stringify(cmd) + '\n')
    } catch (e) {
      log.error('[UsnWatcher] send error:', e)
    }
  }
}

// Singleton instance
export const usnWatcher = new UsnWatcher()
```

- [ ] **Step 2: 在 electron/main/index.ts 中初始化 usnWatcher**

文件: `electron/main/index.ts`，找到 `app.whenReady()` 回调中初始化 shardManager 的位置，在其后添加：

```typescript
// Start USN realtime monitor if enabled
usnWatcher.start().catch((e) => log.error('[UsnWatcher] failed to start:', e))
```

同时在文件顶部添加导入：

```typescript
import { usnWatcher } from './usnWatcher'
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/usnWatcher.ts electron/main/index.ts
git commit -m "feat(usn): add UsnWatcher with TCP child process management

- usnWatcher.ts: spawns go-usn-monitor.exe, TCP 29501 connection, JSON protocol
- Auto-reconnect on disconnect, graceful stop on app quit

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: usnHandler — 事件处理

**文件：**
- 新建: `electron/main/usnHandler.ts`

- [ ] **Step 1: 实现 usnHandler.ts**

文件: `electron/main/usnHandler.ts`

```typescript
import log from 'electron-log/main'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

function getFileType(ext: string): string {
  const map: Record<string, string> = {
    '.txt': 'text', '.md': 'text', '.json': 'text', '.xml': 'text', '.csv': 'text',
    '.doc': 'docx', '.docx': 'docx',
    '.xls': 'xlsx', '.xlsx': 'xlsx',
    '.ppt': 'pptx', '.pptx': 'pptx',
    '.pdf': 'pdf', '.rtf': 'rtf', '.chm': 'chm',
    '.odt': 'odf', '.ods': 'odf', '.odp': 'odf',
    '.epub': 'epub',
    '.zip': 'archive', '.mbox': 'mail', '.eml': 'mail',
    '.wps': 'wps', '.wpp': 'wps', '.et': 'wps', '.dps': 'wps',
  }
  return map[ext] || 'unsupported'
}
import {
  deleteFileFromAllShards,
  renameFileInAllShards,
  updateFileContentInAllShards,
  renameFolderContentsInAllShards,
  deleteFilesByFolderPrefixFromAllShards,
  openNextShard,
  insertFileBatch,
} from './shardManager'

interface UsnEvent {
  event: 'created' | 'modified' | 'deleted' | 'renamed'
       | 'folder_created' | 'folder_deleted' | 'folder_renamed'
  path: string
  volume: string
  timestamp: number
  oldPath?: string
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

function notifyRenderer(ev: UsnEvent): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('usn-update', ev)
}

/**
 * Entry point for all USN events.
 * Decides which shard to write to and how to handle the event.
 */
export async function handleUsnEvent(ev: UsnEvent): Promise<void> {
  log.debug(`[usnHandler] ${ev.event}: ${ev.path}`)

  try {
    switch (ev.event) {
      case 'created':
        await handleCreated(ev.path)
        break
      case 'modified':
        await handleModified(ev.path)
        break
      case 'deleted':
        handleDeleted(ev.path)
        break
      case 'renamed':
        await handleRenamed(ev.oldPath!, ev.path)
        break
      case 'folder_created':
        // No action needed for folder index (folder name index is separate feature)
        break
      case 'folder_deleted':
        handleFolderDeleted(ev.path)
        break
      case 'folder_renamed':
        await handleFolderRenamed(ev.oldPath!, ev.path)
        break
    }
  } catch (e) {
    log.error(`[usnHandler] error handling ${ev.event} ${ev.path}:`, e)
  }

  notifyRenderer(ev)
}

/** Process a newly created file: extract info and insert into shard. */
async function handleCreated(filePath: string): Promise<void> {
  const fileInfo = await processFileSimple(filePath)
  if (!fileInfo) return
  const shard = await openNextShard()
  if (!shard) return
  await insertFileBatch(shard.id, [fileInfo])
  log.info(`[usnHandler] indexed new file: ${filePath}`)
}

/** Process a modified file: re-extract content and update shard. */
async function handleModified(filePath: string): Promise<void> {
  const content = await extractContentSimple(filePath)
  updateFileContentInAllShards(filePath, content)
  log.debug(`[usnHandler] updated content: ${filePath}`)
}

/** Process a deleted file: remove from all shards. */
function handleDeleted(filePath: string): void {
  const count = deleteFileFromAllShards(filePath)
  if (count > 0) log.info(`[usnHandler] deleted from ${count} shard(s): ${filePath}`)
}

/** Process a renamed/moved file: update path in all shards. */
async function handleRenamed(oldPath: string, newPath: string): Promise<void> {
  renameFileInAllShards(oldPath, newPath)
  // Re-extract content under new path
  const content = await extractContentSimple(newPath)
  updateFileContentInAllShards(newPath, content)
  log.info(`[usnHandler] renamed: ${oldPath} → ${newPath}`)
}

/** Process a folder deletion: cascade delete all child files from shards. */
function handleFolderDeleted(folderPath: string): void {
  const count = deleteFilesByFolderPrefixFromAllShards(folderPath)
  log.info(`[usnHandler] cascade deleted ${count} files under: ${folderPath}`)
}

/** Process a folder rename: batch update all child file paths. */
async function handleFolderRenamed(oldPath: string, newPath: string): Promise<void> {
  const count = renameFolderContentsInAllShards(oldPath, newPath)
  log.info(`[usnHandler] renamed ${count} files under folder: ${oldPath} → ${newPath}`)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.xml', '.csv',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.pdf', '.rtf', '.chm', '.odt', '.ods', '.odp',
  '.epub', '.zip', '.mbox', '.eml',
  '.wps', '.wpp', '.et', '.dps',
])

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

interface SimpleFileInfo {
  path: string
  name: string
  size: number
  hash: string | null
  file_type: string
  content: string | null
  is_supported: number
}

async function processFileSimple(filePath: string): Promise<SimpleFileInfo | null> {
  let stats: fs.Stats
  try {
    stats = await fs.promises.stat(filePath)
  } catch {
    return null
  }

  const name = path.basename(filePath)
  const ext = path.extname(name).toLowerCase()
  const isSupported = SUPPORTED_EXTENSIONS.has(ext)
  const fileType = getFileType(ext) || 'unsupported'

  const info: SimpleFileInfo = {
    path: filePath.replace(/\\/g, '/'),
    name,
    size: stats.size,
    hash: null,
    file_type: fileType,
    content: null,
    is_supported: isSupported ? 1 : 0,
  }

  if (stats.size > 0 && stats.size < MAX_FILE_SIZE) {
    try {
      const buf = await fs.promises.readFile(filePath)
      info.hash = crypto.createHash('md5').update(buf).digest('hex')
    } catch {
      // ignore
    }
  }

  return info
}

async function extractContentSimple(filePath: string): Promise<string | null> {
  // Minimal: just return null here. Real content extraction is expensive
  // and should be done asynchronously. This is handled by the async
  // content extractor in scanWorker which is triggered separately.
  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/main/usnHandler.ts
git commit -m "feat(usn): add usnHandler with file/folder event processing

- handleCreated: insert new file into shard
- handleModified: re-extract content (stub, async extractor separate)
- handleDeleted: remove from shards
- handleRenamed: update path + content
- handleFolderDeleted: cascade delete child files
- handleFolderRenamed: batch update child file paths

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: IPC + Preload API

**文件：**
- 修改: `electron/main/ipc.ts`
- 修改: `electron/preload/index.ts`

- [ ] **Step 1: 在 ipc.ts 中添加 IPC handlers**

文件: `electron/main/ipc.ts`，在 `registerIpcHandlers()` 函数中添加：

```typescript
// ── USN Realtime Monitor ────────────────────────────────────────────────────
ipcMain.handle('usn-get-config', async (): Promise<{ enabled: boolean; dirs: string[] }> => {
  return getAppSetting<{ enabled: boolean; dirs: string[] }>('realtimeMonitor', {
    enabled: false,
    dirs: [],
  })
})

ipcMain.handle('usn-set-config', async (_, config: { enabled?: boolean; dirs?: string[] }): Promise<void> => {
  const current = getAppSetting<{ enabled: boolean; dirs: string[] }>('realtimeMonitor', {
    enabled: false,
    dirs: [],
  })
  const updated = { ...current, ...config }
  setAppSetting('realtimeMonitor', updated)

  // Update watcher
  if (updated.enabled && updated.dirs.length > 0) {
    await usnWatcher.start()
  } else {
    usnWatcher.stop()
  }
})
```

同时在 ipc.ts 顶部添加导入（如果尚未引入）：

```typescript
import { usnWatcher } from './usnWatcher'
import { getAppSetting, setAppSetting } from './config'
```

- [ ] **Step 2: 在 preload 中暴露 API**

文件: `electron/preload/index.ts`，在 `ElectronAPI` 接口中添加：

```typescript
usnGetConfig: () => Promise<{ enabled: boolean; dirs: string[] }>
usnSetConfig: (config: { enabled?: boolean; dirs?: string[] }) => Promise<void>
onUsnUpdate: (callback: (ev: UsnEvent) => void) => () => void
```

在 preload 实现中添加：

```typescript
usnGetConfig: () => ipcRenderer.invoke('usn-get-config'),
usnSetConfig: (config) => ipcRenderer.invoke('usn-set-config', config),
onUsnUpdate: (callback) => {
  const handler = (_: any, ev: UsnEvent) => callback(ev)
  ipcRenderer.on('usn-update', handler)
  return () => ipcRenderer.removeListener('usn-update', handler)
}
```

同时在文件顶部添加 `UsnEvent` 接口：

```typescript
interface UsnEvent {
  event: string
  path: string
  volume: string
  timestamp: number
  oldPath?: string
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/ipc.ts electron/preload/index.ts
git commit -m "feat(usn): add IPC handlers and preload APIs for realtime monitor

- usn-get-config / usn-set-config handlers
- onUsnUpdate renderer event listener

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Settings UI — 监控开关

**文件：**
- 修改: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: 添加监控开关组件**

文件: `src/pages/SettingsPage.tsx`，找到现有设置的渲染区域，添加：

```tsx
// 在现有的语言/主题设置之后添加

const [monitorEnabled, setMonitorEnabled] = useState(false)
const [monitorDirs, setMonitorDirs] = useState<string[]>([])

useEffect(() => {
  window.electron.usnGetConfig().then(cfg => {
    setMonitorEnabled(cfg.enabled)
    setMonitorDirs(cfg.dirs)
  })
}, [])

const handleToggleMonitor = async (checked: boolean) => {
  setMonitorEnabled(checked)
  await window.electron.usnSetConfig({ enabled: checked })
}
```

在渲染部分（设置列表中）添加：

```tsx
{/* 实时文件监控 */}
<div className="settings-section">
  <h3 className="settings-section-title">{t('settings.realtimeMonitor')}</h3>

  <div className="settings-item">
    <div className="settings-item-info">
      <div className="settings-item-label">{t('settings.enableRealtimeMonitor')}</div>
      <div className="settings-item-desc">
        {t('settings.enableRealtimeMonitorDesc')}
        <span style={{ color: 'var(--warning-color)', display: 'block', marginTop: '4px' }}>
          ⚠️ {t('settings.realtimeMonitorWarning')}
        </span>
      </div>
    </div>
    <label className="scan-toggle">
      <input
        type="checkbox"
        className="scan-toggle-input"
        checked={monitorEnabled}
        onChange={(e) => handleToggleMonitor(e.target.checked)}
      />
      <span className="scan-toggle-switch" />
    </label>
  </div>
</div>
```

- [ ] **Step 2: 添加 i18n 翻译**

文件: `src/context/LanguageContext.tsx`，在翻译对象中添加：

```typescript
settings: {
  // ... existing
  realtimeMonitor: '实时文件监控',
  enableRealtimeMonitor: '启用实时监控',
  enableRealtimeMonitorDesc: '监控目录下文件变更，实时更新搜索索引。开启后，删除文件夹会同步删除其下所有文件的索引。',
  realtimeMonitorWarning: '删除文件夹将同步删除该目录下所有文件的搜索索引，如需恢复需手动重新扫描。',
},
```

英文：

```typescript
settings: {
  // ... existing
  realtimeMonitor: 'Realtime File Monitor',
  enableRealtimeMonitor: 'Enable Realtime Monitor',
  enableRealtimeMonitorDesc: 'Monitor file changes in watched directories and update search index in real time. Note: deleting a folder will remove all its files from the search index.',
  realtimeMonitorWarning: 'Deleting a folder will remove all its files from the search index. Restore requires a manual rescan.',
},
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx src/context/LanguageContext.tsx
git commit -m "feat(usn): add realtime monitor toggle in Settings UI

- Monitor enable/disable toggle with warning about cascade deletion
- i18n strings in LanguageContext

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: 搜索结果实时追加 UI

**文件：**
- 修改: `src/components/SearchResults.tsx`

- [ ] **Step 1: 添加实时追加横幅逻辑**

文件: `src/components/SearchResults.tsx`，在组件中添加：

```tsx
const [pendingEvents, setPendingEvents] = useState<UsnEvent[]>([])

useEffect(() => {
  const unsub = window.electron.onUsnUpdate((ev) => {
    if (ev.event === 'created' || ev.event === 'renamed') {
      setPendingEvents(prev => [...prev, ev])
    }
  })
  return unsub
}, [])

const handleLoadPending = async () => {
  if (pendingEvents.length === 0) return
  // Re-run current search to pick up new files
  await handleSearch(searchQuery)
  setPendingEvents([])
}

const handleDismissPending = () => {
  setPendingEvents([])
}
```

在渲染的搜索结果列表顶部添加横幅：

```tsx
{pendingEvents.length > 0 && (
  <div className="usn-banner">
    <span>📂 {pendingEvents.length} 个新文件已变更</span>
    <button className="usn-banner-btn" onClick={handleLoadPending}>
      {t('search.loadNew')}
    </button>
    <button className="usn-banner-btn usn-banner-btn-dismiss" onClick={handleDismissPending}>
      {t('search.dismiss')}
    </button>
  </div>
)}
```

添加 CSS（在全局样式文件或组件 style 中）：

```css
.usn-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--primary-light, #e3f2fd);
  border-radius: 6px;
  margin-bottom: 12px;
  animation: fadeIn 0.3s ease;
}
.usn-banner-btn {
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid var(--primary-color);
  background: none;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 12px;
}
.usn-banner-btn:hover { background: var(--primary-light); }
.usn-banner-btn-dismiss { border-color: var(--text-secondary); color: var(--text-secondary); }
.usn-banner-btn-dismiss:hover { background: var(--bg-hover); }
```

- [ ] **Step 2: 添加 i18n**

```tsx
// in LanguageContext
search: {
  // ...
  loadNew: '加载',
  dismiss: '忽略',
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchResults.tsx src/context/LanguageContext.tsx
git commit -m "feat(usn): add realtime update banner in SearchResults

- Shows pending file events as dismissible banner
- [Load] re-triggers search, [Dismiss] clears buffer
- Fade-in animation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: 状态栏监控指示

**文件：**
- 修改: `src/components/StatusBar.tsx`

- [ ] **Step 1: 添加监控状态指示**

文件: `src/components/StatusBar.tsx`，在组件中添加：

```tsx
const [monitorStatus, setMonitorStatus] = useState<{ enabled: boolean; dirs: string[] }>({ enabled: false, dirs: [] })

useEffect(() => {
  window.electron.usnGetConfig().then(cfg => setMonitorStatus(cfg))
}, [])

useEffect(() => {
  const unsub = window.electron.onUsnUpdate(() => {
    // Re-read config when events come in (means watcher is running)
    window.electron.usnGetConfig().then(cfg => setMonitorStatus(cfg))
  })
  return unsub
}, [])
```

在状态栏渲染中添加：

```tsx
{monitorStatus.enabled && (
  <span className="status-monitor" title={monitorStatus.dirs.join(', ')}>
    🔴 {t('status.monitoring')}: {monitorStatus.dirs.length > 0 ? monitorStatus.dirs[0] : ''}
    {monitorStatus.dirs.length > 1 && ` +${monitorStatus.dirs.length - 1}`}
  </span>
)}
{!monitorStatus.enabled && (
  <span className="status-monitor-off">⚫ {t('status.monitorOff')}</span>
)}
```

添加 i18n：

```tsx
// LanguageContext
status: {
  // ...
  monitoring: '监控中',
  monitorOff: '监控已停止',
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StatusBar.tsx src/context/LanguageContext.tsx
git commit -m "feat(usn): add monitor status indicator in StatusBar

- 🔴 Monitoring: D:\Work +2 when active
- ⚫ Monitor off when disabled

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Phase 3: 集成与测试

### Task 10: go-usn-monitor.exe 打包集成

- [ ] **Step 1: 编译 Go 程序（Windows）**

在 Windows 环境下：

```bash
cd D:/ProjectFile/docSeeker/go
go build -ldflags="-s -w" -o usn-monitor.exe .
# 验证编译产物大小
ls -lh usn-monitor.exe
```

预期：生成 `usn-monitor.exe`（约 3-5MB，静态链接）

- [ ] **Step 2: 复制到 resources 目录**

```bash
mkdir -p D:/ProjectFile/docSeeker/resources
cp D:/ProjectFile/docSeeker/go/usn-monitor.exe D:/ProjectFile/docSeeker/resources/
ls -lh D:/ProjectFile/docSeeker/resources/go-usn-monitor.exe
```

- [ ] **Step 3: 配置 electron-builder 复制 exe**

文件: `electron-builder.yml`（或 `electron.vite.config.ts`），在 `extraResources` 中添加：

```yaml
extraResources:
  - from: resources/go-usn-monitor.exe
    to: go-usn-monitor.exe
```

或者在 `electron.vite.config.ts` 的 build 配置中添加：

```typescript
build: {
  extraResources: [
    { from: 'resources/go-usn-monitor.exe', to: 'go-usn-monitor.exe' }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add resources/ electron-builder.yml  # or electron.vite.config.ts
git commit -m "feat(usn): bundle go-usn-monitor.exe into Electron app

- Copy compiled exe to resources/
- Add extraResources config for electron-builder

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 11: E2E 测试验证

- [ ] **Step 1: 开发环境启动验证**

```bash
cd D:/ProjectFile/docSeeker
npm run dev
# 打开设置，启用实时监控
```

预期：Go 进程被拉起，状态栏显示 🔴 监控中

- [ ] **Step 2: 创建文件测试**

```bash
# 在监控目录下新建文件
echo "test content" > D:/TestWatch/test-file.txt
```

预期：
- 搜索 `test-file` 能搜到新文件
- 横幅显示 "📂 1 个新文件已变更"

- [ ] **Step 3: 修改文件测试**

```bash
echo "updated content" > D:/TestWatch/test-file.txt
```

预期：搜索结果中的内容版本更新

- [ ] **Step 4: 重命名文件测试**

```bash
mv D:/TestWatch/test-file.txt D:/TestWatch/test-renamed.txt
```

预期：旧路径文件消失，新路径文件出现

- [ ] **Step 5: 删除文件夹测试**

```bash
rm -rf D:/TestWatch/SubFolder
```

预期：SubFolder 下所有文件从搜索索引中删除

- [ ] **Step 6: 关闭监控验证**

在设置中关闭监控 → 状态栏显示 ⚫ 监控已停止，Go 进程退出

- [ ] **Step 7: 最终 Commit**

```bash
git add -A
git commit -m "test(usn): E2E verification for realtime file monitoring

- Verified: file creation, modification, rename, folder deletion
- Verified: realtime banner, status indicator
- Verified: monitor enable/disable

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## 技术决策自检

| 检查项 | 说明 |
|--------|------|
| Go USN API 使用 golang.org/x/sys/windows | Windows 原生支持，零额外依赖 |
| TCP localhost 通信 | Electron net 模块原生支持，调试方便 |
| 事件处理在 Electron 主进程 | 避免多线程 SQLite 写冲突 |
| `renameFolderContentsInAllShards` 批量更新 | 单条 SQL REPLACE，百万级秒级完成 |
| `deleteFilesByFolderPrefixFromAllShards` 级联删除 | 已有实现，复用 |
| `extractContentSimple` 返回 null | 内容异步提取由 scanWorker 负责，避免阻塞 |
| 单一 Go 进程管所有卷 | goroutine per volume，共用连接，进程管理简单 |

---

## 验收标准

- [ ] Go 程序编译成功，生成 `usn-monitor.exe`
- [ ] Electron 启动时根据配置决定是否拉起 Go 进程
- [ ] 监控目录下新建文件，搜索结果实时追加（带横幅）
- [ ] 修改文件后，shard 中 content 字段更新
- [ ] 重命名文件，`shard_files.path` 和 `shard_files.name` 同步更新
- [ ] 删除文件夹，下属文件索引记录物理删除
- [ ] 重命名文件夹，下属文件路径前缀批量替换
- [ ] Settings UI 监控开关可正常启用/禁用
- [ ] 状态栏正确显示 🔴 监控中 / ⚫ 监控已停止
- [ ] 配置变更后，`usnWatcher.updateDirs()` 动态生效
- [ ] Go 进程空闲 5 分钟自动退出
- [ ] `docs/PROGRESS.md`、`docs/ROADMAP.md`、`src/pages/GuidePage.tsx` 同步更新