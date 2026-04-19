/**
 * Sync actual file counts from shards to meta.db scanned_folders.
 * Fixes path format mismatch (shards use /, scanned_folders uses \\).
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const META_DB = path.join(process.env.APPDATA || '', 'docSeeker', 'db', 'meta.db');
const SHARDS_DIR = path.join(process.env.APPDATA || '', 'docSeeker', 'db', 'shards');

async function main() {
  const SQL = await initSqlJs();

  const buf = fs.readFileSync(META_DB);
  const db = new SQL.Database(buf);

  // Collect folder stats from all shards
  const folderStats = {};
  const shardFiles = fs.readdirSync(SHARDS_DIR).filter(f => f.endsWith('.db'));

  for (const sf of shardFiles) {
    try {
      const shardBuf = fs.readFileSync(path.join(SHARDS_DIR, sf));
      const shardDb = new SQL.Database(shardBuf);
      const rows = shardDb.exec('SELECT path, size FROM shard_files');
      for (const row of rows[0]?.values || []) {
        const filePath = (row[0] || '').replace(/\\/g, '/');
        let folderKey = null;
        if (filePath.startsWith('D:/User/Documents')) {
          folderKey = 'D:\\User\\Documents';
        } else if (filePath.startsWith('D:/User/Desktop')) {
          folderKey = 'D:\\User\\Desktop';
        }
        if (folderKey) {
          if (!folderStats[folderKey]) folderStats[folderKey] = { count: 0, size: 0 };
          folderStats[folderKey].count++;
          folderStats[folderKey].size += (row[1] || 0);
        }
      }
      shardDb.close();
    } catch (e) {
      console.warn('Error reading shard', sf, ':', e.message);
    }
  }

  console.log('Stats from shards:');
  for (const [k, v] of Object.entries(folderStats)) {
    console.log(`  ${k}: ${v.count} files, ${(v.size / 1024 / 1024).toFixed(1)} MB`);
  }

  // Update scanned_folders using REPLACE to normalize paths for comparison
  for (const [folderPath, stats] of Object.entries(folderStats)) {
    const normalized = folderPath.replace(/\\/g, '/');
    // Match: exact path OR path starting with normalized path + /
    const sql = `
      UPDATE scanned_folders
      SET file_count = ${stats.count},
          total_size = ${stats.size},
          last_scan_at = datetime('now')
      WHERE REPLACE(path, '\\', '/') = '${normalized}'
         OR REPLACE(path, '\\', '/') LIKE '${normalized}/%'
    `;
    db.exec(sql);
    console.log(`Updated ${folderPath}: ${stats.count} files, ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  }

  const out = Buffer.from(db.export());
  fs.writeFileSync(META_DB, out);
  console.log('\nmeta.db saved');

  // Verify
  const vDb = new SQL.Database(out);
  const r = vDb.exec('SELECT name, file_count, total_size FROM scanned_folders');
  console.log('\nFinal scanned_folders:');
  r[0]?.values.forEach(row =>
    console.log(`  ${row[0]}: ${row[1]} files, ${((row[2] || 0) / 1024 / 1024).toFixed(1)} MB`)
  );
  vDb.close();
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
