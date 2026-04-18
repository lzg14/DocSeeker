# DocSeeker 竞品分析报告

> 更新时间: 2026-04-15

## 一、项目定位

**DocSeeker** 是一款基于 Electron + React + TypeScript 的本地文档全文搜索工具，面向需要管理大量个人积累文档的用户，提供离线优先的隐私保护搜索体验。

**核心技术栈：**
- 全文索引：SQLite FTS5 + BM25 相关性排名
- 内容解析：mammoth (DOCX)、xlsx (Excel)、jszip (PPTX)、pdf-parse (PDF)
- 桌面框架：Electron 33 + React 18
- 数据库：better-sqlite3（原生模块）

---

## 二、支持文件格式对比

| 格式 | DocSeeker | Everything | AnyTXT | DocFetcher | Copernic | FileSearchy |
|------|:---------:|:---------:|:------:|:----------:|:--------:|:-----------:|
| DOCX/XLSX/PPTX | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| 老 DOC/XLS/PPT | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| PDF | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| TXT/MD/JSON | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| RTF | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| CHM | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| EPUB | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| ODF (ODT/ODS/ODP) | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| WPS/WPP/ET/DPS | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| 邮件 EML/MBOX | ✅ | ❌ | ✅ | ✅ (mbox) | ✅ | ❌ |
| ZIP 内搜索（递归3层） | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| 图片元数据 | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 音频/视频元数据 | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 网络驱动器/云存储 | ❌ | ❌ | ✅ | ❌ | ✅ (GDrive/Dropbox/OneDrive) | ❌ |

---

## 三、核心能力对比

### 3.1 搜索能力

| 能力 | DocSeeker | Everything | AnyTXT | DocFetcher | Copernic |
|------|-----------|-----------|--------|-----------|---------|
| 文件名搜索 | ✅ | ✅ (极快,NTFS MFT) | ✅ | ✅ | ✅ |
| 内容全文搜索 | ✅ (FTS5+BM25) | ❌ | ✅ | ✅ | ✅ |
| AND 多关键词 | ✅ | ✅ | ✅ | ✅ | ✅ |
| OR 组合搜索 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 正则表达式 | ❌ | ✅ | ✅ | ❌ | ✅ |
| 布尔搜索 | ✅ (AND/OR/NOT) | ✅ | ✅ | ❌ | ✅ |
| 日期范围过滤 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 文件大小过滤 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 文件类型过滤 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 搜索历史 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 保存的搜索 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 结果相关性排序 | ✅ (BM25) | ❌ (名称排序) | ✅ | ✅ | ✅ |
| 命中词高亮 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 语法提示面板 | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.2 索引与性能

| 能力 | DocSeeker | Everything | AnyTXT | DocFetcher | Copernic |
|------|-----------|-----------|--------|-----------|---------|
| 增量扫描 | ✅ | ❌ (实时监控) | ✅ | ✅ | ✅ |
| 定时自动扫描 | ✅ (每周) | ❌ | ✅ | ❌ | ✅ |
| 实时文件监控 | ❌ (已移除,chokidar架构问题) | ✅ (NTFS USN) | ✅ | ❌ | ✅ |
| 后台索引 | ✅ (Worker线程) | ✅ | ✅ | ✅ | ✅ |
| 网络驱动器 | ❌ | ❌ | ✅ | ❌ | ✅ |
| 便携版 | ✅ | ✅ | ✅ | ✅ | ❌ |
| 索引数据库位置 | 本地 SQLite | NTFS MFT | 本地 | 本地/便携 | 本地 |

### 3.3 用户体验

| 能力 | DocSeeker | Everything | AnyTXT | Listary | Copernic |
|------|-----------|-----------|--------|---------|---------|
| 暗色模式 | ✅ | ⚠️ (有限) | ✅ | ✅ | ✅ |
| 国际化 | ✅ (中/英) | ❌ | ❌ | ❌ | ❌ |
| 全局快捷键浮层 | ✅ (Ctrl+Shift+F) | ❌ | ❌ | ✅ (双击Ctrl) | ❌ |
| 预览面板 | ✅ | hover预览 | ✅ | ❌ | ✅ (Zoom) |
| 缩略图 | ✅ (hover) | ❌ | ❌ | ✅ | ✅ |
| 拖拽到应用 | ✅ | ❌ | ❌ | ✅ | ❌ |
| 系统托盘 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 无边框窗口 | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.4 许可证与平台

| 工具 | 许可证 | Windows | macOS | Linux | 便携版 |
|------|--------|:-------:|:-----:|:-----:|:------:|
| DocSeeker | MIT | ✅ | ⚠️ (Electron可跨平台) | ⚠️ | ✅ |
| Everything | 免费 (含广告) | ✅ | ❌ | ❌ | ✅ |
| AnyTXT | 免费/付费Pro | ✅ | ❌ | ❌ | ✅ |
| Listary | 免费/付费Pro | ✅ | ❌ | ❌ | ❌ |
| DocFetcher | GPL v3 | ✅ | ✅ | ✅ | ✅ |
| Copernic | 付费 ($49.95) | ✅ | ✅ | ❌ | ❌ |
| FileSearchy | 免费/付费Pro | ✅ | ❌ | ❌ | ✅ |
| Recoll | GPL | ⚠️ (WSL) | ✅ | ✅ | ✅ |

---

## 四、DocSeeker 核心优势

### 4.1 技术优势

1. **FTS5 + BM25 专业级排序**
   - SQLite FTS5 是生产级全文搜索引擎，BM25 是业界标准相关性算法
   - AnyTXT/FileSearchy 仅使用简单关键词匹配，不做相关性排序
   - DocSeeker 返回结果按相关度排列，用户更容易找到真正需要的文档

2. **唯一的中英双语原生支持**
   - 列表中所有竞品均无国际化支持
   - 面向中文用户群体具有天然优势

3. **Electron 现代架构**
   - 代码库年轻（TypeScript + React），易于扩展和维护
   - 有跨平台潜力（目前仅打包 Windows，但代码层面无平台锁定）

4. **零依赖解析**
   - 不需要本机安装 Office 或 PDF 阅读器即可解析文档
   - 与 AnyTXT 相同，避免了 DocFetcher 需要 LibreOffice 的问题

### 4.2 功能优势

5. **ZIP 内递归搜索**
   - 支持 ZIP 内嵌套文档搜索，最深 3 层
   - 竞品中 DocFetcher 和 Copernic 有类似功能，AnyTXT 无

6. **多目录定时增量扫描**
   - 比 DocFetcher 更完善的定时任务机制
   - 比 FileSearchy 更灵活的多目录管理

7. **纯本地隐私**
   - 无任何云端上传，所有数据在本地
   - 对隐私敏感用户有吸引力

8. **便携版支持**
   - 可打包为单文件便携版，数据可随 U 盘带走

---

## 五、DocSeeker 核心不足

### 5.1 功能缺失（优先级 P0）

| 不足 | 影响 | 竞品对比 |
|------|------|---------|
| 实时监控已移除 | 文件变更后索引不自动更新，需手动重新扫描 | Everything NTFS原生/Copernic实时/AnyTXT实时 |
| 支持格式较少（18种） | 无法覆盖 WPD/图片/音视频等格式 | AnyTXT 支持 60+，Copernic 400+ |
| 无正则表达式搜索 | 高级用户无法精准查询 | Everything/AnyTXT 均支持 |
| 无缩略图预览 | 无法快速预览文档内容 | Copernic/Listary 有 |

### 5.2 体验缺失（优先级 P1）

| 不足 | 影响 | 竞品对比 |
|------|------|---------|
| 去重功能未集成 UI | 已有代码但未暴露给用户 | 仅 Copernic 有 |
| 无全局快捷键浮层 | 无法像 Listary 一样随时唤起 | Listary 有 |
| 无网络驱动器支持 | 无法索引 NAS 或网络路径文档 | AnyTXT/Copernic 有 |

### 5.3 技术债（优先级 P2）

| 不足 | 影响 | 竞品对比 |
|------|------|---------|
| Electron 冷启动慢 | 体验不如 Everything 毫秒级响应 | Everything 即开即搜 |
| 仅 Windows | 跨平台未实现 | DocFetcher/Recoll 支持全平台 |
| 增量扫描依赖定时 | 无法感知文件实时变化 | 实时监控竞品均有 |

---

## 六、竞品功能启发清单

以下功能从竞品分析中获得，已完成 ✅，待开发 📋：

### 来自 AnyTXT
- [x] RTF、CHM、WPS、WPD 格式支持 → ✅ RTF/CHM/WPS/EPUB 已完成
- [x] ODF (ODT/ODS/ODP) 格式支持 → ✅ 已完成
- [x] 搜索结果命中词高亮 → ✅ 已完成
- [x] 保存搜索条件 → ✅ 已完成

### 来自 DocFetcher
- [x] ZIP 压缩包内搜索 → ✅ 已完成（递归3层）
- [x] 邮件 mbox 格式搜索 → ✅ 已完成
- [x] 便携版 → ✅ 已完成
- [x] EPUB 格式支持 → ✅ 已完成

### 来自 Copernic
- [ ] 邮件集成（Outlook/Gmail/Exchange）
- [ ] 云存储集成（Google Drive/Dropbox/OneDrive）
- [ ] 图片/音视频元数据索引
- [x] 结果缩略图预览 → ✅ hover 预览已完成

### 来自 Everything
- [ ] NTFS USN Journal 实时监控（替代 chokidar，需 Windows API）
- [ ] HTTP/FTP 服务器模式
- [x] 全局快捷键浮层搜索 → ✅ Ctrl+Shift+F 已完成

### 来自 Listary
- [x] 全局快捷键浮层搜索（双击 Ctrl）→ ✅ Ctrl+Shift+F 已完成
- [x] 拖拽文件搜索 → ✅ 已完成

### 来自 Recoll
- [ ] 强大的查询语言界面
- [ ] 多语言词干提取（stemming）
