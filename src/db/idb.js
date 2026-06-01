/**
 * IndexedDB 本地存储 — H5 客户端
 */

const DB_NAME = 'handwriting_sync'
const DB_VERSION = 1

let db = null

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('strokes')) {
        const s = d.createObjectStore('strokes', { keyPath: 'id' })
        s.createIndex('pageId', 'pageId', { unique: false })
        s.createIndex('ts', 'ts', { unique: false })
      }
    }
    req.onsuccess = () => { db = req.result; resolve(db) }
    req.onerror = () => reject(req.error)
  })
}

export function saveStroke(stroke) {
  if (!db) return Promise.reject('DB not open')
  return new Promise((resolve, reject) => {
    const tx = db.transaction('strokes', 'readwrite')
    tx.objectStore('strokes').put(stroke)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export function getStrokes(pageId) {
  if (!db) return Promise.reject('DB not open')
  return new Promise((resolve, reject) => {
    const tx = db.transaction('strokes', 'readonly')
    const req = tx.objectStore('strokes').index('pageId').getAll(pageId)
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.ts - b.ts))
    req.onerror = () => reject(req.error)
  })
}

export function deleteStroke(id) {
  if (!db) return Promise.reject('DB not open')
  return new Promise((resolve, reject) => {
    const tx = db.transaction('strokes', 'readwrite')
    tx.objectStore('strokes').delete(id)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export function deleteStrokes(ids) {
  if (!db) return Promise.reject(new Error('DB not open'))
  if (!Array.isArray(ids) || !ids.length) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('strokes', 'readwrite')
    const s = tx.objectStore('strokes')
    ids.forEach((id) => s.delete(id))
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}
