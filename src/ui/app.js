/**
 * UI 主程序 — Canvas 手写 + 同步胶水
 *
 * 双 Canvas 架构：
 *   bg-canvas: 已完成的笔画（历史笔画 + 远程笔画）
 *   fg-canvas: 当前正在绘制的一笔
 */

import {
  initSync, on, sendStroke, sendErase, destroySync,
} from '../renderer/index.js'

/* ── DOM 元素 ── */

const bgCanvas = document.getElementById('bg-canvas')
const fgCanvas = document.getElementById('fg-canvas')
const bgCtx = bgCanvas.getContext('2d')
const fgCtx = fgCanvas.getContext('2d')

const btnPen = document.getElementById('btn-pen')
const btnEraser = document.getElementById('btn-eraser')
const colorPicker = document.getElementById('color-picker')
const sizeSlider = document.getElementById('size-slider')
const statusEl = document.getElementById('status')
const peerLabel = document.getElementById('peer-label')

/* ── 状态 ── */

const PAGE_ID = 'page_default'
let tool = 'pen'
let color = '#1a1a1a'
let size = 3
let isDrawing = false
let currentPoints = []
let currentStrokeId = null
const remoteStrokes = new Map() // id -> stroke data

/* ── Canvas 尺寸 ── */

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1
  const container = document.getElementById('canvas-container')
  const w = container.clientWidth
  const h = container.clientHeight
  for (const c of [bgCanvas, fgCanvas]) {
    c.width = w * dpr
    c.height = h * dpr
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
  }
}

window.addEventListener('resize', resizeCanvas)
resizeCanvas()

/* ── 工具栏 ── */

btnPen.addEventListener('click', () => {
  tool = 'pen'
  btnPen.classList.add('active')
  btnEraser.classList.remove('active')
  fgCanvas.style.cursor = 'crosshair'
})

btnEraser.addEventListener('click', () => {
  tool = 'eraser'
  btnEraser.classList.add('active')
  btnPen.classList.remove('active')
  fgCanvas.style.cursor = 'cell'
})

colorPicker.addEventListener('input', (e) => { color = e.target.value })
sizeSlider.addEventListener('input', (e) => { size = parseInt(e.target.value) })

/* ── 指针事件 ── */

function getCanvasPoint(e) {
  const rect = fgCanvas.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    pressure: e.pressure || 0.5,
  }
}

fgCanvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && e.pressure === 0) return // 手掌误触
  e.preventDefault()
  isDrawing = true
  currentPoints = [getCanvasPoint(e)]
  currentStrokeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  if (tool === 'pen') {
    fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height)
  }
})

fgCanvas.addEventListener('pointermove', (e) => {
  if (!isDrawing) return
  e.preventDefault()

  const coalesced = e.getCoalescedEvents?.() || [e]
  for (const ce of coalesced) {
    currentPoints.push(getCanvasPoint(ce))
  }

  if (tool === 'pen') {
    // 只重绘当前笔画（前景层）
    fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height)
    drawStroke(fgCtx, currentPoints, color, size)
  } else if (tool === 'eraser') {
    // 橡皮擦：检查碰撞
    const pt = getCanvasPoint(e)
    const hitIds = []
    remoteStrokes.forEach((s, id) => {
      if (hitTestStroke(s.points, pt, 12)) hitIds.push(id)
    })
    if (hitIds.length > 0) {
      sendErase(PAGE_ID, hitIds)
      hitIds.forEach((id) => {
        remoteStrokes.delete(id)
        sendErase(PAGE_ID, [id])
      })
      redrawAll()
    }
  }
})

fgCanvas.addEventListener('pointerup', (e) => {
  if (!isDrawing) return
  e.preventDefault()
  isDrawing = false

  if (tool === 'pen' && currentPoints.length > 0) {
    // 持久化到 bg canvas
    drawStroke(bgCtx, currentPoints, color, size)
    // 同步到远端
    const msg = sendStroke(PAGE_ID, currentPoints, color, size)
    remoteStrokes.set(msg.id, { points: currentPoints, color, size })
    // 清前景
    fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height)
  }

  currentPoints = []
  currentStrokeId = null
})

fgCanvas.addEventListener('pointerleave', () => {
  // 不结束笔画，pointerup 才是真正的结束信号
})

fgCanvas.addEventListener('pointercancel', () => {
  if (isDrawing && tool === 'pen' && currentPoints.length > 0) {
    drawStroke(bgCtx, currentPoints, color, size)
    const msg = sendStroke(PAGE_ID, currentPoints, color, size)
    remoteStrokes.set(msg.id, { points: currentPoints, color, size })
  }
  isDrawing = false
  currentPoints = []
  currentStrokeId = null
  fgCtx.clearRect(0, 0, fgCanvas.width, fgCanvas.height)
})

/* ── 绘制 ── */

function drawStroke(ctx, points, strokeColor, strokeSize) {
  if (points.length < 1) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = strokeSize
  ctx.globalAlpha = 0.95
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.stroke()
  ctx.restore()
}

function hitTestStroke(points, pt, radius) {
  for (const p of points) {
    const dx = p.x - pt.x
    const dy = p.y - pt.y
    if (dx * dx + dy * dy <= radius * radius) return true
  }
  return false
}

function redrawAll() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height)
  remoteStrokes.forEach((s) => {
    drawStroke(bgCtx, s.points, s.color, s.size)
  })
}

/* ── 同步 ── */

function applyRemoteStroke(msg) {
  const { id, payload } = msg
  if (remoteStrokes.has(id)) return
  remoteStrokes.set(id, payload)
  drawStroke(bgCtx, payload.points, payload.color, payload.width)
}

function applyRemoteErase(msg) {
  const { strokeIds } = msg.payload
  strokeIds.forEach((id) => remoteStrokes.delete(id))
  redrawAll()
}

/* ── 初始化 ── */

const sync = initSync()

on('stroke', (msg) => {
  applyRemoteStroke(msg)
})

on('erase', (msg) => {
  applyRemoteErase(msg)
})

on('connect', ({ clientId }) => {
  statusEl.textContent = '● 已连接'
  statusEl.className = 'status-connected'
  peerLabel.classList.add('show')
  console.log(`[UI] Peer connected: ${clientId}`)
})

on('disconnect', () => {
  statusEl.textContent = '● 等待连接'
  statusEl.className = 'status-disconnected'
  peerLabel.classList.remove('show')
})

// 初始检查
setTimeout(async () => {
  const status = await window.electronAPI?.getWSStatus()
  if (status?.running) {
    statusEl.textContent = '主持中，等待对方加入...'
    statusEl.className = 'status-disconnected'
  }
}, 500)

console.log('[UI] Ready')
