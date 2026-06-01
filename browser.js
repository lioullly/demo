/**
 * H5 客户端 — Canvas 手写 + WebSocket 同步 + IndexedDB 本地存储
 * 连接运行 node server.js 的主机
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
    saveLocalStroke(msg.id, [...points], color, size) // 存本地
    fgCtx.clearRect(0, 0, fg.width, fg.height)
  }
  points = []
}

fg.onpointercancel = () => { isDrawing = false; points = []; fgCtx.clearRect(0, 0, fg.width, fg.height) }

/* ── WebSocket ── */
let ws = null
// 从 URL 参数获取房间码和服务器地址
const params = new URLSearchParams(window.location.search)
const URL_ROOM = params.get('room') || ''
const URL_HOST = params.get('host') || ''

function sendWS(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) }

function connect(host) {
  if (ws) { ws.close(); ws = null }
  const room = URL_ROOM || prompt('请输入房间码:') || ''
  if (!room) { statusEl.textContent = '缺少房间码'; return }
  const url = `ws://${host}:${WS_PORT}?room=${encodeURIComponent(room)}`
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

// 扫描局域网主机
const btnScan = document.getElementById('btn-scan')
const hostList = document.getElementById('host-list')
btnScan.onclick = async () => {
  btnScan.textContent = '...'; btnScan.disabled = true
  statusEl.textContent = '扫描中...'; statusEl.className = 'status-wait'
  hostList.style.display = 'none'

  // 常见子网
  const subnets = ['192.168.1', '192.168.0', '192.168.2', '192.168.31', '192.168.50', '10.0.0']
  const host = window.location.hostname
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    const parts = host.split('.')
    if (parts.length === 4) {
      const s = parts.slice(0, 3).join('.')
      if (!subnets.includes(s)) subnets.unshift(s)
    }
  }

  const found = []
  for (const subnet of subnets) {
    const batch = []
    for (let i = 1; i <= 20; i++) {
      const ip = `${subnet}.${i}`
      batch.push(
        fetch(`http://${ip}:${WS_PORT}/api/status`, { signal: AbortSignal.timeout(600) })
          .then((r) => r.json())
          .then((d) => { if (d.name === 'handwriting-sync') found.push(d); statusEl.textContent = `发现 ${found.length} 台...` })
          .catch(() => {})
      )
    }
    await Promise.all(batch)
    if (found.length > 0) break
  }

  btnScan.textContent = '扫描'; btnScan.disabled = false

  if (found.length > 0) {
    statusEl.textContent = `发现 ${found.length} 台主机`; statusEl.className = 'status-ok'
    // 显示主机列表
    hostList.style.display = 'block'
    hostList.innerHTML = found.map((h) =>
      `<span style="display:inline-block;margin:4px;padding:4px 10px;background:#f0f0f0;border-radius:6px;cursor:pointer;" onclick="document.getElementById('host-addr').value='${h.ip}';document.getElementById('btn-connect').click()">${h.ip}</span>`
    ).join('')
  } else {
    hostList.style.display = 'none'
    statusEl.textContent = '未发现主机，请手动输入 IP'; statusEl.className = 'status-wait'
  }
}

// 自动连接
setTimeout(() => {
  if (URL_HOST) {
    hostInput.value = URL_HOST
    connect(URL_HOST)
  } else if (URL_ROOM) {
    // 有房间码无主机 → 需要手动输入 IP
    statusEl.textContent = '请输入主机 IP'
  } else {
    // 本地开发
    hostInput.value = 'localhost'
    connect('localhost')
  }
}, 300)

/* ── IndexedDB 本地持久化 ── */
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('handwriting_sync', 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('strokes')) r.result.createObjectStore('strokes', { keyPath: 'id' }) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function saveLocalStroke(id, points, color, size) {
  const d = await idb()
  d.transaction('strokes', 'readwrite').objectStore('strokes').put({ id, pageId: PAGE_ID, userId: USER_ID, points, color, size, ts: Date.now() })
}

async function loadLocalStrokes() {
  const d = await idb()
  return new Promise((resolve) => {
    const r = d.transaction('strokes', 'readonly').objectStore('strokes').getAll()
    r.onsuccess = () => {
      const items = r.result.sort((a, b) => a.ts - b.ts)
      items.forEach((s) => { strokes.set(s.id, s); draw(bgCtx, s.points, s.color, s.size) })
      resolve()
    }
  })
}

async function deleteLocalStroke(id) {
  const d = await idb()
  d.transaction('strokes', 'readwrite').objectStore('strokes').delete(id)
}

// 启动时从 IndexedDB 恢复
loadLocalStrokes()
