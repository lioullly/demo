// IndexedDB singleton
let _idb = null
let _promise = null

function getDB() {
  if (_idb) return Promise.resolve(_idb)
  if (!_promise) {
    _promise = new Promise((ok, no) => {
      if (typeof indexedDB === 'undefined') { no(new Error('IndexedDB not available')); return }
      const r = indexedDB.open('handwriting_sync', 3)
      r.onupgradeneeded = () => {
        const d = r.result
        if (!d.objectStoreNames.contains('strokes')) d.createObjectStore('strokes', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('texts')) d.createObjectStore('texts', { keyPath: 'id' })
      }
      r.onsuccess = () => { _idb = r.result; ok(_idb) }
      r.onerror = () => { _promise = null; no(r.error) }
      r.onblocked = () => { _promise = null; no(new Error('Blocked')) }
    })
  }
  return _promise
}

export function draw(ctx, pts, c, s) {
  if (pts.length < 1) return
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = c; ctx.lineWidth = s; ctx.globalAlpha = 0.95
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke(); ctx.restore()
}

export async function saveStroke(id, pts, c, s) {
  try {
    const d = await getDB()
    const tx = d.transaction('strokes', 'readwrite')
    const req = tx.objectStore('strokes').put({ id, pageId: 'page_1', userId: 'local', points: pts, color: c, size: s, ts: Date.now() })
    return new Promise((ok, no) => { req.onsuccess = () => ok(); req.onerror = () => no(req.error); tx.onerror = () => no(tx.error) })
  } catch (_) {}
}

export async function deleteStroke(id) {
  try {
    const d = await getDB()
    const tx = d.transaction('strokes', 'readwrite')
    const req = tx.objectStore('strokes').delete(id)
    return new Promise((ok, no) => { req.onsuccess = () => ok(); req.onerror = () => no(req.error); tx.onerror = () => no(tx.error) })
  } catch (_) {}
}

export async function loadStrokes(callback) {
  if (typeof callback !== 'function') return
  try {
    const d = await getDB()
    const tx = d.transaction('strokes', 'readonly')
    const req = tx.objectStore('strokes').getAll()
    req.onsuccess = () => { try { req.result.sort((a, b) => a.ts - b.ts).forEach((s) => callback(s)) } catch (_) {} }
    req.onerror = () => {}
  } catch (_) {}
}
