// Main entry point — imports and wires all modules
import { $, uid, genRoom, setNick, getUserName, room, setRoom, connectedHost, cv, strokes, pages, currentPage, getStrokes, getPageId, getPageSize, PAGE_SIZES, USER_ID, userName, escHtml } from './utils.js'
import { connectWS, sendWS, handleWS } from './sync.js'
import { addBlock, makeBlock, handleBlockMsg } from './blocks.js'

const WS_PORT = 3000
let isCreate = true, tool = 'pen', color = '#1a1a1a', size = 3, isDrawing = false, points = []

// ── Lobby ──
const createInput = $('create-room-code')
const joinInput = $('join-room-input')
const hostInput = $('host-addr')
const lobbyMsg = $('lobby-msg')

if (createInput) createInput.value = genRoom()
if ($('btn-random')) $('btn-random').onclick = () => { if (createInput) createInput.value = genRoom() }

$('tab-create').onclick = () => {
  isCreate = true
  $('tab-create').className = 'on'; $('tab-join').className = ''
  $('create-row').style.display = 'flex'; joinInput.style.display = 'none'
}
$('tab-join').onclick = () => {
  isCreate = false
  $('tab-join').className = 'on'; $('tab-create').className = ''
  $('create-row').style.display = 'none'; joinInput.style.display = 'block'; joinInput.focus()
}
if (joinInput) joinInput.oninput = () => {
  const v = joinInput.value.trim().toUpperCase(); setRoom(v)
  const be = $('btn-enter'); if (be) be.disabled = v.length < 4
}

function getRoom() { return isCreate ? createInput.value.trim().toUpperCase() || genRoom() : joinInput.value.trim().toUpperCase() }

async function doScan() {
  const btnScan = $('btn-scan')
  btnScan.textContent = '...'; btnScan.disabled = true; lobbyMsg.textContent = 'Scanning...'
  const subs = ['192.168.1','192.168.0','192.168.2','192.168.31','192.168.50','10.0.0']
  const h = location.hostname
  if (h && h !== 'localhost' && h !== '127.0.0.1') { const p=h.split('.'); if(p.length===4){const s=p.slice(0,3).join('.');if(!subs.includes(s))subs.unshift(s)} }
  let found = null
  for (const sub of subs) {
    const batch = []
    for (let i=1;i<=20;i++) { const ip=`${sub}.${i}`; batch.push(fetch(`http://${ip}:${WS_PORT}/api/status`,{signal:AbortSignal.timeout(600)}).then(r=>r.json()).then(d=>{if(d.name==='handwriting-sync'&&!found)found={ip,rooms:d.rooms||[]}}).catch(()=>{})) }
    await Promise.all(batch); if(found)break
  }
  btnScan.textContent='Scan'; btnScan.disabled=false
  if(found){hostInput.value=found.ip;const list=found.rooms.map(r=>`${r.room} (${r.clients})`).join(', ');lobbyMsg.textContent=`Host ${found.ip} | Rooms: ${list}`;if(isCreate)createInput.value=found.rooms[0]?.room||createInput.value;else joinInput.value=found.rooms[0]?.room||joinInput.value}
  else lobbyMsg.textContent='No host found'
}
$('btn-scan').onclick = doScan

$('btn-connect-lobby').onclick = async () => {
  const host = hostInput.value.trim()
  if(!host){lobbyMsg.textContent='Enter host IP';return}
  if(!getRoom()){lobbyMsg.textContent='Enter room code';return}
  setRoom(getRoom())
  const n=$('nickname-input'); setNick((n?.value?.trim())||('User'+Math.random().toString(36).slice(2,5)))
  const ok=await connectWS(host, room)
  if(ok)done(host); else lobbyMsg.textContent='Cannot connect'
}

$('btn-enter').onclick = async () => {
  const r = getRoom(); if(r.length<4){lobbyMsg.textContent='Room code needs 4+ chars';return}
  setRoom(r)
  const n=$('nickname-input'); setNick((n?.value?.trim())||('User'+Math.random().toString(36).slice(2,5)))
  const host=hostInput.value.trim()||location.hostname
  if(host&&host!=='localhost'&&host!=='127.0.0.1'){const ok=await connectWS(host,room);if(ok){done(host);return}}
  done(hostInput.value.trim()||location.hostname)
}

function done(host) {
  $('lobby').style.display='none'; $('canvas-view').classList.add('show')
  const rb=$('room-badge'); if(rb)rb.textContent=`Room: ${room}`
  const doShare = () => {
    const h=connectedHost||host||location.hostname
    const name=userName||$('nickname-input')?.value?.trim()||''
    const text=`http://${h}:${WS_PORT}?room=${room}${name?'&name='+encodeURIComponent(name):''}`
    const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;left:-9999px'
    document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,99999);document.execCommand('copy');document.body.removeChild(ta)
    const btn=document.getElementById('btn-share');if(btn){btn.innerText='Copied';btn.style.background='#22c55e';btn.style.color='#fff'}
    setTimeout(()=>{if(btn){btn.innerText='Share';btn.style.background='';btn.style.color=''}},2000)
  }
  rb.onclick=doShare; const sb=document.getElementById('btn-share');if(sb)sb.onclick=doShare
  setupCanvas()
}

// ── Canvas ──
const statusDot = $('status-dot')

function setupCanvas() {
  for(const k of['mine','peer']){cv[k].ctxBg=cv[k].bg.getContext('2d');cv[k].ctxFg=cv[k].fg.getContext('2d')}
  resize(); window.addEventListener('resize', resize)

  const bp=$('btn-pen'),be=$('btn-eraser'),cp=$('color-picker'),ss=$('size-slider'),em=$('eraser-mode')
  if(bp)bp.onclick=()=>{tool='pen';bp.className='on';if(be)be.className='';cv.mine.fg.className='cross';if(em)em.style.display='none'}
  if(be)be.onclick=()=>{tool='eraser';be.className='on';if(bp)bp.className='';cv.mine.fg.className='';if(em)em.style.display='inline'}
  if(cp)cp.oninput=(e)=>{color=e.target.value}
  if(ss)ss.oninput=(e)=>{size=+e.target.value}

  // Buttons
  const tb=$('btn-add-text'); if(tb)tb.onclick=()=>addBlock('p',{text:''})
  const ib=$('btn-add-image')
  if(ib)ib.onclick=()=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*'
    inp.onchange=()=>{
      if(!inp.files[0])return;const f=inp.files[0]
      if(f.size>10*1024*1024){alert('Too large');return}
      const r=new FileReader();r.onload=()=>{const img=new Image();img.src=r.result
        img.onload=()=>{let w=img.width,h=img.height;if(w>800){h=Math.round(h*800/w);w=800}
          const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h)
          addBlock('img',{src:c.toDataURL('image/jpeg',0.6),alt:f.name,width:w,height:h})}}
      r.readAsDataURL(f)};inp.click()
  }
  const vb=$('btn-view-both'),vm=$('btn-view-mine'),pp=$('panel-peer')
  if(vb)vb.onclick=()=>{if(pp)pp.style.display='';resize();vb.className='on';if(vm)vm.className=''}
  if(vm)vm.onclick=()=>{if(pp)pp.style.display='none';resize();vm.className='on';if(vb)vb.className=''}
  if($('btn-export'))$('btn-export').onclick=exportNotes

  // Save/Load
  const apiBase=()=>`http://${connectedHost||hostInput.value?.trim()||location.hostname}:${WS_PORT}`
  const sb=$('btn-save'),lb=$('btn-load')
  if(sb)sb.onclick=async()=>{sb.textContent='...';sb.disabled=true
    const s=[];getStrokes().forEach((v,k)=>s.push({id:k,points:v.points,color:v.color,size:v.size}))
    try{const r=await fetch(apiBase()+'/api/save',{method:'POST',body:JSON.stringify({room,data:s})});sb.textContent=r.ok?'Saved':'Fail'}
    catch(_){sb.textContent='Error'};setTimeout(()=>{sb.textContent='Save';sb.disabled=false},1500)}
  if(lb)lb.onclick=async()=>{lb.textContent='...';lb.disabled=true
    try{const r=await fetch(apiBase()+'/api/load?room='+encodeURIComponent(room))
      if(r.ok){const d=await r.json();d.data.forEach((s)=>{getStrokes().set(s.id,s);draw(cv.mine.ctxBg,s.points,s.color,s.size)});lb.textContent='Loaded'}
      else lb.textContent='None'}catch(_){lb.textContent='Error'}
    setTimeout(()=>{lb.textContent='Load';lb.disabled=false},1500)}

  // Pages
  const updatePage=()=>{
    const i=$('page-indicator');if(i)i.textContent=`${currentPage+1}/${pages.length}`
    const ps=$('page-size-sel');if(ps)ps.value=pages[currentPage]?.size||'A4'}
  window.goToPage=(idx)=>{
    if(idx<0||idx>=pages.length)return;currentPage=idx;updatePage()
    const ctx=cv.mine.ctxBg;if(ctx){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.mine.bg.width,cv.mine.bg.height);ctx.restore()}
    if(ctx)getStrokes().forEach((s)=>draw(ctx,s.points,s.color,s.size));resize()}
  const addPage=()=>{const i=pages.length;pages.push({id:`page_${i+1}`,name:`Page ${i+1}`,size:pages[currentPage]?.size||'A4',strokes:new Map()});currentPage=i;updatePage()
    const ctx=cv.mine.ctxBg;if(ctx){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.mine.bg.width,cv.mine.bg.height);ctx.restore()};resize()}
  const bpPage=$('btn-prev-page'),bnPage=$('btn-next-page'),baPage=$('btn-add-page'),psSel=$('page-size-sel')
  if(bpPage)bpPage.onclick=()=>goToPage(currentPage-1)
  if(bnPage)bnPage.onclick=()=>goToPage(currentPage+1)
  if(baPage)baPage.onclick=addPage
  if(psSel)psSel.onchange=()=>{pages[currentPage].size=psSel.value;resize()}
  updatePage()

  // Reconnect
  const br=$('btn-reconnect');if(br)br.onclick=async()=>{br.textContent='...';br.disabled=true
    const h=connectedHost||hostInput.value?.trim()||location.hostname
    const ok=await connectWS(h,room);br.textContent='Reconnect';br.disabled=false
    if(!ok&&statusDot){statusDot.textContent='Failed';statusDot.className='status-wait'}else if(ok&&statusDot){statusDot.textContent='Connected';statusDot.className='status-ok'}}

  setupPointer('mine');cv.peer.fg.style.pointerEvents='none'

  if(window.ws?.readyState===WebSocket.OPEN){statusDot.textContent='Connected';statusDot.className='status-ok';window.ws.onmessage=handleWS}
  else if(!window.ws){const h=hostInput.value||'localhost';connectWS(h,room).then(()=>{statusDot.textContent='Connected';statusDot.className='status-ok';window.ws.onmessage=handleWS}).catch(()=>{})}

  // Load saved strokes from IndexedDB
  import('./db.js').then((m)=>{m.loadStrokes((s)=>{getStrokes().set(s.id,s);if(cv.mine.ctxBg)m.drawStroke(cv.mine.ctxBg,s.points,s.color,s.size)})})
}

// ── Drawing ──
function draw(ctx,pts,c,s){if(pts.length<1)return;ctx.save();ctx.lineCap=ctx.lineJoin='round';ctx.strokeStyle=c;ctx.lineWidth=s;ctx.globalAlpha=0.95;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();ctx.restore()}

function eraseLocal(board,p){
  const store=board==='mine'?getStrokes():strokes.peer
  const mode=($('eraser-mode')?.value)||'point';const R=12;let changed=false
  if(mode==='stroke'){for(const[id,s]of store){if(s.points.some((q)=>(q.x-p.x)**2+(q.y-p.y)**2<R*R)){store.delete(id);if(board==='mine')import('./db.js').then((m)=>m.deleteStroke(id));sendWS({type:'erase',payload:{strokeIds:[id]},pageId:getPageId(),userId:USER_ID,userName,id:uid(),ts:Date.now(),source:USER_ID});changed=true;break}}}
  else{const td=[],tu=[]
    for(const[id,s]of store){const keep=s.points.filter((q)=>(q.x-p.x)**2+(q.y-p.y)**2>R*R);if(keep.length===s.points.length)continue;if(keep.length===0)td.push(id);else tu.push({id,pts:keep,color:s.color,size:s.size})}
    td.forEach((id)=>{store.delete(id);if(board==='mine')import('./db.js').then((m)=>m.deleteStroke(id))})
    tu.forEach((u)=>{store.set(u.id,{points:u.pts,color:u.color,size:u.size});if(board==='mine')import('./db.js').then((m)=>m.saveStroke(u.id,u.pts,u.color,u.size))})
    if(td.length||tu.length){changed=true;sendWS({type:'erase_point',payload:{point:p,radius:R,strokes:tu},pageId:getPageId(),userId:USER_ID,userName,id:uid(),ts:Date.now(),source:USER_ID})}}
  if(changed){const ctx=cv[board].ctxBg;const c=cv[board].bg;const dpr=window.devicePixelRatio||1;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);ctx.setTransform(dpr,0,0,dpr,0,0);store.forEach((s)=>draw(ctx,s.points,s.color,s.size));ctx.restore()}
}

function redrawBoard(board){const ctx=cv[board].ctxBg;const c=cv[board].bg;const dpr=window.devicePixelRatio||1;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);ctx.setTransform(dpr,0,0,dpr,0,0);strokes[board].forEach((s)=>draw(ctx,s.points,s.color,s.size));ctx.restore()}

function pt(e,board){const r=cv[board].fg.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top,pressure:e.pressure||0.5}}

function setupPointer(board){
  const{fg,ctxFg,ctxBg}=cv[board]
  fg.onpointerdown=(e)=>{if(e.pointerType==='touch'&&e.pressure===0)return;if(board==='peer')return;e.preventDefault();isDrawing=true;points=[pt(e,board)];try{fg.setPointerCapture(e.pointerId)}catch(_){};if(tool==='pen')ctxFg.clearRect(0,0,fg.width,fg.height)}
  fg.onpointermove=(e)=>{if(!isDrawing||board==='peer')return;e.preventDefault();const cs=e.getCoalescedEvents?.()||[e];cs.forEach((ce)=>points.push(pt(ce,board)));if(tool==='pen'){ctxFg.clearRect(0,0,fg.width,fg.height);draw(ctxFg,points,color,size)}else if(tool==='eraser')eraseLocal(board,pt(e,board))}
  fg.onpointerup=()=>{if(!isDrawing||board==='peer')return;isDrawing=false;if(tool==='pen'&&points.length>0){const id=uid();const msg={id,type:'stroke',payload:{points:[...points],color,size},pageId:getPageId(),userId:USER_ID,userName,ts:Date.now(),source:USER_ID};draw(ctxBg,points,color,size);getStrokes().set(id,{points:[...points],color,size});sendWS(msg);import('./db.js').then((m)=>m.saveStroke(id,[...points],color,size));ctxFg.clearRect(0,0,fg.width,fg.height)};points=[]}
  fg.onpointercancel=()=>{isDrawing=false;points=[];ctxFg.clearRect(0,0,fg.width,fg.height)}
}

function resize(){
  for(const k of['mine','peer']){const wrap=document.getElementById(`wrap-${k}`);if(!wrap)continue;const dpr=devicePixelRatio||1;let w=wrap.clientWidth,h=wrap.clientHeight
    const ps=getPageSize();if(ps){const ratio=ps.w/ps.h;if(w/h>ratio)w=h*ratio;else h=w/ratio;const s=Math.min((wrap.clientWidth*.85)/w,(wrap.clientHeight*.85)/h,1);w=Math.floor(w*s);h=Math.floor(h*s);wrap.style.display='flex';wrap.style.alignItems='center';wrap.style.justifyContent='center'}
    else{wrap.style.display='';wrap.style.alignItems='';wrap.style.justifyContent=''}
    for(const layer of['bg','fg']){const c=cv[k][layer];c.width=w*dpr;c.height=h*dpr;c.style.width=w+'px';c.style.height=h+'px';c.getContext('2d').setTransform(dpr,0,0,dpr,0,0)}
    redrawBoard(k)}
}
let rt=0;window.addEventListener('orientationchange',()=>{clearTimeout(rt);rt=setTimeout(resize,300)})

// Export
function exportNotes(){
  const btn=$('btn-export');if(!btn)return;btn.textContent='...';btn.disabled=true
  const fmt=confirm('PNG=OK, SVG=Cancel');const ts=new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')
  const boards=['mine','peer'];const names=['My Notes','Friend Notes']
  boards.forEach((k,idx)=>{const can=document.createElement('canvas');const dpr=devicePixelRatio||1;const sz=2400;can.width=sz;can.height=sz*1.4
    const ctx=can.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#faf8f0';ctx.fillRect(0,0,can.width/dpr,can.height/dpr)
    const store=k==='mine'?getStrokes():strokes.peer
    store.forEach((s)=>{ctx.save();ctx.lineCap=ctx.lineJoin='round';const sc=sz/(cv[k].bg.width/dpr);ctx.strokeStyle=s.color;ctx.lineWidth=s.size*sc/dpr;ctx.globalAlpha=0.95;ctx.beginPath();if(s.points.length>0){ctx.moveTo(s.points[0].x*sc/dpr,s.points[0].y*sc/dpr);for(let i=1;i<s.points.length;i++)ctx.lineTo(s.points[i].x*sc/dpr,s.points[i].y*sc/dpr)}ctx.stroke();ctx.restore()})
    if(fmt){can.toBlob((blob)=>{const a=document.createElement('a');a.download=`${names[idx]}_${ts}.png`;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)})}
    else{const es=sz/((cv[k].bg.width||1)/dpr);const ss=sz*1.4;let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+ss+' '+ss+'"><rect width="'+ss+'" height="'+ss+'" fill="#faf8f0"/>'
      store.forEach((s)=>{const pts=s.points.map((p)=>`${p.x*es/dpr},${p.y*es/dpr}`).join(' ');svg+='<path d="M'+pts+'" stroke="'+escHtml(s.color)+'" stroke-width="'+(s.size*es/dpr)+'" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>'})
      svg+='</svg>';const blob=new Blob([svg],{type:'image/svg+xml'});const a=document.createElement('a');a.download=`${names[idx]}_${ts}.svg`;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  });btn.textContent='Export';btn.disabled=false}

// URL direct join
const urlRoom=new URLSearchParams(location.search).get('room')
const urlHost=new URLSearchParams(location.search).get('host')
const urlName=new URLSearchParams(location.search).get('name')
if(urlRoom){setRoom(urlRoom.toUpperCase());createInput.value=room
  if(urlName){const ni=$('nickname-input');if(ni)ni.value=decodeURIComponent(urlName);setNick(decodeURIComponent(urlName))}
  const h=urlHost||location.hostname;hostInput.value=h;connectWS(h,room).then((ok)=>{if(ok)done(h);else done(h)})}

// Zoom reset
document.getElementById('wrap-mine')?.addEventListener('dblclick',()=>{document.body.style.zoom=''})
