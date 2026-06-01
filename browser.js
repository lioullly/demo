/**
 * 浏览器端 — WebSocket 客户端 + Canvas 手写
 * 连接运行 npm start 的 Electron 主机
 */

const WS_PORT = 3000
const PAGE_ID = 'page_default'
const USER_ID = `web_${Date.now().toString(36)}`

/* ── DOM ── */
const bg = document.getElementById('bg-canvas')
const fg = document.getElementById('fg-canvas')
const bgCtx = bg.getContext('2d')
const fgCtx = fg.getContext('2d')
const statusEl = document.getElementById('status')
const hostInput = document.getElementById('host-addr')
const btnConnect = document.getElementById('btn-connect')

/* ── 工具状态 ── */
let tool = 'pen', color = '#1a1a1a', size = 3
let isDrawing = false, points = []
const strokes = new Map() // id -> { points, color, size }

document.getElementById('btn-pen').onclick = () => { tool = 'pen'; fg.style.cursor = 'crosshair' }
document.getElementById('btn-eraser').onclick = () => { tool = 'eraser'; fg.style.cursor = 'cell' }
document.getElementById('color-picker').oninput = (e) => { color = e.target.value }
document.getElementById('size-slider').oninput = (e) => { size = +e.target.value }

/* ── Canvas 尺寸 ── */
function resize() {
  const dpr = devicePixelRatio || 1
  const w = document.getElementById('canvas-container').clientWidth
  const h = document.getElementById('canvas-container').clientHeight
  for (const c of [bg, fg]) {
    c.width = w * dpr; c.height = h * dpr
    c.style.width = w + 'px'; c.style.height = h + 'px'
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
  }
}
window.addEventListener('resize', resize)
resize()

/* ── 绘制 ── */
function draw(ctx, pts, c, s) {
  if (pts.length < 1) return
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'
  ctx.strokeStyle = c; ctx.lineWidth = s; ctx.globalAlpha = 0.95
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke(); ctx.restore()
}

function redrawAll() {
  bgCtx.clearRect(0, 0, bg.width, bg.height)
  strokes.forEach((s) => draw(bgCtx, s.points, s.color, s.size))
}

/* ── 指针事件 ── */
function pt(e) { const r = fg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, pressure: e.pressure || 0.5 } }

fg.onpointerdown = (e) => {
  if (e.pointerType === 'touch' && e.pressure === 0) return
  e.preventDefault(); isDrawing = true; points = [pt(e)]
  if (tool === 'pen') fgCtx.clearRect(0, 0, fg.width, fg.height)
}

fg.onpointermove = (e) => {
  if (!isDrawing) return; e.preventDefault()
  const cs = e.getCoalescedEvents?.() || [e]; cs.forEach((ce) => points.push(pt(ce)))
  if (tool === 'pen') { fgCtx.clearRect(0, 0, fg.width, fg.height); draw(fgCtx, points, color, size) }
  else if (tool === 'eraser') {
    const p = pt(e); const hit = []
    strokes.forEach((s, id) => { if (s.points.some((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 144)) hit.push(id) })
    if (hit.length) { hit.forEach((id) => strokes.delete(id)); redrawAll(); sendWS({ type: 'erase', payload: { strokeIds: hit } }) }
  }
}

fg.onpointerup = () => {
  if (!isDrawing) return; isDrawing = false
  if (tool === 'pen' && points.length > 0) {
    const msg = { id: `${Date.now()}_${Math.random().toString(36).slice(2,6)}`, pageId: PAGE_ID, userId: USER_ID,
      type: 'stroke', payload: { points, color, size }, ts: Date.now(), source: USER_ID }
    draw(bgCtx, points, color, size); strokes.set(msg.id, { points, color, size }); sendWS(msg)
    fgCtx.clearRect(0, 0, fg.width, fg.height)
  }
  points = []
}

fg.onpointercancel = () => { isDrawing = false; points = []; fgCtx.clearRect(0, 0, fg.width, fg.height) }

/* ── WebSocket ── */
let ws = null

function sendWS(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) }

function connect(host) {
  if (ws) { ws.close(); ws = null }
  const url = `ws://${host}:${WS_PORT}`
  statusEl.textContent = '连接中...'; statusEl.className = 'status-wait'
  ws = new WebSocket(url)
  ws.onopen = () => { statusEl.textContent = '已连接'; statusEl.className = 'status-ok' }
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.source === USER_ID) return
      if (msg.type === 'stroke') {
        strokes.set(msg.id, msg.payload)
        draw(bgCtx, msg.payload.points, msg.payload.color, msg.payload.width || msg.payload.size)
      } else if (msg.type === 'erase') {
        msg.payload.strokeIds.forEach((id) => strokes.delete(id))
        redrawAll()
      }
    } catch (_) {}
  }
  ws.onclose = () => { statusEl.textContent = '已断开'; statusEl.className = 'status-wait' }
  ws.onerror = () => { statusEl.textContent = '连接失败'; statusEl.className = 'status-wait' }
}

btnConnect.onclick = () => connect(hostInput.value.trim() || 'localhost')
hostInput.onkeydown = (e) => { if (e.key === 'Enter') connect(hostInput.value.trim() || 'localhost') }

// 自动尝试连接 localhost
setTimeout(() => { hostInput.value = 'localhost'; connect('localhost') }, 300)
