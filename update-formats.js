const fs = require('fs');

const file = 'src/context/LanguageContext.tsx';
let content = fs.readFileSync(file, 'utf8');

// 更新中文 overviewDesc
content = content.replace(
  "'guide.overviewDesc': 'DocSeeker 是一款高效的本地文档全文搜索工具，基于 Electron + SQLite FTS5 + BM25 构建，支持 AND/OR/NOT/正则/前缀等多种搜索语法，按相关性排序。所有数据存储在本地，隐私安全。支持以下文档格式的全文索引与搜索：Word · Excel · PowerPoint · PDF · XPS · Text/MD/JSON/CSV · HTML · SVG · RTF · CHM · ODF · EPUB · ZIP · RAR · Email · WPS；并支持图片/音视频元数据全文索引（标题、歌手、GPS 等）。'",
  "'guide.overviewDesc': 'DocSeeker 是一款高效的本地文档全文搜索工具，基于 Electron + SQLite FTS5 + BM25 构建，支持 AND/OR/NOT/前缀等多种搜索语法，按相关性排序。所有数据存储在本地，隐私安全。支持以下文档格式的全文索引与搜索：Word · Excel · PowerPoint · PDF · RTF · CHM · ODF (ODT/ODS/ODP) · EPUB · ZIP/RAR/7Z/GZIP · 邮件 (MSG/PST) · WPS (WPS/ET/DPS) · Apple iWork (Pages/Numbers/Keynote)；支持 70+ 种源代码和配置文件格式；支持图片 OCR 文字识别 (JPG/PNG/GIF/BMP/TIFF/WebP/ICO)。'"
);

// 更新英文 overviewDesc
content = content.replace(
  "'guide.overviewDesc': 'DocSeeker is an efficient local full-text search tool built on Electron + SQLite FTS5 + BM25, supporting AND/OR/NOT/regex/prefix search with relevance ranking. All data stored locally for privacy. Indexes and searches: Word · Excel · PowerPoint · PDF · XPS · Text/MD/JSON/CSV · HTML · SVG · RTF · CHM · ODF · EPUB · ZIP · RAR · Email · WPS; also indexes image/audio/video metadata (title, artist, GPS, etc.)'",
  "'guide.overviewDesc': 'DocSeeker is an efficient local full-text search tool built on Electron + SQLite FTS5 + BM25, supporting AND/OR/NOT/regex/prefix search with relevance ranking. All data stored locally for privacy. Supports 70+ document formats: Word · Excel · PowerPoint · PDF · RTF · CHM · ODF (ODT/ODS/ODP) · EPUB · ZIP/RAR/7Z/GZIP · Email (MSG/PST) · WPS (WPS/ET/DPS) · Apple iWork (Pages/Numbers/Keynote); 70+ source code and config file formats; image OCR (JPG/PNG/GIF/BMP/TIFF/WebP/ICO).'"
);

fs.writeFileSync(file, content);
console.log('Updated LanguageContext.tsx');
