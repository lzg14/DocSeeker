# USN 监控跨平台架构设计

> 创建时间: 2026-04-19

## 背景

M1.4 实时文件监控使用 Windows NTFS USN Journal API，原实现硬编码了平台逻辑。
为支撑未来 macOS（FSEvents）和 Linux（inotify）监控，需抽取抽象接口。

## 架构设计

### 接口层

```go
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
├── volume_manager.go # 按卷分组的 goroutine 管理（已合并入 usn_watcher.go）
└── main.go           # TCP 服务器，调用 FileWatcher 接口
```

### 通信协议（不变）

Electron TS -> TCP JSON -> Go FileWatcher，协议格式不变。

## USN Journal 实现细节

### FRN -> Full Path 解析

USN Journal 的 `FileName` 字段只含文件名不含路径。通过 `ParentFileReferenceNumber`（父目录 FRN）解析完整路径：

1. `pathResolver` 在 `Start` 时预热监控目录下所有子目录的 `parentFRN -> path` 缓存
2. `walkAndCache` 递归遍历监控目录，通过 `NtQueryInformationFile(FileIdExtdDirectoryInformation, class=89)` 获取每个目录的 FRN 和 parentFRN
3. `resolvePathByParentFRN` 从缓存解析完整路径：`parentFRN -> parentPath -> parentPath + filename` = 完整路径
4. 命中失败时 fallback 到 `volumeRoot + filename`

### 关键实现细节

- **class 89 (FileIdExtdDirectoryInformation)**: 唯一包含 ParentFileId 的 USN 路径查询接口。class 54 (FileIdInformation) 只含 FRN 和 VolumeSerialNumber，不含 parent FRN
- **预热策略**: 启动时只遍历监控目录子树，而非全卷扫描。对大目录树友好
- **RWMutex**: `pathResolver.cache` 使用读写锁保护，防止 readLoop goroutine 与未来热更新冲突
- **roots 快照**: `readLoop` 每 tick 通过 `RLock` 捕获 `ctx.roots` 快照，避免 data race

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

实现只需：
1. 创建 `fsevents_watcher.go` 或 `inotify_watcher.go`
2. 实现 `FileWatcher` 接口
3. `main.go` 保持不变（依赖接口，不依赖实现）
