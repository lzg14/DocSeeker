# DocSeeker 格式扩充计划

> 维护人：lizhgb
> 创建日期：2026-04-19
> 状态：规划中

---

## 一、目标

扩充 DocSeeker 支持的文件格式数量，从当前的 **19 种** 向 AnyTXT 的 70+ 种看齐。先做容易的，逐步推进。

---

## 二、当前已支持格式（19 种）

| 类型 | 扩展名 |
|------|--------|
| 纯文本 | .txt .md .json .xml .csv |
| Office | .doc .docx .xls .xlsx .ppt .pptx |
| PDF | .pdf |
| 排版格式 | .rtf .chm |
| ODF | .odt .ods .odp |
| 电子书 | .epub |
| 压缩包 | .zip .rar |
| 邮件 | .mbox .eml |
| WPS | .wps .wpp .et .dps |

---

## 三、扩充计划（按难度分批）

### 第一批：零依赖，难度 ⭐（立即可做）

| 格式 | 扩展名 | 解析方式 | 新增代码量 |
|------|--------|---------|-----------|
| HTML | .html .htm | 剥离标签提取纯文本 | ~10 行 |
| SVG | .svg | XML 解析提取文本和属性 | ~10 行 |
| Markdown | .markdown .mdown | 剥离语法符号保留纯文本 | ~10 行 |

**新增格式：** 5 种（5 个扩展名）
**新增依赖：** 无
**预估工时：** 30 分钟

**实现方式：** 在 `scanner.ts` 和 `scanWorker.ts` 的 `extractText()` switch 中各加 3 个 case，逻辑参考现有的 `.txt`/`.md` 处理。

---

### 第二批：新增纯 JS 依赖，难度 ⭐⭐

| 格式 | 扩展名 | 解析方式 | 新增代码量 |
|------|--------|---------|-----------|
| 图片元数据 | .jpg .jpeg .png .gif .webp .bmp .tiff | 用 `exifr` 提取 EXIF/IPTC/XMP 文字（描述、标题、GPS 等） | ~30 行 |
| 音频元数据 | .mp3 .flac .ogg .wav .aac .m4a | 用 `music-metadata` 提取 ID3/Vorbis 标签（歌名、歌手、专辑） | ~30 行 |
| 视频元数据 | .mp4 .avi .mkv .mov .wmv .flv | 用 `music-metadata` 提取元数据（标题、时长、编码） | ~30 行 |

**新增格式：** 16 种扩展名
**新增依赖：** `exifr`（图片元数据）、`music-metadata`（音视频元数据）
**预估工时：** 1-2 小时

**提取内容示例：**
```
标题: 会议纪要_2024.docx
描述: 2024年Q3产品规划会议记录
GPS: 北京·朝阳区
歌名: 夜曲 | 歌手: 周杰伦 | 专辑: 十一月的萧邦
时长: 00:03:45 | 编码: H.264
```

---

### 第三批：需额外处理，难度 ⭐⭐⭐

| 格式 | 扩展名 | 解析方式 | 备注 |
|------|--------|---------|------|
| XPS | .xps | ZIP+XML，用 JSZip 解析 | 微软 PDF 替代品，结构与 DOCX 相近 |
| XPS 缩略图 | — | System.Drawing 已有 | 无需额外处理 |

**新增格式：** 1 种
**新增依赖：** 无（复用已有 JSZip）
**预估工时：** 1-2 小时

---

### 第四批：需重型依赖，难度 ⭐⭐⭐⭐

| 格式 | 扩展名 | 解析方式 | 备注 |
|------|--------|---------|------|
| WPD | .wpd | LibreOffice headless 转换 | 需要用户安装 LibreOffice（约 300MB） |
| PST/OST | .pst .ost | LibreOffice headless 或 `node-libpst` | Outlook 邮件存档 |
| WPS 旧版 | .wps .wpsx | LibreOffice headless | WPS 自有格式 |

**新增格式：** 3 种
**新增依赖：** LibreOffice CLI（需用户安装）或 `node-libpst`
**预估工时：** 半天~1 天
**注意：** LibreOffice 依赖较重，放在第三批完成后评估是否值得做

---

### 第五批：暂无成熟方案，难度 ⭐⭐⭐⭐⭐

| 格式 | 扩展名 | 解析方式 | 备注 |
|------|--------|---------|------|
| DjVu | .djvu | 暂无纯 JS 方案 | 扫描文档格式，可考虑 LibreOffice 转换 |
| CAD DWG/DXF | .dwg .dxf | ODA 库（商业收费） | 专业格式，AnyTXT Pro 才有 |
| OCR 图片识别 | .jpg .png（扫描件） | Tesseract.js | 高难度，CJK 识别效果差 |

这些格式目前没有可靠的纯 JS 实现，收益有限，建议远期评估。

---

## 四、任务总览

| 批次 | 格式 | 难度 | 新增依赖 | 状态 | 工时 |
|------|------|------|---------|------|------|
| 第一批 | HTML / SVG / Markdown | ⭐ | 无 | ✅ 已完成 | 30 分钟 |
| 第二批 | 图片/音频/视频元数据 | ⭐⭐ | exifr + music-metadata | ❌ 待实施 | 1-2 小时 |
| 第三批 | XPS | ⭐⭐⭐ | 无（复用 JSZip） | ❌ 待实施 | 1-2 小时 |
| 第四批 | WPD / PST / WPS 旧版 | ⭐⭐⭐⭐ | LibreOffice 或 node-libpst | ❌ 待实施 | 半天~1 天 |
| 第五批 | DjVu / CAD / OCR | ⭐⭐⭐⭐⭐ | — | ❌ 暂不评估 | — |

---

## 五、实施建议

**立即开始第一批（零依赖）。**

操作步骤：
1. `scanner.ts` + `scanWorker.ts`：在 `extractText()` switch 中添加 `.html` / `.htm` / `.svg` / `.markdown` / `.mdown` case
2. `SUPPORTED_EXTENSIONS` 添加新扩展名
3. `getFileType()` / `FILE_TYPE_MAP` 添加映射
4. `SearchPage.tsx`：`FILE_TYPE_OPTIONS` 添加对应过滤器选项（图片元数据 → "图片"、音视频 → "媒体"）
5. `LanguageContext.tsx`：About 页面描述补充新格式
6. `docs/PROGRESS.md` / `docs/ROADMAP.md`：更新格式数量

> 注：图片/音频/视频元数据提取不解析文件内容，而是提取文件附带的元数据标签。这些标签本身就是纯文本，无需额外解析器。
