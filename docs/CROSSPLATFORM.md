# DocSeeker 跨平台可行性评估

> 维护人：lizhgb
> 更新日期：2026-04-18
> 状态：评估完成

---

## 一、评估范围

本报告评估将 DocSeeker 从 Windows 扩展至 macOS 和 Linux 的技术可行性和工作量。

**评估维度：**
1. Windows 特有功能及替代方案
2. Electron 跨平台兼容性
3. 数据库（SQLite FTS5）
4. 文件格式解析
5. 打包与分发
6. 结论与建议

---

## 二、Windows 特有功能分析

### 2.1 NTFS USN Journal（实时文件监控）

| 项目 | 说明 |
|------|------|
| Windows | NTFS USN Journal API 可高效监听文件系统变更 |
| macOS | FSEvents API（效果等价） |
| Linux | inotify API（效果等价） |

**结论：** 三平台均有等效方案，代码需抽象为统一接口。

### 2.2 ShellThumbnail API

| 项目 | 说明 |
|------|------|
| Windows | `IThumbnailProvider` / `IWICBitmapDecoder` 可提取任意文件缩略图 |
| macOS | QuickLook 框架（`QLThumbnailGenerator`） |
| Linux | tumbler 守护进程（GNOME）或 f thumbnail spec |

**结论：** 跨平台缩略图是最大难点，建议统一用 PDF.js / 图片解码库在渲染进程实现。

### 2.3 注册表 / .lnk 快捷方式

| 项目 | 说明 |
|------|------|
| Windows | 开机自启依赖注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |
| macOS | `~/Library/LaunchAgents` plist 文件 |
| Linux | XDG autostart（`~/.config/autostart`）或 systemd user service |

**结论：** Electron `app.setLoginItemSettings()` 已封装跨平台逻辑，可直接使用。

### 2.4 系统路径差异

| 功能 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 用户数据目录 | `%APPDATA%` | `~/Library/Application Support` | `~/.config` 或 `$XDG_CONFIG_HOME` |
| 文档目录 | `Shell Folder CSIDL_MYDOCUMENTS` | `NSSearchPathForDirectoriesInDomains(DocumentDirectory)` | `XDG_DOCUMENTS_DIR` 或 `~/Documents` |
| 缩略图缓存 | `%LOCALAPPDATA%` | `~/Library/Caches` | `~/.cache` |

**结论：** Electron `app.getPath('userData')` / `app.getPath('documents')` 已封装，无需手动判断。

---

## 三、Electron 跨平台兼容性

### 3.1 主进程 API（全部跨平台）

| API | 跨平台支持 |
|-----|-----------|
| `app` / `BrowserWindow` | ✅ 全部 |
| `Menu` / `Tray` | ✅ 全部 |
| `globalShortcut` | ✅ 全部 |
| `nativeTheme` | ✅ 全部 |
| `shell.openPath()` | ✅ 全部 |
| `dialog` | ✅ 全部 |

### 3.2 需要抽象的 API

| API | 处理方式 |
|-----|---------|
| 文件监控 | 抽象为 `FileWatcher` 接口，平台特定实现 |
| 缩略图 | 统一在渲染进程用 JS 库实现 |
| 系统通知 | 均支持，但样式不同 |

**结论：** Electron 核心完全跨平台，主要工作量在平台特定功能抽象。

---

## 四、数据库（SQLite FTS5）

**结论：无差异。**

SQLite FTS5 在 Windows / macOS / Linux 上行为完全一致。`db/shards/` 目录结构无需修改。

---

## 五、文件格式解析

### 5.1 当前 DocSeeker 支持的格式

| 格式 | Windows 解析方式 | macOS/Linux 替代 |
|------|----------------|-----------------|
| .doc/.xls/.ppt (OLE2) | OleFileIOPlus | LibreOffice headless 转换 |
| .docx/.xlsx/.pptx | JSZip + xml2js | 相同（纯 JS） |
| .pdf | pdfjs-dist | 相同（纯 JS） |
| .epub | adm-zip + xml2js | 相同（纯 JS） |
| .rtf | 正则剥离富文本 | 相同（纯 JS） |
| .chm | node-chmlib（native） | 不支持（CHM 是 Windows 特有） |
| .odt/.ods/.odp | JSZip + XML | 相同（纯 JS） |

### 5.2 OLE2 格式（.doc/.xls）跨平台方案

**问题：** OleFileIOPlus 依赖 Windows 特有 COM/OLE API，macOS/Linux 无法直接使用。

**方案：LibreOffice Headless 转换**

```bash
# 将 .doc 转换为 .txt
libreoffice --headless --convert-to txt --outdir /tmp/ /path/to/file.doc
cat /tmp/file.txt
```

**优点：** 支持所有 Office 格式
**缺点：** 需要用户安装 LibreOffice（约 300MB），或打包时一起分发

**推荐实现：** 在扫描阶段调用 LibreOffice CLI，保持索引格式统一。

### 5.3 CHM 格式

CHM 是 Windows 特有格式（Compiled HTML Help），macOS/Linux 无原生支持。

**建议：** 跨平台版本暂不支持 CHM，在文档中明确标注。macOS/Linux 用户若有大量 CHM 需求，可建议使用 Wine 或 Parallels。

---

## 六、打包与分发

### 6.1 electron-builder 支持的平台

| 平台 | 打包格式 | 代码签名 |
|------|---------|---------|
| Windows | NSIS（.exe）、portable（.zip） | 代码签名（Authenticode） |
| macOS | DMG、pkg、zip | Apple Developer ID + notarization |
| Linux | AppImage、deb、rpm、snap | GPG 签名（可选） |

### 6.2 工作量估算

| 平台 | 主要工作量 | 难度 |
|------|---------|------|
| macOS | 适配 UI（视网膜屏、Dock）、申请 Apple 开发者账号 | 中等 |
| Linux | AppImage 打包、XDG 规范适配 | 较高（发行版碎片化） |

**代码签名说明：**
- macOS：必须签名 + notarization，否则 Gatekeeper 会拦截
- Linux：GPG 签名可选，但主流发行版会验证

---

## 七、结论与建议

### 7.1 macOS：可行，建议优先

| 维度 | 评估 |
|------|------|
| 技术可行性 | ✅ 完全可行 |
| 工作量 | 中等（约 3 个月） |
| 用户价值 | 高（macOS 用户对本地搜索工具有强需求） |
| 主要难点 | OLE2 格式解析、CHM 不支持 |

**必要前置条件：**
1. 申请 Apple Developer Program 账号（年费 $99）
2. 安装 macOS 虚拟机或真机测试
3. 用 LibreOffice headless 替换 OleFileIOPlus

**实施步骤（简化）：**
```
Phase 1: 抽象文件监控为 FileWatcher 接口
Phase 2: 替换 OLE2 解析为 LibreOffice
Phase 3: UI 适配（Retina、分栏布局）
Phase 4: macOS 打包 + 代码签名
```

### 7.2 Linux：可行，但优先级低

| 维度 | 评估 |
|------|------|
| 技术可行性 | ✅ 完全可行 |
| 工作量 | 较高（4-6 个月） |
| 用户价值 | 中等（Linux 用户群较小） |
| 主要难点 | 发行版碎片化（Ubuntu/Debian/Fedora 各有差异） |

**建议：** macOS 完成后再评估 Linux 优先级。Linux 打包优先选 AppImage 格式，兼容性最好。

### 7.3 架构改造建议（跨平台前置工作）

无论先做哪个平台，以下重构现在就应该做：

1. **抽象 FileWatcher**
   ```typescript
   // src/utils/fileWatcher.ts
   export interface FileWatcher {
     watch(dir: string, callback: (event: FileEvent) => void): void
     stop(): void
   }
   export function createFileWatcher(platform: 'win32' | 'darwin' | 'linux'): FileWatcher
   ```

2. **统一路径工具**
   ```typescript
   // src/utils/paths.ts
   export const paths = {
     userData: app.getPath('userData'),
     thumbnails: ...,   // 平台特定
     documents: app.getPath('documents'),
   }
   ```

3. **LibreOffice 转换层**
   ```typescript
   // electron/main/extractors/officeConverter.ts
   export async function convertToText(filePath: string): Promise<string | null>
   ```

---

## 八、总结

| 平台 | 可行性 | 优先级 | 预估工作量 | 主要风险 |
|------|--------|--------|-----------|---------|
| macOS | ✅ 完全可行 | **P1** | 3 个月 | OLE2 解析、代码签名 |
| Linux | ✅ 完全可行 | P2 | 4-6 个月 | 发行版碎片化 |
| CHM 支持 | ❌ 不可行 | — | — | CHM 是 Windows 特有格式 |

**行动建议：**
1. **立即**：抽象 `FileWatcher` 和路径工具，为跨平台做准备
2. **短期**：引入 LibreOffice headless，移除 OleFileIOPlus 依赖
3. **中期**：macOS 移植（UI 适配 + 打包 + 签名）
4. **长期**：Linux 评估（根据用户反馈决定优先级）
