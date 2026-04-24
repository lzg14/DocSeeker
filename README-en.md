# DocSeeker - Personal Document Search Tool

A desktop full-text search tool built with Electron + React + TypeScript, designed for finding personal documents accumulated over time. Supports document scanning and full-text search.

**Positioning**: Helps users manage and search through accumulated documents (Word, Excel, PPT, PDF, TXT, etc.) with manual incremental or full rescanning to update the index, enabling quick file retrieval anytime.

## Features

### 1. Guide Page
- First-time user guide to quickly understand core features
- Support for donations (WeChat/Alipay)
- Application information display

### 2. Scan Page
- Add/remove scan directories
- Initial full scan to build full-text index
- Manual incremental scan or complete rescan
- Real-time scan progress display
- View scan statistics (file count, total size, last scan time)

### 3. Search Page
- Full-text search by filename or document content (FTS5 + BM25 relevance ranking)
- Search history (last 20 entries)
- Saved searches (named favorites)
- Advanced filters (file type, size range, date range)
- Search syntax help
- Display search keyword context snippets (highlighted matches)
- Search results sorted by relevance
- Click to view file details
- Quick open file or show in folder

### 4. Language & Theme Settings
- Support for Simplified Chinese and English, instant switch
- 7 themes: Light, Dark, Blue, Nordic, Warm, Sunrise, Follow System
- Follow system mode to automatically match Windows/macOS light/dark theme

### 5. Floating Search Window
- Press `Ctrl+Shift+F` global hotkey to summon anytime
- Search without switching windows
- Search results can directly open files or locate in folder

### 6. System Tray
- Minimize to system tray when closing main window (configurable)
- Tray menu: Show window, Global search, Exit
- Double-click tray icon to show main window

### 7. Auto-start & Silent Launch
- Configurable auto-start on boot
- Supports `--startup` silent launch parameter, hides main window on startup, runs in tray only

### 8. Auto Update
- Auto-check for new versions on the 5th and 15th of each month
- Notification popup when new version is available
- One-click download and install upgrade

## Supported File Formats (77 types, verified)

### Core Documents
- **Office**: `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.msg`, `.pst`
- **PDF**: `.pdf`
- **Other**: `.rtf`, `.chm`, `.epub`

### ODF/WPS/Apple
- **ODF**: `.odt`, `.ods`, `.odp`
- **WPS**: `.wps`, `.et`, `.dps`
- **Apple iWork**: `.pages`, `.numbers`, `.key`

### Archives
- `.zip`, `.rar`, `.7z`, `.tar`, `.gz`

### Source Code (37 types)
- `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.java`, `.c`, `.cpp`, `.h`, `.cs`, `.go`, `.rs`
- `.rb`, `.php`, `.swift`, `.kt`, `.scala`, `.lua`, `.pl`, `.sh`, `.ps1`, `.bat`
- `.sql`, `.xml`, `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.conf`, `.properties`
- `.html`, `.htm`, `.css`, `.scss`, `.less`

### Image Metadata
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.tif`, `.webp`, `.ico`

### Simple Text
- `.txt`, `.md`, `.csv`, `.log`, `.nfo`, `.srt`, `.vtt`, `.ass`

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Desktop Framework**: Electron
- **Database**: SQLite (better-sqlite3) with FTS5 full-text search
- **Document Parsing**: mammoth (docx), xlsx (Excel), pdf-parse (PDF), jszip (PPTX)
- **Hash**: MD5
- **Auto Update**: electron-updater

## Development

### Requirements
- Node.js 18+
- npm 9+
- Python 3.x (for compiling better-sqlite3 native module)
- Visual Studio Build Tools 2022 (for compiling native modules on Windows)

### Install Dependencies
```bash
npm install
```

First install will automatically rebuild better-sqlite3 native module for Electron version.

### Start Development Server
```bash
npm run dev
```

### Build Application
```bash
npm run build
```

### Package Installers
```bash
npm run build:win        # Windows (.exe NSIS installer)
npm run build:win:portable  # Windows portable (.exe)
npm run build:mac        # macOS (.dmg)
npm run build:linux      # Linux (AppImage/deb)
```

Packaged files are located in `dist/` directory.

## Project Structure

```
docseeker/
├── src/                      # React frontend source
│   ├── components/           # React components
│   ├── context/              # React Context (global state)
│   ├── pages/                # Page components
│   │   ├── GuidePage.tsx    # Guide page
│   │   ├── ScanPage.tsx     # Scan page
│   │   ├── SearchPage.tsx   # Search page
│   │   ├── LanguagePage.tsx # Language settings
│   │   └── FloatingSearch.tsx # Floating search window
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # React entry
│   ├── styles.css           # Global styles
│   └── types.ts             # TypeScript types
├── electron/                  # Electron backend source
│   ├── main/                 # Main process
│   │   ├── index.ts         # Main process entry
│   │   ├── ipc.ts           # IPC handlers
│   │   ├── database.ts     # SQLite operations (FTS5 + BM25)
│   │   ├── scanner.ts      # File scanning logic
│   │   ├── scanWorker.ts    # Worker thread scanning
│   │   └── updater.ts       # Auto-update detection
│   └── preload/             # Preload script
│       └── index.ts         # API bridge
├── electron-builder.yml      # Packaging config (electron-builder)
├── package.json              # Dependencies + scripts
├── tsconfig.json             # TypeScript frontend config
├── tsconfig.node.json        # TypeScript Node.js/Electron config
└── electron.vite.config.ts # Vite build config
```

## Quick Start

### First Use
1. Launch the app (guide page will appear on first use)
2. Switch to "Scan" page, click "Add Directory" to add folders to scan
3. Click "Start Scan" for initial full scan
4. Wait for scan to complete (may take a few minutes depending on file count)
5. Switch to "Search" page, enter keywords to search files

### System Tray
- Clicking the window close button minimizes to system tray instead of quitting
- Click tray icon to show main window
- Tray menu provides "Show Window", "Global Search", "Exit" options
- Can disable "Minimize to Tray on Close" in Language & Theme settings

### Search Tips
- Enter filename keywords for direct search
- Enter document content keywords for full-text search
- Support multi-keyword search (space-separated, results sorted by relevance)
- Use advanced filters to narrow results (file type, size, date)
- Click search result to view file details
- Press Ctrl+Shift+F anytime to summon floating search window

---

## Competition Comparison

For detailed competitive analysis, see [Competition Analysis Report](./docs/superpowers/archive/COMPETITION.md).

**DocSeeker Core Advantages:**
- Free + MIT License
- 77 document formats (most among free competitors)
- Only tool with native Chinese/English bilingual support
- Only tool with fuzzy search (Fuse.js)
- NTFS USN Journal real-time monitoring
- 7 themes + dark mode

---

## License

MIT License
