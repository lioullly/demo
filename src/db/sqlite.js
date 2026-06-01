/**
 * SQLite 本地数据库 — better-sqlite3
 *
 * 存储本地手写笔记，仅存储自己的页面数据。
 */

import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron' // 仅 Electron 主进程可用

let db = null

/** 初始化数据库 */
export function initDB(userId = 'default') {
  const dbPath = path.join(app.getPath('userData'), `notes_${userId}.db`)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      page_number INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')*1000),
      updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
    );

    CREATE TABLE IF NOT EXISTS strokes (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL REFERENCES pages(id),
      user_id TEXT NOT NULL,
      color TEXT DEFAULT '#000000',
      width REAL DEFAULT 3.0,
      points TEXT NOT NULL,
      ts INTEGER NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id)
    );

    CREATE TABLE IF NOT EXISTS text_blocks (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL REFERENCES pages(id),
      user_id TEXT NOT NULL,
      content TEXT DEFAULT '',
      pos_x REAL DEFAULT 0,
      pos_y REAL DEFAULT 0,
      ts INTEGER NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id)
    );

    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL REFERENCES pages(id),
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      pos_x REAL DEFAULT 0,
      pos_y REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0,
      ts INTEGER NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id)
    );

    CREATE INDEX IF NOT EXISTS idx_strokes_page ON strokes(page_id);
    CREATE INDEX IF NOT EXISTS idx_text_page ON text_blocks(page_id);
    CREATE INDEX IF NOT EXISTS idx_images_page ON images(page_id);
  `)

  console.log(`[DB] Initialized: ${dbPath}`)
  return db
}

/** 关闭数据库 */
export function closeDB() {
  if (db) {
    db.close()
    db = null
    console.log('[DB] Closed')
  }
}

/* ── 页面操作 ── */

export function ensurePage(pageId, pageNumber = 1) {
  const existing = db.prepare('SELECT id FROM pages WHERE id = ?').get(pageId)
  if (!existing) {
    db.prepare('INSERT INTO pages (id, page_number) VALUES (?, ?)').run(pageId, pageNumber)
  }
}

/* ── Stroke ── */

export function saveStroke(id, pageId, userId, color, width, points) {
  ensurePage(pageId)
  db.prepare(
    'INSERT OR REPLACE INTO strokes (id, page_id, user_id, color, width, points, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, pageId, userId, color, width, JSON.stringify(points), Date.now())
}

export function getStrokes(pageId) {
  return db.prepare('SELECT * FROM strokes WHERE page_id = ? ORDER BY ts').all(pageId).map(r => ({
    ...r,
    points: JSON.parse(r.points),
  }))
}

export function deleteStroke(id) {
  db.prepare('DELETE FROM strokes WHERE id = ?').run(id)
}

export function deleteStrokes(ids) {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`DELETE FROM strokes WHERE id IN (${placeholders})`).run(...ids)
}

/* ── Text ── */

export function saveText(id, pageId, userId, content, x = 0, y = 0) {
  ensurePage(pageId)
  db.prepare(
    'INSERT OR REPLACE INTO text_blocks (id, page_id, user_id, content, pos_x, pos_y, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, pageId, userId, content, x, y, Date.now())
}

export function getTextBlocks(pageId) {
  return db.prepare('SELECT * FROM text_blocks WHERE page_id = ? ORDER BY ts').all(pageId)
}

/* ── Image ── */

export function saveImage(id, pageId, userId, url, x = 0, y = 0, w = 0, h = 0) {
  ensurePage(pageId)
  db.prepare(
    'INSERT OR REPLACE INTO images (id, page_id, user_id, url, pos_x, pos_y, width, height, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, pageId, userId, url, x, y, w, h, Date.now())
}

export function getImages(pageId) {
  return db.prepare('SELECT * FROM images WHERE page_id = ? ORDER BY ts').all(pageId)
}
