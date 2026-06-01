/**
 * SQLite 本地数据库 — sql.js (纯 JS，无需编译)
 */

import initSqlJs from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db = null

/** 初始化数据库（异步） */
export async function initDB(userId = 'default') {
  const SQL = await initSqlJs()
  const dbDir = app.getPath('userData')
  const dbPath = path.join(dbDir, `notes_${userId}.db`)

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA journal_mode = WAL')

  db.run(`CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    page_number INTEGER NOT NULL,
    created_at INTEGER,
    updated_at INTEGER
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS strokes (
    id TEXT PRIMARY KEY, page_id TEXT, user_id TEXT,
    color TEXT, width REAL, points TEXT, ts INTEGER
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS text_blocks (
    id TEXT PRIMARY KEY, page_id TEXT, user_id TEXT,
    content TEXT, pos_x REAL, pos_y REAL, ts INTEGER
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY, page_id TEXT, user_id TEXT,
    url TEXT, pos_x REAL, pos_y REAL, width REAL, height REAL, ts INTEGER
  )`)

  console.log(`[DB] Initialized: ${dbPath}`)
  return db
}

/** 保存到磁盘 */
function save() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  const dbDir = app.getPath('userData')
  const files = fs.readdirSync(dbDir).filter((f) => f.startsWith('notes_') && f.endsWith('.db'))
  const dbPath = path.join(dbDir, files[0] || 'notes_default.db')
  fs.writeFileSync(dbPath, buffer)
}

export function closeDB() { if (db) { db.close(); db = null } }

/* ── 页面 ── */
function ensurePage(pageId, num = 1) {
  const r = db.exec('SELECT id FROM pages WHERE id = ?', [pageId])
  if (!r.length || !r[0].values.length) {
    db.run('INSERT INTO pages (id, page_number, created_at, updated_at) VALUES (?, ?, ?, ?)', [pageId, num, Date.now(), Date.now()])
    save()
  }
}

/* ── Stroke ── */
export function saveStroke(id, pageId, userId, color, width, points) {
  ensurePage(pageId)
  db.run('INSERT OR REPLACE INTO strokes VALUES (?,?,?,?,?,?,?)', [id, pageId, userId, color, width, JSON.stringify(points), Date.now()])
  save()
}

export function getStrokes(pageId) {
  const r = db.exec('SELECT * FROM strokes WHERE page_id = ? ORDER BY ts', [pageId])
  if (!r.length) return []
  return r[0].values.map((row) => ({ id: row[0], page_id: row[1], user_id: row[2], color: row[3], width: row[4], points: JSON.parse(row[5]), ts: row[6] }))
}

export function deleteStroke(id) { db.run('DELETE FROM strokes WHERE id = ?', [id]); save() }

export function deleteStrokes(ids) {
  if (!ids.length) return
  db.run(`DELETE FROM strokes WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  save()
}

/* ── Text ── */
export function saveText(id, pageId, userId, content, x = 0, y = 0) {
  ensurePage(pageId)
  db.run('INSERT OR REPLACE INTO text_blocks VALUES (?,?,?,?,?,?,?)', [id, pageId, userId, content, x, y, Date.now()])
  save()
}

export function getTextBlocks(pageId) {
  const r = db.exec('SELECT * FROM text_blocks WHERE page_id = ? ORDER BY ts', [pageId])
  if (!r.length) return []
  return r[0].values.map((row) => ({ id: row[0], page_id: row[1], user_id: row[2], content: row[3], pos_x: row[4], pos_y: row[5], ts: row[6] }))
}

/* ── Image ── */
export function saveImage(id, pageId, userId, url, x = 0, y = 0, w = 0, h = 0) {
  ensurePage(pageId)
  db.run('INSERT OR REPLACE INTO images VALUES (?,?,?,?,?,?,?,?,?)', [id, pageId, userId, url, x, y, w, h, Date.now()])
  save()
}

export function getImages(pageId) {
  const r = db.exec('SELECT * FROM images WHERE page_id = ? ORDER BY ts', [pageId])
  if (!r.length) return []
  return r[0].values.map((row) => ({ id: row[0], page_id: row[1], user_id: row[2], url: row[3], pos_x: row[4], pos_y: row[5], width: row[6], height: row[7], ts: row[8] }))
}
