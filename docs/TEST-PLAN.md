# DocSeeker 测试计划

> 更新时间: 2026-04-22
> 目标: 确保所有功能健壮可靠

---

## 一、测试文件目录结构

建议创建测试目录 `D:\DocSeeker-Test\`：

```
D:\DocSeeker-Test\
├── 01_document\
│   ├── plain_text.txt
│   ├── markdown.md
│   ├── json.json
│   ├── xml.xml
│   ├── csv.csv
│   ├── html.html
│   └── svg.svg
├── 02_office\
│   ├── word.doc
│   ├── word.docx
│   ├── excel.xls
│   ├── excel.xlsx
│   ├── powerpoint.ppt
│   └── powerpoint.pptx
├── 03_pdf\
│   ├── document.pdf
│   └── xps.xps
├── 04_rtf_chm\
│   ├── rich_text.rtf
│   └── help.chm
├── 05_odf\
│   ├── text.odt
│   ├── spreadsheet.ods
│   └── presentation.odp
├── 06_wps\
│   ├── wps.wps
│   ├── et.et
│   └── dps.dps
├── 07_epub\
│   └── book.epub
├── 08_archive\
│   ├── documents.zip
│   └── archive.rar
├── 09_email\
│   ├── single.eml
│   ├── mailbox.mbox
│   └── outlook.pst (需用户提供)
├── 10_images\
│   ├── photo.jpg
│   └── screenshot.png
├── 11_media\
│   ├── audio.mp3
│   └── video.mp4
├── 12_phase_a\
│   ├── outlook.msg
│   ├── config.yaml
│   ├── settings.yml
│   ├── app.log
│   ├── settings.ini
│   ├── app.cfg
│   ├── server.conf
│   ├── subtitle.srt
│   ├── subtitle.vtt
│   ├── info.nfo
│   ├── document.rst
│   └── latex.tex
├── 13_phase_b\
│   ├── archive.7z
│   ├── backup.tar
│   ├── data.tar.gz
│   ├── file.bz2
│   ├── ebook.mobi
│   ├── ebook.azw3
│   ├── fictionbook.fb2
│   ├── diagram.vsd
│   ├── diagram.vsdx
│   └── pages.pages
├── 14_phase_c\
│   ├── numbers.numbers
│   ├── presentation.key
│   ├── drawing.odg
│   ├── chart.odc
│   ├── spreadsheet_template.ots
│   └── presentation_template.otp
└── 15_edge_cases\
    ├── empty.txt
    ├── large_file.pdf (100MB+)
    ├── chinese.txt (中文内容)
    └── emoji.txt (emoji内容)
```

---

## 二、格式解析测试用例

### 2.1 基础文档格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .txt | plain_text.txt | 文件名 + 内容 | ✅ 全文可搜索 |
| .md | markdown.md | 标题 + 正文 | ✅ Markdown 可搜索 |
| .json | json.json | 键值对内容 | ✅ JSON 可搜索 |
| .xml | xml.xml | XML 标签内容 | ✅ XML 可搜索 |
| .csv | csv.csv | 表格内容 | ✅ CSV 可搜索 |
| .html | html.html | HTML 正文 | ✅ HTML 可搜索 |
| .svg | svg.svg | SVG 文本元素 | ✅ SVG 可搜索 |

### 2.2 Office 格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .doc | word.doc | Word 正文 | ✅ DOC 可搜索 |
| .docx | word.docx | Word 正文 + 标题 | ✅ DOCX 可搜索 |
| .xls | excel.xls | Excel 单元格内容 | ✅ XLS 可搜索 |
| .xlsx | excel.xlsx | Excel 单元格 + 公式 | ✅ XLSX 可搜索 |
| .ppt | powerpoint.ppt | PPT 文本框内容 | ✅ PPT 可搜索 |
| .pptx | powerpoint.pptx | PPT 幻灯片文本 | ✅ PPTX 可搜索 |

### 2.3 PDF 类格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .pdf | document.pdf | PDF 正文 + 页码 | ✅ PDF 可搜索 |
| .xps | xps.xps | XPS 文档文本 | ✅ XPS 可搜索 |

### 2.4 RTF/CHM 格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .rtf | rich_text.rtf | RTF 正文 | ✅ RTF 可搜索 |
| .chm | help.chm | CHM 帮助内容 | ✅ CHM 可搜索 |

### 2.5 ODF 格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .odt | text.odt | ODT 文档内容 | ✅ ODT 可搜索 |
| .ods | spreadsheet.ods | ODS 表格内容 | ✅ ODS 可搜索 |
| .odp | presentation.odp | ODP 幻灯片文本 | ✅ ODP 可搜索 |

### 2.6 WPS 格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .wps | wps.wps | WPS 文档 | ✅ WPS 可搜索 |
| .et | et.et | ET 表格 | ✅ ET 可搜索 |
| .dps | dps.dps | DPS 演示 | ✅ DPS 可搜索 |

### 2.7 电子书格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .epub | book.epub | EPUB 章节内容 | ✅ EPUB 可搜索 |

### 2.8 压缩包格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .zip | documents.zip | ZIP 内文档内容 | ✅ ZIP 内文件可搜索 |
| .rar | archive.rar | RAR 内文档内容 | ✅ RAR 内文件可搜索 |

### 2.9 邮件格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .eml | single.eml | 邮件主题 + 正文 | ✅ EML 可搜索 |
| .mbox | mailbox.mbox | 多个邮件内容 | ✅ MBOX 可搜索 |
| .pst | outlook.pst | PST 多个文件夹邮件 | ✅ PST 可搜索 |

### 2.10 图片/音视频元数据

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .jpg | photo.jpg | EXIF 元数据 | ✅ EXIF 可搜索 |
| .png | screenshot.png | PNG 元数据 | ✅ PNG 元数据可搜索 |
| .mp3 | audio.mp3 | ID3 标签 | ✅ MP3 标签可搜索 |
| .mp4 | video.mp4 | 视频元数据 | ✅ MP4 元数据可搜索 |

### 2.11 Phase A 格式 (简单文本)

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .msg | outlook.msg | MSG 邮件内容 | ✅ MSG 可搜索 |
| .yaml | config.yaml | YAML 配置内容 | ✅ YAML 可搜索 |
| .yml | settings.yml | YAML 配置内容 | ✅ YML 可搜索 |
| .log | app.log | 日志内容 | ✅ LOG 可搜索 |
| .ini | settings.ini | INI 配置 | ✅ INI 可搜索 |
| .cfg | app.cfg | 配置文件 | ✅ CFG 可搜索 |
| .conf | server.conf | 服务器配置 | ✅ CONF 可搜索 |
| .srt | subtitle.srt | 字幕内容 | ✅ SRT 可搜索 |
| .vtt | subtitle.vtt | WebVTT 字幕 | ✅ VTT 可搜索 |
| .nfo | info.nfo | NFO 信息文件 | ✅ NFO 可搜索 |
| .rst | document.rst | reStructuredText | ✅ RST 可搜索 |
| .tex | latex.tex | LaTeX 文档 | ✅ TEX 可搜索 |

### 2.12 Phase B 格式 (中等复杂度)

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .7z | archive.7z | 7z 压缩包内容 | ⚠️ 需 7zip-bin |
| .tar | backup.tar | TAR 归档内容 | ⚠️ 需完整解析 |
| .tar.gz | data.tar.gz | GZIP 压缩内容 | ⚠️ 需完整解析 |
| .bz2 | file.bz2 | BZ2 压缩内容 | ⚠️ 需完整解析 |
| .mobi | ebook.mobi | Kindle 内容 | ✅ MOBI 可搜索 |
| .azw3 | ebook.azw3 | Kindle 新版 | ✅ AZW3 可搜索 |
| .fb2 | fictionbook.fb2 | FictionBook 内容 | ✅ FB2 可搜索 |
| .vsd | diagram.vsd | Visio 旧版 | ⚠️ 二进制格式 |
| .vsdx | diagram.vsdx | Visio XML 文本 | ✅ VSDX 可搜索 |
| .pages | pages.pages | Apple Pages | ⚠️ 需完整解析 |

### 2.13 Phase C 格式 (Apple/iWork)

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .numbers | numbers.numbers | Apple Numbers | ⚠️ 需完整测试 |
| .key | presentation.key | Apple Keynote | ⚠️ 需完整测试 |
| .odg | drawing.odg | ODF 图形 | ⚠️ 需完整测试 |
| .odc | chart.odc | ODF 图表 | ⚠️ 需完整测试 |
| .ots | spreadsheet_template.ots | ODF 表格模板 | ⚠️ 需完整测试 |
| .otp | presentation_template.otp | ODF 演示模板 | ⚠️ 需完整测试 |

---

## 三、测试执行步骤

### 3.1 扫描测试

```bash
# 1. 添加测试目录
扫描目录: D:\DocSeeker-Test\

# 2. 验证扫描进度
- 确认所有文件被识别
- 确认文件数量正确

# 3. 检查日志
日志文件: %APPDATA%\docseeker\logs\
```

### 3.2 搜索测试

```bash
# 对每个格式执行以下搜索测试

# 1. 文件名搜索
搜索: test_keyword
预期: 相关文件名出现在结果中

# 2. 内容搜索
搜索: unique_keyword_from_file
预期: 文件出现在搜索结果中

# 3. 模糊搜索测试
开启模糊搜索，输入: "test_keywor" (故意拼错)
预期: 相关文件也能被找到
```

### 3.3 边界情况测试

| 测试场景 | 操作 | 预期结果 |
|----------|------|----------|
| 空文件 | 扫描空 .txt | 不崩溃，显示为空 |
| 大文件 | 扫描 100MB PDF | 跳过或成功解析 |
| 中文内容 | 扫描含中文文件 | 中文可搜索 |
| 特殊字符 | 文件名含 emoji | 正常显示 |
| 损坏文件 | 损坏的 DOCX | 跳过，不崩溃 |

---

## 四、测试检查清单

### 4.1 扫描功能

- [ ] 所有测试文件被正确识别
- [ ] 文件大小正确记录
- [ ] 文件类型正确识别
- [ ] 内容成功提取
- [ ] 没有崩溃或错误

### 4.2 搜索功能

- [ ] 精确搜索返回正确结果
- [ ] 正则搜索 `/pattern/` 工作正常
- [ ] 布尔搜索 AND/OR/NOT 工作正常
- [ ] 字段搜索 name:/ext:/path: 工作正常
- [ ] 模糊搜索 ✨ 开关工作正常

### 4.3 高级功能

- [ ] 去重功能 🔗 工作正常
- [ ] 文件标签功能工作正常
- [ ] 批量操作工作正常
- [ ] 导出功能 CSV/HTML/TXT 工作正常
- [ ] 右键菜单集成工作正常

---

## 五、测试报告模板

```markdown
## 测试报告 - [日期]

### 测试环境
- 操作系统: Windows 11
- DocSeeker 版本: 1.x.x
- 测试目录: D:\DocSeeker-Test\

### 测试结果汇总

| 类别 | 通过 | 失败 | 总计 |
|------|------|------|------|
| 基础文档 | X/Y | Z | Y |
| Office | X/Y | Z | Y |
| ... | ... | ... | ... |

### 发现的问题

| # | 格式 | 问题描述 | 严重程度 |
|---|------|----------|----------|
| 1 | .xxx | 描述 | 高/中/低 |

### 结论

- [ ] 测试通过，可以发布
- [ ] 需要修复后重新测试
```

---

## 六、测试文件生成脚本

### 6.1 生成简单测试文件

```bash
# 创建基础目录结构
mkdir -p "D:\DocSeeker-Test"
mkdir -p "D:\DocSeeker-Test\01_document"
mkdir -p "D:\DocSeeker-Test\02_office"
# ... 其他目录

# 生成测试文件
echo "This is a test document" > "D:\DocSeeker-Test\01_document\plain_text.txt"
echo "# Test Markdown" > "D:\DocSeeker-Test\01_document\markdown.md"
echo '{"key": "value"}' > "D:\DocSeeker-Test\01_document\json.json"
```

### 6.2 创建中文测试文件

```bash
# 创建中文内容测试文件
echo "这是一个测试文档" > "D:\DocSeeker-Test\01_document\chinese.txt"
echo "🎉 Emoji test 文件" > "D:\DocSeeker-Test\01_document\emoji.txt"
```

---

## 七、已知问题

| # | 格式 | 问题 | 状态 |
|---|------|------|------|
| 1 | .7z | 需要 7zip-bin 库 | 待解决 |
| 2 | .tar/.gz | 流式解压待完善 | 待解决 |
| 3 | .pages | Apple 格式解析待测试 | 待测试 |
| 4 | .vsd | 二进制格式，仅记录文件名 | 已知限制 |

---

## 八、测试优先级

### 高优先级 (核心功能)
1. .txt, .docx, .pdf - 最常用格式
2. .zip, .rar - 常用压缩包
3. .eml, .pst - 邮件格式

### 中优先级
4. .xlsx, .pptx - Office 表格/演示
5. .chm, .rtf - 帮助/富文本
6. Phase A 简单格式

### 低优先级 (较少使用)
7. 电子书格式
8. Apple/iWork 格式
9. 图形格式
