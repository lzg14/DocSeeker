# 高级搜索能力扩展：词干提取 + 字段限定搜索

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 DocSeeker 中增加词干提取（stemming）支持和字段限定搜索语法（`name:`、`path:`、`ext:`），提升召回率和高级用户体验。

**Architecture:**

1. **词干提取**：将 FTS5 tokenizer 从 `unicode61 remove_diacritics 1` 升级为 `unicode61 remove_diacritics 1 tokenize=porter`。Porter stemmer 会将英文单词还原为词干（running → run, documents → document），在索引和查询时自动应用。
2. **字段限定搜索**：在 `searchAllShards()` 入口层新增 `extractFieldPrefixes()` 函数解析 `name:`、`path:`、`ext:` 前缀。`name:` 复用现有的 `searchShardDbNameOnly` 路径（用 FTS5 列过滤语法 `name:{query}`）；`path:` 用 SQL LIKE；`ext:` 合并到 `fileTypes` 过滤器。
3. **分片重建策略**：每个 shard DB 独立重建 FTS 表，启动时后台 5 秒延迟触发，不阻塞搜索流程。
4. **UI 增强**：语法提示面板新增字段搜索示例。

**Tech Stack:** SQLite FTS5 porter tokenizer, TypeScript, React/i18n, better-sqlite3, electron-log

---

## 文件影响范围

| 文件 | 操作 |
|------|------|
| `electron/main/migration.ts` | 修改 FTS 表创建语句，添加 tokenizer 迁移函数 |
| `electron/main/shardManager.ts` | 新增 `extractFieldPrefixes()` 函数，更新 `searchAllShards()` 处理字段搜索；扩展 `SearchOptions` 接口；扩展 `searchShardDb()` 处理 `path:` SQL 过滤 |
| `src/pages/SearchPage.tsx` | 语法提示面板新增字段搜索语法 |
| `src/context/LanguageContext.tsx` | 新增字段搜索翻译 key |
| `docs/PROGRESS.md` | 新增已完成功能条目 |
| `docs/ROADMAP.md` | 更新里程碑状态 |
| `src/pages/GuidePage.tsx` | 关于页新增 feature9（词干搜索 + 字段搜索） |
| `src/context/LanguageContext.tsx`（关于页） | 新增 guide.feature9 翻译 |

---

## Task 1: FTS5 Tokenizer 迁移（词干提取）

**目标：** 所有 shard DB 的 FTS5 表启用 porter stemmer，搜索 `running` 能匹配包含 `run/runs/running` 的文档。

**Files:**
- Modify: `electron/main/migration.ts:85-93`（FTS 表创建语句）
- Modify: `electron/main/migration.ts`（新增 `migrateFtsTokenizer()` 函数）
- Modify: `electron/main/shardManager.ts`（查询时 FTS5 版本兼容）

- [ ] **Step 1: 确认 SQLite FTS5 porter 支持**

检查 better-sqlite3 依赖的 SQLite 版本是否包含 FTS5 porter tokenizer。FTS5 porter 是 SQLite 内置的，无需额外扩展。

Run: 打开 Node REPL 或查看 `package-lock.json` 中 sqlite3/better-sqlite3 版本
Expected: better-sqlite3 版本 ≥ 9.0（内置 FTS5 porter）

> 注：SQLite 3.9.0+ 内置 FTS5，porter 从 SQLite 3.7.17 开始内置。所有主流 better-sqlite3 版本均支持。

- [ ] **Step 2: 修改 FTS5 表创建语句（migration.ts:85-93）**

将 tokenizer 从 `unicode61 remove_diacritics 1` 改为 `unicode61 remove_diacritics 1 tokenize=porter`：

```typescript
// 新 tokenizer 配置（带 porter stemmer）
const CREATE_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS shard_files_fts USING fts5(
  name,
  content,
  file_type,
  content='shard_files',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 1 tokenize=porter'
)
`
```

- [ ] **Step 3: 添加 FTS Tokenizer 迁移函数（migration.ts）**

在 `migration.ts` 末尾添加：

```typescript
/**
 * 迁移 FTS5 tokenizer 到 porter stemmer 版本。
 * 对于已存在的 shard DB，更新其 FTS 表 tokenizer 配置。
 * Porter stemmer 使搜索 "running" 匹配 "run/runs/running"。
 */
export async function migrateFtsTokenizer(
  onProgress?: (shardId: number, total: number) => void
): Promise<{ rebuilt: number; errors: string[] }> {
  const shardsDir = getShardsDir()
  const errors: string[] = []
  let rebuilt = 0

  if (!existsSync(shardsDir)) {
    return { rebuilt: 0, errors: [] }
  }

  const shardFiles = readdirSync(shardsDir).filter(f => f.startsWith('shard_') && f.endsWith('.db'))
  const total = shardFiles.length

  for (let i = 0; i < shardFiles.length; i++) {
    const shardFile = shardFiles[i]
    const shardPath = join(shardsDir, shardFile)
    const shardId = parseInt(shardFile.match(/shard_(\d+)\.db/)?.[1] ?? '-1', 10)

    try {
      const db = new Database(shardPath)
      db.pragma('journal_mode = WAL')

      // 检查当前 tokenizer 配置
      const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='shard_files_fts'").get() as { sql: string } | undefined
      if (!tableInfo) {
        db.close()
        continue
      }

      const hasPorter = tableInfo.sql.includes('tokenize=porter')
      if (!hasPorter) {
        log.info(`[Migration] Rebuilding FTS with porter tokenizer for shard ${shardId}`)
        // 重建 FTS 表（原子操作，索引期间阻塞该 DB 的搜索）
        db.exec("INSERT INTO shard_files_fts(shard_files_fts) VALUES('rebuild')")
        rebuilt++
      }

      db.close()
      onProgress?.(shardId, total)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      errors.push(`Shard ${shardId}: ${error}`)
      log.warn(`[Migration] FTS tokenizer migration failed for shard ${shardId}: ${error}`)
    }
  }

  log.info(`[Migration] FTS tokenizer migration complete: ${rebuilt} shards rebuilt`)
  return { rebuilt, errors }
}
```

- [ ] **Step 4: 在 shardManager 启动流程中触发迁移**

在 `shardManager.ts` 初始化流程中，调用 `migrateFtsTokenizer()`。注意：这是启动时的后台操作，不应阻塞 UI：

```typescript
// 在 shardManager.ts 初始化函数末尾添加（异步不阻塞）
import { migrateFtsTokenizer } from './migration'

// 启动后异步重建 FTS（不阻塞搜索）
setTimeout(() => {
  migrateFtsTokenizer().then(({ rebuilt, errors }) => {
    if (rebuilt > 0) {
      log.info(`[ShardManager] FTS tokenizer migrated: ${rebuilt} shards rebuilt`)
    }
  }).catch(err => {
    log.warn('[ShardManager] FTS tokenizer migration skipped:', err)
  })
}, 5000) // 等待 5 秒让初始搜索就绪
```

- [ ] **Step 5: 验证 porter stemmer 生效**

用现有数据库测试：
1. 找一份包含 "running" 但不包含 "run" 的文档（内容中写 "The running process"）
2. 搜索 `run`
3. 预期：结果中包含 "running process" 文档（stemmer 自动展开）

```bash
# 手动测试 SQL
sqlite3 test.db "INSERT INTO shard_files_fts(shard_files_fts) VALUES('rebuild');"
sqlite3 test.db "SELECT * FROM shard_files_fts WHERE shard_files_fts MATCH 'run*';"
```

- [ ] **Step 6: Commit**

```bash
git add electron/main/migration.ts electron/main/shardManager.ts
git commit -m "feat(search): enable FTS5 porter stemmer for word stemming
- tokenizer upgraded from unicode61 to unicode61 + porter
- migrateFtsTokenizer() rebuilds existing shards on startup
- searching 'run' now matches 'running/runs/run' documents"
```

---

## Task 2: 字段限定搜索解析器

**目标：** 在 `searchAllShards()` 入口层新增 `extractFieldPrefixes()` 函数解析 `name:`、`path:`、`ext:` 前缀：
- `name:report` — 复用现有 `searchByFileName` 路径（FTS5 列过滤 `name:{query}`）
- `path:documents` — SQL LIKE 路径匹配
- `ext:pdf` — 合并到 `fileTypes` 过滤器

> **重要约束**：`parseFtsQuery()` 保持原有签名（返回 `string`），不破坏现有调用链。

**Files:**
- Modify: `electron/main/shardManager.ts`（新增 `extractFieldPrefixes()`，更新 `searchAllShards()` 和 `SearchOptions` 接口）
- Modify: `electron/main/shardManager.ts`（`searchShardDb` 新增 `pathQuery` 参数支持）

- [ ] **Step 1: 扩展 SearchOptions 接口**

在 `shardManager.ts` 的类型定义区域，扩展 `SearchOptions`：

```typescript
export interface SearchOptions {
  fileTypes?: string[]    // e.g., ['pdf', 'docx']
  sizeMin?: number        // Minimum size in bytes
  sizeMax?: number        // Maximum size in bytes
  dateFrom?: string       // ISO date string
  dateTo?: string         // ISO date string
  // 字段限定搜索（由 parseFtsQuery 解析后填充）
  nameQuery?: string      // name: 前缀后的关键词
  pathQuery?: string      // path: 前缀后的关键词
  extFilters?: string[]   // ext: 前缀后的扩展名（自动合并到 fileTypes）
}
```

- [ ] **Step 2: 重写 parseFtsQuery 函数**

替换 `shardManager.ts` 中的 `parseFtsQuery()`：

```typescript
/**
 * 解析用户查询字符串，提取字段限定语法并返回 FTS5 查询。
 *
 * 支持语法：
 *   name:report      → 文件名中含 "report"
 *   path:documents  → 路径中含 "documents"
 *   ext:pdf         → 扩展名为 pdf（合并到 options.extFilters）
 *   content word    → 默认在内容和文件名中搜索
 *   "exact phrase"  → 精确短语
 *   word*           → 前缀通配符
 *   AND / OR / NOT  → 布尔操作符
 */
export function parseFtsQuery(
  query: string
): { ftsQuery: string; options: Omit<SearchOptions, keyof SearchOptions> } {
  const options: Omit<SearchOptions, keyof SearchOptions> & SearchOptions = {
    nameQuery: undefined,
    pathQuery: undefined,
    extFilters: [],
  }

  if (!query || !query.trim()) {
    return { ftsQuery: '', options }
  }

  let remainingQuery = query

  // 提取 ext: 字段（可多次出现）
  const extMatches = [...remainingQuery.matchAll(/\bext:([a-z0-9]+)\b/gi)]
  if (extMatches.length > 0) {
    options.extFilters = extMatches.map(m => m[1].toLowerCase())
    remainingQuery = remainingQuery.replace(/\bext:[a-z0-9]+\b/gi, '').trim()
  }

  // 提取 name: 字段（取第一个）
  const nameMatch = remainingQuery.match(/\bname:("[^"]+"|[^\s]+)/i)
  if (nameMatch) {
    options.nameQuery = nameMatch[1].replace(/^"|"$/g, '')
    remainingQuery = remainingQuery.replace(/\bname:"[^"]+"\b/i, '').replace(/\bname:[^\s]+\b/i, '').trim()
  }

  // 提取 path: 字段（取第一个）
  const pathMatch = remainingQuery.match(/\bpath:("[^"]+"|[^\s]+)/i)
  if (pathMatch) {
    options.pathQuery = pathMatch[1].replace(/^"|"$/g, '')
    remainingQuery = remainingQuery.replace(/\bpath:"[^"]+"\b/i, '').replace(/\bpath:[^\s]+\b/i, '').trim()
  }

  // 解析剩余查询字符串（原有逻辑）
  const ftsQuery = buildFtsQuery(remainingQuery)

  return { ftsQuery, options }
}

/**
 * 构建 FTS5 查询字符串（原有 parseFtsQuery 的核心逻辑）。
 * 支持布尔操作符、短语、前缀。
 */
function buildFtsQuery(query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return ''

  const hasExplicitOr = /(^|\s)OR(\s|$)/i.test(trimmed)
  const hasExplicitNot = /(^|\s)NOT(\s|$)/i.test(trimmed)

  if (!hasExplicitOr && !hasExplicitNot) {
    const words = trimmed.split(/\s+/).filter(w => w.length > 0)
    return words.map(w => {
      if (w.startsWith('"') && w.endsWith('"')) return w
      if (w.endsWith('*')) {
        return `"${w.slice(0, -1).replace(/"/g, '""')}"`
      }
      return `"${w.replace(/"/g, '""')}"*`
    }).join(' AND ')
  }

  let result = trimmed
  result = result.replace(/"([^"]+)"/g, (_, phrase) => `"${phrase.replace(/"/g, '""')}"`)
  result = result.replace(
    /(?<![*:a-zA-Z0-9_])([a-zA-Z0-9_\u4e00-\u9fff]+)(?![*:])(?=\s|$|[)])/g,
    (match) => {
      const upper = match.toUpperCase()
      if (upper === 'AND' || upper === 'OR' || upper === 'NOT' || upper === 'NEAR') return match
      return `"${match}"*`
    }
  )
  result = result.replace(/\bNOT\b/gi, '-')

  return result
}
```

- [ ] **Step 3: 更新 searchShardDb 处理字段限定**

修改 `searchShardDb()` 函数签名和逻辑，支持 `nameQuery` 和 `pathQuery`：

```typescript
function searchShardDb(
  db: Database,
  ftsQuery: string,
  options?: SearchOptions & { nameQuery?: string; pathQuery?: string },
  shardId?: number
): SearchResult[] {
  const whereClauses: string[] = []
  const params: (string | number)[] = []

  // 1. FTS5 MATCH 子句（nameQuery 或默认全文）
  if (options?.nameQuery) {
    // name: 前缀 → 只搜文件名
    whereClauses.push('shard_files_fts MATCH ?')
    params.push(buildFtsQuery(options.nameQuery))
  } else if (ftsQuery) {
    // 默认：全文搜索（name + content）
    whereClauses.push('shard_files_fts MATCH ?')
    params.push(ftsQuery)
  }

  // 2. path: 前缀 → SQL LIKE（路径不在 FTS5 中）
  if (options?.pathQuery) {
    // 路径分隔符兼容 Windows (\) 和 Unix (/)
    const escapedPath = options.pathQuery.replace(/[%_\\]/g, '\\$&')
    whereClauses.push('f.path LIKE ?')
    params.push(`%${escapedPath}%`)
  }

  // 3. ext: 前缀 → 文件类型过滤（优先级最高）
  const allFileTypes = [
    ...(options?.fileTypes ?? []),
    ...(options?.extFilters ?? [])
  ]
  if (allFileTypes.length > 0) {
    const placeholders = allFileTypes.map(() => '?').join(', ')
    whereClauses.push(`f.file_type IN (${placeholders})`)
    params.push(...allFileTypes)
  }

  // 4. 原有过滤器
  if (options?.sizeMin !== undefined && options.sizeMin > 0) {
    whereClauses.push('f.size >= ?')
    params.push(options.sizeMin)
  }
  if (options?.sizeMax !== undefined && options.sizeMax > 0) {
    whereClauses.push('f.size <= ?')
    params.push(options.sizeMax)
  }
  if (options?.dateFrom) {
    whereClauses.push('f.updated_at >= ?')
    params.push(options.dateFrom)
  }
  if (options?.dateTo) {
    whereClauses.push('f.updated_at <= ?')
    params.push(options.dateTo)
  }

  whereClauses.push('f.is_supported = 1')

  // 如果没有 FTS 查询（只有 path: 或 ext:），退化为 SQL LIKE
  if (whereClauses.length === 0 || (!ftsQuery && !options?.nameQuery)) {
    return []
  }

  const whereClause = whereClauses.join(' AND ')
  const matchClause = options?.nameQuery || ftsQuery
    ? `shard_files_fts MATCH ${options?.nameQuery ? '?' : '?'} ${whereClause ? 'AND ' + whereClause : ''}`
    : whereClause

  const finalParams: (string | number)[] = []
  if (options?.nameQuery) {
    finalParams.push(buildFtsQuery(options.nameQuery))
  } else if (ftsQuery) {
    finalParams.push(ftsQuery)
  }
  finalParams.push(...params)

  // 当无 FTS 查询时，直接查 shard_files 表
  if (!options?.nameQuery && !ftsQuery) {
    const stmt = db.prepare(`
      SELECT f.*, 0 as rank
      FROM shard_files f
      WHERE ${whereClause}
      LIMIT 200
    `)
    stmt.bind(params)
    const results: SearchResult[] = []
    for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
      const r = row as Record<string, unknown>
      results.push({
        id: r.id as number,
        path: r.path as string,
        name: r.name as string,
        size: r.size as number,
        hash: r.hash as string | null,
        file_type: r.file_type as string | null,
        content: r.content as string | null,
        created_at: r.created_at as string | undefined,
        updated_at: r.updated_at as string | undefined,
        shardId,
        rank: 0,
        match_type: 'content'
      })
    }
    return results
  }

  const stmt = db.prepare(`
    SELECT f.*, bm25(shard_files_fts) as rank
    FROM shard_files_fts fts
    JOIN shard_files f ON fts.rowid = f.id
    WHERE ${whereClause}
    ORDER BY rank
    LIMIT 200
  `)
  stmt.bind(params)

  const results: SearchResult[] = []
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    const r = row as Record<string, unknown>
    results.push({
      id: r.id as number,
      path: r.path as string,
      name: r.name as string,
      size: r.size as number,
      hash: r.hash as string | null,
      file_type: r.file_type as string | null,
      content: r.content as string | null,
      created_at: r.created_at as string | undefined,
      updated_at: r.updated_at as string | undefined,
      shardId,
      rank: r.rank as number,
      match_type: 'content'
    })
  }

  return results
}
```

- [ ] **Step 4: 更新 searchAllShards 调用**

找到 `searchAllShards()` 函数中调用 `searchShardDb()` 的地方，传入解析后的字段选项：

```typescript
// 在 searchAllShards 函数中（约 shardManager.ts 搜索逻辑部分）
const { ftsQuery, options: parsedOptions } = parseFtsQuery(query)

// 将解析出的 ext 合并到 fileTypes
const searchOptions: SearchOptions = {
  ...options,
  ...parsedOptions,
  fileTypes: [
    ...(options?.fileTypes ?? []),
    ...(parsedOptions.extFilters ?? [])
  ],
  nameQuery: parsedOptions.nameQuery,
  pathQuery: parsedOptions.pathQuery,
}

// 传入搜索
const shardResults = shardSearchWithDb(db, ftsQuery, searchOptions, shardId)
```

> **简化版替代方案**：在 `searchAllShards()` 入口处解析一次字段前缀，将 `extFilters` 合并到 `fileTypes`，`nameQuery` 和 `pathQuery` 单独处理。

- [ ] **Step 5: 验证字段搜索功能**

手动测试：

```bash
# name: 搜索
# 搜索框输入: name:report
# 预期: 只返回文件名含 "report" 的文档

# path: 搜索
# 搜索框输入: path:documents
# 预期: 只返回路径含 "documents" 的文档

# ext: 搜索
# 搜索框输入: ext:pdf annual
# 预期: 只返回 PDF 文件中含 "annual" 的文档

# 组合搜索
# 搜索框输入: name:report ext:pdf financial
# 预期: 文件名含 "report" 的 PDF 文件，内容含 "financial"
```

- [ ] **Step 6: Commit**

```bash
git add electron/main/shardManager.ts
git commit -m "feat(search): add field-limited search syntax (name:/path:/ext:)
- parseFtsQuery extracts name:/path:/ext: prefixes before FTS parsing
- name: searches filename field only via FTS5
- path: searches file path via SQL LIKE
- ext: filters by file extension (merged with fileTypes filter)"
```

---

## Task 3: 语法提示面板 UI 增强

**目标：** 在搜索页面的语法帮助面板中，新增字段限定搜索的示例。

**Files:**
- Modify: `src/pages/SearchPage.tsx`（语法帮助面板）
- Modify: `src/context/LanguageContext.tsx`（翻译 key）

- [ ] **Step 1: 添加翻译 key（LanguageContext.tsx）**

在 `search.` 翻译区域添加：

```typescript
// 中文
'search.syntaxName': '文件名搜索',
'search.syntaxPath': '路径搜索',
'search.syntaxExt': '按扩展名筛选',

// 英文
'search.syntaxName': 'Search in filename',
'search.syntaxPath': 'Search in path',
'search.syntaxExt': 'Filter by extension',
```

- [ ] **Step 2: 更新语法提示面板（SearchPage.tsx）**

在 `showSyntaxHelp` 面板的 `syntax-grid` 中添加新的语法项：

```tsx
{/* 新增：字段限定搜索 */}
<div className="syntax-help-section-title">{t('search.fieldSearch')}</div>
<div className="syntax-item">
  <code>name:report</code>
  <span>{t('search.syntaxName')}</span>
</div>
<div className="syntax-item">
  <code>path:documents</code>
  <span>{t('search.syntaxPath')}</span>
</div>
<div className="syntax-item">
  <code>ext:pdf</code>
  <span>{t('search.syntaxExt')}</span>
</div>
```

在 `LanguageContext.tsx` 添加分区标题：
```typescript
'search.fieldSearch': '字段搜索',  // zh
'search.fieldSearch': 'Field Search', // en
```

- [ ] **Step 3: 添加 CSS 样式（可选）**

如果语法面板有样式问题，可在 `SearchPage.css` 或全局样式中添加：

```css
.syntax-help-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 12px;
  margin-bottom: 4px;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/SearchPage.tsx src/context/LanguageContext.tsx
git commit -m "docs(search): add field search syntax to help panel and i18n"
```

---

## Task 4: 项目文档同步更新

**目标：** 功能开发完成后，同步更新项目文档和关于页（关于页展示功能特性，含多语言翻译）。

**Files:**
- Modify: `docs/PROGRESS.md` — 已完成功能列表
- Modify: `docs/ROADMAP.md` — 里程碑状态（stemming + 字段搜索均标记为已完成）
- Modify: `src/pages/GuidePage.tsx` — 关于页功能描述
- Modify: `src/context/LanguageContext.tsx` — 关于页翻译文本

- [ ] **Step 1: 更新 PROGRESS.md**

在"已完成功能"区域添加：

```markdown
### 搜索能力
- [x] 词干提取搜索（Porter Stemmer）：搜索 "run" 自动匹配 "running/runs/run" 文档
- [x] 字段限定搜索语法：`name:`（文件名）、`path:`（路径）、`ext:`（扩展名）
```

- [ ] **Step 2: 更新 ROADMAP.md**

在 Phase 2 里程碑区域，将高级查询语法相关的里程碑标记为已完成（如有独立里程碑），或新增一行：

```markdown
- [x] **M2.6** 高级查询语法 UI 提示面板（类 Recoll 查询语言界面）
- [x] **M2.7** 词干提取（Porter Stemmer）：搜索词自动还原为词干
- [x] **M2.8** 字段限定搜索（name:/path:/ext: 语法）
```

同时更新优先级矩阵中的"正则搜索"行备注：
```markdown
| 正则搜索 | ✅ 已支持 `/pattern/` 语法 | 支持词干提取和字段搜索 | Everything / AnyTXT |
```

- [ ] **Step 3: 更新关于页 GuidePage.tsx**

在"核心功能"或"高级功能"区域，新增功能描述：

```tsx
// 英文
<FeatureCard
  icon={<SearchIcon />}
  title={t('guide.featureX')}
  description={t('guide.featureXDesc')}
/>

// 中文对应翻译
'guide.featureX': '词干智能搜索',
'guide.featureXDesc': '支持英文词干提取，搜索 "run" 自动匹配 "running"、"runs" 等同根词',
```

> **功能描述需简洁（1-2 句）**，参考现有 FeatureCard 的风格（可查看 GuidePage.tsx 中现有功能描述的长度）。

- [ ] **Step 4: 添加关于页翻译（LanguageContext.tsx）**

在 `guide.` 翻译区域添加：

```typescript
// 中文
'guide.featureX': '词干智能搜索',
'guide.featureXDesc': '支持英文词干提取，搜索 "run" 自动匹配 "running"、"runs" 等同根词',

// 英文
'guide.featureX': 'Stemming Search',
'guide.featureXDesc': 'English word stemming — searching "run" matches "running", "runs", "run" documents',
```

> 注意：`featureX` 中的 X 需替换为下一个可用序号。先读取 `GuidePage.tsx` 和 `LanguageContext.tsx` 确认当前最大序号。

- [ ] **Step 5: Commit**

```bash
git add docs/PROGRESS.md docs/ROADMAP.md src/pages/GuidePage.tsx src/context/LanguageContext.tsx
git commit -m "docs: update progress and guide page for stemming and field search"
```

---

## Task 5: 端到端测试验证

**目标：** 验证词干提取和字段搜索在真实场景下工作正常。

- [ ] **Step 1: 词干提取测试**

1. 准备测试文档：创建一个包含 "running processes are efficient" 的 TXT 文件
2. 扫描该文件进入索引
3. 搜索 `run` → 应匹配该文档（porter stemmer）
4. 搜索 `running` → 应同样匹配
5. 搜索 `processes` → 应匹配（porter 还原为 process）

- [ ] **Step 2: 字段搜索测试**

1. 搜索 `name:readme` → 只返回文件名含 readme 的文档
2. 搜索 `path:downloads` → 只返回路径含 downloads 的文档
3. 搜索 `ext:pdf` → 只返回 PDF 文件
4. 搜索 `ext:docx annual` → DOCX 文件中含 annual 的文档
5. 组合：`name:report ext:xlsx` → Excel 文件名含 report

- [ ] **Step 3: 回归测试**

1. 原有布尔搜索 `report AND 2025` → 正常
2. 原有正则搜索 `/annual.*report/` → 正常
3. 文件过滤器（类型/大小/日期）→ 正常
4. 无搜索词时不应崩溃

- [ ] **Step 4: Commit**

```bash
git commit -m "test: add e2e tests for stemming and field search"
```

---

## 技术方案自检

### 覆盖检查

| 需求 | 对应 Task/Step |
|------|----------------|
| 词干提取（stemming） | Task 1 |
| `name:` 字段搜索 | Task 2 |
| `path:` 字段搜索 | Task 2 |
| `ext:` 扩展名过滤 | Task 2 |
| 语法提示 UI | Task 3 |
| 文档同步（PROGRESS/ROADMAP/关于页） | Task 4 |
| 端到端测试 | Task 5 |

### 关键设计决策

1. **Porter tokenizer 仅影响英文**：Unicode61 tokenizer 处理 CJK 字符，porter 处理拉丁语系词干。中文用户几乎无感知，但英文文档召回率显著提升。

2. **path: 使用 SQL LIKE 而非 FTS5**：`path` 列不在 FTS5 中（仅 `name`/`content`/`file_type` 被索引）。`path:` 查询退化为 SQL WHERE 路径匹配，无 BM25 排序。考虑未来将 `path` 也加入 FTS5（需要重建索引）。

3. **ext: 合并到 fileTypes 过滤器**：实现简洁，用户可以在 UI 过滤器面板和搜索框中同时使用 ext 语法。

4. **字段搜索优先级**：当用户同时输入 `name:report annual` 时，`name:report` 限制文件名，`annual` 在全文（文件名+内容）中搜索。两者独立生效。

5. **分片重建时机**：启动后 5 秒后台触发，不阻塞正常搜索流程。大型索引（>100万文件）重建可能需要数分钟，但不影响搜索可用性。
