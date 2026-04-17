# 构建文档

## 环境准备

### 必需工具

- Node.js 18+
- npm
- electron-builder v25+
- Python 3（用于某些构建辅助脚本）

### winCodeSign 工具（签名与资源编辑）

`winCodeSign` 是 electron-builder 用于编辑 exe 图标和版本信息的工具。

**离线构建方式**（推荐）：

1. 首次构建时，`electron-builder` 会自动从 GitHub 下载 `winCodeSign-2.6.0.7z`
2. 下载后，工具缓存位置：
   ```
   C:\Users\<用户名>\AppData\Local\electron-builder\Cache\winCodeSign\
   ```
3. **以后每次构建前**，将以下文件复制到项目 `tools/winCodeSign/` 目录：
   - `rcedit-x64.exe`
   - `rcedit-ia32.exe`
   - `winCodeSign-2.6.0.7z`
   - `windows-10/` 目录（Windows 签名工具）
   - `windows-6/` 目录
4. 同时将 `winCodeSign-2.6.0.7z` 复制到缓存目录：
   ```
   C:\Users\<用户名>\AppData\Local\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0.7z
   ```

> 注意：`winCodeSign-2.6.0.7z` 包含 macOS 签名工具（symlink），在 Windows 上解压时会报 symlink 错误，这是正常的，不影响使用。确保 `rcedit-x64.exe` 存在即可。

## 构建命令

```bash
# 完整构建（先编译后打包）
npm run build:win

# 仅重新打包（不重新编译）
npx electron-builder --win nsis portable --config
```

## 构建产物

构建完成后，产物在 `dist/` 目录：

| 文件 | 说明 |
|------|------|
| `DocSeeker Setup 1.0.0.exe` | NSIS 安装包 |
| `DocSeeker-1.0.0-portable.exe` | 便携版（直接运行） |
| `win-unpacked/` | 解压后的应用目录 |

## 构建配置说明

`package.json` 中的 electron-builder 配置：

```json
"win": {
  "target": ["nsis", "portable"],
  "icon": "build/icon.ico",
  "signAndEditExecutable": false
}
```

- `icon`: exe 图标（必须 256x256 以上，ico 格式）
- `signAndEditExecutable: false`: 跳过 electron-builder 内置的 rcedit 调用
  - 原因：Windows 上无法创建 macOS symlink，导致 electron-builder 下载的 winCodeSign 解压失败
  - 解决方式：手动调用 `tools/winCodeSign/rcedit-x64.exe` 设置图标（见下文）

## 手动设置 exe 图标（如需要）

```bash
# 设置图标（需要先执行 npm run build 编译出 win-unpacked）
./tools/winCodeSign/rcedit-x64.exe \
  --set-icon build/icon.ico \
  dist/win-unpacked/DocSeeker.exe
```

## 图标生成（如需要更换图标）

```bash
# 安装依赖
npm install

# 从 512x512 PNG 生成 ico
node -e "
const { imagesToIco } = require('png-to-ico');
const fs = require('fs');
imagesToIco(['build/icon_256.png'])
  .then(buf => fs.writeFileSync('build/icon.ico', buf))
  .catch(console.error);
"
```

## 签名（可选）

如需代码签名，在 `package.json` 的 `win` 配置中添加：

```json
"win": {
  "certificateFile": "path/to/certificate.pfx",
  "certificatePassword": "your-password"
}
```

或通过环境变量：
```bash
set CSC_LINK=path/to/certificate.pfx
set CSC_KEY_PASSWORD=your-password
npm run build:win
```

## 常见问题

**Q: electron-builder 下载 winCodeSign 超时？**
A: 网络问题。将 `winCodeSign-2.6.0.7z` 手动放入缓存目录（见上文）。

**Q: rcedit 解压报错 "Cannot create symbolic link"？**
A: 正常。这是 macOS 工具链的 symlink，Windows 忽略即可，确保 `rcedit-x64.exe` 存在即可。

**Q: 图标未更新？**
A: 手动调用 `rcedit-x64.exe` 设置图标（见上文手动设置步骤）。
