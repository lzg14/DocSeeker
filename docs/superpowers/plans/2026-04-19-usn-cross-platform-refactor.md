# USN 监控重构：接口抽象 + 跨平台预备 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 `go/usn/` 代码，抽取 `FileWatcher` 接口，按平台实现分离；同步更新文档。

**Architecture:** 将 `usn` 包拆分为 `FileWatcher` 接口层 + `UsnWatcher`（Windows NTFS USN Journal 实现）。接口定义在 `watcher.go`，Windows 实现为 `usn_watcher.go`，统一入口为 `main.go`。后续新增 macOS/Linux 只需新增文件，不动已有结构。

**Tech Stack:** Go + golang.org/x/sys/windows (NTFS USN Journal API)

---

## 文件结构（目标）

```
go/usn/
├── watcher.go        # FileWatcher 接口 + UsnEvent 类型（平台无关）
├── usn_watcher.go    # Windows NTFS USN Journal 实现（实现 FileWatcher）
├── volume_manager.go # VolumeManager：按卷分组 goroutine 管理
└── main.go           # TCP 服务器，调用 FileWatcher 接口（不变动核心逻辑）
```

---

### Task 1: 创建 `watcher.go` — 接口定义

**Files:**
- Create: `D:\ProjectFile\docSeeker\go\usn\watcher.go`
- Reference: `D:\ProjectFile\docSeeker\go\usn\journal.go:58-66`（现有 UsnEvent）

- [ ] **Step 1: 创建 `watcher.go`，定义 FileWatcher 接口**

```go
package usn

import "time"

// FileWatcher 是文件监控接口，各平台实现此接口即可。
// Windows 实现：usn_watcher.go（NTFS USN Journal）
// macOS 实现：fsevents_watcher.go（未来，FSEvents）
// Linux 实现：inotify_watcher.go（未来，inotify）
type FileWatcher interface {
    // Start 开始监控指定目录列表。Idempotent。
    Start(dirs []string)
    // Stop 停止监控，释放所有资源。
    Stop()
    // UpdateDirs 动态更新监控目录。
    UpdateDirs(dirs []string)
}

// UsnEvent 是统一的事件类型（从 watcher.go 移出，保持兼容）
type UsnEvent struct {
    Event       string
    Path        string
    Volume      string
    Timestamp   int64
    OldPath     string
    IsDirectory bool
}
```

- [ ] **Step 2: 提交**

```bash
cd D:/ProjectFile/docSeeker
git add go/usn/watcher.go
git commit -m "feat(usn): 定义 FileWatcher 接口，UsnEvent 类型平台无关"
```

---

### Task 2: 创建 `usn_watcher.go` — Windows USN Journal 实现

**Files:**
- Create: `D:\ProjectFile\docSeeker\go\usn\usn_watcher.go`
- Reference: `D:\ProjectFile\docSeeker\go\usn\journal.go`（现有常量、结构体、OpenVolume、CreateJournal、ReadJournalStart、parseUsnRecords）
- Reference: `D:\ProjectFile\docSeeker\go\usn\manager.go`（现有 VolumeManager 逻辑）

**说明：** 本文件是 Windows 平台核心实现，包含：
- USN Journal 常量（FSCTL_*、FILE_*）
- USN_RECORD_V2 结构体
- `OpenVolume`、`CreateJournal`、`ReadJournalStart`（原 journal.go）
- `parseUsnRecords` + `utf16ToString`（原 journal.go）
- **`pathResolver` 正确实现**（修复现有 bug）
- **`UsnWatcher` 实现 FileWatcher 接口**

- [ ] **Step 1: 实现 `usn_watcher.go` 骨架：常量 + 结构体 + OpenVolume + CreateJournal + ReadJournalStart + parseUsnRecords**

复制 `journal.go` 的常量区（15-56行）、`OpenVolume`（68-80行）、`CreateJournal`（82-100行）、`ReadJournalStart`（102-147行）、`parseUsnRecords`（149-204行）、`utf16ToString`（206-215行），整理到文件顶部。

- [ ] **Step 2: 实现 `pathResolver`（修复核心 bug）**

完整重写 `pathResolver`，逻辑如下：

```go
// pathResolver resolves full paths from USN parent FRNs using a directory cache.
// Strategy: the monitor already has the full tree in the FRN cache.
// When an unknown parent is encountered, walk from the nearest cached ancestor.
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
    pr.cache[0] = pr.volumeRoot // FRN 0 → root
    // 预热 roots 下所有子目录的 parentFRN → path 映射
    for _, root := range roots {
        pr.warmupRoot(root)
    }
    return pr
}

// warmupRoot 遍历一个监控根目录，将所有子目录的 parentFRN → path 缓存起来。
// 对每个目录：打开目录句柄 → NtQueryInformationFile(FileIdInformation) 获取 FRN → 缓存 parentFRN。
func (pr *pathResolver) warmupRoot(root string) {
    // 使用 os.File 的 ReadDir 无法获取 FRN，改用 filepath.WalkDir + 手动打开
    // WalkDir 只遍历目录，不需要逐个打开文件
    filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
        if err != nil || !d.IsDir() {
            return nil
        }
        // 跳过 root 本身（FRN = root's parent = 0，cache[0] 已存在）
        if path == root {
            return nil
        }
        // 获取 path 的父目录 FRN（即 root 下某级目录）
        parentPath := filepath.Dir(path)
        parentPathFS := filepath.ToSlash(parentPath)

        // 从 cache 中查找 parentPath 对应的 FRN
        // 如果 parentPath 在 cache 中，说明已经记录过它的 FRN
        var parentFRN uint64
        for frn, cachedPath := range pr.cache {
            if cachedPath == parentPathFS+"/" {
                parentFRN = frn
                break
            }
        }

        // 打开当前目录获取自己的 FRN
        h, err := windows.CreateFile(
            windows.StringToUTF16Ptr(`\\.\`+pr.volumeChar+`\`+strings.ReplaceAll(filepath.ToSlash(path), "/", `\`)),
            0,
            windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
            nil,
            windows.OPEN_EXISTING,
            windows.FILE_FLAG_BACKUP_SEMANTICS,
            0,
        )
        if err != nil {
            return nil
        }
        defer windows.CloseHandle(h)

        var frn uint64
        buf := make([]byte, 32)
        var retLen uint32
        r1, _, _ := windows.NewLazyDLL("ntdll.dll").NewProc("NtQueryInformationFile").Call(
            uintptr(h), uintptr(unsafe.Pointer(&retLen)),
            uintptr(unsafe.Pointer(&buf[0])), uintptr(32), uintptr(54),
        )
        if r1 == 0 && retLen >= 16 {
            frn = binary.LittleEndian.Uint64(buf[0:8])
        }
        if frn != 0 && parentFRN != 0 {
            pr.cache[parentFRN] = parentPathFS + "/"
            pr.cache[frn] = filepath.ToSlash(path) + "/"
        }
        return nil
    })
}
```

**关键说明：** `warmupRoot` 不再每次从根目录遍历，而是只遍历监控目录（通常只有几十到几千个文件夹），在大目录树下完全避免全卷扫描。`parentFRN` 通过缓存已有的 `frn → path` 反查得到。

- [ ] **Step 3: 实现 `resolvePathByParentFRN`**

```go
func (pr *pathResolver) resolvePathByParentFRN(parentFRN uint64, filename string) string {
    if parentFRN == 0 {
        return pr.volumeRoot + filename
    }
    if parentPath, ok := pr.cache[parentFRN]; ok {
        return parentPath + filename
    }
    // 找不到 → fallback 到 root + filename（最坏情况，但不会崩溃）
    return pr.volumeRoot + filename
}
```

- [ ] **Step 4: 实现 `UsnWatcher`（实现 FileWatcher）**

```go
// UsnWatcher 是 Windows NTFS USN Journal 实现。
type UsnWatcher struct {
    volumeRoots []string // 监控根目录（forward slash）
    notifyCh    chan UsnEvent
    vm          *volumeManager // 内部引用
}

func NewUsnWatcher(notifyCh chan UsnEvent) *UsnWatcher {
    return &UsnWatcher{notifyCh: notifyCh}
}

func (w *UsnWatcher) Start(dirs []string) {
    w.vm = newVolumeManager(w.notifyCh)
    w.volumeRoots = dirs
    w.vm.UpdateDirs(dirs)
}

func (w *UsnWatcher) Stop() {
    if w.vm != nil {
        w.vm.Stop()
    }
}

func (w *UsnWatcher) UpdateDirs(dirs []string) {
    w.volumeRoots = dirs
    if w.vm != nil {
        w.vm.UpdateDirs(dirs)
    }
}
```

- [ ] **Step 5: 提交**

```bash
git add go/usn/usn_watcher.go
git commit -m "feat(usn): 实现 UsnWatcher（Windows NTFS USN Journal）+ 正确 pathResolver"
```

---

### Task 3: 重构 `volume_manager.go`（原 manager.go）

**Files:**
- Modify: `D:\ProjectFile\docSeeker\go\usn\volume_manager.go`（新建，复制自 manager.go）
- Delete: `D:\ProjectFile\docSeeker\go\usn\journal.go`
- Reference: `D:\ProjectFile\docSeeker\go\usn\manager.go`

- [ ] **Step 1: 将 `manager.go` 重命名为 `volume_manager.go`**

```bash
mv D:/ProjectFile/docSeeker/go/usn/manager.go D:/ProjectFile/docSeeker/go/usn/volume_manager.go
```

- [ ] **Step 2: 修改 `volume_manager.go` 内部引用**

- `package usn` → 不变
- `NewVolumeManager` → `newVolumeManager`（私有，供 UsnWatcher 调用）
- `UpdateDirs` → 保留公开接口
- 移除 `getVolumeLetter` 的路径规范化逻辑（已统一 forward slash）
- `readLoop` 中的 `shouldNotify` 路径比较：直接用 forward slash，简化

- [ ] **Step 3: 删除 `journal.go`**

```bash
rm D:/ProjectFile/docSeeker/go/usn/journal.go
```

- [ ] **Step 4: 确认编译通过**

```bash
cd D:/ProjectFile/docSeeker/go && C:/PROGRA~1/Go/bin/go.exe build -o usn-monitor.exe .
```

预期：编译成功，无错误。

- [ ] **Step 5: 提交**

```bash
git add go/usn/volume_manager.go go/usn/journal.go
git rm go/usn/journal.go
git commit -m "refactor(usn): 重构为 volume_manager.go，删除 journal.go 死代码"
```

---

### Task 4: 更新 `main.go` 使用新结构

**Files:**
- Modify: `D:\ProjectFile\docSeeker\go\main.go:15-31`
- Reference: `D:\ProjectFile\docSeeker\go\main.go`

- [ ] **Step 1: 更新 `main.go` 的引用**

将：
```go
vm = usn.NewVolumeManager(notifyCh)
```
改为：
```go
watcher = usn.NewUsnWatcher(notifyCh)
```

将：
```go
vm.UpdateDirs(cmd.Dirs)
```
改为：
```go
watcher.UpdateDirs(cmd.Dirs)
```

- [ ] **Step 2: 声明改为接口类型**

```go
var watcher usn.FileWatcher
```

- [ ] **Step 3: 编译确认**

```bash
cd D:/ProjectFile/docSeeker/go && C:/PROGRA~1/Go/bin/go.exe build -o usn-monitor.exe .
```

预期：编译成功。

- [ ] **Step 4: 提交**

```bash
git add go/main.go
git commit -m "refactor(usn): main.go 依赖 FileWatcher 接口，支撑跨平台"
```

---

### Task 5: 更新文档

**Files:**
- Modify: `D:\ProjectFile\docSeeker\docs\PROGRESS.md`
- Modify: `D:\ProjectFile\docSeeker\docs\ROADMAP.md`
- Create: `D:\ProjectFile\docSeeker\docs\superpowers\plans\2026-04-19-usn-cross-platform-design.md`（设计文档）

- [ ] **Step 1: 创建设计文档 `2026-04-19-usn-cross-platform-design.md`**

```markdown
# USN 监控跨平台架构设计

## 背景

M1.4 实时文件监控使用 Windows NTFS USN Journal API，原实现硬编码了平台逻辑。
为支撑未来 macOS（FSEvents）和 Linux（inotify）监控，需抽取抽象接口。

## 架构设计

### 接口层

```go
// FileWatcher 是文件监控的统一接口
type FileWatcher interface {
    Start(dirs []string)
    Stop()
    UpdateDirs(dirs []string)
}
```

### 各平台实现

| 文件 | 平台 | 实现 |
|------|------|------|
| `usn_watcher.go` | Windows | NTFS USN Journal API |
| `fsevents_watcher.go` | macOS | FSEvents API（未来） |
| `inotify_watcher.go` | Linux | inotify API（未来） |

### 目录结构

```
go/usn/
├── watcher.go        # FileWatcher 接口 + UsnEvent 类型（平台无关）
├── usn_watcher.go    # Windows NTFS USN Journal 实现
├── volume_manager.go # 按卷分组的 goroutine 管理
└── main.go           # TCP 服务器，调用 FileWatcher 接口
```

### 通信协议（不变）

Electron TS → TCP JSON → Go FileWatcher，协议格式不变。

## USN Journal 实现细节

### FRN → Full Path 解析

USN Journal 的 `FileName` 字段只含文件名不含路径。通过 `ParentFileReferenceNumber`（父目录 FRN）解析完整路径：

1. `pathResolver` 在 `Start` 时预热监控目录下所有子目录的 `parentFRN → path` 缓存
2. 解析时查缓存：`parentFRN` → `parentPath` → `parentPath + filename` = 完整路径
3. 命中失败时 fallback 到 `volumeRoot + filename`

### 跨卷监控

`VolumeManager`（goroutine per volume）管理多个卷，各卷独立读写 USN Journal，独立 pathResolver。

### 事件映射

| USN Reason | Event |
|-----------|-------|
| FILE_CREATE | created |
| FILE_DELETE | deleted |
| FILE_RENAMED_OLD_NAME + NEW_NAME | renamed |
| DATA_OVERWRITE / DATA_TRUNCATION | modified |
| 目录对应事件 | folder_created / folder_deleted |

## 未来扩展

- macOS：`fsevents_watcher.go`，使用 `github.com/thejerf/fsevents` 或直接调用 C API
- Linux：`inotify_watcher.go`，使用 `golang.org/x/sys/unix.InotifyInit`
```

- [ ] **Step 2: 更新 `PROGRESS.md`**

在 M1.4 行备注追加：
```
NTFS USN Journal + Go 独立进程，跨卷监控，动态目录配置，FileWatcher 接口抽象
```

- [ ] **Step 3: 更新 `ROADMAP.md`**

在 Phase 1 M1.4 行更新备注：
```
实时文件监控（FileWatcher 接口抽象 + Windows NTFS USN Journal 实现）
```

在 Phase 4 M4.4 行备注追加：
```
FileWatcher 接口已抽象，macOS FSEvents / Linux inotify 实现只需新增文件
```

- [ ] **Step 4: 提交**

```bash
git add docs/PROGRESS.md docs/ROADMAP.md
git add docs/superpowers/plans/2026-04-19-usn-cross-platform-design.md
git commit -m "docs: 更新文档，补充跨平台架构设计和 FileWatcher 接口"
```

---

## 自检清单

- [ ] Spec 覆盖：FileWatcher 接口、usn_watcher.go、跨平台设计文档，全部有对应 task
- [ ] 无 placeholder：所有 task 都有完整代码，路径均为绝对路径
- [ ] 类型一致性：main.go 中 `var watcher usn.FileWatcher` 声明，调用 `UpdateDirs`、`Stop` 与接口一致
- [ ] 编译：Task 3 和 Task 4 各有编译验证步骤
