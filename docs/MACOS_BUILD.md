# macOS Build Guide

DocSeeker macOS 版本构建指南。

## 前置要求

- macOS 10.15+ (Catalina or later)
- Xcode Command Line Tools
- Go 1.21+
- Node.js 18+
- npm

## 1. 交叉编译 Go 监控进程

### 在 macOS 上编译

```bash
cd go

# 编译 macOS 版本
GOOS=darwin GOARCH=amd64 go build -o docseeker-monitor .
# 或 ARM64 版本
GOOS=darwin GOARCH=arm64 go build -o docseeker-monitor .

# 编译 Windows 版本 (可选)
GOOS=windows GOARCH=amd64 go build -o docseeker-monitor.exe .
```

### 在 Linux 上交叉编译 macOS 版本

需要安装 macOS 交叉编译工具链：

```bash
# 安装 macOS 交叉编译工具 (Ubuntu/Debian)
sudo apt install mingw-w64
go install github.com/geph4/macos-sdk@latest

# 编译
cd go
GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 \
  MACOS_SDK_PATH=/path/to/macos-sdk \
  go build -o docseeker-monitor .
```

## 2. 修改 package.json

确保包含 macOS 构建配置：

```json
{
  "build": {
    "mac": {
      "category": "public.app-category.productivity",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "target": [
        {
          "target": "dmg",
          "arch": ["x64", "arm64"]
        }
      ]
    },
    "extraResources": [
      {
        "from": "go/docseeker-monitor",
        "to": "docseeker-monitor",
        "filter": ["**/*"]
      }
    ]
  }
}
```

## 3. 构建应用

```bash
# 构建 macOS 版本
npm run build:mac

# 构建所有平台
npm run build:win
npm run build:mac
npm run build:linux
```

## 平台差异说明

| 功能 | Windows | macOS | 说明 |
|------|---------|-------|------|
| 文件监控 | USN Journal | FSEvents (fsnotify) | Go 代码已兼容 |
| 双击 Ctrl | ✅ | ❌ | macOS 无此功能 |
| 全局快捷键 | ✅ | ✅ | Ctrl → Cmd 自动转换 |
| 右键菜单集成 | ✅ | ❌ | 已移除 |
| 系统托盘 | ✅ | ✅ | Menu bar 图标 |

## macOS 特有功能

- **Menu Bar 图标**: 应用图标显示在顶部菜单栏
- **Dock 图标**: Launchpad 和 Finder 中显示
- **Auto-launch**: 使用 `~/Library/LaunchAgents`

## 代码修改

### go/main.go

键盘钩子已添加平台判断：

```go
if runtime.GOOS == "windows" {
    if err := StartKeyboardHook(onDoubleCtrl); err != nil {
        fmt.Fprintf(os.Stderr, "WARN: keyboard hook failed: %v\n", err)
    }
}
```

### electron/main/usnWatcher.ts

二进制路径已添加平台判断：

```typescript
const binaryName = process.platform === 'win32'
  ? 'docseeker-monitor.exe'
  : 'docseeker-monitor'
```

## 签名和公证 (可选)

发布到 App Store 或第三方分发需要签名：

```bash
# 签名
codesign --sign "Developer ID Application: Your Name" dist/DocSeeker-*.dmg

# 公证 (需要 Apple Developer 账号)
xcrun notarytool submit dist/DocSeeker-*.dmg --apple-id "your@email.com" --team-id "YOURTEAMID"
```

## 故障排除

### Go 交叉编译问题

**错误**: `ld: library 'pthread' not found`

**解决**:
```bash
export CGO_ENABLED=1
go build -o docseeker-monitor .
```

### 应用无法启动

检查日志：
```bash
open /Applications/DocSeeker.app/Contents/MacOS/DocSeeker
```

### 监控进程未启动

检查 `~/Library/Logs/DocSeeker/` 下的日志文件。
