# DocSeeker 项目规范

## 功能变更同步规则

- **新增功能**：必须同步更新以下位置
  - `docs/PROGRESS.md` - 已完成功能列表
  - `docs/ROADMAP.md` - 里程碑状态
  - `src/pages/GuidePage.tsx` - 关于页功能描述（多语言 i18n）
  - `src/context/LanguageContext.tsx` - 如果涉及翻译文本

- **删除/暂缓功能**：必须从上述位置移除相关描述

- **规则**：代码和文档同步提交，不允许文档落后于代码

## 关于页（GuidePage）更新说明

关于页展示软件功能特性，包含多语言翻译：
- 中文：`guide.feature1` ~ `guide.feature7`
- 英文：对应的英文 key

功能变更时，需要同时更新 i18n 翻译文本。

## 前端规范

### CSS 变量命名
- 使用 `--` 前缀 + 语义化命名，如 `--primary-color`、`--text-secondary`
- 禁止使用内联 style，统一使用 CSS 变量或 class

### 组件结构
- 一个组件一个文件，文件名与组件名一致
- Props 和 State 类型定义在组件文件顶部或单独 types 文件
- 优先使用函数组件 + Hooks

## Electron 规范

### 主进程 / 渲染进程通信
- 渲染进程通过 `window.electron.xxx()` 调用主进程（preload 暴露的 API）
- 禁止在渲染进程中直接 import `electron` 模块
- IPC handler 注册统一放在 `electron/main/ipc.ts`
- 每个 IPC channel 名称格式：`module-action`，如 `file-read`、`search-query`

### 进程安全
- 不在 preload 之外暴露 Node.js API 到渲染进程
- 用户输入必须经过验证再传给主进程

## 数据库规范

### 直接查询 SQLite 数据
- **使用 Python 脚本**，不要用 Node.js REPL 或重新构建 sql.js
- 示例：`node -e "..."` 使用 sql.js 需要编译/加载 WASM，容易出错
- Python: `python -c "import sqlite3; ..."` 或编写 `.py` 脚本直接查询

### SQLite 字段修改流程
1. 在 `migration.ts` 中编写迁移脚本，使用 ALTER TABLE
2. 修改实体类字段后，必须同步更新 TypeScript 类型定义
3. 迁移前先备份数据库文件
4. **禁止直接修改已有字段类型**，新增字段或创建新表迁移数据
5. 提交前验证迁移脚本在开发环境运行正常

## 双击 Ctrl 热键实现

### 技术方案

由于 DocSeeker 的文件监控模块（USN Watcher）运行在独立的 Go 进程（`docseeker-monitor.exe`）中，双击 Ctrl 检测逻辑也必须在该进程中实现。

**最初尝试的方案（已废弃）**：使用 Windows Low-Level Keyboard Hook (`SetWindowsHookEx` + `WH_KEYBOARD_LL`)

```go
// 废弃方案：使用 SetWindowsHookEx 注册低级键盘钩子
hook, _, err := procSetHook.Call(
    uintptr(WH_KEYBOARD_LL),
    uintptr(kbProc),
    uintptr(module),
    0,
)
```

**问题**：`SetWindowsHookEx` 在独立的后台进程中无法可靠地接收全局键盘事件。hook 成功注册，但回调函数永远不会被触发。

---

### 最终采用的方案：轮询 `GetAsyncKeyState`

使用 `GetAsyncKeyState` API 轮询检测 Ctrl 键状态，通过状态机识别双击模式。

**实现文件**：`go/keyboard_hook.go`

**核心代码**：

```go
// 导入 Windows API
import "golang.org/x/sys/windows"

// 调用 GetAsyncKeyState 检测 Ctrl 键状态
func GetAsyncKeyState(vkey int32) uintptr {
    ret, _, _ := syscall.NewLazyDLL("user32.dll").NewProc("GetAsyncKeyState").Call(uintptr(vkey))
    return ret
}

// 状态机定义
const (
    stateIdle    int32 = 0  // 空闲状态
    statePressed int32 = 1  // Ctrl 已按下
    stateWaiting int32 = 2  // 等待第二次按下
)

// 双击时间窗口：300ms
const DoubleCtrlWindow = 300 * time.Millisecond

// 轮询检测逻辑
func (hk *keyboardHook) checkCtrlKey() {
    // VK_CONTROL = 0x11
    ctrlPressed := GetAsyncKeyState(0x11) & 0x8000 != 0
    prevState := hk.ctrlState.Load()

    switch {
    case ctrlPressed && prevState == stateIdle:
        // Ctrl 首次按下
        hk.ctrlState.Store(statePressed)

    case !ctrlPressed && prevState == statePressed:
        // Ctrl 释放，启动等待计时器
        hk.ctrlState.Store(stateWaiting)
        hk.timer = time.AfterFunc(DoubleCtrlWindow, func() {
            hk.ctrlState.Store(stateIdle)  // 超时后恢复空闲
        })

    case ctrlPressed && prevState == stateWaiting:
        // 在等待窗口内再次按下 = 双击成功
        hk.timer.Stop()
        hk.ctrlState.Store(stateIdle)
        go hk.callback()  // 触发回调，显示浮动搜索窗口
    }
}
```

**工作流程**：

```
状态机流程：
┌─────────┐  Ctrl按下  ┌───────────┐  Ctrl释放  ┌──────────┐
│  Idle   │ ─────────> │  Pressed  │ ─────────> │ Waiting  │
└─────────┘            └───────────┘            └──────────┘
     ^                      │                        │
     │                      │                        │
     │   300ms超时          │  Ctrl再次按下          │
     │ <───────────────────┘ <─────────────────────┘
     │
     │ 双击成功
     │
     └── 触发 callback
```

### 轮询实现

```go
func (hk *keyboardHook) run() {
    hk.isRunning.Store(true)
    pollInterval := 16 * time.Millisecond // ~60fps 轮询频率

    for {
        select {
        case <-hk.done:
            hk.isRunning.Store(false)
            return
        default:
            hk.checkCtrlKey()
            time.Sleep(pollInterval)
        }
    }
}
```

### 与 Electron 的通信

当检测到双击时，通过 TCP 连接发送消息：

```go
func onDoubleCtrl() {
    // 向 Electron 主进程发送 double_ctrl 消息
    msg, _ := json.Marshal(map[string]string{"type": "double_ctrl"})
    conn.Write(msg)
}
```

Electron 端收到消息后显示浮动搜索窗口。

### 跨平台设计

**Windows**：
- 支持双击 Ctrl 热键（通过 `GetAsyncKeyState` 轮询实现）
- 同时支持全局快捷键（如 `Ctrl+Shift+F`）

**macOS**：
- 仅支持全局快捷键
- 不支持双击 Ctrl（因为 `GetAsyncKeyState` 是 Windows 专用 API）
- macOS 上建议使用 `Cmd+Space` 等组合键作为替代方案

### 为什么不用 Electron 的 globalShortcut 检测双击

Electron 的 `globalShortcut` 模块可以注册全局快捷键，但它：
1. 只能检测完整的组合键（如 `Ctrl+Shift+F`）
2. 不支持检测单键的双击模式

因此需要自定义实现来检测双击 Ctrl。
