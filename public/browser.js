/**
 * H5 客户端 — 大厅选房(含IP/扫描) + 双面板手写
 */

const WS_PORT = 3000
const PAGE_ID = 'page_default'
const USER_ID = `u_${Date.now().toString(36)}`

function $(id) { return document.getElementById(id) }
function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2,8)}` }
function genRoom() { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<6;i++)s+=c[Math.floor(Math.random()*c.length)];return s }

/* ── 大厅 ── */
const lobby = $('lobby')
const tabCreate = $('tab-create')
const tabJoin = $('tab-join')
const createRow = $('create-row')
const createInput = $('create-room-code')
const btnRandom = $('btn-random')
const joinInput = $('join-room-input')
const hostInput = $('host-addr')
const btnScan = $('btn-scan')
const btnConnectLobby = $('btn-connect-lobby')
const btnEnter = $('btn-enter')
const lobbyMsg = $('lobby-msg')
const canvasView = $('canvas-view')
const roomBadge = $('room-badge')

let isCreate = true, room = '', ws = null, connectedHost = ''

createInput.value = genRoom()
btnRandom.onclick = () => { createInput.value = genRoom() }

tabCreate.onclick = () => {
  isCreate = true; tabCreate.className = 'on'; tabJoin.className = ''
  createRow.style.display = 'flex'; joinInput.style.display = 'none'
}
tabJoin.onclick = () => {
  isCreate = false; tabJoin.className = 'on'; tabCreate.className = ''
  createRow.style.display = 'none'; joinInput.style.display = 'block'; joinInput.focus()
}

joinInput.oninput = () => {
  room = joinInput.value.trim().toUpperCase()
  btnEnter.disabled = room.length < 4
}

function getRoom() { return isCreate ? createInput.value.trim().toUpperCase() || genRoom() : joinInput.value.trim().toUpperCase() }

function connectWS(host) {
  return new Promise((resolve, reject) => {
    if (ws) { ws.close(); ws = null }
    if (!room) { reject('no room'); return }
    const url = `ws://${host}:${WS_PORT}?room=${encodeURIComponent(room)}`
    lobbyMsg.textContent = '连接中...'
    ws = new WebSocket(url)
    ws.onopen = () => { lobbyMsg.textContent = '已连接'; connectedHost = host; resolve(true) }
    ws.onerror = () => { lobbyMsg.textContent = '连接失败'; ws = null; resolve(false) }
    ws.onclose = () => { if (ws) { lobbyMsg.textContent = '已断开'; ws = null } }
    setTimeout(() => { if (ws?.readyState !== WebSocket.OPEN) { ws = null; resolve(false) } }, 3000)
  })
}

async function doScan() {
  btnScan.textContent = '...'; btnScan.disabled = true; lobbyMsg.textContent = '扫描中...'
  const subs = ['192.168.1','192.168.0','192.168.2','192.168.31','192.168.50','10.0.0']
  const host = location.hostname
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    const parts = host.split('.')
    if (parts.length === 4) { const s = parts.slice(0,3).join('.'); if (!subs.includes(s)) subs.unshift(s) }
  }
  for (const sub of subs) {
    const batch = []
    for (let i = 1; i <= 20; i++) {
      const ip = `${sub}.${i}`
      batch.push(fetch(`http://${ip}:${WS_PORT}/api/status`,{signal:AbortSignal.timeout(600)}).then(r=>r.json()).then(d=>{
        if (d.name==='handwriting-sync') { hostInput.value = d.ip; btnScan.textContent='找到'; lobbyMsg.textContent=`发现: ${d.ip}`; throw 'found' }
      }).catch(()=>{}))
    }
    await Promise.all(batch)
    if (btnScan.textContent === '找到') break
  }
  btnScan.textContent = '扫描'; btnScan.disabled = false
}

btnScan.onclick = doScan
btnConnectLobby.onclick = async () => {
  const host = hostInput.value.trim()
  if (!host) { lobbyMsg.textContent = '请输入主机地址'; return }
  if (!getRoom()) { lobbyMsg.textContent = '请输入房间码'; return }
  room = getRoom()
  const ok = await connectWS(host)
  if (ok) done()
  else lobbyMsg.textContent = '连接失败，请检查地址和房间码'
}

btnEnter.onclick = async () => {
  room = getRoom()
  if (room.length < 4) { lobbyMsg.textContent = '房间码至少 4 位'; return }
  const host = hostInput.value.trim() || location.hostname
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    const ok = await connectWS(host)
    if (ok) { done(); return }
  }
  // 连接 localhost 或失败也先进画布
  done()
}

function done() {
  lobby.style.display = 'none'
  canvasView.classList.add('show')
  roomBadge.textContent = `Room: ${room}`
  const shareURL = () => {
    const host = connectedHost || hostInput.value.trim()
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(room)}&host=${encodeURIComponent(host)}`
    navigator.clipboard?.writeText(url).catch(()=>{})
    roomBadge.textContent = 'Copied!'
    setTimeout(() => { roomBadge.textContent = `Room: ${room}` }, 1500)
  }
  roomBadge.onclick = shareURL
  $('btn-share').onclick = shareURL
  setupCanvas()
}

/* ── 画布 ── */
const statusDot = $('status-dot')
let tool = 'pen', color = '#1a1a1a', size = 3, isDrawing = false, points = []
const strokes = { mine: new Map(), peer: new Map() }
const cv = {
  mine: { bg: $('cv-mine-bg'), fg: $('cv-mine-fg'), ctxBg: null, ctxFg: null },
  peer: { bg: $('cv-peer-bg'), fg: $('cv-peer-fg'), ctxBg: null, ctxFg: null },
}

function setupCanvas() {
  for (const k of ['mine', 'peer']) {
    cv[k].ctxBg = cv[k].bg.getContext('2d')
    cv[k].ctxFg = cv[k].fg.getContext('2d')
  }
  resize()
  window.addEventListener('resize', resize)

  $('btn-pen').onclick = () => { tool='pen'; $('btn-pen').className='on'; $('btn-eraser').className=$('btn-text').className=''; cv.mine.fg.className='cross' }
  $('btn-eraser').onclick = () => { tool='eraser'; $('btn-eraser').className='on'; $('btn-pen').className=$('btn-text').className=''; cv.mine.fg.className='' }
  $('btn-text').onclick = () => { $('text-overlay').classList.toggle('show'); $('text-input').focus() }
  $('color-picker').oninput = (e) => { color = e.target.value }
  $('size-slider').oninput = (e) => { size = +e.target.value }
  $('btn-view-both').onclick = () => { $('panel-peer').style.display='';resize();$('btn-view-both').className='on';$('btn-view-mine').className='' }
  $('btn-view-mine').onclick = () => { $('panel-peer').style.display='none';resize();$('btn-view-mine').className='on';$('btn-view-both').className='' }
  $('text-send').onclick = sendText
  $('text-cancel').onclick = () => { $('text-input').value=''; $('text-overlay').classList.remove('show') }

  setupPointer('mine')
  cv.peer.fg.style.pointerEvents = 'none'

  // 如果已有 ws 连接，更新 status
  if (ws?.readyState === WebSocket.OPEN) {
    statusDot.textContent = '已连接'; statusDot.className = 'status-ok'
    ws.onmessage = handleWS
  } else {
    // 本地连接
    if (!ws) { hostInput.value = hostInput.value || 'localhost'; connectWS(hostInput.value).then(() => { statusDot.textContent = '已连接'; statusDot.className = 'status-ok'; ws.onmessage = handleWS }).catch(()=>{}) }
  }
}

function handleWS(e) {
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
      const ctx = cv.peer.ctxBg
      ctx.save(); ctx.font = '16px system-ui'; ctx.fillStyle = '#1a1a1a'; ctx.fillText(msg.payload.content, msg.payload.x, msg.payload.y); ctx.restore()
    }
  } catch (_) {}
}
if (ws) ws.onmessage = handleWS

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
    if (!isDrawing || board === 'peer') return; e.preventDefault()
    const cs = e.getCoalescedEvents?.() || [e]; cs.forEach((ce) => points.push(pt(ce, board)))
    if (tool === 'pen') { ctxFg.clearRect(0, 0, fg.width, fg.height); draw(ctxFg, points, color, size) }
    else if (tool === 'eraser') eraseLocal(board, pt(e, board))
  }
  fg.onpointerup = () => {
    if (!isDrawing || board === 'peer') return; isDrawing = false
    if (tool === 'pen' && points.length > 0) {
      const id = uid()
      const msg = { id, type:'stroke', payload:{ points: [...points], color, size }, pageId:PAGE_ID, userId:USER_ID, ts:Date.now(), source:USER_ID }
      draw(ctxBg, points, color, size); strokes.mine.set(id, { points: [...points], color, size }); sendWS(msg); saveStroke(id, [...points], color, size)
      ctxFg.clearRect(0, 0, fg.width, fg.height)
    }
    points = []
  }
  fg.onpointercancel = () => { isDrawing = false; points = []; ctxFg.clearRect(0, 0, fg.width, fg.height) }
}

function draw(ctx, pts, c, s) {
  if (pts.length < 1) return
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = c; ctx.lineWidth = s; ctx.globalAlpha = 0.95
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.stroke(); ctx.restore()
}

function eraseLocal(board, p) {
  const store = board === 'mine' ? strokes.mine : strokes.peer
  const ctx = cv[board].ctxBg
  const hit = []
  store.forEach((s, id) => { if (s.points.some((q) => (q.x-p.x)**2 + (q.y-p.y)**2 < 144)) hit.push(id) })
  if (hit.length) {
    hit.forEach((id) => { store.delete(id); if (board==='mine') deleteStroke(id) })
    sendWS({ type:'erase', payload:{ strokeIds:hit }, pageId:PAGE_ID, userId:USER_ID, id:uid(), ts:Date.now(), source:USER_ID })
    redrawBoard(board)
  }
}

function redrawBoard(board) {
  const ctx = cv[board].ctxBg
  ctx.clearRect(0, 0, cv[board].bg.width, cv[board].bg.height)
  strokes[board].forEach((s) => draw(ctx, s.points, s.color, s.size))
}

function sendText() {
  const txt = $('text-input').value.trim()
  if (!txt) return
  const msg = { id:uid(), type:'text', payload:{ content:txt, x:100, y:100 }, pageId:PAGE_ID, userId:USER_ID, ts:Date.now(), source:USER_ID }
  sendWS(msg)
  const ctx = cv.mine.ctxBg; ctx.save(); ctx.font = '16px system-ui'; ctx.fillStyle = '#1a1a1a'; ctx.fillText(txt, 100, 100); ctx.restore()
  $('text-input').value = ''; $('text-overlay').classList.remove('show')
}

function sendWS(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) }

/* ── IndexedDB ── */
function idb() { return new Promise((ok,no)=>{const r=indexedDB.open('handwriting_sync',2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('strokes'))r.result.createObjectStore('strokes',{keyPath:'id'})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}) }
async function saveStroke(id, pts, c, s) { try { const d=await idb();d.transaction('strokes','readwrite').objectStore('strokes').put({id,pageId:PAGE_ID,userId:USER_ID,points:pts,color:c,size:s,ts:Date.now()}) } catch(_) {} }
async function deleteStroke(id) { try { const d=await idb();d.transaction('strokes','readwrite').objectStore('strokes').delete(id) } catch(_) {} }
;(async function load() {
  try {
    const d = await idb()
    const req = d.transaction('strokes','readonly').objectStore('strokes').getAll()
    req.onsuccess = () => req.result.sort((a,b)=>a.ts-b.ts).forEach((s)=>{strokes.mine.set(s.id,s);cv.mine.ctxBg&&draw(cv.mine.ctxBg,s.points,s.color,s.size)})
  } catch(_) {}
})()

// URL 直连
const urlRoom = new URLSearchParams(location.search).get('room')
const urlHost = new URLSearchParams(location.search).get('host')
if (urlRoom) {
  room = urlRoom.toUpperCase()
  createInput.value = room
  const h = urlHost || location.hostname
  hostInput.value = h
  connectWS(h).then((ok) => { if (ok) done(); else done() })
}
