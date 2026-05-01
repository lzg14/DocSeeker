-- DocSeeker SQL Test File
-- Test SQL queries for DocSeeker database operations

-- Create files table
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    size INTEGER,
    hash TEXT,
    file_type TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert test file
INSERT INTO files (path, name, size, file_type, content)
VALUES ('D:\Documents\test.txt', 'test.txt', 1024, 'text', 'DocSeeker test content');

-- Search files containing keyword
SELECT * FROM files WHERE content LIKE '%DocSeeker%';

-- Update file record
UPDATE files SET updated_at = CURRENT_TIMESTAMP WHERE id = 1;

-- Delete file
DELETE FROM files WHERE path = 'D:\Documents\old.txt';

-- Test query with DocSeeker keyword
SELECT name, path FROM files WHERE name LIKE '%test%' AND file_type = 'text';
