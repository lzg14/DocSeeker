/**
 * Migration script: meta.db schema upgrade
 *
 * Old schema (meta.db, created before db-redesign refactoring):
 *   meta_folders       → new: scanned_folders
 *   meta_search_history → new: search_history
 *   meta_saved_searches → new: saved_searches
 *
 * New schema (expected by current code):
 *   scanned_folders
 *   search_history
 *   saved_searches
 *
 * This script:
 * 1. Creates the new tables in meta.db (if not exist)
 * 2. Migrates data from old tables to new tables
 * 3. Optionally syncs accurate file counts from shards
 *
 * Usage: node scripts/migrate-meta-db.js [--sync-from-shards]
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const APPDATA = process.env.APPDATA || '';
const DB_DIR = path.join(APPDATA, 'docSeeker', 'db');
const META_DB = path.join(DB_DIR, 'meta.db');
const SHARDS_DIR = path.join(DB_DIR, 'shards');

async function migrate() {
  const SQL = await initSqlJs();
  const args = process.argv.slice(2);
  const syncFromShards = args.includes('--sync-from-shards');

  console.log('=== meta.db Migration ===');
  console.log('DB dir:', DB_DIR);

  if (!fs.existsSync(META_DB)) {
    console.error('meta.db not found at', META_DB);
    process.exit(1);
  }

  // Load meta.db
  const metaBuf = fs.readFileSync(META_DB);
  const metaDb = new SQL.Database(metaBuf);

  // Check which old tables exist
  const oldTables = metaDb.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'meta_%'"
  );
  const oldTableNames = (oldTables[0]?.values || []).map(v => v[0]);
  console.log('Old tables found:', oldTableNames);

  // Check if new tables already have data
  const newFoldersCount = metaDb.exec(
    'SELECT COUNT(*) FROM scanned_folders'
  );
  const newFoldersRows = newFoldersCount[0]?.values[0][0] || 0;
  console.log('scanned_folders rows (new table):', newFoldersRows);

  // ---- Create new tables and migrate in SINGLE exec calls (sql.js quirk) ----
  // sql.js requires CREATE + INSERT in same exec() call for visibility

  // Migrate meta_folders → scanned_folders
  if (oldTableNames.includes('meta_folders') && newFoldersRows === 0) {
    console.log('\nMigrating meta_folders → scanned_folders...');
    metaDb.exec(`
      CREATE TABLE IF NOT EXISTS scanned_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        last_scan_at TEXT,
        last_full_scan_at TEXT,
        file_count INTEGER DEFAULT 0,
        total_size INTEGER DEFAULT 0,
        schedule_enabled INTEGER DEFAULT 0,
        schedule_day TEXT,
        schedule_time TEXT
      );
      INSERT INTO scanned_folders (path, name, last_scan_at, last_full_scan_at, file_count, total_size, schedule_enabled, schedule_day, schedule_time)
      SELECT path, name, last_scan_at, last_full_scan_at, file_count, total_size, schedule_enabled, schedule_day, schedule_time
      FROM meta_folders;
    `);
    const migrated = metaDb.exec('SELECT COUNT(*) FROM scanned_folders');
    console.log('Migrated', migrated[0]?.values[0][0], 'folders');
  } else if (newFoldersRows > 0) {
    console.log('\nscanned_folders already has data, skipping folder migration');
  }

  // Migrate meta_search_history → search_history
  if (oldTableNames.includes('meta_search_history')) {
    const existing = metaDb.exec('SELECT COUNT(*) FROM search_history');
    const existingRows = existing[0]?.values[0][0] || 0;
    if (existingRows === 0) {
      console.log('\nMigrating meta_search_history → search_history...');
      metaDb.exec(`
        CREATE TABLE IF NOT EXISTS search_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          searched_at TEXT
        );
        INSERT INTO search_history (query, searched_at)
        SELECT query, searched_at FROM meta_search_history;
      `);
      const migrated = metaDb.exec('SELECT COUNT(*) FROM search_history');
      console.log('Migrated', migrated[0]?.values[0][0], 'history entries');
    }
  }

  // Migrate meta_saved_searches → saved_searches
  if (oldTableNames.includes('meta_saved_searches')) {
    const existing = metaDb.exec('SELECT COUNT(*) FROM saved_searches');
    const existingRows = existing[0]?.values[0][0] || 0;
    if (existingRows === 0) {
      console.log('\nMigrating meta_saved_searches → saved_searches...');
      metaDb.exec(`
        CREATE TABLE IF NOT EXISTS saved_searches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          query TEXT NOT NULL,
          created_at TEXT
        );
        INSERT INTO saved_searches (name, query, created_at)
        SELECT name, query, created_at FROM meta_saved_searches;
      `);
      const migrated = metaDb.exec('SELECT COUNT(*) FROM saved_searches');
      console.log('Migrated', migrated[0]?.values[0][0], 'saved searches');
    }
  }

  // ---- Sync accurate file counts from shards ----
  if (syncFromShards) {
    console.log('\nSyncing file counts from shards...');
    if (!fs.existsSync(SHARDS_DIR)) {
      console.log('Shards dir not found, skipping');
    } else {
      const shardFiles = fs.readdirSync(SHARDS_DIR).filter(f => f.endsWith('.db'));
      const folderStats = new Map();

      for (const sf of shardFiles) {
        try {
          const buf = fs.readFileSync(path.join(SHARDS_DIR, sf));
          const shardDb = new SQL.Database(buf);
          const rows = shardDb.exec('SELECT path, size FROM shard_files');
          for (const row of rows[0]?.values || []) {
            const filePath = row[0];
            // Determine folder prefix
            let folderPath = null;
            if (filePath.startsWith('D:/User/Documents')) {
              folderPath = 'D:/User/Documents';
            } else if (filePath.startsWith('D:/User/Desktop')) {
              // Check for nested scanned folders
              const parts = filePath.replace(/\\/g, '/').split('/');
              // Desktop path segments: ['', 'D:', 'User', 'Desktop', ...]
              // We want the immediate subfolder of Desktop that's registered
              if (parts.length >= 5) {
                // For now, attribute everything to D:/User/Desktop
                folderPath = 'D:/User/Desktop';
              }
            }
            if (folderPath) {
              const existing = folderStats.get(folderPath) || { count: 0, size: 0 };
              existing.count += 1;
              existing.size += (row[1] || 0);
              folderStats.set(folderPath, existing);
            }
          }
          shardDb.close();
        } catch (e) {
          console.warn('Error reading', sf, ':', e.message);
        }
      }

      console.log('Folder stats from shards:', JSON.stringify(Object.fromEntries(folderStats)));

      // Update scanned_folders in meta.db
      for (const [folderPath, stats] of folderStats) {
        const stmt = metaDb.prepare(
          "UPDATE scanned_folders SET file_count = ?, total_size = ?, last_scan_at = datetime('now') WHERE path = ? OR path LIKE ? || '/%'"
        );
        stmt.run([stats.count, stats.size, folderPath, folderPath]);
        stmt.free();
        console.log(`Updated ${folderPath}: ${stats.count} files, ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
      }
    }
  }

  // ---- Clean up old tables ----
  const oldTables = ['meta_folders', 'meta_search_history', 'meta_saved_searches', 'meta_state'];
  for (const t of oldTables) {
    try {
      metaDb.exec('DROP TABLE IF EXISTS ' + t);
      console.log('Dropped old table:', t);
    } catch {}
  }
  metaDb.exec("DELETE FROM sqlite_sequence WHERE name IN ('meta_folders','meta_search_history','meta_saved_searches')");

  // ---- Save meta.db ----
  const data = metaDb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(META_DB, buffer);
  console.log('\nmeta.db saved successfully');

  // Verify
  const verifyDb = new SQL.Database(buffer);
  const folders = verifyDb.exec('SELECT path, name, file_count, total_size FROM scanned_folders');
  console.log('\n=== Final scanned_folders ===');
  folders[0]?.values.forEach(r =>
    console.log(`  ${r[1]}: ${r[2]} files, ${((r[3] || 0) / 1024 / 1024).toFixed(1)}MB`)
  );
  verifyDb.close();
  metaDb.close();

  console.log('\nDone!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
