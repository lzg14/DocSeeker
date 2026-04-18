# fix-native.ps1
# 修复 better-sqlite3 native 模块（用于 Electron）
# 问题：npm rebuild/reinstall 时会用系统 Node 编译，导致 ABI 不匹配 Electron
# 解决：从 GitHub 下载匹配 Electron ABI 的预编译版本

param(
    [string]$ElectronVersion = "130"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$bsDir = Join-Path $projectRoot "node_modules\better-sqlite3"
$destDir = Join-Path $bsDir "build\Release"
$bsqVersion = "12.9.0"
$url = "https://github.com/WiseLibs/better-sqlite3/releases/download/v${bsqVersion}/better-sqlite3-v${bsqVersion}-electron-v${ElectronVersion}-win32-x64.tar.gz"
$tmpTar = "$env:TEMP\bsq-electron.tar.gz"

Write-Host "=== better-sqlite3 Native Module Fix ===" -ForegroundColor Cyan
Write-Host "Downloading: $url"
Write-Host "Destination: $destDir"

# 清理旧文件
if (Test-Path $destDir) {
    Remove-Item "$destDir\*" -Recurse -Force -ErrorAction SilentlyContinue
}

# 下载
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
    Invoke-WebRequest -Uri $url -OutFile $tmpTar -UseBasicParsing
} catch {
    Write-Host "ERROR: Failed to download. Check Electron version." -ForegroundColor Red
    Write-Host "Electron version to ABI mapping:" -ForegroundColor Yellow
    Write-Host "  Electron 28 -> v122 (ABI 122)"
    Write-Host "  Electron 29 -> v124 (ABI 124)"
    Write-Host "  Electron 30 -> v125 (ABI 125)"
    Write-Host "  Electron 31 -> v127 (ABI 127)"
    Write-Host "  Electron 32 -> v128 (ABI 128)"
    Write-Host "  Electron 33 -> v130 (ABI 130)"
    Write-Host "  Electron 34 -> v132 (ABI 132)"
    Write-Host "  Electron 35 -> v133 (ABI 133)"
    exit 1
}

# 解压
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Host "tar not found, using .NET extraction..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $tar = [System.IO.Compression.ZipFile]::OpenRead($tmpTar)
    $entry = $tar.Entries | Where-Object { $_.FullName -like "*better_sqlite3.node" }
    if ($entry) {
        [System.IO.File]::WriteAllBytes("$destDir\better_sqlite3.node", $entry.Open().ReadAllBytes())
    }
    $tar.Dispose()
} else {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    tar -xzf $tmpTar -C $bsDir\build\
    $src = Join-Path $bsDir "build\build\Release\better_sqlite3.node"
    if (Test-Path $src) {
        Copy-Item $src -Destination $destDir\ -Force
        Remove-Item (Join-Path $bsDir "build\build") -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 验证
$nodeFile = Join-Path $destDir "better_sqlite3.node"
if (Test-Path $nodeFile) {
    $size = (Get-Item $nodeFile).Length
    Write-Host "SUCCESS: better_sqlite3.node installed ($([math]::Round($size/1MB, 1)) MB)" -ForegroundColor Green
    Write-Host "File: $nodeFile"
} else {
    Write-Host "ERROR: better_sqlite3.node not found after extraction!" -ForegroundColor Red
    exit 1
}

# 清理
Remove-Item $tmpTar -ErrorAction SilentlyContinue
Write-Host "Done. Restart the app."
