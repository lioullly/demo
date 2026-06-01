/**
 * H5 客户端 — 双面板手写 + WebSocket 同步 + IndexedDB
 */

const WS_PORT = 3000
const params = new URLSearchParams(location.search)
const URL_ROOM = params.get('room') || ''
const URL_HOST = params.get('host') || ''
const PAGE_ID = 'page_default'
const USER_ID = `u_${Date.now().toString(36)}`

/* ── DOM ── */
const $ = (id) => document.getElementById(id)
const roomBadge = $('room-badge')
const statusDot = $('status-dot')
const hostInput = $('host-addr')
const btnConnect = $('btn-connect')
const btnScan = $('btn-scan')
const btnPen = $('btn-pen')
const btnEraser = $('btn-eraser')
const btnText = $('btn-text')
const colorPicker = $('color-picker')
const sizeSlider = $('size-slider')
const btnViewBoth = $('btn-view-both')
const btnViewMine = $('btn-view-mine')
const panelPeer = $('panel-peer')
const textOverlay = $('text-overlay')
const textInput = $('text-input')
const textSend = $('text-send')
const textCancel = $('text-cancel')

// Canvas pairs: [bg, fg]
const cv = {
  mine: { bg: $('cv-mine-bg'), fg: $('cv-mine-fg'), ctxBg: null, ctxFg: null },
  peer: { bg: $('cv-peer-bg'), fg: $('cv-peer-fg'), ctxBg: null, ctxFg: null },
}
for (const k of ['mine', 'peer']) {
  cv[k].ctxBg = cv[k].bg.getContext('2d')
  cv[k].ctxFg = cv[k].fg.getContext('2d')
}

/* ── 状态 ── */
let tool = 'pen', color = '#1a1a1a', size = 3
let isDrawing = false, points = []
let activeBoard = 'mine' // 'mine' | 'both'
const strokes = { mine: new Map(), peer: new Map() } // id -> { points, color, size }
const texts = { mine: new Map(), peer: new Map() } // id -> { content, x, y }
let ws = null, room = URL_ROOM || 'demo1234'

roomBadge.textContent = `Room: ${room}`

/* ── Canvas 尺寸 ── */
function resize() {
  for (const k of ['mine', 'peer']) {
    const wrap = document.getElementById(`wrap-${k}`)
    if (!wrap) continue
    const dpr = devicePixelRatio || 1
    const w = wrap.clientWidth, h = wrap.clientHeight
    for (const layer of ['bg', 'fg']) {
      const c = cv[k][layer]
      c.width = w * dpr; c.height = h * dpr
      c.style.width = w + 'px'; c.style.height = h + 'px'
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }
}
window.addEventListener('resize', resize)
setTimeout(resize, 100)

/* ── 工具栏 ── */
btnPen.onclick = () => { tool = 'pen'; btnPen.className = 'on'; btnEraser.className = btnText.className = ''; setCursor() }
btnEraser.onclick = () => { tool = 'eraser'; btnEraser.className = 'on'; btnPen.className = btnText.className = ''; setCursor() }
btnText.onclick = () => { textOverlay.classList.toggle('show'); textInput.focus() }
colorPicker.oninput = (e) => { color = e.target.value }
sizeSlider.oninput = (e) => { size = +e.target.value }
btnViewBoth.onclick = () => { activeBoard = 'both'; panelPeer.style.display = ''; btnViewBoth.className = 'on'; btnViewMine.className = ''; resize() }
btnViewMine.onclick = () => { activeBoard = 'mine'; panelPeer.style.display = 'none'; btnViewMine.className = 'on'; btnViewBoth.className = ''; resize() }
textSend.onclick = () => { const txt = textInput.value.trim(); if (txt) { sendWS({ type:'text', payload:{ content:txt, x:100, y:100 }, pageId:PAGE_ID, userId:USER_ID, id:uid(), ts:Date.now(), source:USER_ID }); addText('mine', uid(), txt, 100, 100) } textInput.value = ''; textOverlay.classList.remove('show') }
textCancel.onclick = () => { textInput.value = ''; textOverlay.classList.remove('show') }

function setCursor() {
  const cs = tool === 'eraser' ? 'cell' : tool === 'pen' ? 'crosshair' : 'default'
  cv.mine.fg.style.cursor = cs
}

/* ── 指针事件 ── */
function pt(e, board) {
  const r = cv[board].fg.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top, pressure: e.pressure || 0.5 }
}

function setupPointer(board) {
  const { fg, ctxFg, ctxBg } = cv[board]
  fg.onpointerdown = (e) => {
    if (e.pointerType === 'touch' && e.pressure === 0) return
    if (board === 'peer') return
    e.preventDefault(); isDrawing = true; points = [pt(e, board)]
    if (tool === 'pen') ctxFg.clearRect(0, 0, fg.width, fg.height)
  }
  fg.onpointermove = (e) => {
    if (!isDrawing || board === 'peer') return
    e.preventDefault()
    const cs = e.getCoalescedEvents?.() || [e]; cs.forEach((ce) => points.push(pt(ce, board)))
    if (tool === 'pen') { ctxFg.clearRect(0, 0, fg.width, fg.height); draw(ctxFg, points, color, size) }
    else if (tool === 'eraser') eraseStroke(board, pt(e, board))
  }
  fg.onpointerup = () => {
    if (!isDrawing || board === 'peer') return; isDrawing = false
    if (tool === 'pen' && points.length > 0) {
      const id = uid()
      const msg = { id, type:'stroke', payload:{ points, color, size }, pageId:PAGE_ID, userId:USER_ID, ts:Date.now(), source:USER_ID }
      draw(ctxBg, points, color, size); strokes.mine.set(id, { points, color, size }); sendWS(msg); saveLocalStroke(id, points, color, size)
      ctxFg.clearRect(0, 0, fg.width, fg.height)
    }
    points = []
  }
  fg.onpointercancel = () => { isDrawing = false; points = []; ctxFg.clearRect(0, 0, fg.width, fg.height) }
}

setupPointer('mine')
// Peer canvas is read-only
cv.peer.fg.style.pointerEvents = 'none'

/* ── 绘制 ── */
function draw(ctx, pts, c, s) {
  if (pts.length < 1) return
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'
  ctx.strokeStyle = c; ctx.lineWidth = s; ctx.globalAlpha = 0.95
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke(); ctx.restore()
}

function eraseStroke(board, p) {
  const store = board === 'mine' ? strokes.mine : strokes.peer
  const ctx = cv[board].ctxBg
  const hit = []
  store.forEach((s, id) => { if (s.points.some((q) => (q.x-p.x)**2 + (q.y-p.y)**2 < 144)) hit.push(id) })
  if (hit.length) {
    hit.forEach((id) => { store.delete(id); if (board==='mine') deleteLocalStroke(id) })
    sendWS({ type:'erase', payload:{ strokeIds:hit }, pageId:PAGE_ID, userId:USER_ID, id:uid(), ts:Date.now(), source:USER_ID })
    redrawBoard(board)
  }
}

function redrawBoard(board) {
  const ctx = cv[board].ctxBg
  ctx.clearRect(0, 0, cv[board].bg.width, cv[board].bg.height)
  strokes[board].forEach((s) => draw(ctx, s.points, s.color, s.size))
  texts[board].forEach((t) => drawText(board, t))
}

function drawText(board, t) {
  const ctx = cv[board].ctxBg
  ctx.save(); ctx.font = '16px system-ui'; ctx.fillStyle = '#1a1a1a'; ctx.fillText(t.content, t.x, t.y); ctx.restore()
}

function addText(board, id, content, x, y) {
  texts[board].set(id, { content, x, y })
  redrawBoard(board)
}

function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2,8)}` }

/* ── WebSocket ── */
function sendWS(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) }

function connect(host) {
  if (ws) { ws.close(); ws = null }
  const url = `ws://${host}:${WS_PORT}?room=${encodeURIComponent(room)}`
  statusDot.textContent = '连接中...'; statusDot.className = 'status-wait'
  ws = new WebSocket(url)
  ws.onopen = () => { statusDot.textContent = '已连接'; statusDot.className = 'status-ok' }
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.source === USER_ID) return
      if (msg.type === 'stroke') {
        strokes.peer.set(msg.id, msg.payload)
        draw(cv.peer.ctxBg, msg.payload.points, msg.payload.color, msg.payload.width || msg.payload.size)
      } else if (msg.type === 'erase') {
        msg.payload.strokeIds.forEach((id) => strokes.peer.delete(id))
        redrawBoard('peer')
      } else if (msg.type === 'text') {
        addText('peer', msg.id, msg.payload.content, msg.payload.x, msg.payload.y)
      }
    } catch (_) {}
  }
  ws.onclose = () => { statusDot.textContent = '已断开'; statusDot.className = 'status-wait' }
  ws.onerror = () => { statusDot.textContent = '连接失败'; statusDot.className = 'status-wait' }
}

btnConnect.onclick = () => connect(hostInput.value.trim() || 'localhost')
hostInput.onkeydown = (e) => { if (e.key === 'Enter') connect(hostInput.value.trim() || 'localhost') }

/* ── 扫描 ── */
btnScan.onclick = async () => {
  btnScan.textContent = '...'; btnScan.disabled = true; statusDot.textContent = '扫描中...'
  const subnets = ['192.168.1','192.168.0','192.168.2','192.168.31','192.168.50','10.0.0']
  for (const sub of subnets) {
    const batch = []
    for (let i = 1; i <= 20; i++) {
      const ip = `${sub}.${i}`
      batch.push(fetch(`http://${ip}:${WS_PORT}/api/status`, { signal: AbortSignal.timeout(600) }).then(r=>r.json()).then(d=>{if(d.name==='handwriting-sync'){hostInput.value=d.ip;connect(d.ip);throw 'found'}}).catch(()=>{}))
    }
    await Promise.all(batch)
    if (ws?.readyState === WebSocket.OPEN) break
  }
  btnScan.textContent = '扫描'; btnScan.disabled = false
  if (ws?.readyState !== WebSocket.OPEN) statusDot.textContent = '未发现主机'
}

/* ── IndexedDB ── */
function idb() { return new Promise((ok,no)=>{const r=indexedDB.open('handwriting_sync',2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('strokes'))r.result.createObjectStore('strokes',{keyPath:'id'})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}) }
async function saveLocalStroke(id, pts, c, s) { const d=await idb();d.transaction('strokes','readwrite').objectStore('strokes').put({id,pageId:PAGE_ID,userId:USER_ID,points:pts,color:c,size:s,ts:Date.now()}) }
async function deleteLocalStroke(id) { const d=await idb();d.transaction('strokes','readwrite').objectStore('strokes').delete(id) }
;(async function load() {
  try {
    const d = await idb()
    const req = d.transaction('strokes','readonly').objectStore('strokes').getAll()
    req.onsuccess = () => {
      const items = req.result.sort((a,b)=>a.ts-b.ts)
      items.forEach((s)=>{strokes.mine.set(s.id,s);draw(cv.mine.ctxBg,s.points,s.color,s.size)})
    }
  } catch(_) {}
})()

/* ── 自动连接 ── */
setTimeout(() => {
  if (URL_HOST) { hostInput.value = URL_HOST; connect(URL_HOST) }
  else if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') { connect(location.hostname) }
  else { hostInput.value = 'localhost'; connect('localhost') }
}, 300)
