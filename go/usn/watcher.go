package usn

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
	Event       string // 事件类型：created/modified/deleted/renamed/folder_*
	Path        string // 文件/目录完整路径（forward slash）
	Volume      string // 卷名，如 "D:/"
	Timestamp   int64  // Unix epoch 毫秒
	OldPath     string // rename 事件的旧路径
	IsDirectory bool   // 是否为目录
}
