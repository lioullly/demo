// IndexedDB singleton
let _idb = null, _promise = null

function getDB() {
  if (_idb) return Promise.resolve(_idb)
  if (!_promise) {
    _promise = new Promise((ok, no) => {
      const r = indexedDB.open('handwriting_sync', 3)
      r.onupgradeneeded = () => {
        const d = r.result
        if (!d.objectStoreNames.contains('strokes')) d.createObjectStore('strokes', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('texts')) d.createObjectStore('texts', { keyPath: 'id' })
      }
      r.onsuccess = () => { _idb = r.result; ok(_idb) }
      r.onerror = () => no(r.error)
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
  try { const d = await getDB(); d.transaction('strokes', 'readwrite').objectStore('strokes').put({ id, pageId: 'page_1', userId: 'local', points: pts, color: c, size: s, ts: Date.now() }) } catch (_) {}
}

export async function deleteStroke(id) {
  try { const d = await getDB(); d.transaction('strokes', 'readwrite').objectStore('strokes').delete(id) } catch (_) {}
}

export async function loadStrokes(callback) {
  try {
    const d = await getDB()
    const req = d.transaction('strokes', 'readonly').objectStore('strokes').getAll()
    req.onsuccess = () => req.result.sort((a, b) => a.ts - b.ts).forEach((s) => callback(s))
  } catch (_) {}
}
