/**
 * ThumbnailCache Tests
 *
 * TDD: Write tests first, then implement.
 */

import {ThumbnailCache} from '../thumbnailCache'
import fs, {mkdirSync} from 'fs'
import path from 'path'

const TEST_DIR = path.join(__dirname, 'test_thumb_cache')
const SOURCE_DIR = path.join(__dirname, 'test_thumb_src')

function cleanup() {
  for (const d of [TEST_DIR, SOURCE_DIR]) {
    if (fs.existsSync(d)) {
      fs.rmSync(d, {recursive: true})
    }
  }
}

// Helper: create a real source file for use with set()
function makeFile(name: string, content: string): string {
  if (!fs.existsSync(SOURCE_DIR)) {
    mkdirSync(SOURCE_DIR, {recursive: true})
  }
  const p = path.join(SOURCE_DIR, name)
  fs.writeFileSync(p, content)
  return p
}

beforeEach(() => { cleanup() })
afterAll(() => { cleanup() })

test('set and get returns same data', () => {
  const cache = new ThumbnailCache(TEST_DIR, 10 * 1024 * 1024)
  const data = Buffer.from('fake png data')
  const filePath = makeFile('test.png', '')
  const key = cache.set(filePath, data)
  const result = cache.get(key)
  expect(result).toEqual(data)
})

test('returns null for unknown key', () => {
  const cache = new ThumbnailCache(TEST_DIR, 10 * 1024 * 1024)
  const result = cache.get('nonexistent')
  expect(result).toBeNull()
})

test('evicts oldest when over maxSize', () => {
  // 200 bytes limit, 3 files × 100 bytes = 300 bytes > 200 bytes
  // Eviction should remove the oldest file, leaving 2 files (200 bytes)
  const cache = new ThumbnailCache(TEST_DIR, 200)
  const f1 = makeFile('file1.txt', 'a'.repeat(100))
  const f2 = makeFile('file2.txt', 'b'.repeat(100))
  const f3 = makeFile('file3.txt', 'c'.repeat(100))

  cache.set(f1, Buffer.alloc(100, 'a'))
  cache.set(f2, Buffer.alloc(100, 'b'))
  cache.set(f3, Buffer.alloc(100, 'c')) // eviction happens here

  const files = fs.readdirSync(TEST_DIR)
  const totalSize = files.reduce((acc, name) => {
    return acc + fs.statSync(path.join(TEST_DIR, name)).size
  }, 0)

  // After eviction: should have 2 files, total size <= 200
  expect(files.length).toBe(2)
  expect(totalSize).toBeLessThanOrEqual(200)
})

test('clear removes all cached files', () => {
  const cache = new ThumbnailCache(TEST_DIR, 10 * 1024 * 1024)
  const f1 = makeFile('clear1.txt', 'test1')
  const f2 = makeFile('clear2.txt', 'test2')

  cache.set(f1, Buffer.from('test1'))
  cache.set(f2, Buffer.from('test2'))
  expect(fs.readdirSync(TEST_DIR).length).toBe(2)

  cache.clear()
  expect(fs.readdirSync(TEST_DIR).length).toBe(0)
})
