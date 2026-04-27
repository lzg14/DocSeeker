# DocSeeker 测试计划

> 更新时间: 2026-04-25
> 版本: 2.0
> 目标: 确保所有功能健壮可靠

---

## 一、功能概览与测试范围

### 1.1 核心功能模块

| 模块 | 功能 | 测试优先级 |
|------|------|-----------|
| 搜索 | 全文检索、模糊搜索、字段搜索、正则搜索、布尔搜索 | P0 |
| 扫描 | 添加目录、增量扫描、完整扫描、删除目录 | P0 |
| 文件预览 | 内容预览、元数据显示、格式识别 | P1 |
| 系统集成 | 托盘、快捷键、全局热键、窗口管理 | P1 |
| 界面 | 主题切换、语言切换、导航 | P2 |
| 去重 | 重复文件检测 | P2 |

### 1.2 支持的文件格式（60+）

**基础文档**: txt, md, json, xml, csv, html, svg, rst, tex
**Office**: doc, docx, xls, xlsx, ppt, pptx, wps, et, dps
**PDF**: pdf, xps
**电子书**: epub, mobi, azw3, fb2
**压缩包**: zip, rar, 7z, tar, tar.gz, bz2
**邮件**: eml, mbox, msg, pst
**配置**: yaml, yml, ini, cfg, conf, log
**字幕**: srt, vtt
**其他**: rtf, chm, nfo, odt, ods, odp, vsdx, pages, numbers, key

---

## 二、测试文件目录结构

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
│   ├── svg.svg
│   ├── chinese.txt        # 中文内容测试
│   ├── emoji.txt          # Emoji 测试
│   └── latex.tex
├── 02_office\
│   ├── word.doc
│   ├── word.docx
│   ├── excel.xls
│   ├── excel.xlsx
│   ├── powerpoint.ppt
│   └── powerpoint.pptx
├── 03_pdf\
│   ├── document.pdf
│   └── large_file.pdf     # 100MB+ 大文件测试
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
├── 07_ebook\
│   ├── book.epub
│   └── novel.mobi
├── 08_archive\
│   ├── documents.zip
│   ├── archive.rar
│   ├── data.tar.gz
│   └── archive.7z
├── 09_email\
│   ├── single.eml
│   ├── mailbox.mbox
│   └── outlook.msg
├── 10_config\
│   ├── config.yaml
│   ├── settings.yml
│   ├── settings.ini
│   ├── app.cfg
│   ├── server.conf
│   └── app.log
├── 11_subtitle\
│   ├── subtitle.srt
│   └── subtitle.vtt
├── 12_image\
│   ├── photo.jpg
│   ├── screenshot.png
│   └── design.psd
├── 13_media\
│   ├── audio.mp3
│   └── video.mp4
├── 14_duplicate\
│   ├── doc1.txt          # 内容与 doc2.txt 相同
│   ├── doc2.txt          # 内容与 doc1.txt 相同
│   ├── doc3.txt          # 唯一文件
│   └── subfolder\
│       └── doc1_copy.txt  # doc1.txt 的副本
└── 15_edge_cases\
    ├── empty.txt          # 空文件
    ├── large_file.pdf      # 100MB+ 测试
    ├── corrupted.docx      # 损坏文件
    └── chinese_filename.txt
```

---

## 三、功能测试用例

### 3.1 搜索功能测试

#### 3.1.1 基础搜索

| 测试用例 | 输入 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 文件名搜索 | `report` | 返回文件名含 "report" 的文件 | P0 |
| 内容搜索 | `unique_keyword_123` | 返回内容含该关键词的文件 | P0 |
| 空搜索 | (空) | 显示最近文件或提示输入关键词 | P1 |
| 无结果搜索 | `xxx_nonexistent_xxx` | 显示"未找到结果" | P1 |

#### 3.1.2 高级搜索语法

| 测试用例 | 输入 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 字段-文件名 | `name:report` | 仅匹配文件名 | P0 |
| 字段-扩展名 | `ext:pdf` | 仅匹配 PDF 文件 | P0 |
| 字段-路径 | `path:downloads` | 仅匹配路径含 downloads 的文件 | P1 |
| 正则搜索 | `/test\d+/` | 使用正则匹配 | P1 |
| 布尔-AND | `report AND 2024` | 两个关键词都匹配 | P1 |
| 布尔-OR | `report OR summary` | 任一关键词匹配 | P1 |
| 布尔-NOT | `report NOT draft` | 包含 report 但不包含 draft | P2 |

#### 3.1.3 模糊搜索

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 模糊开关 | 开启模糊搜索 | 输入 "test_keywor" 能匹配 "test_keyword" | P0 |
| 拼写容错 | 开启模糊搜索 | 输入 "doccument" 能匹配 "document" | P1 |
| 关闭模糊 | 关闭模糊搜索 | 拼写错误则无结果 | P2 |

#### 3.1.4 词干提取搜索

| 测试用例 | 输入关键词 | 预期匹配 | 优先级 |
|----------|------------|----------|--------|
| running → run | `running` | 包含 "run/runs/running" 的文件 | P0 |
| documents → document | `documents` | 包含 "document/documents" 的文件 | P0 |

---

### 3.2 扫描功能测试

#### 3.2.1 目录管理

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 添加目录 | 点击"添加目录" | 打开目录选择对话框 | P0 |
| 确认添加 | 选择测试目录 | 目录出现在列表中 | P0 |
| 删除目录 | 点击删除 | 目录从列表移除，弹出确认 | P1 |
| 取消删除 | 取消确认 | 目录保留 | P2 |

#### 3.2.2 扫描操作

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 增量扫描 | 点击增量扫描 | 仅扫描新增/修改文件 | P0 |
| 完整扫描 | 点击完整扫描 | 重新扫描所有文件 | P0 |
| 扫描进度 | 扫描中 | 状态栏显示进度 | P1 |
| 扫描取消 | 点击取消 | 停止扫描 | P2 |
| 大目录扫描 | 扫描 1000+ 文件 | 不卡顿，进度正常 | P1 |

---

### 3.3 文件预览功能测试

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 点击文件 | 点击文件列表项 | 右侧显示文件详情 | P0 |
| 双击打开 | 双击文件 | 调用系统默认程序打开 | P0 |
| 显示元数据 | 查看文件详情 | 显示大小、修改时间、路径 | P1 |
| 路径复制 | 点击复制路径 | 路径复制到剪贴板 | P1 |
| 文件不存在 | 文件已删除 | 显示"文件不存在"提示 | P2 |

---

### 3.4 去重功能测试

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 检测重复 | 扫描含重复文件的目录 | 识别相同内容的文件 | P2 |
| 显示重复组 | 查看重复文件 | 按组显示重复文件 | P2 |
| 差异对比 | 比较重复文件 | 显示文件差异 | P2 |

---

### 3.5 界面功能测试

#### 3.5.1 主题切换

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 切换浅色 | 选择浅色主题 | 界面变为浅色 | P0 |
| 切换深色 | 选择深色主题 | 界面变为深色 | P0 |
| 主题持久化 | 切换后重启 | 保持上次的theme选择 | P1 |

#### 3.5.2 语言切换

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 切换英文 | 选择 English | 界面变为英文 | P0 |
| 切换中文 | 选择 中文 | 界面变为中文 | P0 |
| 语言持久化 | 切换后重启 | 保持上次的language选择 | P1 |

#### 3.5.3 导航

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 搜索页导航 | 点击搜索图标 | 切换到搜索页 | P0 |
| 扫描页导航 | 点击扫描图标 | 切换到扫描页 | P0 |
| 设置页导航 | 点击设置图标 | 切换到语言/主题设置页 | P0 |
| 帮助页导航 | 点击帮助图标 | 切换到帮助页 | P0 |
| 导航状态保持 | 切换页面后返回 | 搜索状态保留 | P1 |

---

### 3.6 系统集成测试

#### 3.6.1 窗口管理

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 最小化 | 点击最小化按钮 | 窗口最小化到任务栏 | P0 |
| 最大化 | 点击最大化按钮 | 窗口最大化/还原切换 | P0 |
| 关闭 | 点击关闭按钮 | 显示关闭确认或最小化到托盘 | P0 |
| 拖动 | 拖动标题栏 | 窗口随鼠标移动 | P1 |

#### 3.6.2 系统托盘

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 最小化到托盘 | 设置后点击关闭 | 最小化到系统托盘 | P1 |
| 托盘菜单 | 右键托盘图标 | 显示菜单(显示/退出) | P1 |
| 托盘恢复 | 点击托盘图标 | 恢复窗口 | P1 |
| 退出程序 | 托盘菜单点击退出 | 完全退出程序 | P1 |

#### 3.6.3 快捷键

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 全局快捷键 | Ctrl+Shift+F | 唤起浮动搜索窗口 | P0 |
| 双击 Ctrl | 快速按两下 Ctrl | 唤起浮动搜索窗口 | P1 |
| ESC 关闭 | 在浮动窗口按 ESC | 关闭浮动窗口 | P1 |

#### 3.6.4 浮动搜索窗口

| 测试用例 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 搜索功能 | 输入关键词搜索 | 显示搜索结果 | P0 |
| 结果点击 | 点击搜索结果 | 打开文件 | P1 |
| 回车搜索 | 输入后按回车 | 执行搜索 | P1 |
| ESC 关闭 | 按 ESC | 关闭窗口 | P1 |

---

### 3.7 格式解析测试

#### 3.7.1 高优先级格式（核心功能）

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .txt | plain_text.txt | 纯文本内容 | ✅ 可搜索 |
| .pdf | document.pdf | PDF 正文 | ✅ 可搜索 |
| .docx | word.docx | Word 正文 + 标题 | ✅ 可搜索 |
| .xlsx | excel.xlsx | Excel 单元格 | ✅ 可搜索 |
| .pptx | powerpoint.pptx | PPT 幻灯片文本 | ✅ 可搜索 |
| .md | markdown.md | Markdown 内容 | ✅ 可搜索 |
| .json | json.json | JSON 数据 | ✅ 可搜索 |
| .zip | documents.zip | ZIP 内文件 | ✅ 可搜索 |

#### 3.7.2 中优先级格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .doc | word.doc | Word 正文 | ✅ 可搜索 |
| .xls | excel.xls | Excel 单元格 | ✅ 可搜索 |
| .ppt | powerpoint.ppt | PPT 文本框 | ✅ 可搜索 |
| .html | html.html | HTML 正文 | ✅ 可搜索 |
| .xml | xml.xml | XML 内容 | ✅ 可搜索 |
| .csv | csv.csv | CSV 表格内容 | ✅ 可搜索 |
| .rtf | rich_text.rtf | RTF 正文 | ✅ 可搜索 |
| .chm | help.chm | CHM 帮助内容 | ✅ 可搜索 |
| .eml | single.eml | 邮件正文 | ✅ 可搜索 |
| .yaml | config.yaml | YAML 配置 | ✅ 可搜索 |
| .yml | settings.yml | YAML 配置 | ✅ 可搜索 |
| .ini | settings.ini | INI 配置 | ✅ 可搜索 |
| .log | app.log | 日志内容 | ✅ 可搜索 |

#### 3.7.3 低优先级格式

| 格式 | 测试文件 | 验证内容 | 预期结果 |
|------|----------|----------|----------|
| .epub | book.epub | EPUB 章节 | ✅ 可搜索 |
| .mobi | novel.mobi | Kindle 内容 | ✅ 可搜索 |
| .rar | archive.rar | RAR 内文件 | ✅ 可搜索 |
| .7z | archive.7z | 7z 内文件 | ⚠️ 需测试 |
| .tar.gz | data.tar.gz | TGZ 内文件 | ⚠️ 需测试 |
| .msg | outlook.msg | MSG 邮件 | ✅ 可搜索 |
| .vsdx | diagram.vsdx | Visio XML | ✅ 可搜索 |
| .odt | text.odt | ODF 文档 | ✅ 可搜索 |
| .ods | spreadsheet.ods | ODF 表格 | ✅ 可搜索 |
| .odp | presentation.odp | ODF 演示 | ✅ 可搜索 |

---

### 3.8 边界情况测试

| 测试场景 | 操作 | 预期结果 | 优先级 |
|----------|------|----------|--------|
| 空文件 | 扫描 empty.txt | 不崩溃 | P1 |
| 大文件 | 扫描 100MB+ PDF | 跳过或成功解析 | P1 |
| 中文内容 | 搜索中文关键词 | 正常返回结果 | P0 |
| 中文文件名 | 搜索中文文件名 | 正常返回结果 | P0 |
| 特殊字符 | 文件名含 `!@#$%` | 正常显示 | P2 |
| Emoji 文件名 | 文件名含 emoji 🎉 | 正常显示 | P2 |
| 损坏文件 | 扫描 corrupted.docx | 跳过，不崩溃 | P1 |
| 文件已删除 | 查看已删文件 | 显示不存在提示 | P2 |
| 长路径 | 文件路径超长 | 正常显示路径 | P2 |

---

## 四、测试执行步骤

### 4.1 环境准备

```bash
# 1. 克隆/更新项目
git clone https://github.com/your-repo/docseeker.git
cd docseeker

# 2. 安装依赖
npm install

# 3. 创建测试目录
mkdir -p "D:\DocSeeker-Test"

# 4. 生成测试文件（见第五节）
```

### 4.2 开发环境测试

```bash
# 1. 启动开发服务器
npm run dev

# 2. 执行手动测试
# - 按照测试用例逐项测试

# 3. 停止开发服务器
```

### 4.3 生产环境测试

```bash
# 1. 打包应用
npm run build
npm run pack

# 2. 安装并测试打包后的应用
# - 运行 DocSeeker-Setup-x.x.x.exe
```

---

## 五、测试文件生成脚本

### 5.1 生成基础测试文件

```powershell
# 创建测试目录
$testDir = "D:\DocSeeker-Test"
New-Item -ItemType Directory -Force -Path $testDir | Out-Null

# 基础文档
"Test content with keyword_123" | Out-File "$testDir\01_document\plain_text.txt" -Encoding UTF8
"# Test Markdown" | Out-File "$testDir\01_document\markdown.md" -Encoding UTF8
'{"name": "test", "keyword": "value_123"}' | Out-File "$testDir\01_document\json.json" -Encoding UTF8
"<root><item>XML content 123</item></root>" | Out-File "$testDir\01_document\xml.xml" -Encoding UTF8

# 中文测试
"这是一个测试文档，包含关键词中文123" | Out-File "$testDir\01_document\chinese.txt" -Encoding UTF8
"🎉 Emoji test 文件 emoji_🎉" | Out-File "$testDir\01_document\emoji.txt" -Encoding UTF8

# 空文件
"" | Out-File "$testDir\15_edge_cases\empty.txt" -Encoding UTF8
```

### 5.2 生成重复文件（用于去重测试）

```powershell
# 创建重复文件
$content = "This is duplicate content for deduplication test."
$content | Out-File "$testDir\14_duplicate\doc1.txt" -Encoding UTF8
$content | Out-File "$testDir\14_duplicate\doc2.txt" -Encoding UTF8

# 唯一文件
"Unique content that appears only once in this directory." | Out-File "$testDir\14_duplicate\doc3.txt" -Encoding UTF8

# 子目录副本
New-Item -ItemType Directory -Force -Path "$testDir\14_duplicate\subfolder" | Out-Null
$content | Out-File "$testDir\14_duplicate\subfolder\doc1_copy.txt" -Encoding UTF8
```

### 5.3 生成配置测试文件

```powershell
# YAML
@"
name: DocSeeker Test
version: "1.0"
features:
  - search
  - scan
"@ | Out-File "$testDir\10_config\config.yaml" -Encoding UTF8

# INI
@"
[database]
host=localhost
port=5432

[app]
debug=true
"@ | Out-File "$testDir\10_config\settings.ini" -Encoding UTF8

# LOG
@"
[2024-01-01 10:00:00] INFO: Application started
[2024-01-01 10:00:01] DEBUG: Database connected
[2024-01-01 10:00:02] ERROR: Failed to load config
"@ | Out-File "$testDir\10_config\app.log" -Encoding UTF8
```

---

## 六、测试检查清单

### 6.1 核心功能 (P0)

#### 搜索功能
- [ ] 精确搜索文件名返回正确结果
- [ ] 精确搜索文件内容返回正确结果
- [ ] 字段搜索 `name:` 工作正常
- [ ] 字段搜索 `ext:` 工作正常
- [ ] 字段搜索 `path:` 工作正常
- [ ] 模糊搜索开关工作正常
- [ ] 模糊搜索能匹配拼写变体
- [ ] 词干提取搜索 (run/running) 工作正常

#### 扫描功能
- [ ] 添加目录成功
- [ ] 删除目录成功（需确认）
- [ ] 增量扫描只扫描新增文件
- [ ] 完整扫描重新扫描所有文件
- [ ] 扫描进度正确显示

#### 界面
- [ ] 浅色主题正确应用
- [ ] 深色主题正确应用
- [ ] 中文界面正确显示
- [ ] 英文界面正确显示
- [ ] 四个导航页面切换正常

#### 系统集成
- [ ] 最小化按钮工作
- [ ] 最大化/还原按钮工作
- [ ] 关闭按钮工作（根据设置）
- [ ] 全局快捷键 Ctrl+Shift+F 唤起浮动窗口

### 6.2 重要功能 (P1)

#### 搜索
- [ ] 正则搜索 `/pattern/` 工作
- [ ] 布尔搜索 AND 工作
- [ ] 布尔搜索 OR 工作
- [ ] 布尔搜索 NOT 工作
- [ ] 无结果时显示正确提示

#### 扫描
- [ ] 大目录（1000+文件）扫描不卡顿
- [ ] 扫描日志无错误

#### 文件预览
- [ ] 点击文件显示预览
- [ ] 双击文件打开应用
- [ ] 显示文件元数据
- [ ] 复制路径功能正常

#### 系统托盘
- [ ] 最小化到托盘功能
- [ ] 托盘菜单显示
- [ ] 托盘恢复窗口
- [ ] 托盘退出程序

#### 浮动窗口
- [ ] 搜索结果正常显示
- [ ] 点击结果打开文件
- [ ] ESC 关闭窗口

### 6.3 增强功能 (P2)

#### 去重
- [ ] 检测重复文件
- [ ] 显示重复组
- [ ] 比较文件差异

#### 边界情况
- [ ] 空文件不崩溃
- [ ] 大文件（100MB+）处理
- [ ] 中文内容搜索
- [ ] 中文文件名搜索
- [ ] 特殊字符文件名
- [ ] Emoji 文件名
- [ ] 损坏文件不崩溃
- [ ] 文件已删除提示

---

## 七、测试报告模板

```markdown
## 测试报告 - [日期]

### 测试环境
- 操作系统: Windows 11
- DocSeeker 版本: x.x.x
- Node 版本: xx.x.x
- 测试目录: D:\DocSeeker-Test\

### 测试结果汇总

#### P0 核心功能
| 功能 | 测试项数 | 通过 | 失败 |
|------|----------|------|------|
| 搜索-精确 | X | X | X |
| 搜索-字段 | X | X | X |
| 扫描-目录管理 | X | X | X |
| 扫描-扫描操作 | X | X | X |
| 界面-主题 | X | X | X |
| 界面-语言 | X | X | X |
| 界面-导航 | X | X | X |
| 系统-窗口 | X | X | X |
| 系统-快捷键 | X | X | X |

#### P1 重要功能
| 功能 | 测试项数 | 通过 | 失败 |
|------|----------|------|------|
| ... | ... | ... | ... |

#### P2 增强功能
| 功能 | 测试项数 | 通过 | 失败 |
|------|----------|------|------|
| ... | ... | ... | ... |

### 格式支持测试

| 格式 | 支持 | 备注 |
|------|------|------|
| txt | ✅ | |
| pdf | ✅/❌ | |
| docx | ✅/❌ | |
| ... | ... | |

### 发现的问题

| # | 功能 | 问题描述 | 严重程度 | 状态 |
|---|------|----------|----------|------|
| 1 | xxx | 描述 | P0/P1/P2 | Open/Fixed |

### 测试结论

- P0 功能: X/X 通过 ✅
- P1 功能: X/X 通过 ✅
- P2 功能: X/X 通过 ✅

- [ ] 可以发布
- [ ] 需要修复 P0 问题后重新测试
- [ ] 需要修复 P1 问题后重新测试
```

---

## 八、已知问题

| # | 问题 | 格式/功能 | 状态 | 备注 |
|---|------|-----------|------|------|
| 1 | .7z 格式支持 | 7z | ⚠️ 需测试 | 依赖 7zip-bin |
| 2 | .tar.gz 解析 | tar.gz | ⚠️ 需测试 | 流式解压 |
| 3 | Apple 格式支持 | pages/numbers/key | ⚠️ 需测试 | iWork 格式 |
| 4 | 双击 Ctrl 热键 | 全局热键 | ✅ 已实现 | Windows 专用 |
| 5 | 实时监控 | 文件监控 | ✅ 已实现 | 默认关闭（CPU 优化） |

---

## 九、测试优先级总结

### 第一轮测试 (P0 - 核心功能)
```
预计时间: 30 分钟
目标: 验证基本功能可用

1. 搜索功能 (10分钟)
   - 文件名搜索
   - 内容搜索
   - 字段搜索 (name:/ext:/path:)

2. 扫描功能 (10分钟)
   - 添加目录
   - 增量扫描
   - 完整扫描

3. 界面功能 (5分钟)
   - 主题切换
   - 语言切换
   - 导航

4. 窗口管理 (5分钟)
   - 最小化/最大化/关闭
   - 全局快捷键
```

### 第二轮测试 (P1 - 重要功能)
```
预计时间: 45 分钟
目标: 验证高级功能和稳定性

1. 高级搜索 (15分钟)
   - 正则搜索
   - 布尔搜索
   - 模糊搜索
   - 词干提取

2. 文件预览 (10分钟)
   - 点击预览
   - 双击打开
   - 元数据显示
   - 路径复制

3. 系统托盘 (10分钟)
   - 最小化到托盘
   - 托盘菜单
   - 恢复窗口
   - 退出程序

4. 浮动窗口 (10分钟)
   - 搜索功能
   - 打开文件
   - ESC 关闭
```

### 第三轮测试 (P2 - 完整测试)
```
预计时间: 60 分钟
目标: 完整验证所有功能和边界情况

1. 格式支持 (30分钟)
   - 按格式逐项测试
   - 验证可搜索性

2. 去重功能 (10分钟)
   - 检测重复
   - 显示重复组

3. 边界情况 (15分钟)
   - 空文件
   - 大文件
   - 中文内容
   - 特殊字符
   - 损坏文件

4. 边界确认 (5分钟)
   - 确认已知问题
   - 记录新发现
```

---

## 十、快速回归测试脚本

每次代码修改后，至少执行以下回归测试：

```markdown
### 快速回归检查清单

#### 搜索 (2分钟)
- [ ] 搜索已知文件 → 结果正确
- [ ] 搜索未知关键词 → 无结果提示

#### 扫描 (3分钟)
- [ ] 添加测试目录 → 成功
- [ ] 增量扫描 → 完成
- [ ] 搜索新文件 → 找到

#### 界面 (1分钟)
- [ ] 切换主题 → 生效
- [ ] 切换语言 → 生效

#### 窗口 (1分钟)
- [ ] 最小化/还原 → 正常
- [ ] 全局快捷键 → 正常
```

---

> 如发现问题，请更新 PROGRESS.md 的已知问题列表，并创建 Issue 跟踪。
