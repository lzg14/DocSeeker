# DocSeeker 功能进度

> 更新时间: 2026-04-19

---

## 已支持文件格式（29 种）

| 格式 | 扩展名 | 全文索引 | UI 过滤器 |
|------|--------|----------|-----------|
| 纯文本 | .txt .md .markdown .mdown .json .xml .csv | ✅ | ✅ 文本 |
| HTML | .html .htm | ✅ | ✅ HTML |
| SVG | .svg | ✅ | ✅ SVG |
| Word | .doc .docx | ✅ | ✅ Word |
| Excel | .xls .xlsx | ✅ | ✅ Excel |
| PowerPoint | .ppt .pptx | ✅ | ✅ PPT |
| PDF | .pdf | ✅ | ✅ PDF |
| XPS | .xps | ✅ | ✅ XPS |
| RTF | .rtf | ✅ | ✅ RTF |
| CHM | .chm | ✅ | ✅ CHM |
| ODF | .odt .ods .odp | ✅ | ✅ ODF |
| EPUB | .epub | ✅ | ✅ EPUB |
| ZIP | .zip（内部文档） | ✅ | ✅ ZIP |
| RAR | .rar（内部文档） | ✅ | ✅ RAR |
| 邮件 | .mbox .eml | ✅ | ✅ 邮件 |
| WPS | .wps .wpp .et .dps | ✅ | —（映射到 Word/PPT/Excel） |
| 图片元数据 | .jpg .jpeg .png .gif .webp .bmp .tiff .tif | ✅ | ✅ 图片元数据 |
| 音视频元数据 | .mp3 .flac .ogg .wav .aac .m4a .mp4 .avi .mkv .mov .wmv .flv .webm | ✅ | ✅ 音视频 |

---

## 已完成功能

### Phase 1 — 核心体验补全

| 功能 | 状态 | 备注 |
|------|------|------|
| M1.1 新增 RTF 格式 | ✅ | |
| M1.2 新增 CHM 格式 | ✅ | |
| M1.3 新增 ODF 系列（ODT/ODS/ODP） | ✅ | |
| M1.4 实时文件监控 | ✅ | NTFS USN Journal + Go 独立进程，跨卷监控，动态目录配置 |
| M1.5 搜索历史 | ✅ | |
| M1.6 保存的搜索 | ✅ | |
| M1.7 搜索结果上限 | ✅ | 已移除 200 条限制 |

### Phase 2 — 高级搜索能力

| 功能 | 状态 | 备注 |
|------|------|------|
| M2.1 正则表达式搜索 | ✅ | `/pattern/` 语法 |
| M2.2 布尔搜索（AND/OR/NOT） | ✅ | FTS5 原生支持 |
| M2.3 文件类型过滤器 | ✅ | |
| M2.4 文件大小过滤器 | ✅ | |
| M2.5 日期范围过滤器 | ✅ | |
| M2.6 高级查询语法 UI 提示 | ✅ | |
| M2.7 词干提取（Porter Stemmer） | ✅ | 搜索 "running" 匹配 "run/runs/running" |
| M2.8 字段限定搜索 | ✅ | `name:` `path:` `ext:` 语法 |

### Phase 3 — 企业级功能

| 功能 | 状态 | 备注 |
|------|------|------|
| M3.1 ZIP/RAR 压缩包内全文搜索 | ✅ | ZIP + RAR 均已完成 |
| M3.2 邮件格式支持 | ✅ | mbox / EML |
| M3.3 便携版打包 | ✅ | |
| M3.4 云存储集成 | ✅ 天然支持 | 扫描本地云盘文件夹（OneDrive/Dropbox 等）即可，无需额外配置 |

### Phase 4 — 体验与性能优化

| 功能 | 状态 | 备注 |
|------|------|------|
| M4.1 缩略图预览 | ✅ | 图片 + PDF（Windows Shell 方案）已完成 |
| M4.2 全局快捷键浮层 | ✅ | Ctrl+Shift+F |
| M4.3 Electron 冷启动优化 | ✅ | 分片架构，UI <100ms 可交互 |
| M4.4 跨平台支持评估 | ✅ | 评估文档已完成；实际 macOS/Linux 未实现 |
| M4.5 搜索结果命中词高亮 | ✅ | |
| M4.6 去重功能 UI | ✅ | 按 MD5 hash 去重 |
| M4.7 文件计数数据源统一 | ✅ | 界面数据全部来自 config.db |
| M4.8 搜索结果导出 | ✅ | CSV / HTML / TXT 三种格式 |

---

## 待完善功能

| 功能 | 优先级 | 备注 |
|------|--------|------|
| 文件夹名称索引 | P1 | 搜索 `folder:Desktop` 可返回文件夹 |
| 实时文件监控 | ✅ 已实现 | NTFS USN Journal API + Go 独立进程 |
| macOS/Linux 打包 | P3 | 评估文档已完成 |
