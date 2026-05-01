# DocSeeker 测试套件

本目录包含 DocSeeker 的测试代码、测试脚本和测试数据。

## 目录结构

\`\`\`
tests/
├── README.md              # 本文档
├── scripts/               # 测试脚本
│   └── auto-test-formats.js  # 格式解析自动测试
├── fixtures/              # 测试数据文件 (47 个文件)
│   ├── test_txt.txt      # 纯文本
│   ├── test_json.json    # JSON 格式
│   ├── test_xml.xml      # XML 格式
│   ├── test_html.html    # HTML 格式
│   ├── test_md.md        # Markdown 格式
│   ├── test_csv.csv      # CSV 格式
│   ├── test_ini.ini      # INI 配置
│   ├── test_log.log      # 日志文件
│   ├── test_sql.sql      # SQL 脚本
│   ├── test_sh.sh        # Shell 脚本
│   ├── test_py.py        # Python 代码
│   ├── test_js.js        # JavaScript 代码
│   ├── test_java.java    # Java 代码
│   ├── test_rust.rs      # Rust 代码
│   └── ...               # 其他格式测试文件
└── unit/                 # 单元测试 (4 个测试文件, 61 个测试)
    ├── thumbnailCache.test.ts  # 缩略图缓存测试
    ├── scanner.test.ts         # 扫描器测试
    ├── config.test.ts          # 配置管理测试
    └── search.test.ts          # 搜索功能测试
\`\`\`

## 运行测试

### 单元测试

\`\`\`bash
# 运行所有单元测试
npm test

# 监视模式（文件变化时自动运行）
npm run test:watch
\`\`\`

### 格式解析测试

\`\`\`bash
npm run test:formats
\`\`\`

这将测试 fixtures/ 目录下的所有文件格式，验证解析器是否能正确提取文本内容。

## 测试统计

| 测试类型 | 测试文件数 | 测试用例数 | 状态 |
|---------|-----------|-----------|------|
| 单元测试 | 4 | 61 | ✅ 全部通过 |
| 格式测试 | 47+ | - | ✅ 全部通过 |

## 测试覆盖范围

### 单元测试覆盖

- thumbnailCache.test.ts - 缩略图缓存功能
- scanner.test.ts - 文件类型检测、路径工具、大小格式化、跳过规则、文本提取
- config.test.ts - 扫描设置、跳过规则、验证逻辑、应用设置、导入/导出
- search.test.ts - 查询规范化、搜索结果处理、模糊匹配、高亮显示、搜索历史

### 格式测试覆盖 (fixtures/)

| 类别 | 格式 |
|------|------|
| 文本/配置 | txt, json, xml, html, md, csv, log, yaml, ini, conf, properties, toml |
| 源代码 | js, py, java, rs, cs, go, h, kt, lua, php, pl, rb, scala, scss, sh, sql |
| 字幕 | srt, vtt, ass |
| Office | odt, ods, odp, pages, numbers, key, et, dps |
| 其他 | msg, nfo, tar, tiff, webp |

## 添加新的测试

### 添加格式解析测试

1. 将测试文件放入 tests/fixtures/ 目录
2. 文件名格式：test_<格式名>.<扩展名>
3. 文件内容建议包含关键词以便验证：DocSeeker、Test、测试
4. 运行 npm run test:formats 进行测试

### 添加单元测试

1. 在 tests/unit/ 目录创建新的 .test.ts 文件
2. 使用 Jest 的 test() 或 it() 函数编写测试
3. 运行 npm test 执行测试

## 注意事项

- 格式解析测试会读取 fixtures/ 目录下的所有文件
- 测试文件应该较小（建议 < 1MB）
- 某些格式（如 PDF、DOC、XLS）需要额外依赖
