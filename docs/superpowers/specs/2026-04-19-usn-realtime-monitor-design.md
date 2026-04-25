# M1.4 实时文件监控 — 技术设计文档

> 维护人：lizhgb
> 日期：2026-04-19
> 状态：设计完成，待实施

---

## 一、背景与目标

### 1.1 问题

原 chokidar 方案在大目录场景下性能不可接受，已被移除（见 ROADMAP.md）。NTFS USN Journal 是 Windows 内核级文件变更记录，零开销、毫秒级延迟，是实时监控的最佳选择。

### 1.2 目标

- 文件系统变更（创建/修改/删除/重命名）毫秒级感知
- 监控目录可跨多个卷（`D:\`、`E:\` 等）
- 用户可配置开关，不占用非监控用户的资源
- 前端搜索结果实时追加，无需手动刷新
- 文件夹变更同步更新（与"文件夹名称索引"功能联动）

### 1.3 与其他功能的关联

本功能与以下功能共享 `usnHandler.ts` 事件处理逻辑，**实施时需同步规划**：

| 关联功能 | 共享逻辑 |
|---------|---------|
| 文件夹名称索引（`shard_folders` 表） | USN 检测到目录变更时，同步写入 `shard_folders` 表 |
| 不支持格式文件名索引 | `shard_files.is_supported` 字段，`false` 时仅索引文件名 |
| 文件夹重命名路径更新 | `shard_files` / `shard_folders` 表的路径前缀批量替换（见 4.2） |

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Electron 主进程 (TypeScript)                                     │
│                                                                   │
│  ┌────────────────┐   ┌──────────────────┐   ┌───────────────┐ │
│  │ usnWatcher.ts  │◄──│  TCP JSON 通信   │   │ usnHandler.ts │ │
│  │ 子进程生命周期   │   │  双向异步消息    │   │  事件处理      │ │
│  └───────┬────────┘   └───────┬──────────┘   └───────┬───────┘ │
│          │                    │                       │          │
└──────────┼────────────────────┼───────────────────────┼──────────┘
           │  进程拉起/终止      │  JSON Event             │
           │  init / update_dirs │ event / ack / err      │
           ▼                    ▼                          ▼
┌──────────────────────────────────────────────────────────────────┐
│  go-usn-monitor.exe  (Go 独立进程，单一实例)                      │
│                                                                   │
│  启动参数: 无（目录列表由 Electron 动态下发）                     │
│  进程生命周期: Electron 启动时拉起，空闲超时自动退出                │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                    volumeManager                          │    │
│  │          （按卷分组，每卷一个 goroutine）                  │    │
│  │                                                           │    │
│  │  goroutine: volume D:\                                    │    │
│  │    USN Journal 订阅 (FSCTL_READ_USN_JOURNAL)              │    │
│  │    路径过滤器 (前缀匹配: D:\Work, D:\Personal)            │    │
│  │    事件推送                                                │    │
│  │                                                           │    │
│  │  goroutine: volume E:\                                    │    │
│  │    ... 同上                                               │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   NTFS USN Journal   │
                         │   (内核级变更记录)    │
                         └─────────────────────┘
```

---

## 三、Go 进程设计

### 3.1 入口与进程管理

**文件：** `go/main.go`

职责：
- 监听 TCP `127.0.0.1:29501`（端口号固定，开发期间可配置）
- 解析来自 Electron 的 JSON 命令
- 调度 volumeManager 创建/销毁各卷订阅
- 子进程 SIGTERM / 断开连接时优雅退出

### 3.2 消息协议

**Electron → Go（命令）：**

```json
// 初始化/全量更新监控目录
{
  "type": "init",
  "dirs": ["D:\\Work", "D:\\Personal", "E:\\Backups"]
}

// 增量更新监控目录
{
  "type": "update_dirs",
  "dirs": ["D:\\Work", "D:\\Project"]
}

// 心跳（保活）
{
  "type": "ping"
}
```

**Go → Electron（事件）：**

```json
// 文件变更事件
{
  "type": "event",
  "event": "created",
  "path": "D:\\Work\\a.txt",
  "volume": "D:\\",
  "timestamp": 1745068800000
}

// 目录创建事件
{
  "type": "event",
  "event": "folder_created",
  "path": "D:\\Work\\NewFolder",
  "volume": "D:\\",
  "timestamp": 1745068800000
}

// 重命名事件（含原路径）
{
  "type": "event",
  "event": "renamed",
  "path": "D:\\Work\\new.txt",
  "volume": "D:\\",
  "timestamp": 1745068800000,
  "oldPath": "D:\\Work\\old.txt"
}

// 目录重命名事件（需批量更新子路径）
{
  "type": "event",
  "event": "folder_renamed",
  "path": "D:\\Work2",
  "volume": "D:\\",
  "timestamp": 1745068800000,
  "oldPath": "D:\\Work"
}

// 命令响应
{
  "type": "ack",
  "command": "init"
}

// 错误
{
  "type": "err",
  "message": "volume D:\\ not found"
}
```

> 注：`event` 字段取值：`created | modified | deleted | renamed | folder_created | folder_deleted | folder_renamed`

### 3.3 按卷分组与路径过滤

**文件：** `go/usn/manager.go`

- `volumeManager` 接收目录列表，按卷分组：
  ```
  {D:\ → [D:\Work, D:\Personal], E:\ → [E:\Backups]}
  ```
- 每个卷对应一个 goroutine，订阅该卷的 USN Journal
- 路径过滤：USN Record 的 `FileName` 与监控路径前缀匹配才推送
- 重命名事件：Windows USN 会同时报 `FILE_RENAMED_OLD_NAME` 和 `FILE_RENAMED_NEW_NAME`，Go 合并为一条 `renamed` 事件

### 3.4 USN Journal API 封装

**文件：** `go/usn/journal.go`

使用 `golang.org/x/sys/windows` 包：

```go
// 核心调用
DeviceIoControl(hANDLE, FSCTL_CREATE_USN_JOURNAL, ...)
DeviceIoControl(hANDLE, FSCTL_READ_USN_JOURNAL, ...)

// 持续读取循环（非阻塞，MFT_USN_JOURNAL_CHANGE_ONLY mode）
for {
    n, err := DeviceIoControl(..., USN_JOURNAL_DATA, buffer)
    // 解析 USN_RECORD，打印或过滤
}
```

**需要处理的 USN Reason：**
- `FILE_CREATE` → `created`（文件或目录）
- `FILE_DELETE` → `deleted`（文件或目录）
- `DATA_OVERWRITE` / `DATA_TRUNCATION` → `modified`（仅文件）
- `FILE_RENAME_OLD_NAME` + `FILE_RENAME_NEW_NAME` → `renamed`（文件或目录）
- `SECURITY_CHANGE` / `ATTRIBUTE_CHANGE` 等 → 忽略（不推事件）

**区分文件与目录：** 通过 USN Record 的 `FileAttributes` 字段的 `FILE_ATTRIBUTE_DIRECTORY` 位判断。文件推送 `created/modified/deleted/renamed`，目录推送 `folder_created/folder_deleted/folder_renamed`。

### 3.5 进程生命周期

- **启动**：Electron 发送 `init` 后，Go 开始订阅并推送事件
- **空闲退出**：Go 启动时记录启动时间，若超过 5 分钟（可配置）未收到任何事件，自动退出。收到 Electron 消息则重置计时器
- **异常退出**：订阅失败、端口冲突等，Go 输出错误 JSON 后退出，Electron 捕获子进程 exit 事件

---

## 四、Electron 端设计

### 4.1 子进程管理

**文件：** `electron/main/usnWatcher.ts`

职责：
- 读取用户配置，判断是否启用实时监控
- 启动/终止 `go-usn-monitor.exe` 子进程
- 维护 TCP 连接，解析 JSON 消息
- 发送 `init` / `update_dirs` 命令

```typescript
class UsnWatcher {
  private process: ChildProcessWithoutNullStreams | null = null
  private client: net.Socket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private idleTimer: NodeJS.Timeout | null = null

  async start(): Promise<void> {
    // 1. 检查配置
    const enabled = await config.get('realtimeMonitor.enabled')
    if (!enabled) return

    // 2. 拉起 Go 进程
    this.process = spawn(
      path.join(process.resourcesPath || '', 'go-usn-monitor.exe'),
      [],
      { detached: false }
    )

    // 3. 建立 TCP 连接
    await this.connect()

    // 4. 发送初始化目录列表
    const dirs = await config.get('realtimeMonitor.dirs')
    this.send({ type: 'init', dirs })
  }

  stop(): void {
    this.client?.destroy()
    this.process?.kill()
    this.process = null
  }
}
```

### 4.2 事件处理

**文件：** `electron/main/usnHandler.ts`

职责：
- 接收 Go 推送的变更事件
- 根据事件类型调用 shardManager 写入 shard
- 通知前端搜索结果更新

```typescript
// electron/main/usnHandler.ts

type UsnEventType =
  | 'created' | 'modified' | 'deleted' | 'renamed'   // 文件
  | 'folder_created' | 'folder_deleted' | 'folder_renamed'  // 目录

interface UsnEvent {
  type: 'event'
  event: UsnEventType
  path: string
  volume: string
  timestamp: number
  oldPath?: string
}

export async function handleUsnEvent(ev: UsnEvent): Promise<void> {
  switch (ev.event) {
    case 'created':
      await addFile(ev.path)
      break
    case 'modified':
      await updateFile(ev.path)
      break
    case 'deleted':
      await removeFile(ev.path)
      break
    case 'renamed':
      await renameFile(ev.oldPath!, ev.path)
      break
    case 'folder_created':
      await addFolder(ev.path)
      break
    case 'folder_deleted':
      await removeFolderAndContents(ev.path)    // 目录删除 → 级联删除子文件索引
      break
    case 'folder_renamed':
      await renameFolderAndContents(ev.oldPath!, ev.path)  // 批量更新子文件路径
      break
  }

  // 通知前端
  notifyRenderer(ev)
}
```

**各事件处理逻辑：**

| 事件 | shard_files 操作 | shard_folders 操作 |
|------|-----------------|-------------------|
| `created` | INSERT（或 UPDATE 若已存在） | — |
| `modified` | UPDATE content（异步重新提取） | — |
| `deleted` | DELETE record | — |
| `renamed` | UPDATE path, name | — |
| `folder_created` | — | INSERT |
| `folder_deleted` | DELETE 所有 path 以该目录为前缀的记录 | DELETE 该目录及所有子目录 |
| `folder_renamed` | `REPLACE(path, oldPath, newPath)` 批量更新 | 同上批量更新 + 递归子目录 |

**文件夹重命名路径批量替换：**

```typescript
// shardManager.renameFolderContents(oldPath, newPath)
// SQLite REPLACE 函数单条 SQL 完成路径前缀替换
async function renameFolderAndContents(oldPath: string, newPath: string): Promise<void> {
  await db.exec(`
    UPDATE shard_files
    SET path = REPLACE(path, '${escapeSql(oldPath)}\\', '${escapeSql(newPath)}\\'),
        name = '${escapeSql(path.basename(newPath))}' || SUBSTR(name, ${oldPath.length + 1})
    WHERE path LIKE '${escapeSql(oldPath)}\\%'
  `)
  // shard_folders 同理，递归处理所有子目录
}
```

> ⚠️ **用户知情权**：开启实时监控后，**删除文件夹会导致该文件夹下所有文件的搜索索引同步被删除**（不可恢复，直到下次全量扫描补充）。此行为需在配置界面明确告知用户。

### 4.3 搜索结果实时追加

**文件：** `electron/main/search.ts` + IPC

- 新增 `usn-update` IPC channel，Electron 主动推送变更事件到 renderer
- Renderer 端维护一个增量结果缓冲区 `pendingResults[]`
- 搜索结果列表顶部显示 `📂 检测到 N 个新文件，点击加载`，点击后将缓冲区内容合入主列表

---

## 五、前端设计

### 5.1 配置界面

**位置：** `src/pages/SettingsPage.tsx`

新增配置项：

| 配置项 | 类型 | 默认值 |
|--------|------|--------|
| `realtimeMonitor.enabled` | boolean | `false` |
| `realtimeMonitor.dirs` | string[] | `[]`（取自当前扫描目录） |

UI：开关 toggle + 目录列表管理（添加/移除监控目录）。

> ⚠️ **注意（配置提示）**：
> - 开启后，**删除文件夹会同步删除该目录下所有文件的搜索索引**
> - 如需恢复，需手动触发重新扫描该目录
> - 监控目录变更后，旧路径下的索引不会自动清理

### 5.2 搜索结果实时追加

**位置：** `src/components/SearchResults.tsx`

```
┌──────────────────────────────────────┐
│  📂 检测到 5 个新文件    [加载] [忽略] │
├──────────────────────────────────────┤
│  result 1                            │
│  result 2                            │
│  ...                                 │
└──────────────────────────────────────┘
```

- 新文件检测到时，显示横幅，带淡入动画
- 点击"加载"将新文件追加到列表顶部（按相关性排序）
- 点击"忽略"收起横幅，新文件不追加（等下次搜索刷新）

### 5.3 状态指示

**位置：** `src/components/StatusBar.tsx`

```
[🔴 监控中: D:\Work, E:\Backups]  或  [⚫ 监控已停止]
```

---

## 六、数据流总览

```
用户新增文件 D:\Work\report.docx

1. NTFS USN Journal 记录变更（内核级，无感知延迟）
2. Go goroutine (volume D:\) 读取 USN Record
3. Go 过滤路径：D:\Work\report.docx 在监控树下
4. Go 推送: {"type":"event","event":"created","path":"D:\\Work\\report.docx",...}
5. Electron TCP 接收 JSON
6. usnHandler.handleUsnEvent('created', 'D:\\Work\\report.docx')
7. processFile() → FileInfo (path/size/hash，isSupported=true)
8. shardManager.insertFile(fileInfo) → 写入 shard
9. extractContentAsync() → 异步提取文本内容
10. IPC "usn-update" → Renderer
11. Renderer 显示 "📂 检测到 1 个新文件 [加载]"
12. 用户点击加载 → 新文件追加到搜索结果列表
```

---

## 七、文件清单

### 7.1 Go 侧（新增）

| 文件 | 职责 |
|------|------|
| `go/main.go` | 入口：TCP 监听、命令解析、goroutine 调度 |
| `go/usn/manager.go` | volumeManager：按卷分组，路径过滤，事件汇总 |
| `go/usn/journal.go` | NTFS USN Journal API：CreateJournal / ReadJournal |
| `go/go.mod` / `go.sum` | Go 模块依赖 |
| `go/usn-monitor.exe` | **编译产物**，Electron 打包时复制到 `resources/` |

### 7.2 Electron 侧（新增）

| 文件 | 职责 |
|------|------|
| `electron/main/usnWatcher.ts` | 子进程管理 + TCP 通信 |
| `electron/main/usnHandler.ts` | 事件处理：写 shard |
| `electron/main/ipc.ts` | 新增 `usn-update` IPC channel |
| `electron/preload/index.ts` | 暴露 `usnNotify` API |
| `src/pages/SettingsPage.tsx` | 监控开关 + 目录配置 UI |
| `src/components/SearchResults.tsx` | 实时追加横幅 |
| `src/components/StatusBar.tsx` | 监控状态指示 |

### 7.3 修改文件

| 文件 | 改动 |
|------|------|
| `electron/main/config.ts` | 新增 `realtimeMonitor` 配置项 |
| `src/context/LanguageContext.tsx` | i18n 翻译文本 |
| `docs/PROGRESS.md` | 标注 M1.4 完成 |
| `docs/ROADMAP.md` | 标注 M1.4 完成 |
| `src/pages/GuidePage.tsx` | 功能描述更新 |

---

## 八、技术决策自检

| 决策 | 说明 |
|------|------|
| Go 独立进程 vs CGO addon | 独立进程更稳定，崩溃不影响 Electron，可单独热更新 |
| TCP vs 命名管道 | TCP 实现简单，Electron net 模块原生支持，调试方便 |
| 动态目录更新 vs 重启进程 | 用户可随时增减监控目录，体验流畅 |
| 空闲退出 | 减少资源占用，用户不感知进程存在 |
| Electron 写 shard | Go 无需理解 shard 分片策略，职责单一 |

---

## 九、已知限制

1. **仅 Windows**：USN Journal 是 NTFS 特有功能，不支持 macOS/Linux
2. **跨卷重命名**：若文件从监控卷移动到非监控卷，只会收到 `deleted` 事件（来源卷可见），`created` 不会出现在监控目标中
3. **USN Journal 删除**：USN Journal 有大小上限（默认 32MB），超过后旧记录被覆盖，监控可能丢失。此问题需要定期 `FSCTL_DELETE_USN_JOURNAL` + 重建来缓解
4. **Go 进程首次拉起延迟**：Go 冷启动约 50-200ms，监控不会立即生效（可忽略，用户感知不到）
5. **文件夹删除级联擦除索引**：开启监控后，删除任意文件夹会导致该目录下所有文件的索引记录被物理删除。用户需充分知悉此行为，建议在配置 UI 中明确提示

## 十、与文件夹名称索引的联动

文件夹名称索引（`shard_folders` 表）依赖 USN 监控保持同步：

```
文件夹创建 → USN: folder_created → addFolder()
文件夹删除 → USN: folder_deleted → removeFolderAndContents()（级联删除子文件）
文件夹重命名 → USN: folder_renamed → renameFolderAndContents()（批量更新路径前缀）
```

**实施顺序建议：**
1. 先实现文件夹名称索引（`shard_folders` 表 + 相关任务）
2. 再实现 USN 监控，两个功能共用 `usnHandler.ts`，互为依赖

若 USN 监控先于文件夹名称索引上线，`folder_created/deleted/renamed` 事件可暂时忽略，后续无缝接入。

---

## 十一、文件内容更新队列（Worker 线程）

> 新增日期：2026-04-25
> 状态：已实现

### 11.1 背景

文件内容可能频繁变化（如编辑 Word 时频繁保存），每次保存都触发内容重新提取会严重影响性能。采用队列机制，先记录变化，每 15 分钟批量处理。

### 11.2 架构设计

```
┌──────────────────────────────────────────────────────────────────┐
│  Electron 主进程                                                    │
│                                                                     │
│  usnHandler.ts                                                      │
│  ┌────────────────┐   ┌──────────────────┐                        │
│  │ 变更事件队列    │──►│ Worker 线程      │                        │
│  │ (Set 去重)     │   │ contentWorker    │                        │
│  └────────────────┘   └──────────────────┘                        │
│         │                      │                                    │
│         ▼                      ▼                                    │
│  pendingContentUpdates    主线程消息                                │
│  (15分钟定时 flush)        ↓                                        │
│                           解析文件内容                               │
│                           写入数据库                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 11.3 队列机制

| 组件 | 说明 |
|------|------|
| `pendingContentUpdates` | `Set<string>` 存储待处理的文件路径，自动去重 |
| `flushTimer` | 15 分钟定时器，队列达到条件后触发批量处理 |
| `currentProcessingFiles` | 记录正在处理的文件，用于崩溃恢复 |
| `contentWorker` | Worker 线程，执行内容提取（不阻塞主线程） |

### 11.4 崩溃恢复

Worker 崩溃时（`on('error')` 或收到 `error` 消息类型），会将 `currentProcessingFiles` 中的文件重新加入队列，并重新调度下一次 flush。

```typescript
// 崩溃时恢复
contentWorker.on('error', (err) => {
  if (currentProcessingFiles.length > 0) {
    for (const f of currentProcessingFiles) {
      pendingContentUpdates.add(f)  // 重新加入队列
    }
    currentProcessingFiles = []
    scheduleFlush()  // 重新调度
  }
  contentWorker = null
})
```

### 11.5 防重复调度

如果当前已有 Worker 在运行（`contentWorker !== null`），新的 flush 调用会跳过，避免 15 分钟内重复启动。

### 11.6 支持的文件类型

Worker 支持以下格式的内容提取：
- 纯文本：`.txt`, `.md`
- 结构化：`.json`, `.xml`, `.csv`
- Office：`.docx`, `.xlsx`, `.pptx`, `.doc`, `.xls`, `.ppt`
- PDF：`.pdf`
- RTF：`.rtf`
- 其他：`.html`, `.epub`

### 11.7 实现文件

| 文件 | 职责 |
|------|------|
| `electron/main/usnHandler.ts` | 队列管理、崩溃恢复、定时调度 |
| `electron/main/contentWorker.ts` | Worker 线程，内容提取 |
| `electron.vite.config.ts` | 构建配置，包含 contentWorker |
