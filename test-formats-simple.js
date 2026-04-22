/**
 * DocSeeker 格式验证测试脚本 v2
 * 直接扫描文件系统验证支持的格式
 */

const fs = require('fs');
const path = require('path');

// 支持的所有格式映射
const SUPPORTED_FORMATS = {
  // Office 文档
  '.doc': { name: 'Microsoft Word 97-2003', priority: 1, category: 'Office' },
  '.docx': { name: 'Microsoft Word 2007+', priority: 1, category: 'Office' },
  '.xls': { name: 'Microsoft Excel 97-2003', priority: 1, category: 'Office' },
  '.xlsx': { name: 'Microsoft Excel 2007+', priority: 1, category: 'Office' },
  '.ppt': { name: 'Microsoft PowerPoint 97-2003', priority: 1, category: 'Office' },
  '.pptx': { name: 'Microsoft PowerPoint 2007+', priority: 1, category: 'Office' },
  '.msg': { name: 'Outlook Message', priority: 1, category: 'Office' },
  '.pst': { name: 'Outlook PST', priority: 1, category: 'Office' },

  // PDF
  '.pdf': { name: 'PDF', priority: 1, category: 'PDF' },

  // 其他文档
  '.rtf': { name: 'Rich Text Format', priority: 2, category: 'Document' },
  '.chm': { name: 'Compiled HTML Help', priority: 2, category: 'Document' },
  '.epub': { name: 'EPUB eBook', priority: 2, category: 'Document' },

  // ODF 文档
  '.odt': { name: 'OpenDocument Text', priority: 2, category: 'ODF' },
  '.ods': { name: 'OpenDocument Spreadsheet', priority: 2, category: 'ODF' },
  '.odp': { name: 'OpenDocument Presentation', priority: 2, category: 'ODF' },

  // WPS 文档
  '.wps': { name: 'WPS Document', priority: 2, category: 'WPS' },
  '.et': { name: 'WPS Spreadsheet', priority: 2, category: 'WPS' },
  '.dps': { name: 'WPS Presentation', priority: 2, category: 'WPS' },

  // 压缩文件
  '.zip': { name: 'ZIP Archive', priority: 2, category: 'Archive' },
  '.rar': { name: 'RAR Archive', priority: 2, category: 'Archive' },
  '.7z': { name: '7-Zip Archive', priority: 2, category: 'Archive' },
  '.tar': { name: 'TAR Archive', priority: 2, category: 'Archive' },
  '.gz': { name: 'GZIP Archive', priority: 2, category: 'Archive' },

  // 源代码
  '.js': { name: 'JavaScript', priority: 3, category: 'Code' },
  '.ts': { name: 'TypeScript', priority: 3, category: 'Code' },
  '.py': { name: 'Python', priority: 3, category: 'Code' },
  '.java': { name: 'Java', priority: 3, category: 'Code' },
  '.c': { name: 'C Source', priority: 3, category: 'Code' },
  '.cpp': { name: 'C++ Source', priority: 3, category: 'Code' },
  '.h': { name: 'C/C++ Header', priority: 3, category: 'Code' },
  '.cs': { name: 'C# Source', priority: 3, category: 'Code' },
  '.go': { name: 'Go Source', priority: 3, category: 'Code' },
  '.rs': { name: 'Rust Source', priority: 3, category: 'Code' },
  '.rb': { name: 'Ruby', priority: 3, category: 'Code' },
  '.php': { name: 'PHP', priority: 3, category: 'Code' },
  '.swift': { name: 'Swift', priority: 3, category: 'Code' },
  '.kt': { name: 'Kotlin', priority: 3, category: 'Code' },
  '.scala': { name: 'Scala', priority: 3, category: 'Code' },
  '.lua': { name: 'Lua', priority: 3, category: 'Code' },
  '.pl': { name: 'Perl', priority: 3, category: 'Code' },
  '.sh': { name: 'Shell Script', priority: 3, category: 'Code' },
  '.ps1': { name: 'PowerShell', priority: 3, category: 'Code' },
  '.bat': { name: 'Batch File', priority: 3, category: 'Code' },
  '.sql': { name: 'SQL', priority: 3, category: 'Code' },
  '.xml': { name: 'XML', priority: 3, category: 'Code' },
  '.json': { name: 'JSON', priority: 3, category: 'Code' },
  '.yaml': { name: 'YAML', priority: 3, category: 'Code' },
  '.yml': { name: 'YAML', priority: 3, category: 'Code' },
  '.toml': { name: 'TOML', priority: 3, category: 'Code' },
  '.ini': { name: 'INI Config', priority: 3, category: 'Code' },
  '.conf': { name: 'Config File', priority: 3, category: 'Code' },
  '.properties': { name: 'Properties', priority: 3, category: 'Code' },

  // Web
  '.html': { name: 'HTML', priority: 3, category: 'Web' },
  '.htm': { name: 'HTML', priority: 3, category: 'Web' },
  '.css': { name: 'CSS', priority: 3, category: 'Web' },
  '.scss': { name: 'SCSS', priority: 3, category: 'Web' },
  '.less': { name: 'LESS', priority: 3, category: 'Web' },

  // Apple/iWork
  '.pages': { name: 'Apple Pages', priority: 4, category: 'Apple' },
  '.numbers': { name: 'Apple Numbers', priority: 4, category: 'Apple' },
  '.key': { name: 'Apple Keynote', priority: 4, category: 'Apple' },

  // 图片 (OCR)
  '.jpg': { name: 'JPEG Image', priority: 4, category: 'Image' },
  '.jpeg': { name: 'JPEG Image', priority: 4, category: 'Image' },
  '.png': { name: 'PNG Image', priority: 4, category: 'Image' },
  '.gif': { name: 'GIF Image', priority: 4, category: 'Image' },
  '.bmp': { name: 'BMP Image', priority: 4, category: 'Image' },
  '.tiff': { name: 'TIFF Image', priority: 4, category: 'Image' },
  '.tif': { name: 'TIFF Image', priority: 4, category: 'Image' },
  '.webp': { name: 'WebP Image', priority: 4, category: 'Image' },
  '.ico': { name: 'Icon', priority: 4, category: 'Image' },

  // 简单文本
  '.txt': { name: 'Plain Text', priority: 5, category: 'Text' },
  '.md': { name: 'Markdown', priority: 5, category: 'Text' },
  '.csv': { name: 'CSV', priority: 5, category: 'Text' },
  '.log': { name: 'Log File', priority: 5, category: 'Text' },
  '.nfo': { name: 'NFO', priority: 5, category: 'Text' },
  '.srt': { name: 'Subtitles', priority: 5, category: 'Text' },
  '.vtt': { name: 'WebVTT Subtitles', priority: 5, category: 'Text' },
  '.ass': { name: 'ASS Subtitles', priority: 5, category: 'Text' },
};

// 扫描目录统计文件类型
function scanDirectory(dir, stats, depth = 0, maxDepth = 10) {
  if (depth > maxDepth) return;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      try {
        if (entry.isDirectory()) {
          // 跳过系统目录
          if (!['node_modules', '.git', '.svn', '$RECYCLE.BIN', 'System Volume Information'].includes(entry.name)) {
            scanDirectory(fullPath, stats, depth + 1, maxDepth);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) {
            if (!stats[ext]) {
              stats[ext] = { count: 0, size: 0 };
            }
            try {
              const fileStat = fs.statSync(fullPath);
              stats[ext].count++;
              stats[ext].size += fileStat.size;
            } catch (e) {
              // 文件访问失败，跳过
            }
          }
        }
      } catch (e) {
        // 访问目录/文件失败，跳过
      }
    }
  } catch (e) {
    // 读取目录失败，跳过
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatNumber(num) {
  return num.toLocaleString();
}

// 主函数
function main() {
  const scanPath = 'D:/User/Documents';
  const altPath = 'C:/Users/lzg14/Documents';

  // 检查路径
  let targetPath = scanPath;
  if (!fs.existsSync(scanPath)) {
    if (fs.existsSync(altPath)) {
      targetPath = altPath;
    } else {
      console.log('❌ 找不到 Documents 目录');
      console.log(`   尝试过: ${scanPath}, ${altPath}`);
      process.exit(1);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 DocSeeker 格式验证报告');
  console.log('='.repeat(80));
  console.log(`\n🔍 扫描目录: ${targetPath}\n`);

  // 扫描文件系统
  console.log('⏳ 正在扫描文件系统...');
  const stats = {};
  scanDirectory(targetPath, stats);
  console.log('✅ 扫描完成!\n');

  // 分类统计
  const categories = {
    'Office': { supported: [], unsupported: [] },
    'PDF': { supported: [], unsupported: [] },
    'Document': { supported: [], unsupported: [] },
    'ODF': { supported: [], unsupported: [] },
    'WPS': { supported: [], unsupported: [] },
    'Archive': { supported: [], unsupported: [] },
    'Code': { supported: [], unsupported: [] },
    'Web': { supported: [], unsupported: [] },
    'Apple': { supported: [], unsupported: [] },
    'Image': { supported: [], unsupported: [] },
    'Text': { supported: [], unsupported: [] },
    'Other': { supported: [], unsupported: [] }
  };

  let totalFiles = 0;
  let totalSize = 0;
  let supportedFiles = 0;
  let supportedSize = 0;
  let supportedCount = 0;
  let unsupportedFiles = 0;
  let unsupportedSize = 0;

  // 分配到类别
  for (const [ext, data] of Object.entries(stats)) {
    const fmt = SUPPORTED_FORMATS[ext];
    if (fmt) {
      categories[fmt.category].supported.push({
        ext,
        ...fmt,
        count: data.count,
        size: data.size
      });
      supportedFiles += data.count;
      supportedSize += data.size;
      supportedCount++;
    } else {
      categories.Other.unsupported.push({
        ext,
        count: data.count,
        size: data.size
      });
      unsupportedFiles += data.count;
      unsupportedSize += data.size;
    }
    totalFiles += data.count;
    totalSize += data.size;
  }

  // 输出总览
  console.log('📊 总览:\n');
  console.log(`   总文件数: ${formatNumber(totalFiles)}`);
  console.log(`   总大小: ${formatBytes(totalSize)}`);
  console.log(`   唯一格式数: ${Object.keys(stats).length}`);
  console.log('');
  console.log(`   ✅ 已支持: ${formatNumber(supportedFiles)} 个文件 (${formatBytes(supportedSize)}) - ${supportedCount} 种格式`);
  console.log(`   ⚠️  未支持: ${formatNumber(unsupportedFiles)} 个文件 (${formatBytes(unsupportedSize)}) - ${Object.keys(stats).length - supportedCount} 种格式`);
  console.log(`   📈 覆盖率: ${totalFiles > 0 ? ((supportedFiles / totalFiles) * 100).toFixed(2) : 0}%`);

  // 按类别输出详细结果
  console.log('\n' + '='.repeat(80));
  console.log('📁 格式详情 (按类别)\n');

  const categoryNames = {
    'Office': '🏢 Office 文档',
    'PDF': '📄 PDF 文档',
    'Document': '📃 其他文档',
    'ODF': '📊 ODF 文档',
    'WPS': '📝 WPS 文档',
    'Archive': '📦 压缩文件',
    'Code': '💻 源代码',
    'Web': '🌐 Web 文件',
    'Apple': '🍎 Apple 文档',
    'Image': '🖼️  图片 (OCR)',
    'Text': '📝 简单文本',
    'Other': '❓ 未分类'
  };

  const priorityNames = {
    1: 'P1-核心',
    2: 'P2-重要',
    3: 'P3-代码',
    4: 'P4-扩展',
    5: 'P5-文本'
  };

  for (const [cat, catData] of Object.entries(categories)) {
    const hasSupported = catData.supported.length > 0;
    const hasUnsupported = catData.unsupported.length > 0;

    if (!hasSupported && !hasUnsupported) continue;

    console.log(`\n${categoryNames[cat] || cat}:\n`);

    if (hasSupported) {
      console.log('   ✅ 已支持:');
      console.log('   优先级  格式        名称                          文件数          大小');
      console.log('   ───────────────────────────────────────────────────────────────────────');

      // 按优先级排序
      catData.supported.sort((a, b) => a.priority - b.priority);

      for (const item of catData.supported) {
        const pri = priorityNames[item.priority] || 'P?';
        const name = item.name.padEnd(27);
        const ext = item.ext.padEnd(10);
        const count = formatNumber(item.count).padStart(10);
        const size = formatBytes(item.size).padStart(13);
        console.log(`   [${pri}]  ${ext} ${name} ${count} ${size}`);
      }
    }

    if (hasUnsupported) {
      console.log('\n   ⚠️  未支持:');
      console.log('   格式        文件数          大小');
      console.log('   ──────────────────────────────────────');

      // 按文件数排序
      catData.unsupported.sort((a, b) => b.count - a.count);

      for (const item of catData.unsupported.slice(0, 10)) {
        const ext = item.ext.padEnd(10);
        const count = formatNumber(item.count).padStart(10);
        const size = formatBytes(item.size).padStart(15);
        console.log(`   ${ext} ${count} ${size}`);
      }

      if (catData.unsupported.length > 10) {
        console.log(`   ... 还有 ${catData.unsupported.length - 10} 种格式`);
      }
    }
  }

  // 优先级汇总
  console.log('\n' + '='.repeat(80));
  console.log('📋 优先级分布:\n');

  const priorityStats = {
    'P1-核心': { supported: 0, unsupported: 0 },
    'P2-重要': { supported: 0, unsupported: 0 },
    'P3-代码': { supported: 0, unsupported: 0 },
    'P4-扩展': { supported: 0, unsupported: 0 },
    'P5-文本': { supported: 0, unsupported: 0 }
  };

  for (const [ext, data] of Object.entries(stats)) {
    const fmt = SUPPORTED_FORMATS[ext];
    const pri = fmt ? `P${fmt.priority}-${['核心', '重要', '代码', '扩展', '文本'][fmt.priority - 1]}` : '未分类';
    if (priorityStats[pri]) {
      priorityStats[pri].supported += data.count;
    } else {
      if (!priorityStats['未分类']) priorityStats['未分类'] = { supported: 0, unsupported: 0 };
      priorityStats['未分类'].supported += data.count;
    }
  }

  console.log('   优先级    已扫描文件数      状态');
  console.log('   ─────────────────────────────────');

  for (const [pri, data] of Object.entries(priorityStats)) {
    if (data.supported > 0 || data.unsupported > 0) {
      const status = data.unsupported === 0 ? '✅' : '⚠️';
      console.log(`   ${pri.padEnd(10)} ${formatNumber(data.supported).padStart(15)} ${status}`);
    }
  }

  // 最终结论
  console.log('\n' + '='.repeat(80));
  console.log('🎯 验证结论:\n');

  const coverage = totalFiles > 0 ? ((supportedFiles / totalFiles) * 100).toFixed(2) : 0;

  if (coverage >= 95) {
    console.log(`   🎉 优秀! 文件格式覆盖率: ${coverage}%`);
    console.log('   所有主要格式都已支持!');
  } else if (coverage >= 80) {
    console.log(`   ✅ 良好! 文件格式覆盖率: ${coverage}%`);
    console.log('   大部分文件格式都已支持。');
  } else if (coverage >= 50) {
    console.log(`   ⚠️  一般! 文件格式覆盖率: ${coverage}%`);
    console.log('   建议增加更多格式支持。');
  } else {
    console.log(`   ❌ 较低! 文件格式覆盖率: ${coverage}%`);
    console.log('   需要大幅增加格式支持。');
  }

  // 显示已支持格式总数
  const totalSupportedFormats = Object.keys(SUPPORTED_FORMATS).length;
  const foundSupportedFormats = supportedCount;
  console.log(`\n   📦 DocSeeker 已实现: ${totalSupportedFormats} 种文件格式`);
  console.log(`   📁 用户实际使用: ${foundSupportedFormats} 种文件格式\n`);

  console.log('='.repeat(80) + '\n');
}

// 运行
main();
