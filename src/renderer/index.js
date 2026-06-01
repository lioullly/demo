/**
 * 渲染进程 — UI ↔ Sync 胶水层
 *
 * 负责：
 *   1. 监听本地 UI 事件 → 发送 sync 消息
 *   2. 接收远程 sync 消息 → 回放应用到 UI
 */

import { isValidOp } from '../sync/protocol.js'

// 全局状态
const state = {
  userId: `user_${Date.now().toString(36)}`,
  currentPageId: 'page_default',
  connected: false,
  peers: [],
}

/* ── 事件监听器注册 ── */

const listeners = {
  stroke: [],
  text: [],
  image: [],
  erase: [],
  connect: [],
  disconnect: [],
}

/** 注册 UI 事件回调 */
export function on(event, callback) {
  if (listeners[event]) listeners[event].push(callback)
}

/** 注销回调 */
export function off(event, callback) {
  if (listeners[event]) {
    listeners[event] = listeners[event].filter((cb) => cb !== callback)
  }
}

/** 触发事件 */
function emit(event, data) {
  if (listeners[event]) {
    listeners[event].forEach((cb) => {
      try { cb(data) } catch (e) { console.error(`[Sync] Listener error (${event}):`, e) }
    })
  }
}

/* ── 初始化 ── */

export function initSync(userId) {
  if (userId) state.userId = userId

  // 检测 Electron 环境
  if (window.electronAPI) {
    setupElectronBridge()
  } else {
    console.warn('[Sync] Running outside Electron — sync disabled')
  }

  console.log(`[Sync] Initialized, userId: ${state.userId}`)
  return state
}

/* ── Electron IPC 桥接 ── */

let unsubscribers = []

function setupElectronBridge() {
  // 收远程消息 → 回放到 UI
  const unsub1 = window.electronAPI.onSyncMessage((msg) => {
    if (!isValidOp(msg)) return
    // 过滤自己发出的消息（防回环）
    if (msg.source === state.userId) return
    applyRemoteOp(msg)
  })

  // 对端连接/断开
  const unsub2 = window.electronAPI.onPeerConnected((clientId) => {
    state.connected = true
    state.peers.push(clientId)
    emit('connect', { clientId })
  })

  const unsub3 = window.electronAPI.onPeerDisconnected((clientId) => {
    state.peers = state.peers.filter((id) => id !== clientId)
    state.connected = state.peers.length > 0
    emit('disconnect', { clientId })
  })

  // 检查初始状态
  window.electronAPI.getWSStatus().then((status) => {
    if (status?.running) {
      console.log('[Sync] WS server is running')
    }
  })

  unsubscribers = [unsub1, unsub2, unsub3]
}

/** 应用远程操作 */
function applyRemoteOp(msg) {
  switch (msg.type) {
    case 'stroke':
      emit('stroke', msg)
      break
    case 'text':
      emit('text', msg)
      break
    case 'image':
      emit('image', msg)
      break
    case 'erase':
      emit('erase', msg)
      break
    default:
      console.warn('[Sync] Unknown message type:', msg.type)
  }
}

/* ── 发送消息 ── */

export function sendStroke(pageId, points, color, width) {
  const msg = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pageId: pageId || state.currentPageId,
    userId: state.userId,
    type: 'stroke',
    payload: { points, color, width },
    ts: Date.now(),
    source: state.userId,
  }
  if (window.electronAPI) {
    window.electronAPI.sendMessage(msg)
  }
  return msg
}

export function sendText(pageId, content) {
  const msg = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pageId: pageId || state.currentPageId,
    userId: state.userId,
    type: 'text',
    payload: { content },
    ts: Date.now(),
    source: state.userId,
  }
  if (window.electronAPI) {
    window.electronAPI.sendMessage(msg)
  }
  return msg
}

export function sendImage(pageId, url) {
  const msg = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pageId: pageId || state.currentPageId,
    userId: state.userId,
    type: 'image',
    payload: { url },
    ts: Date.now(),
    source: state.userId,
  }
  if (window.electronAPI) {
    window.electronAPI.sendMessage(msg)
  }
  return msg
}

export function sendErase(pageId, strokeIds) {
  const msg = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pageId: pageId || state.currentPageId,
    userId: state.userId,
    type: 'erase',
    payload: { strokeIds },
    ts: Date.now(),
    source: state.userId,
  }
  if (window.electronAPI) {
    window.electronAPI.sendMessage(msg)
  }
  return msg
}

/* ── 销毁 ── */

export function destroySync() {
  unsubscribers.forEach((fn) => fn())
  unsubscribers = []
}
