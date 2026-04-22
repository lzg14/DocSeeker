/**
 * 补充创建 ZIP 格式的测试文件
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const TEST_DIR = 'D:/DocSeeker-Format-Test';

async function createZipSync(filename, xmlContent) {
  const zip = new JSZip();
  zip.file(filename, xmlContent);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer;
}

async function main() {
  const files = [
    {
      name: 'test_odt.odt',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">
<office:body><office:text>
  <text:p>DocSeeker ODT Test - OpenDocument Text</text:p>
  <text:p>关键词: 测试文档解析</text:p>
</office:text></office:body></office:document>`
    },
    {
      name: 'test_ods.ods',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">
<office:body><office:spreadsheet>
  <table:table><table:table-row>
    <table:table-cell><text:p>DocSeeker</text:p></table:table-cell>
    <table:table-cell><text:p>ODS Test</text:p></table:table-cell>
  </table:table-row></table:table>
</office:spreadsheet></office:body></office:document>`
    },
    {
      name: 'test_odp.odp',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">
<office:body><office:presentation>
  <text:p>DocSeeker ODP Test - OpenDocument Presentation</text:p>
</office:presentation></office:body></office:document>`
    },
    {
      name: 'test_et.et',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Workbook><Sheet><Name>DocSeeker ET Test</Name></Sheet></Workbook>`
    },
    {
      name: 'test_dps.dps',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Presentation><Slide>DocSeeker DPS Test - WPS Presentation</Slide></Presentation>`
    },
    {
      name: 'test_pages.pages',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<document><flow name="document-body">
  <text><t>DocSeeker Apple Pages Test</t></text>
  <text><t>Apple iWork 文档测试</t></text>
</flow></document>`
    },
    {
      name: 'test_numbers.numbers',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<numbers:document xmlns:numbers="http://schemas.apple.com/numbers/2009/active">
<sheets><sheet><name>DocSeeker Numbers Test</name></sheet></sheets>
</numbers:document>`
    },
    {
      name: 'test_key.key',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<keynote:document xmlns:keynote="http://schemas.apple.com/keynote/2009/keynote">
<slides><slide><t>DocSeeker Apple Keynote Test</t></slide></slides>
</keynote:document>`
    }
  ];

  console.log('📦 创建 ZIP 格式测试文件...\n');

  for (const file of files) {
    const ext = path.extname(file.name).slice(1);
    try {
      const buffer = await createZipSync('content.xml', file.content);
      fs.writeFileSync(path.join(TEST_DIR, file.name), buffer);
      console.log(`  ✅ ${file.name} (${buffer.length} bytes)`);
    } catch (err) {
      console.log(`  ❌ ${file.name}: ${err.message}`);
    }
  }

  // 创建 NFO 文件 (使用 latin1 编码)
  const nfoContent = Buffer.from(`═══════════════════════════════════════════════════════════════
DocSeeker NFO Test - NFO 文档格式测试
Personal Document Search Tool
Version: 1.0.0
Release Date: 2024-04-22
关键词: 文档搜索, 全文检索, 个人文档管理
═══════════════════════════════════════════════════════════════`, 'latin1');
  fs.writeFileSync(path.join(TEST_DIR, 'test_nfo.nfo'), nfoContent);
  console.log('  ✅ test_nfo.nfo (' + nfoContent.length + ' bytes)');

  console.log('\n✅ 补充文件创建完成!\n');
}

main();
