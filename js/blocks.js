// Block operations — text, image, todo creation and editing
import { uid, escHtml, getPageId, USER_ID, userName } from './utils.js'
import { sendWS } from './sync.js'

export function sendBlockUpdate(id, text, checked) {
  sendWS({ type:'block_update', blockId:id, payload:{ text, checked }, pageId:getPageId(), userId:USER_ID, id:uid(), ts:Date.now(), source:USER_ID })
}

function showChrome(div) {
  div.style.borderColor = '#93c5fd'; div.style.borderStyle = 'dashed'
  div.querySelectorAll('[data-chrome]').forEach((el) => { el.style.display = '' })
}
function hideChrome(div) {
  if (document.activeElement === div || div.contains(document.activeElement)) return
  div.style.borderColor = 'transparent'; div.style.borderStyle = 'solid'
  div.querySelectorAll('[data-chrome]').forEach((el) => { el.style.display = 'none' })
}
function resetChrome(div) { div.querySelectorAll('[data-chrome]').forEach((el) => { el.style.display = 'none' }) }

function addDragHandles(div, id, type, readOnly) {
  if (readOnly) return
  const bar = document.createElement('div')
  bar.setAttribute('data-chrome', '')
  bar.style.cssText = 'height:10px;cursor:grab;position:relative;margin:-2px 0 2px 0;touch-action:none;display:none'
  bar.innerHTML = '<div style="border-top:1px dashed #93c5fd;position:absolute;top:4px;left:4px;right:4px"></div><div style="background:#eff6ff;width:40px;height:6px;border-radius:3px;position:absolute;top:2px;left:50%;transform:translateX(-50%);border:1px solid #93c5fd"></div>'
  let startX, startY, origLeft, origTop
  bar.onpointerdown = (e) => {
    e.stopPropagation(); e.preventDefault(); bar.setPointerCapture(e.pointerId)
    startX = e.clientX; startY = e.clientY
    origLeft = parseFloat(div.style.left) || 0; origTop = parseFloat(div.style.top) || 0
    div.style.position = 'relative'
    const move = (ev) => { div.style.left = (origLeft + ev.clientX - startX) + 'px'; div.style.top = (origTop + ev.clientY - startY) + 'px' }
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); bar.releasePointerCapture(e.pointerId) }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up)
  }
  div.appendChild(bar)

  const resizer = document.createElement('div')
  resizer.setAttribute('data-chrome', '')
  resizer.style.cssText = 'position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,#c0c0c0 50%,#c0c0c0 55%,transparent 55%,transparent 75%,#c0c0c0 75%);display:none'
  let rsX, rsY, rsW, rsH
  resizer.onpointerdown = (e) => {
    e.stopPropagation(); e.preventDefault(); resizer.setPointerCapture(e.pointerId)
    rsX = e.clientX; rsY = e.clientY; rsW = div.offsetWidth; rsH = div.offsetHeight
    const move = (ev) => {
      const nw = Math.max(120, rsW + ev.clientX - rsX); const nh = Math.max(40, rsH + ev.clientY - rsY)
      div.style.width = nw + 'px'; div.style.minHeight = nh + 'px'
      const scale = Math.min(2.5, Math.max(0.6, nw / 280))
      div.querySelectorAll('input,textarea').forEach((inp) => { inp.style.fontSize = Math.round(14 * scale) + 'px' })
    }
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up) }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up)
  }
  div.appendChild(resizer)

  const del = document.createElement('button'); del.textContent = 'x'
  del.setAttribute('data-chrome', '')
  del.style.cssText = 'position:absolute;top:-4px;right:-4px;background:#fff;color:#999;border:1px solid #93c5fd;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;z-index:2;line-height:1;display:none'
  del.onclick = (e) => { e.stopPropagation(); div.remove(); sendWS({ type:'block_delete', blockId:id, pageId:getPageId(), userId:USER_ID, id:uid(), ts:Date.now(), source:USER_ID }) }
  div.appendChild(del)
}

export function makeBlock(id, type, payload, readOnly) {
  const div = document.createElement('div')
  div.className = 'block-item'; div.dataset.blockId = id; div.dataset.blockType = type
  div.style.cssText = 'padding:8px 12px;margin:8px 4px;background:#fff;border-radius:4px;border:1.5px solid transparent;position:relative;pointer-events:auto;touch-action:manipulation;min-width:120px;min-height:40px;overflow:visible;transition:border-color 0.2s'
  div.addEventListener('mouseenter', () => { div.style.borderColor = '#93c5fd'; div.style.borderStyle = 'dashed' })
  div.addEventListener('mouseleave', () => { if (document.activeElement !== div && !div.contains(document.activeElement)) { div.style.borderColor = 'transparent'; resetChrome(div) } })
  div.addEventListener('click', () => { showChrome(div) })
  document.addEventListener('click', (e) => { if (!div.contains(e.target)) hideChrome(div) })
  addDragHandles(div, id, type, readOnly)

  const inner = document.createElement('div'); inner.style.cssText = 'display:flex;align-items:flex-start;gap:6px'

  if (type === 'img') {
    const img = document.createElement('img'); img.src = payload.src
    img.style.maxWidth = '100%'; img.style.maxHeight = '300px'; img.style.borderRadius = '4px'
    inner.appendChild(img); div.appendChild(inner); return div
  }
  if (type === 'todo') {
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = payload.checked || false
    cb.style.cssText = 'width:18px;height:18px;flex-shrink:0;margin-top:2px'
    if (!readOnly) cb.onchange = () => sendBlockUpdate(id, null, cb.checked)
    inner.appendChild(cb)
  }

  const fs = { h1:28, h2:24, h3:20, p:14, todo:14 }[type] || 14
  let input
  if (type === 'p') {
    input = document.createElement('textarea'); input.setAttribute('inputmode', 'text'); input.rows = 1
    input.style.cssText = `flex:1;border:none;outline:none;background:transparent;font-family:inherit;padding:2px 0;pointer-events:auto;font-size:${fs}px;resize:none;overflow:hidden;min-height:24px`
    input.placeholder = 'Type...'; input.value = payload.text || ''
    input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.max(24, input.scrollHeight) + 'px' }
    setTimeout(() => { input.style.height = 'auto'; input.style.height = Math.max(24, input.scrollHeight) + 'px' }, 10)
  } else {
    input = document.createElement('input'); input.type = 'text'; input.setAttribute('inputmode', 'text')
    input.style.cssText = `flex:1;border:none;outline:none;background:transparent;font-family:inherit;padding:2px 0;pointer-events:auto;font-size:${fs}px`
    if (type.startsWith('h')) { input.style.fontWeight = 'bold'; input.placeholder = 'Heading ' + (parseInt(type[1]) || 1) }
    input.placeholder = input.placeholder || 'Type...'; input.value = payload.text || ''
  }
  if (input) {
    input.readOnly = !!readOnly
    if (!readOnly) {
      let debounce
      input.oninput = () => { clearTimeout(debounce); debounce = setTimeout(() => sendBlockUpdate(id, input.value, type==='todo'?inner.querySelector('input[type=checkbox]')?.checked:undefined), 300); if(type==='p'){input.style.height='auto';input.style.height=Math.max(24,input.scrollHeight)+'px'} }
      input.onblur = () => { clearTimeout(debounce); sendBlockUpdate(id, input.value, type==='todo'?inner.querySelector('input[type=checkbox]')?.checked:undefined) }
    }
    inner.appendChild(input)
  }
  div.appendChild(inner)
  return div
}

export function addBlock(type, payload) {
  const id = uid()
  sendWS({ id, type:'block_add', blockType:type, payload, pageId:getPageId(), userId:USER_ID, userName, ts:Date.now(), source:USER_ID })
  const wrap = document.getElementById('wrap-mine')
  if (!wrap) return
  wrap.insertBefore(makeBlock(id, type, payload, false), wrap.firstChild)
}

export function handleBlockMsg(msg) {
  const wrap = document.getElementById('wrap-peer')
  if (!wrap) return
  if (msg.type === 'block_add') {
    if (msg.source === USER_ID) return
    const el = makeBlock(msg.id, msg.blockType, msg.payload, true)
    const label = document.createElement('small'); label.textContent = ' - ' + (msg.userName || msg.userId)
    label.style.cssText = 'font-size:10px;color:#888;align-self:center'; el.appendChild(label)
    wrap.insertBefore(el, wrap.firstChild)
  } else if (msg.type === 'block_update') {
    const existing = wrap.querySelector('[data-block-id="'+msg.blockId+'"]')
    if (existing) {
      const inp = existing.querySelector('input[type="text"],textarea')
      if (inp && msg.payload.text !== undefined) inp.value = msg.payload.text
      const cb = existing.querySelector('input[type="checkbox"]')
      if (cb && msg.payload.checked !== undefined) cb.checked = msg.payload.checked
    }
  } else if (msg.type === 'block_delete') {
    const el = wrap.querySelector('[data-block-id="'+msg.blockId+'"]')
    if (el) el.remove()
  }
}
