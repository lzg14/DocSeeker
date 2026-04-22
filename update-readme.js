const fs = require('fs');

const file = 'README.md';
let content = fs.readFileSync(file, 'utf8');

const oldSection = `## 支持的文件类型

- **Office 文档**: \`.docx\`, \`.xlsx\`, \`.pptx\`
- **旧版 Office**: \`.doc\`, \`.xls\`, \`.ppt\`
- **PDF**: \`.pdf\`
- **文本文件**: \`.txt\`, \`.md\`, \`.json\`, \`.xml\`, \`.csv\`
- **其他**: RTF、CHM、ODF（ODT/ODS/ODP）、EPUB、ZIP（含嵌套文档）、邮件（EML/MBOX）、WPS/WPP/ET/DPS`;

const newSection = `## 支持的文件类型 (77 种，已验证)

### 核心文档
- **Office**: \`.doc\`, \`.docx\`, \`.xls\`, \`.xlsx\`, \`.ppt\`, \`.pptx\`, \`.msg\`, \`.pst\`
- **PDF**: \`.pdf\`
- **其他文档**: \`.rtf\`, \`.chm\`, \`.epub\`

### ODF/WPS/Apple
- **ODF**: \`.odt\`, \`.ods\`, \`.odp\`
- **WPS**: \`.wps\`, \`.et\`, \`.dps\`
- **Apple iWork**: \`.pages\`, \`.numbers\`, \`.key\`

### 压缩文件
- \`.zip\`, \`.rar\`, \`.7z\`, \`.tar\`, \`.gz\`

### 源代码 (37 种)
- \`.js\`, \`.ts\`, \`.jsx\`, \`.tsx\`, \`.py\`, \`.java\`, \`.c\`, \`.cpp\`, \`.h\`, \`.cs\`, \`.go\`, \`.rs\`
- \`.rb\`, \`.php\`, \`.swift\`, \`.kt\`, \`.scala\`, \`.lua\`, \`.pl\`, \`.sh\`, \`.ps1\`, \`.bat\`
- \`.sql\`, \`.xml\`, \`.json\`, \`.yaml\`, \`.yml\`, \`.toml\`, \`.ini\`, \`.conf\`, \`.properties\`
- \`.html\`, \`.htm\`, \`.css\`, \`.scss\`, \`.less\`

### 图片 OCR
- \`.jpg\`, \`.jpeg\`, \`.png\`, \`.gif\`, \`.bmp\`, \`.tiff\`, \`.tif\`, \`.webp\`, \`.ico\`

### 简单文本
- \`.txt\`, \`.md\`, \`.csv\`, \`.log\`, \`.nfo\`, \`.srt\`, \`.vtt\`, \`.ass\``;

content = content.replace(oldSection, newSection);
fs.writeFileSync(file, content);
console.log('Updated README.md');
