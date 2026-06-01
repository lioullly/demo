/**
 * H5 客户端 — 大厅选房(含IP/扫描) + 双面板手写
 */

const WS_PORT = 3000
const PAGE_ID = 'page_default'
let USER_ID = `u_${Date.now().toString(36)}`
let userName = ''

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

function connectWS(host) {
  return new Promise((resolve, reject) => {
    if (ws) { ws.close(); ws = null }
    if (!room) { reject('no room'); return }
    const url = `ws://${host}:${WS_PORT}?room=${encodeURIComponent(room)}`
    lobbyMsg.textContent = '连接中...'
    ws = new WebSocket(url)
    ws.onopen = () => {
      lobbyMsg.textContent = '已连接'; connectedHost = host; resolve(true)
      if (statusDot) { statusDot.textContent = '已连接'; statusDot.className = 'status-ok'; $('btn-reconnect').style.display = 'none' }
    }
    ws.onerror = () => {
      lobbyMsg.textContent = '连接失败'; ws = null; resolve(false)
      if (statusDot) { statusDot.textContent = '已断开'; statusDot.className = 'status-wait'; $('btn-reconnect').style.display = '' }
    }
    ws.onclose = () => {
      if (ws) { lobbyMsg.textContent = '已断开'; ws = null }
      if (statusDot) { statusDot.textContent = '已断开'; statusDot.className = 'status-wait'; $('btn-reconnect').style.display = '' }
    }
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
  if (bp) bp.onclick = () => { tool='pen'; bp.className='on'; if(be)be.className='';cv.mine.fg.className='cross' }
  if (be) be.onclick = () => { tool='eraser'; be.className='on'; if(bp)bp.className='';cv.mine.fg.className='' }
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
          const reader = new FileReader()
          reader.onload = () => {
            const img = new Image(); img.src = reader.result
            img.onload = () => addBlock(type, { src: reader.result, alt: inp.files[0].name, width: img.width, height: img.height })
          }
          reader.readAsDataURL(inp.files[0])
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
    const w = wrap.clientWidth, h = wrap.clientHeight
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
      const msg = { id, type:'stroke', payload:{ points: [...points], color, size }, pageId:PAGE_ID, userId:USER_ID, userName, ts:Date.now(), source:USER_ID }
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
    sendWS({ type:'erase', payload:{ strokeIds:hit }, pageId:PAGE_ID, userId:USER_ID, userName, id:uid(), ts:Date.now(), source:USER_ID })
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
  const msg = { id:uid(), type:'text', payload:{ content:txt, x:100, y:100 }, pageId:PAGE_ID, userId:USER_ID, ts:Date.now(), source:USER_ID }
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
async function saveStroke(id, pts, c, s) { try { const d=await idb();d.transaction('strokes','readwrite').objectStore('strokes').put({id,pageId:PAGE_ID,userId:USER_ID,points:pts,color:c,size:s,ts:Date.now()}) } catch(_) {} }
async function deleteStroke(id) { try { const d=await idb();d.transaction('strokes','readwrite').objectStore('strokes').delete(id) } catch(_) {} }
async function saveTextBlock(id, content, x, y) { try { const d=await idb();d.transaction('texts','readwrite').objectStore('texts').put({id,pageId:PAGE_ID,userId:USER_ID,content,x,y,ts:Date.now()}) } catch(_) {} }

// Load saved strokes on startup
idb().then((d) => {
  const req = d.transaction('strokes','readonly').objectStore('strokes').getAll()
  req.onsuccess = () => req.result.sort((a,b)=>a.ts-b.ts).forEach((s)=>{strokes.mine.set(s.id,s);if(cv.mine.ctxBg)draw(cv.mine.ctxBg,s.points,s.color,s.size)})
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
    ctx.fillStyle = '#ffffff'
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
      svg += '<rect width="'+svgSize+'" height="'+svgSize+'" fill="white"/>'
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
function addBlock(type, payload) {
  const id = uid()
  const msg = { id, type, payload, pageId: PAGE_ID, userId: USER_ID, userName, ts: Date.now(), source: USER_ID }
  sendWS(msg)
  // 本地渲染
  const wrap = document.getElementById('wrap-mine')
  if (!wrap) return
  if (type === 'img') {
    const img = document.createElement('img')
    img.src = payload.src; img.style.maxWidth = '100%'; img.style.maxHeight = '300px'; img.style.borderRadius = '6px'
    wrap.appendChild(img)
  } else {
    const div = document.createElement('div')
    div.style.padding = '8px 12px'; div.style.margin = '4px 0'; div.style.background = '#fff'; div.style.borderRadius = '6px'; div.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
    if (type.startsWith('h')) { const lvl = payload.level || 1; div.innerHTML = '<strong style="font-size:'+(28-lvl*4)+'px">'+escHtml(payload.text||'heading '+lvl)+'</strong>' }
    else if (type === 'todo') { div.innerHTML = '<input type="checkbox" '+(payload.checked?'checked':'')+'> '+escHtml(payload.text||'todo') }
    else { div.textContent = payload.text || '(text)' }
    wrap.insertBefore(div, wrap.firstChild)
  }
}

// Handle incoming block messages
function handleBlockMsg(msg) {
  if (msg.source === USER_ID) return
  const wrap = document.getElementById('wrap-peer')
  if (!wrap) return
  if (msg.type === 'img') {
    const img = document.createElement('img')
    img.src = msg.payload.src; img.style.maxWidth = '100%'; img.style.maxHeight = '300px'; img.style.borderRadius = '6px'
    wrap.insertBefore(img, wrap.firstChild)
  } else if (msg.type === 'p' || msg.type === 'todo' || msg.type?.startsWith('h')) {
    const div = document.createElement('div')
    div.style.padding = '8px 12px'; div.style.margin = '4px 0'; div.style.background = '#fff'; div.style.borderRadius = '6px'; div.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
    if (msg.type.startsWith('h')) { const lvl = msg.payload.level || 1; div.innerHTML = '<strong style="font-size:'+(28-lvl*4)+'px">'+escHtml(msg.payload.text||'h')+'</strong> - <small>'+escHtml(msg.userName||msg.userId)+'</small>' }
    else if (msg.type === 'todo') { div.innerHTML = '<input type="checkbox" '+(msg.payload.checked?'checked':'')+' disabled> '+escHtml(msg.payload.text||'') }
    else { div.textContent = (msg.payload.text||'') + ' - ' + (msg.userName||msg.userId) }
    wrap.insertBefore(div, wrap.firstChild)
  }
}


/* ── 触摸手势 (双指缩放/平移) ── */
;(function setupGestures() {
  let initDist = 0, initScale = 1, initX = 0, initY = 0, panX = 0, panY = 0
  const wrap = document.getElementById('wrap-mine')
  if (!wrap) return

  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      initDist = Math.hypot(dx, dy)
      initScale = parseFloat(wrap.style.transform?.match(/scale\(([\d.]+)\)/)?.[1] || 1)
      initX = panX; initY = panY
    }
  }, { passive: false })

  wrap.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const newScale = Math.min(3, Math.max(0.5, initScale * dist / initDist))
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      panX = initX + (midX - (initX ?? midX)); panY = initY + (midY - (initY ?? midY))
      wrap.style.transform = `translate(${panX}px,${panY}px) scale(${newScale})`
      wrap.style.transformOrigin = '0 0'
    }
  }, { passive: false })

  wrap.addEventListener('touchend', () => {
    initDist = 0
  })
})()

// Double tap to reset zoom
document.getElementById('wrap-mine')?.addEventListener('dblclick', () => {
  const wrap = document.getElementById('wrap-mine')
  if (wrap) wrap.style.transform = ''
})
