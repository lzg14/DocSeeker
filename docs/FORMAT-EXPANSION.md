# 文件格式扩展计划：目标 60+

> 更新时间: 2026-04-22
> 目标: 60+ 种文件格式支持

---

## 当前状态

| 类别 | 格式数量 | 已有格式 |
|------|----------|----------|
| 文档 | 13 | txt, md, json, xml, csv, html, svg, doc, docx, xls, xlsx, ppt, pptx |
| PDF类 | 4 | pdf, xps, rtf, chm |
| ODF/办公套件 | 8 | odt, ods, odp, wps, wpp, et, dps, epub |
| 压缩包 | 2 | zip, rar |
| 邮件 | 3 | mbox, eml, pst |
| 图片元数据 | 6 | jpg, png, gif, webp, bmp, tiff |
| 音视频元数据 | 13 | mp3, flac, ogg, wav, aac, m4a, mp4, avi, mkv, mov, wmv, flv, webm |
| **合计** | **49** | |

**目标差距: +11 种格式**

---

## 扩展计划

### Phase A: 简单格式（纯文本/轻量级）— 8 种

| 格式 | 说明 | 复杂度 | 预计工时 | 优先级 |
|------|------|--------|----------|--------|
| `.msg` | Outlook 单封邮件 | ⭐ | 1h | P0 |
| `.yaml/.yml` | YAML 配置文件 | ⭐ | 0.5h | P0 |
| `.log` | 日志文件 | ⭐ | 0.5h | P1 |
| `.ini/.cfg/.conf` | 配置文件 | ⭐ | 0.5h | P1 |
| `.srt/.vtt` | 字幕文件 | ⭐ | 1h | P1 |
| `.nfo` | 信息文件 | ⭐ | 0.5h | P2 |
| `.rst` | reStructuredText | ⭐ | 0.5h | P2 |
| `.tex` | LaTeX 文档 | ⭐ | 1h | P2 |

### Phase B: 中等格式（需要额外库）— 6 种

| 格式 | 说明 | 复杂度 | 预计工时 | 优先级 |
|------|------|--------|----------|--------|
| `.7z` | 7-Zip 压缩包 | ⭐⭐ | 4h | P0 |
| `.tar/.gz/.bz2` | Unix 压缩包 | ⭐⭐ | 2h | P1 |
| `.mobi/.azw3` | Kindle 电子书 | ⭐⭐ | 4h | P2 |
| `.fb2` | FictionBook 电子书 | ⭐⭐ | 4h | P2 |
| `.vsd/.vsdx` | Visio 图表 | ⭐⭐ | 6h | P2 |
| `.pages` | Apple Pages | ⭐⭐ | 4h | P2 |

### Phase C: 复杂格式（需要专业库）— 6 种

| 格式 | 说明 | 复杂度 | 预计工时 | 优先级 |
|------|------|--------|----------|--------|
| `.numbers` | Apple Numbers | ⭐⭐⭐ | 8h | P2 |
| `.key` | Apple Keynote | ⭐⭐⭐ | 8h | P2 |
| `.odg` | OpenDocument Graphics | ⭐⭐⭐ | 6h | P3 |
| `.odc` | OpenDocument Chart | ⭐⭐⭐ | 6h | P3 |
| `.ots` | OpenDocument Spreadsheet Template | ⭐⭐ | 4h | P3 |
| `.otp` | OpenDocument Presentation Template | ⭐⭐ | 4h | P3 |

---

## 实施计划

### 第一批: P0 优先级（4 种格式）

| 格式 | 工作内容 | 工时 |
|------|----------|------|
| `.msg` | Outlook MSG 解析（与 PST 共用逻辑） | 2h |
| `.yaml/.yml` | 纯文本解析 | 1h |
| `.7z` | 添加 7z 解压支持 | 4h |
| `.tar/.gz/.bz2` | 添加 Unix 压缩支持 | 3h |
| **小计** | | **10h** |

### 第二批: P1 优先级（5 种格式）

| 格式 | 工作内容 | 工时 |
|------|----------|------|
| `.log` | 纯文本解析 | 1h |
| `.ini/.cfg/.conf` | 纯文本解析 | 1h |
| `.srt/.vtt` | 字幕解析 | 2h |
| `.mobi/.azw3` | Kindle 解析 | 4h |
| `.fb2` | FictionBook 解析 | 4h |
| **小计** | | **12h** |

### 第三批: P2 优先级（6 种格式）

| 格式 | 工作内容 | 工时 |
|------|----------|------|
| `.nfo` | 纯文本解析 | 1h |
| `.rst` | reStructuredText | 1h |
| `.tex` | LaTeX 解析 | 2h |
| `.vsd/.vsdx` | Visio XML 解析 | 6h |
| `.pages` | Apple Pages (ZIP+XML) | 4h |
| **小计** | | **14h** |

---

## 技术方案

### 简单格式（⭐）
- 直接读取文件内容
- 正则提取关键信息

### ZIP 类格式（⭐⭐）
- 使用 `jszip` 解压
- 解析内部 XML

### 专业格式（⭐⭐⭐）
- 使用 npm 包或 Calibre 工具

---

## 进度追踪

| 批次 | 格式数 | 状态 |
|------|--------|------|
| Phase A (简单) | 8 | ⬜ |
| Phase B (中等) | 6 | ⬜ |
| Phase C (复杂) | 6 | ⬜ |

**目标: 49 + 20 = 69 种格式** (超额完成)
