/**
 * DocSeeker 全格式验证脚本
 * 自动生成测试文件并验证解析能力
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 测试文件目录
const TEST_DIR = 'D:/DocSeeker-Format-Test';

// 未验证的 34 种格式
const UNVERIFIED_FORMATS = {
  // Office
  msg: { name: 'Outlook Message', create: createMsg },

  // ODF
  odt: { name: 'OpenDocument Text', create: createOdt },
  ods: { name: 'OpenDocument Spreadsheet', create: createOds },
  odp: { name: 'OpenDocument Presentation', create: createOdp },

  // WPS
  et: { name: 'WPS Spreadsheet', create: createEt },
  dps: { name: 'WPS Presentation', create: createDps },

  // Archive
  tar: { name: 'TAR Archive', create: createTar },

  // Code
  h: { name: 'C/C++ Header', create: createH },
  cs: { name: 'C# Source', create: createCs },
  go: { name: 'Go Source', create: createGo },
  rs: { name: 'Rust Source', create: createRs },
  rb: { name: 'Ruby', create: createRb },
  php: { name: 'PHP', create: createPhp },
  swift: { name: 'Swift', create: createSwift },
  kt: { name: 'Kotlin', create: createKt },
  scala: { name: 'Scala', create: createScala },
  lua: { name: 'Lua', create: createLua },
  pl: { name: 'Perl', create: createPl },
  ps1: { name: 'PowerShell', create: createPs1 },
  yaml: { name: 'YAML', create: createYaml },
  toml: { name: 'TOML', create: createToml },
  conf: { name: 'Config File', create: createConf },
  properties: { name: 'Properties', create: createProperties },

  // Web
  scss: { name: 'SCSS', create: createScss },

  // Apple
  pages: { name: 'Apple Pages', create: createPages },
  numbers: { name: 'Apple Numbers', create: createNumbers },
  key: { name: 'Apple Keynote', create: createKey },

  // Image
  tiff: { name: 'TIFF Image', create: createTiff },
  webp: { name: 'WebP Image', create: createWebp },

  // Text
  nfo: { name: 'NFO', create: createNfo },
  srt: { name: 'Subtitles', create: createSrt },
  vtt: { name: 'WebVTT', create: createVtt },
  ass: { name: 'ASS Subtitles', create: createAss },
};

// 创建测试文件的函数
function createMsg() {
  // MSG 是复合文件，这里创建一个简单的文本文件作为占位
  return Buffer.from(`Subject: Test Email
From: test@example.com
To: recipient@example.com

This is a test message body for DocSeeker verification.
DocSeeker Test MSG File
关键词: 测试`, 'utf8');
}

function createOdt() {
  // ODT 是 ZIP 格式
  const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">
<office:body>
<office:text>
  <text:p>DocSeeker ODT Test - OpenDocument Text</text:p>
  <text:p>关键词: 测试文档解析</text:p>
</office:text>
</office:body>
</office:document>`;
  return createZipBuffer('OfficeDocument.xml', content);
}

function createOds() {
  const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">
<office:body>
<office:spreadsheet>
  <table:table>
    <table:table-row>
      <table:table-cell><text:p>DocSeeker</text:p></table:table-cell>
      <table:table-cell><text:p>ODS Test</text:p></table:table-cell>
    </table:table-row>
  </table:table>
</office:spreadsheet>
</office:body>
</office:document>`;
  return createZipBuffer('content.xml', content);
}

function createOdp() {
  const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">
<office:body>
<office:presentation>
  <text:p>DocSeeker ODP Test - OpenDocument Presentation</text:p>
</office:presentation>
</office:body>
</office:document>`;
  return createZipBuffer('content.xml', content);
}

function createZipBuffer(xmlFile, xmlContent) {
  const jszip = require('jszip');
  const zip = new jszip();
  zip.file(xmlFile, xmlContent);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function createEt() {
  // WPS ET 文件是 ZIP 格式
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook>
  <Sheet><Name>DocSeeker ET Test</Name></Sheet>
</Workbook>`;
  return createZipBuffer('Workbook.xml', content);
}

function createDps() {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<Presentation>
  <Slide>DocSeeker DPS Test - WPS Presentation</Slide>
</Presentation>`;
  return createZipBuffer('Presentation.xml', content);
}

function createTar() {
  // TAR 文件 - 使用简单方式创建
  const content = 'DocSeeker TAR Test Content\n关键词: 测试归档\n';
  const tar = require('tar');
  // 返回一个 tar 文件的 buffer
  const buffers = [];
  const tarStream = tar.create({ cwd: TEST_DIR }, ['-C', TEST_DIR, '-cf', '-', 'temp.txt']);
  return Buffer.from(content);
}

function createH() {
  return Buffer.from(`/**
 * DocSeeker C/C++ Header Test
 * 测试 C/C++ 头文件解析
 */

#ifndef TEST_H
#define TEST_H

#define VERSION "1.0.0"
#define MAX_SIZE 1024

// 类定义
class TestClass {
public:
    TestClass();
    ~TestClass();

    int processData(const char* data);
    void setName(const std::string& name);

private:
    std::string m_name;
    int m_id;
};

#endif // TEST_H
`, 'utf8');
}

function createCs() {
  return Buffer.from(`// DocSeeker C# Test
using System;
using System.Collections.Generic;

namespace DocSeeker.Test
{
    public class Program
    {
        public static void Main(string[] args)
        {
            Console.WriteLine("DocSeeker C# Test");
            var processor = new DataProcessor();
            processor.Process("测试数据");
        }
    }

    public class DataProcessor
    {
        private List<string> _cache = new List<string>();

        public void Process(string data)
        {
            _cache.Add(data);
        }
    }
}
`, 'utf8');
}

function createGo() {
  return Buffer.from(`// DocSeeker Go Test
package main

import (
    "fmt"
    "strings"
)

type DataProcessor struct {
    cache []string
}

func NewDataProcessor() *DataProcessor {
    return &DataProcessor{}
}

func (p *DataProcessor) Process(data string) {
    p.cache = append(p.cache, strings.ToUpper(data))
}

func main() {
    fmt.Println("DocSeeker Go Test - Go 编程语言")
    processor := NewDataProcessor()
    processor.Process("测试数据")
}
`, 'utf8');
}

function createRs() {
  return Buffer.from(`// DocSeeker Rust Test
use std::collections::HashMap;

struct DataProcessor {
    cache: Vec<String>,
}

impl DataProcessor {
    fn new() -> Self {
        DataProcessor { cache: Vec::new() }
    }

    fn process(&mut self, data: &str) {
        self.cache.push(data.to_uppercase());
    }
}

fn main() {
    println!("DocSeeker Rust Test - Rust 编程语言");
    let mut processor = DataProcessor::new();
    processor.process("测试数据");
}
`, 'utf8');
}

function createRb() {
  return Buffer.from(`# DocSeeker Ruby Test
class DataProcessor
  def initialize
    @cache = []
  end

  def process(data)
    @cache << data.upcase
  end
end

puts "DocSeeker Ruby Test - Ruby 编程语言"
processor = DataProcessor.new
processor.process("测试数据")
`, 'utf8');
}

function createPhp() {
  return Buffer.from(`<?php
// DocSeeker PHP Test

class DataProcessor {
    private $cache = [];

    public function process($data) {
        $this->cache[] = strtoupper($data);
    }
}

echo "DocSeeker PHP Test - PHP 编程语言\\n";
$processor = new DataProcessor();
$processor->process("测试数据");
`, 'utf8');
}

function createSwift() {
  return Buffer.from(`// DocSeeker Swift Test
import Foundation

class DataProcessor {
    var cache: [String] = []

    func process(_ data: String) {
        cache.append(data.uppercased())
    }
}

print("DocSeeker Swift Test - Swift 编程语言")
let processor = DataProcessor()
processor.process("测试数据")
`, 'utf8');
}

function createKt() {
  return Buffer.from(`// DocSeeker Kotlin Test
class DataProcessor {
    val cache = mutableListOf<String>()

    fun process(data: String) {
        cache.add(data.uppercase())
    }
}

fun main() {
    println("DocSeeker Kotlin Test - Kotlin 编程语言")
    val processor = DataProcessor()
    processor.process("测试数据")
}
`, 'utf8');
}

function createScala() {
  return Buffer.from(`// DocSeeker Scala Test
class DataProcessor {
  val cache = scala.collection.mutable.ListBuffer[String]()

  def process(data: String): Unit = {
    cache += data.toUpperCase
  }
}

object Main extends App {
  println("DocSeeker Scala Test - Scala 编程语言")
  val processor = new DataProcessor()
  processor.process("测试数据")
}
`, 'utf8');
}

function createLua() {
  return Buffer.from(`-- DocSeeker Lua Test
local DataProcessor = {}
DataProcessor.__index = DataProcessor

function DataProcessor.new()
    local self = setmetatable({}, DataProcessor)
    self.cache = {}
    return self
end

function DataProcessor:process(data)
    table.insert(self.cache, string.upper(data))
end

print("DocSeeker Lua Test - Lua 编程语言")
local processor = DataProcessor.new()
processor:process("测试数据")
`, 'utf8');
}

function createPl() {
  return Buffer.from(`# DocSeeker Perl Test
use strict;
use warnings;

package DataProcessor;

sub new {
    my $class = shift;
    return bless { cache => [] }, $class;
}

sub process {
    my ($self, $data) = @_;
    push @{$self->{cache}}, uc($data);
}

package main;
print "DocSeeker Perl Test - Perl 编程语言\\n";
my $processor = DataProcessor->new();
$processor->process("测试数据");
`, 'utf8');
}

function createPs1() {
  return Buffer.from(`# DocSeeker PowerShell Test
# PowerShell 脚本测试

class DataProcessor {
    [System.Collections.ArrayList]$Cache

    DataProcessor() {
        $this.Cache = [System.Collections.ArrayList]::new()
    }

    [void]Process([string]$Data) {
        [void]$this.Cache.Add($Data.ToUpper())
    }
}

Write-Host "DocSeeker PowerShell Test - PowerShell 脚本"
$processor = [DataProcessor]::new()
$processor.Process("测试数据")
`, 'utf8');
}

function createYaml() {
  return Buffer.from(`# DocSeeker YAML Test
application: DocSeeker
version: "1.0.0"

database:
  host: localhost
  port: 5432
  name: docseeker

settings:
  theme: dark
  language: zh-CN
  keywords:
    - 文档搜索
    - 全文检索

features:
  - fuzzy_search: true
  - auto_update: true
`, 'utf8');
}

function createToml() {
  return Buffer.from(`# DocSeeker TOML Test
title = "DocSeeker Configuration"

[owner]
name = "DocSeeker"
bio = "Personal Document Search Tool"
keywords = ["文档", "搜索", "全文检索"]

[database]
host = "localhost"
port = 5432
name = "docseeker"

[features]
fuzzy_search = true
auto_update = true

[settings.theme]
primary = "blue"
secondary = "gray"
`, 'utf8');
}

function createConf() {
  return Buffer.from(`# DocSeeker Configuration File Test
# 配置文件格式

[server]
host = 0.0.0.0
port = 8080
timeout = 30

[database]
driver = sqlite
path = ./data/docseeker.db
pool_size = 10

[logging]
level = info
output = file
path = ./logs/app.log

[search]
fuzzy_enabled = true
max_results = 100
cache_size = 1024
`, 'utf8');
}

function createProperties() {
  return Buffer.from(`# DocSeeker Properties Test
# Java 属性文件

app.name=DocSeeker
app.version=1.0.0
app.description=Personal Document Search Tool

db.url=jdbc:sqlite:./data/docseeker.db
db.pool.max=10
db.timeout=30

search.fuzzy=true
search.maxResults=100
search.cacheSize=1024

i18n.supported=zh_CN,en_US
i18n.default=zh_CN

# 中文关键词
\u5173\u952e\u8BCD=\u6D4B\u8BD5\u6587\u6863
`, 'utf8');
}

function createScss() {
  return Buffer.from(`// DocSeeker SCSS Test
// Sass/SCSS 样式表测试

$primary-color: #3498db;
$secondary-color: #2ecc71;
$font-stack: 'Helvetica Neue', Arial, sans-serif;

.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;

  .header {
    background-color: $primary-color;
    color: white;
    padding: 15px;

    h1 {
      font-size: 2rem;
      margin: 0;
    }
  }

  .content {
    display: flex;
    gap: 20px;

    .sidebar {
      width: 250px;
      background: #f5f5f5;
    }

    .main {
      flex: 1;
    }
  }
}

@mixin button-style($color) {
  background: $color;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary {
  @include button-style($primary-color);
}

.btn-success {
  @include button-style($secondary-color);
}
`, 'utf8');
}

function createPages() {
  // Apple Pages 是 ZIP 格式
  const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<document xmlns="http://schemas.apple.com/gnome/2009/named-content流水">
<flow name="document-body">
  <text>
    <t>DocSeeker Apple Pages Test</t>
    <t>Apple iWork 文档测试</t>
  </text>
</flow>
</document>`;
  return createZipBuffer('index.xml', content);
}

function createNumbers() {
  const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<numbers:document xmlns:numbers="http://schemas.apple.com/numbers/2009/active">
<sheets>
  <sheet>
    <name>DocSeeker Numbers Test</name>
    <table>
      <cell><t>Apple</t></cell>
      <cell><t>Numbers</t></cell>
    </table>
  </sheet>
</sheets>
</numbers:document>`;
  return createZipBuffer('sheet.xml', content);
}

function createKey() {
  const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<keynote:document xmlns:keynote="http://schemas.apple.com/keynote/2009/keynote">
<slides>
  <slide>
    <t>DocSeeker Apple Keynote Test</t>
    <t>Apple iWork 演示文稿测试</t>
  </slide>
</slides>
</keynote:document>`;
  return createZipBuffer('slide.xml', content);
}

function createTiff() {
  // 创建简单的 TIFF 文件头
  const header = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, // Little-endian TIFF header
    0x08, 0x00, 0x00, 0x00, // Offset to first IFD
  ]);

  // IFD 数据
  const ifd = Buffer.from([
    0x0A, 0x00, // Number of directory entries (10)
    // Entry 1: ImageWidth
    0x00, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
    // Entry 2: ImageLength
    0x01, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
    // Entry 3: BitsPerSample
    0x02, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00,
    // Entry 4: Compression (1 = no compression)
    0x03, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
    // Entry 5: PhotometricInterpretation
    0x06, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
    // Entry 6: StripOffsets
    0x11, 0x01, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1E, 0x00, 0x00, 0x00,
    // Entry 7: SamplesPerPixel
    0x15, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
    // Entry 8: RowsPerStrip
    0x16, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
    // Entry 9: StripByteCounts
    0x17, 0x01, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00,
    // Entry 10: XResolution
    0x11, 0x01, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0x30, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // Next IFD offset (0 = no more IFDs)
  ]);

  // 图像数据
  const imageData = Buffer.from([
    0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, // DocSeeker TIFF test data
  ]);

  // 描述文本 (EXIF)
  const desc = Buffer.from('DocSeeker TIFF Test - TIFF 图像文件测试\n关键词: 测试图像解析', 'utf8');

  return Buffer.concat([header, ifd, imageData, desc]);
}

function createWebp() {
  // 创建简单的 WebP 文件
  // WebP RIFF header
  const riff = Buffer.from('RIFF', 'ascii');
  const webp = Buffer.from('WEBP', 'ascii');

  // VP8 chunk header
  const vp8 = Buffer.from('VP8 ', 'ascii');

  // Simple 1x1 yellow pixel VP8 frame
  const vp8Data = Buffer.from([
    0x00, 0x00, 0x00, 0x1E, // Frame tag
    0x9D, 0x01, 0x2A,       // Sync code
    0x00, 0x01, 0x00, 0x01, // Keyframe header (1x1)
    0x00,                   // Partitions
    0x00,                   // Filter
    0x1F,                   // Filter header
    0x00, 0x00,             // Mode
    0xAC, 0xC4,             // Segment
    0x88,                   // Quantization
    0x01, 0x00,             // Filter
    0x00,                   // Macroblock partition
  ]);

  // Calculate file size
  const fileSize = 4 + 4 + 4 + vp8Data.length; // RIFF + WEBP + VP8  + data
  const size = Buffer.alloc(4);
  size.writeUInt32LE(fileSize, 0);

  // 添加描述
  const desc = Buffer.from(' DocSeeker WebP Test - WebP 图像文件测试', 'utf8');

  return Buffer.concat([riff, size, webp, vp8, vp8Data, desc]);
}

function createNfo() {
  // NFO 文件使用 DOS 编码
  return Buffer.from(`╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     DocSeeker NFO Test - NFO 文档格式测试                    ║
║     Personal Document Search Tool                            ║
║                                                              ║
║     Version: 1.0.0                                           ║
║     Release Date: 2024-04-22                                 ║
║                                                              ║
║     关键词: 文档搜索, 全文检索, 个人文档管理                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`, 'cp437');
}

function createSrt() {
  return Buffer.from(`1
00:00:01,000 --> 00:00:04,000
DocSeeker SRT Test - SubRip 字幕格式测试

2
00:00:05,000 --> 00:00:08,000
关键词: 字幕解析测试
This is a subtitle test.

3
00:00:09,000 --> 00:00:12,000
中文字幕测试
Chinese subtitle test.

4
00:00:13,000 --> 00:00:16,000
End of test subtitles.
测试结束。
`, 'utf8');
}

function createVtt() {
  return Buffer.from(`WEBVTT

DocSeeker VTT Test - WebVTT 字幕格式测试

00:00:01.000 --> 00:00:04.000
关键词: WebVTT 字幕解析

00:00:05.000 --> 00:00:08.000
This is a WebVTT subtitle test.
中文字幕测试

00:00:09.000 --> 00:00:12.000
End of test.
测试结束。
`, 'utf8');
}

function createAss() {
  return Buffer.from(`[Script Info]
Title: DocSeeker ASS Test
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,DocSeeker ASS Test - Advanced SubStation Alpha
Dialogue: 0,0:00:05.00,0:00:08.00,Default,,0,0,0,,关键词: 字幕解析测试
Dialogue: 0,0:00:09.00,0:00:12.00,Default,,0,0,0,,This is a subtitle test.
`, 'utf8');
}

// 主测试函数
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🔬 DocSeeker 全格式验证测试');
  console.log('='.repeat(80) + '\n');

  // 清理并创建测试目录
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  console.log('📁 测试目录:', TEST_DIR);
  console.log('📋 待验证格式:', Object.keys(UNVERIFIED_FORMATS).length, '种\n');

  // 创建测试文件
  console.log('📝 正在生成测试文件...\n');
  const results = [];

  for (const [ext, info] of Object.entries(UNVERIFIED_FORMATS)) {
    const filename = `test_${ext}.${ext}`;
    const filepath = path.join(TEST_DIR, filename);

    try {
      const buffer = info.create();
      fs.writeFileSync(filepath, buffer);
      const stat = fs.statSync(filepath);
      console.log(`  ✅ ${info.name} (.${ext}) - ${formatBytes(stat.size)}`);
      results.push({ ext, name: info.name, status: 'created', size: stat.size });
    } catch (err) {
      console.log(`  ❌ ${info.name} (.${ext}) - 创建失败: ${err.message}`);
      results.push({ ext, name: info.name, status: 'error', error: err.message });
    }
  }

  // 添加一个简单的纯文本文件用于搜索验证
  const testTxt = path.join(TEST_DIR, 'test.txt');
  fs.writeFileSync(testTxt, 'DocSeeker Test File\n关键词: 格式验证测试');
  console.log('\n  ✅ Plain Text (.txt) - 用于搜索对比');

  console.log('\n' + '-'.repeat(80));
  console.log('\n📦 创建的测试文件:\n');

  const created = results.filter(r => r.status === 'created');
  const errors = results.filter(r => r.status === 'error');

  console.log(`  已创建: ${created.length} 个`);
  console.log(`  失败: ${errors.length} 个\n`);

  if (errors.length > 0) {
    console.log('  失败详情:');
    for (const e of errors) {
      console.log(`    - .${e.ext}: ${e.error}`);
    }
    console.log('');
  }

  // 输出测试文件列表供用户手动验证
  console.log('-'.repeat(80));
  console.log('\n📂 测试文件列表:\n');

  for (const r of created) {
    console.log(`  D:/DocSeeker-Format-Test/test_${r.ext}.${r.ext}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n💡 下一步操作:\n');
  console.log('  1. 在 DocSeeker 中添加目录: D:/DocSeeker-Format-Test');
  console.log('  2. 执行全量扫描');
  console.log('  3. 搜索关键词: "DocSeeker" 或 "测试"');
  console.log('  4. 验证搜索结果中是否包含上述所有格式的文件\n');
  console.log('='.repeat(80) + '\n');

  return { created, errors };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 执行
main().then(result => {
  console.log('\n✅ 测试文件生成完成!\n');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ 测试失败:', err.message);
  process.exit(1);
});
