// WebSocket connection and message handling
import { WS_PORT, uid, setWS, setConnectedHost, connectedHost, cv, strokes } from './utils.js'

let _connectId = 0

export function connectWS(host, room) {
  const cid = ++_connectId
  return new Promise((resolve) => {
    if (window.ws) { try { window.ws.close() } catch(_) {}; window.ws = null }
    if (!room) { resolve(false); return }
    const url = `ws://${host}:${WS_PORT}?room=${encodeURIComponent(room)}`
    window.ws = new WebSocket(url)
    let settled = false
    window.ws.onopen = () => {
      if (settled || cid !== _connectId) return
      settled = true; setConnectedHost(host); resolve(true)
      const sd = document.getElementById('status-dot')
      if (sd) { sd.textContent = 'Connected'; sd.className = 'status-ok' }
      const rb = document.getElementById('btn-reconnect'); if(rb) rb.style.display = 'none'
    }
    window.ws.onerror = () => {
      if (settled) return; settled = true; window.ws = null; resolve(false)
      const sd = document.getElementById('status-dot')
      if (sd) { sd.textContent = 'Disconnected'; sd.className = 'status-wait' }
      const rb = document.getElementById('btn-reconnect'); if(rb) rb.style.display = ''
    }
    window.ws.onclose = () => {
      if (settled) return; window.ws = null
      const sd = document.getElementById('status-dot')
      if (sd) { sd.textContent = 'Disconnected'; sd.className = 'status-wait' }
      const rb = document.getElementById('btn-reconnect'); if(rb) rb.style.display = ''
    }
    window.ws.onmessage = handleWS
    setTimeout(() => {
      if (!settled && cid === _connectId) { settled = true; window.ws = null; resolve(false) }
    }, 5000)
  })
}

export function sendWS(msg) {
  if (window.ws?.readyState === WebSocket.OPEN) window.ws.send(JSON.stringify(msg))
}

function draw(ctx, pts, c, s) {
  if (pts.length < 1) return
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = c; ctx.lineWidth = s; ctx.globalAlpha = 0.95
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke(); ctx.restore()
}

function redrawBoard(board) {
  const ctx = cv[board].ctxBg; const c = cv[board].bg
  const dpr = window.devicePixelRatio || 1
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  strokes[board].forEach((s) => draw(ctx, s.points, s.color, s.size))
  ctx.restore()
}

export function handleWS(e) {
  try {
    const msg = JSON.parse(e.data)
    if (msg.source === USER_ID) return
    if (msg.type === 'sync') {
      for (const raw of msg.history) {
        try {
          const m = JSON.parse(raw)
          if (m.type === 'stroke') { strokes.peer.set(m.id, m.payload); draw(cv.peer.ctxBg, m.payload.points, m.payload.color, m.payload.width || m.payload.size) }
          else if (m.type === 'erase') { m.payload.strokeIds.forEach((id) => strokes.peer.delete(id)) }
          else if (m.type === 'text') { const ctx = cv.peer.ctxBg; ctx.save(); ctx.font = '16px system-ui'; ctx.fillStyle = '#1a1a1a'; ctx.fillText(m.payload.content, m.payload.x, m.payload.y); ctx.restore() }
        } catch (_) {}
      }
      redrawBoard('peer'); return
    }
    if (msg.type === 'stroke') { strokes.peer.set(msg.id, msg.payload); draw(cv.peer.ctxBg, msg.payload.points, msg.payload.color, msg.payload.width || msg.payload.size) }
    else if (msg.type === 'erase') { msg.payload.strokeIds.forEach((id) => strokes.peer.delete(id)); redrawBoard('peer') }
    else if (msg.type === 'erase_point') { const { strokes:u } = msg.payload; if (u) u.forEach((x) => strokes.peer.set(x.id, x)); redrawBoard('peer') }
    else if (msg.type === 'text') { const ctx = cv.peer.ctxBg; ctx.save(); ctx.font = '16px system-ui'; ctx.fillStyle = '#1a1a1a'; ctx.fillText(msg.payload.content, msg.payload.x, msg.payload.y); ctx.restore() }
    else if (['p','h1','h2','h3','todo','img'].includes(msg.type) || msg.type?.startsWith('block_')) {
      import('./blocks.js').then((m) => m.handleBlockMsg(msg))
    }
  } catch (_) {}
}
