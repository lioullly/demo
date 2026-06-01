/**
 * H5 客户端 — 大厅选房(含IP/扫描) + 双面板手写
 */

const WS_PORT = 3000
let USER_ID = `u_${Date.now().toString(36)}`
let userName = ''
// Multi-page system
const PAGE_SIZES = { A4: { w: 595, h: 842 }, A5: { w: 420, h: 595 }, Letter: { w: 612, h: 792 }, Square: { w: 600, h: 600 }, Auto: null }
let pages = [{ id: 'page_1', name: 'Page 1', size: 'A4', strokes: new Map() }]
let currentPage = 0
function getPageId() { return pages[currentPage]?.id || 'page_1' }
function getStrokes() { return pages[currentPage]?.strokes || pages[0].strokes }
function getPageSize() { const s = pages[currentPage]?.size || 'A4'; return PAGE_SIZES[s] || PAGE_SIZES.Auto }

function $(id) { return document.getElementById(id) }
function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2,8)}` }
function genRoom() { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<6;i++)s+=c[Math.floor(Math.random()*c.length)];return s }
function escHtml(s) { const d=document.createElement('div');d.textContent=s;return d.innerHTML }
function setNick(name) { userName = name; USER_ID = `u_${name}_${Date.now().toString(36)}`; const b=$('user-badge');if(b)b.textContent=name }

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

async function doScan() {
  btnScan.textContent = '...'; btnScan.disabled = true; lobbyMsg.textContent = '扫描中...'
  const subs = ['192.168.1','192.168.0','192.168.2','192.168.31','192.168.50','10.0.0']
  const host = location.hostname
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    const parts = host.split('.')
    if (parts.length === 4) { const s = parts.slice(0,3).join('.'); if (!subs.includes(s)) subs.unshift(s) }
  }
  let found = null
  for (const sub of subs) {
    const batch = []
    for (let i = 1; i <= 20; i++) {
      const ip = `${sub}.${i}`
      batch.push(fetch(`http://${ip}:${WS_PORT}/api/status`,{signal:AbortSignal.timeout(600)}).then(r=>r.json()).then(d=>{
        if (d.name==='handwriting-sync' && !found) { found = { ip, rooms: d.rooms || [] } }
      }).catch(()=>{}))
    }
    await Promise.all(batch)
    if (found) break
  }
  btnScan.textContent = '扫描'; btnScan.disabled = false
  if (found) {
    hostInput.value = found.ip
    if (found.rooms.length > 0) {
      const list = found.rooms.map(r => `${r.room} (${r.clients}人)`).join(', ')
      lobbyMsg.textContent = `主机 ${found.ip} | 房间: ${list}`
      // 自动填入第一个房间
      if (isCreate) createInput.value = found.rooms[0].room
      else joinInput.value = found.rooms[0].room
    } else {
      lobbyMsg.textContent = `主机 ${found.ip} | 暂无房间`
    }
  } else {
    lobbyMsg.textContent = '未发现主机'
  }
}

btnScan.onclick = doScan

btnConnectLobby.onclick = async () => {
  const host = hostInput.value.trim()
  if (!host) { lobbyMsg.textContent = '请输入主机地址'; return }
  if (!getRoom()) { lobbyMsg.textContent = '请输入房间码'; return }
  room = getRoom()
  const nickInput = $('nickname-input')
  setNick((nickInput?.value?.trim()) || ('User' + Math.random().toString(36).slice(2,5)))
  const ok = await connectWS(host)
  if (ok) done(host)
  else lobbyMsg.textContent = 'Cannot connect to host'
}

btnEnter.onclick = async () => {
  room = getRoom()
  if (room.length < 4) { lobbyMsg.textContent = 'Room code needs 4+ chars'; return }
  const nickInput = $('nickname-input')
  setNick((nickInput?.value?.trim()) || ('User' + Math.random().toString(36).slice(2,5)))
  const host = hostInput.value.trim() || location.hostname
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    const ok = await connectWS(host)
    if (ok) { done(host); return }
  }
  done(hostInput.value.trim() || location.hostname)
}

function done(host) {
  lobby.style.display = 'none'
  canvasView.classList.add('show')
  roomBadge.textContent = `Room: ${room}`

  const doShare = () => {
    const h = connectedHost || host || location.hostname
    const text = `http://${h}:${WS_PORT}?room=${room}`
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px'
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999)
    document.execCommand('copy'); document.body.removeChild(ta)
    const btn = document.getElementById('btn-share')
    if (btn) { btn.innerText = '已复制'; btn.style.background = '#22c55e'; btn.style.color = '#fff' }
    setTimeout(() => {
      if (btn) { btn.innerText = '分享'; btn.style.background = ''; btn.style.color = '' }
    }, 2000)
  }
  roomBadge.onclick = doShare
  const sb = document.getElementById('btn-share')
  if (sb) sb.onclick = doShare
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

  const bp = $('btn-pen'), be = $('btn-eraser'), cp = $('color-picker'), ss = $('size-slider')
  const em = $('eraser-mode')
  if (bp) bp.onclick = () => { tool='pen'; bp.className='on'; if(be)be.className='';cv.mine.fg.className='cross';if(em)em.style.display='none' }
  if (be) be.onclick = () => { tool='eraser'; be.className='on'; if(bp)bp.className='';cv.mine.fg.className='';if(em)em.style.display='inline' }
  if (cp) cp.oninput = (e) => { color = e.target.value }
  if (ss) ss.oninput = (e) => { size = +e.target.value }

  // Add block menu
  const menu = document.querySelector('.add-block-menu')
  const addBtn = $('btn-add-block')
  if (addBtn) addBtn.onclick = () => { if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none' }
  if (menu) menu.querySelectorAll('div').forEach((el) => {
    el.onclick = () => {
      menu.style.display = 'none'
      const type = el.dataset.type
      if (type === 'img') {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'
        inp.onchange = () => {
          if (!inp.files[0]) return
          const file = inp.files[0]
          if (file.size > 10 * 1024 * 1024) { alert('Image too large (>10MB). Please use a smaller image.'); return }
          const reader = new FileReader()
          reader.onload = () => {
            const img = new Image(); img.src = reader.result
            img.onload = () => {
              // Compress: max 800px, JPEG quality 0.6
              const MAX_W = 800
              let w = img.width, h = img.height
              if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W }
              const c = document.createElement('canvas'); c.width = w; c.height = h
              const ctx = c.getContext('2d')
              ctx.drawImage(img, 0, 0, w, h)
              const compressed = c.toDataURL('image/jpeg', 0.6)
              addBlock(type, { src: compressed, alt: file.name, width: w, height: h })
            }
          }
          reader.readAsDataURL(file)
        }
        inp.click()
      } else {
        addBlock(type, type.startsWith('h') ? { level: parseInt(type[1]), text: '' } : type === 'todo' ? { text: '', checked: false } : { text: '' })
      }
    }
  })
  const vBoth = $('btn-view-both'), vMine = $('btn-view-mine'), pp = $('panel-peer')
  if (vBoth) vBoth.onclick = () => { if(pp)pp.style.display='';resize();vBoth.className='on';if(vMine)vMine.className='' }
  if (vMine) vMine.onclick = () => { if(pp)pp.style.display='none';resize();vMine.className='on';if(vBoth)vBoth.className='' }
  if ($('btn-export')) $('btn-export').onclick = exportNotes
  if ($('text-send')) $('text-send').onclick = sendText
  if ($('text-cancel')) $('text-cancel').onclick = () => { const ti=$('text-input'); if(ti)ti.value=''; const to=$('text-overlay'); if(to)to.classList.remove('show') }

  // Page management
  const updatePageIndicator = () => {
    const ind = $('page-indicator'); if (ind) ind.textContent = `${currentPage+1}/${pages.length}`
    const ps = $('page-size-sel'); if (ps) ps.value = pages[currentPage]?.size || 'A4'
  }
  const goToPage = (idx) => {
    if (idx < 0 || idx >= pages.length) return
    currentPage = idx
    updatePageIndicator()
    // Clear and reload canvas for this page
    const ctx = cv.mine.ctxBg
    if (ctx) { ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.mine.bg.width,cv.mine.bg.height); ctx.restore() }
    if (ctx) getStrokes().forEach((s) => draw(ctx, s.points, s.color, s.size))
    resize()
  }
  const addPage = () => {
    const idx = pages.length
    pages.push({ id: `page_${idx+1}`, name: `Page ${idx+1}`, size: pages[currentPage]?.size || 'A4', strokes: new Map() })
    currentPage = idx
    updatePageIndicator()
    const ctx = cv.mine.ctxBg
    if (ctx) { ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.mine.bg.width,cv.mine.bg.height); ctx.restore() }
    resize()
  }
  const bpPage = $('btn-prev-page'), bnPage = $('btn-next-page'), baPage = $('btn-add-page'), psSel = $('page-size-sel')
  if (bpPage) bpPage.onclick = () => goToPage(currentPage - 1)
  if (bnPage) bnPage.onclick = () => goToPage(currentPage + 1)
  if (baPage) baPage.onclick = addPage
  if (psSel) psSel.onchange = () => {
    pages[currentPage].size = psSel.value
    resize()
  }
  updatePageIndicator()

  // 重连按钮
  const btnReconnect = $('btn-reconnect')
  btnReconnect.onclick = async () => {
    btnReconnect.textContent = '...'; btnReconnect.disabled = true
    const host = connectedHost || hostInput.value.trim() || location.hostname
    const ok = await connectWS(host)
    btnReconnect.textContent = '重连'; btnReconnect.disabled = false
    if (!ok) {
      statusDot.textContent = '重连失败'; statusDot.className = 'status-wait'
    }
  }

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
    if (msg.type === 'sync') {
      // 服务器发来的历史笔画，批量回放
      for (const raw of msg.history) {
        try {
          const m = JSON.parse(raw)
          if (m.type === 'stroke') {
            strokes.peer.set(m.id, m.payload)
            draw(cv.peer.ctxBg, m.payload.points, m.payload.color, m.payload.width || m.payload.size)
          } else if (m.type === 'erase') {
            m.payload.strokeIds.forEach((id) => strokes.peer.delete(id))
          } else if (m.type === 'text') {
            const ctx = cv.peer.ctxBg
            ctx.save(); ctx.font = '16px system-ui'; ctx.fillStyle = '#1a1a1a'; ctx.fillText(m.payload.content, m.payload.x, m.payload.y); ctx.restore()
          }
        } catch (_) {}
      }
      redrawBoard('peer')
      return
    }
    if (msg.type === 'stroke') {
      strokes.peer.set(msg.id, msg.payload)
      draw(cv.peer.ctxBg, msg.payload.points, msg.payload.color, msg.payload.width || msg.payload.size)
    } else if (msg.type === 'erase') {
      msg.payload.strokeIds.forEach((id) => strokes.peer.delete(id))
      redrawBoard('peer')
    } else if (msg.type === 'text') {
      const ctx = cv.peer.ctxBg
      ctx.save(); ctx.font = '16px system-ui'; ctx.fillStyle = '#1a1a1a'; ctx.fillText(msg.payload.content, msg.payload.x, msg.payload.y); ctx.restore()
    } else if (['p','h1','h2','h3','todo','img'].includes(msg.type)) {
      handleBlockMsg(msg)
    }
  } catch (_) {}
}
if (ws) ws.onmessage = handleWS

function resize() {
  for (const k of ['mine', 'peer']) {
    const wrap = document.getElementById(`wrap-${k}`)
    if (!wrap) continue
    const dpr = devicePixelRatio || 1
    let w = wrap.clientWidth, h = wrap.clientHeight
    const ps = getPageSize()
    if (ps) {
      // Fixed page size: constrain aspect ratio and center
      const ratio = ps.w / ps.h
      if (w / h > ratio) w = h * ratio
      else h = w / ratio
      // Scale down to 85% of container for visible margin
      const scale = Math.min((wrap.clientWidth * 0.85) / w, (wrap.clientHeight * 0.85) / h, 1)
      w = Math.floor(w * scale); h = Math.floor(h * scale)
      wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.justifyContent = 'center'
    } else {
      wrap.style.display = ''; wrap.style.alignItems = ''; wrap.style.justifyContent = ''
    }
    for (const layer of ['bg', 'fg']) {
      const c = cv[k][layer]
      c.width = w * dpr; c.height = h * dpr
      c.style.width = w + 'px'; c.style.height = h + 'px'
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    redrawBoard(k)
  }
}

// 旋转防抖
let resizeTimer = 0
window.addEventListener('orientationchange', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(resize, 300)
})

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
    try { fg.setPointerCapture(e.pointerId) } catch (_) {}
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
      const msg = { id, type:'stroke', payload:{ points: [...points], color, size }, pageId:getPageId(), userId:USER_ID, userName, ts:Date.now(), source:USER_ID }
      draw(ctxBg, points, color, size); getStrokes().set(id, { points: [...points], color, size }); sendWS(msg); saveStroke(id, [...points], color, size)
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
  const store = board === 'mine' ? getStrokes() : strokes.peer
  const mode = ($('eraser-mode')?.value) || 'point'
  const hit = []

  if (mode === 'stroke') {
    // Stroke erase: remove the first stroke that contains this point
    for (const [id, s] of store) {
      if (s.points.some((q) => (q.x-p.x)**2 + (q.y-p.y)**2 < 144)) {
        hit.push(id); break // Only erase one stroke per touch
      }
    }
  } else {
    // Point erase: remove all strokes touched by the eraser radius
    store.forEach((s, id) => { if (s.points.some((q) => (q.x-p.x)**2 + (q.y-p.y)**2 < 144)) hit.push(id) })
  }

  if (hit.length) {
    hit.forEach((id) => { store.delete(id); if (board==='mine') deleteStroke(id) })
    sendWS({ type:'erase', payload:{ strokeIds:hit }, pageId:getPageId(), userId:USER_ID, userName, id:uid(), ts:Date.now(), source:USER_ID })
    redrawBoard(board)
  }
}

function redrawBoard(board) {
  const ctx = cv[board].ctxBg
  const c = cv[board].bg
  const dpr = window.devicePixelRatio || 1
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  strokes[board].forEach((s) => draw(ctx, s.points, s.color, s.size))
  ctx.restore()
}

function sendText() {
  const txt = $('text-input').value.trim()
  if (!txt) return
  const msg = { id:uid(), type:'text', payload:{ content:txt, x:100, y:100 }, pageId:getPageId(), userId:USER_ID, ts:Date.now(), source:USER_ID }
  sendWS(msg)
  const ctx = cv.mine.ctxBg; ctx.save(); ctx.font = '16px system-ui'; ctx.fillStyle = '#1a1a1a'; ctx.fillText(txt, 100, 100); ctx.restore()
  $('text-input').value = ''; $('text-overlay').classList.remove('show')
}

function sendWS(msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) }

/* ── IndexedDB (singleton) ── */
let _idb = null, _idbPromise = null
function idb() {
  if (_idb) return Promise.resolve(_idb)
  if (!_idbPromise) {
    _idbPromise = new Promise((ok,no)=>{
      const r=indexedDB.open('handwriting_sync',3)
      r.onupgradeneeded=()=>{
        const d=r.result
        if(!d.objectStoreNames.contains('strokes'))d.createObjectStore('strokes',{keyPath:'id'})
        if(!d.objectStoreNames.contains('texts'))d.createObjectStore('texts',{keyPath:'id'})
      }
      r.onsuccess=()=>{_idb=r.result;ok(_idb)}
      r.onerror=()=>no(r.error)
    })
  }
  return _idbPromise
}
async function saveStroke(id, pts, c, s) { try { const d=await idb();d.transaction('strokes','readwrite').objectStore('strokes').put({id,pageId:getPageId(),userId:USER_ID,points:pts,color:c,size:s,ts:Date.now()}) } catch(_) {} }
async function deleteStroke(id) { try { const d=await idb();d.transaction('strokes','readwrite').objectStore('strokes').delete(id) } catch(_) {} }
async function saveTextBlock(id, content, x, y) { try { const d=await idb();d.transaction('texts','readwrite').objectStore('texts').put({id,pageId:getPageId(),userId:USER_ID,content,x,y,ts:Date.now()}) } catch(_) {} }

// Load saved strokes on startup
idb().then((d) => {
  const req = d.transaction('strokes','readonly').objectStore('strokes').getAll()
  req.onsuccess = () => req.result.sort((a,b)=>a.ts-b.ts).forEach((s)=>{getStrokes().set(s.id,s);if(cv.mine.ctxBg)draw(cv.mine.ctxBg,s.points,s.color,s.size)})
}).catch(()=>{})

/* ── connectWS race fix ── */
let _connectId = 0
function connectWS(host) {
  const cid = ++_connectId
  return new Promise((resolve) => {
    if (ws) { try { ws.close() } catch(_) {}; ws = null }
    if (!room) { resolve(false); return }
    const url = `ws://${host}:${WS_PORT}?room=${encodeURIComponent(room)}`
    lobbyMsg.textContent = 'Connecting...'
    ws = new WebSocket(url)
    let settled = false
    ws.onopen = () => {
      if (settled || cid !== _connectId) return
      settled = true; connectedHost = host; resolve(true)
      lobbyMsg.textContent = 'Connected'
      if (statusDot) { statusDot.textContent = 'Connected'; statusDot.className = 'status-ok'; const rb=$('btn-reconnect');if(rb)rb.style.display='none' }
    }
    ws.onerror = () => {
      if (settled) return
      settled = true; ws = null; resolve(false)
      lobbyMsg.textContent = 'Connection failed'
      if (statusDot) { statusDot.textContent = 'Disconnected'; statusDot.className = 'status-wait'; const rb=$('btn-reconnect');if(rb)rb.style.display='' }
    }
    ws.onclose = () => {
      if (settled) return
      ws = null
      if (statusDot) { statusDot.textContent = 'Disconnected'; statusDot.className = 'status-wait'; const rb=$('btn-reconnect');if(rb)rb.style.display='' }
    }
    ws.onmessage = handleWS
    setTimeout(() => {
      if (!settled && cid === _connectId) { settled = true; ws = null; resolve(false); lobbyMsg.textContent = 'Timed out' }
    }, 5000)
  })
}

// URL 直连
const urlRoom = new URLSearchParams(location.search).get('room')
const urlHost = new URLSearchParams(location.search).get('host')
if (urlRoom) {
  room = urlRoom.toUpperCase()
  createInput.value = room
  const h = urlHost || location.hostname
  hostInput.value = h
  connectWS(h).then((ok) => { if (ok) done(h); else done(h) })
}

/* ── 导出 ── */
function exportNotes() {
  const btn = $('btn-export')
  if (!btn) return
  btn.textContent = '...'; btn.disabled = true

  const fmt = confirm('导出格式:\n确定=PNG (图片)\n取消=SVG (矢量)')
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const boards = ['mine', 'peer']
  const names = ['我的笔记', '朋友的笔记']

  boards.forEach((k, idx) => {
    const canvas = document.createElement('canvas')
    const dpr = devicePixelRatio || 1
    const size = 2400 // export resolution width
    canvas.width = size
    canvas.height = size * 1.4
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#faf8f0'
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)

    // 重绘大分辨率
    strokes[k].forEach((s) => {
      ctx.save()
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      const scale = size / (cv[k].bg.width / (window.devicePixelRatio || 1))
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.size * scale / (dpr || 1)
      ctx.globalAlpha = 0.95
      ctx.beginPath()
      if (s.points.length > 0) {
        ctx.moveTo(s.points[0].x * scale / (dpr || 1), s.points[0].y * scale / (dpr || 1))
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x * scale / (dpr || 1), s.points[i].y * scale / (dpr || 1))
        }
      }
      ctx.stroke(); ctx.restore()
    })

    if (fmt) {
      // PNG
      canvas.toBlob((blob) => {
        const a = document.createElement('a')
        a.download = `${names[idx]}_${ts}.png`
        a.href = URL.createObjectURL(blob)
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      })
    } else {
      // SVG export with proper coordinate scaling
      const exportScale = size / (cv[k].bg.width / (window.devicePixelRatio || 1))
      const svgSize = size * 1.4
      let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+svgSize+' '+svgSize+'" width="'+svgSize+'" height="'+svgSize+'">'
      svg += '<rect width="'+svgSize+'" height="'+svgSize+'" fill="#faf8f0"/>'
      strokes[k].forEach((s) => {
        const pts = s.points.map((p) => `${p.x*exportScale/(dpr||1)},${p.y*exportScale/(dpr||1)}`).join(' ')
        svg += '<path d="M'+pts+'" stroke="'+escHtml(s.color)+'" stroke-width="'+(s.size*exportScale/(dpr||1))+
          '" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>'
      })
      svg += '</svg>'
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const a = document.createElement('a')
      a.download = `${names[idx]}_${ts}.svg`
      a.href = URL.createObjectURL(blob)
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }
  })

  btn.textContent = '导出'; btn.disabled = false
}

/* ── 块操作 ── */
function sendBlockUpdate(id, text, checked) {
  sendWS({ type:'block_update', blockId:id, payload:{ text, checked }, pageId:getPageId(), userId:USER_ID, id:uid(), ts:Date.now(), source:USER_ID })
}

function addDragHandles(div, id, type, readOnly) {
  if (readOnly) return
  // Top drag bar: long dashed line with white center for grab
  const bar = document.createElement('div')
  bar.style.cssText = 'height:10px;cursor:grab;position:relative;margin:-2px 0 2px 0;touch-action:none'
  bar.innerHTML = '<div style="border-top:1px dashed #93c5fd;position:absolute;top:4px;left:4px;right:4px"></div><div style="background:#eff6ff;width:40px;height:6px;border-radius:3px;position:absolute;top:2px;left:50%;transform:translateX(-50%);border:1px solid #93c5fd"></div>'
  let startX, startY, origLeft, origTop
  bar.onpointerdown = (e) => {
    e.stopPropagation(); e.preventDefault(); bar.setPointerCapture(e.pointerId)
    startX = e.clientX; startY = e.clientY
    origLeft = parseFloat(div.style.left) || 0; origTop = parseFloat(div.style.top) || 0
    div.style.position = 'relative'
    const move = (ev) => { div.style.left = (origLeft + ev.clientX - startX) + 'px'; div.style.top = (origTop + ev.clientY - startY) + 'px' }
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); bar.releasePointerCapture(e.pointerId) }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }
  div.appendChild(bar)

  // Corner resize handle (bottom-right)
  const resizer = document.createElement('div')
  resizer.style.cssText = 'position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,#c0c0c0 50%,#c0c0c0 55%,transparent 55%,transparent 75%,#c0c0c0 75%)'
  let rsX, rsY, rsW, rsH
  resizer.onpointerdown = (e) => {
    e.stopPropagation(); e.preventDefault(); resizer.setPointerCapture(e.pointerId)
    rsX = e.clientX; rsY = e.clientY
    rsW = div.offsetWidth; rsH = div.offsetHeight
    const move = (ev) => {
      const nw = Math.max(120, rsW + ev.clientX - rsX)
      const nh = Math.max(40, rsH + ev.clientY - rsY)
      div.style.width = nw + 'px'
      div.style.minHeight = nh + 'px'
      // Scale font with width: bigger box = bigger text
      const scale = Math.min(2, Math.max(0.6, nw / 300))
      const inputs = div.querySelectorAll('input,textarea')
      inputs.forEach((inp) => {
        const base = type === 'h' ? (28 - (parseInt(type[1]) || 1) * 4) : 14
        inp.style.fontSize = Math.round(base * scale) + 'px'
      })
    }
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up) }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }
  div.appendChild(resizer)

  // Delete button (top-right)
  const del = document.createElement('button'); del.textContent = 'x'
  del.style.cssText = 'position:absolute;top:-4px;right:-4px;background:#fff;color:#999;border:1px solid #93c5fd;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;z-index:2;line-height:1'
  del.onclick = (e) => { e.stopPropagation(); div.remove(); sendWS({ type:'block_delete', blockId:id, pageId:getPageId(), userId:USER_ID, id:uid(), ts:Date.now(), source:USER_ID }) }
  div.appendChild(del)
}

function makeBlock(id, type, payload, readOnly) {
  const div = document.createElement('div')
  div.className = 'block-item'; div.dataset.blockId = id; div.dataset.blockType = type
  div.style.cssText = 'padding:8px 12px;margin:8px 4px;background:#fff;border-radius:4px;border:1.5px dashed #93c5fd;position:relative;pointer-events:auto;touch-action:manipulation;min-width:120px;min-height:40px;overflow:visible'

  addDragHandles(div, id, type, readOnly)

  const inner = document.createElement('div')
  inner.style.cssText = 'display:flex;align-items:flex-start;gap:6px'

  if (type === 'img') {
    const img = document.createElement('img')
    img.src = payload.src; img.style.maxWidth = '100%'; img.style.maxHeight = '300px'; img.style.borderRadius = '4px'
    inner.appendChild(img)
    div.appendChild(inner)
    return div
  }

  if (type === 'todo') {
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = payload.checked || false
    cb.style.cssText = 'width:18px;height:18px;flex-shrink:0;margin-top:2px'
    if (!readOnly) cb.onchange = () => sendBlockUpdate(id, null, cb.checked)
    inner.appendChild(cb)
  }

  const fontSizeMap = { h1: 28, h2: 24, h3: 20, h4: 18, p: 14, todo: 14 }
  const fs = fontSizeMap[type] || 14

  let input
  if (type === 'p') {
    input = document.createElement('textarea')
    input.setAttribute('inputmode', 'text'); input.rows = 1
    input.style.cssText = 'flex:1;border:none;outline:none;background:transparent;font-family:inherit;padding:2px 0;pointer-events:auto;font-size:' + fs + 'px;resize:none;overflow:hidden;min-height:24px'
    input.placeholder = 'Type here...'; input.value = payload.text || ''
    input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.max(24, input.scrollHeight) + 'px' }
    setTimeout(() => { input.style.height = 'auto'; input.style.height = Math.max(24, input.scrollHeight) + 'px' }, 10)
  } else {
    input = document.createElement('input')
    input.type = 'text'; input.setAttribute('inputmode', 'text')
    input.style.cssText = 'flex:1;border:none;outline:none;background:transparent;font-family:inherit;padding:2px 0;pointer-events:auto;font-size:' + fs + 'px'
    if (type.startsWith('h')) { input.style.fontWeight = 'bold'; input.placeholder = 'Heading ' + (parseInt(type[1]) || 1) }
    else { input.placeholder = 'Type...' }
    input.value = payload.text || ''
  }
  if (input) {
    input.readOnly = !!readOnly
    if (!readOnly) {
      let debounce
      const sendUpdate = () => { clearTimeout(debounce); debounce = setTimeout(() => sendBlockUpdate(id, input.value, type==='todo' ? inner.querySelector('input[type=checkbox]')?.checked : undefined), 300) }
      input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.max(24, input.scrollHeight) + 'px'; sendUpdate() }
      input.onblur = () => { clearTimeout(debounce); sendBlockUpdate(id, input.value, type==='todo' ? inner.querySelector('input[type=checkbox]')?.checked : undefined) }
    }
    inner.appendChild(input)
  }
  div.appendChild(inner)
  return div
}

function addBlock(type, payload) {
  const id = uid()
  const msg = { id, type:'block_add', blockType:type, payload, pageId:getPageId(), userId:USER_ID, userName, ts:Date.now(), source:USER_ID }
  sendWS(msg)
  const wrap = document.getElementById('wrap-mine')
  if (!wrap) return
  const el = makeBlock(id, type, payload, false)
  wrap.insertBefore(el, wrap.firstChild)
}

function handleBlockMsg(msg) {
  const wrap = document.getElementById('wrap-peer')
  if (!wrap) return
  if (msg.type === 'block_add') {
    if (msg.source === USER_ID) return
    const el = makeBlock(msg.id, msg.blockType, msg.payload, true)
    const label = document.createElement('small')
    label.textContent = ' - ' + (msg.userName || msg.userId)
    label.style.fontSize = '10px'; label.style.color = '#888'; label.style.alignSelf = 'center'
    el.appendChild(label)
    wrap.insertBefore(el, wrap.firstChild)
  } else if (msg.type === 'block_update') {
    const existing = wrap.querySelector('[data-block-id="'+msg.blockId+'"]')
    if (existing) {
      const input = existing.querySelector('input[type="text"],textarea')
      if (input && msg.payload.text !== undefined) input.value = msg.payload.text
      const cb = existing.querySelector('input[type="checkbox"]')
      if (cb && msg.payload.checked !== undefined) cb.checked = msg.payload.checked
    }
  } else if (msg.type === 'block_delete') {
    const el = wrap.querySelector('[data-block-id="'+msg.blockId+'"]')
    if (el) el.remove()
  }
}


/* ── 触摸手势 (双指缩放/平移) ── */
// Zoom: use browser native pinch zoom (enabled in viewport meta)
// Reset zoom with double-tap
document.getElementById('wrap-mine')?.addEventListener('dblclick', () => {
  document.body.style.zoom = ''
})
