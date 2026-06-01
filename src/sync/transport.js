/**
 * WebSocket 传输层
 *
 * 主机端：创建 WS Server（port 3000）
 * 客户端：连接主机 WS Server
 */

import { WebSocketServer, WebSocket } from 'ws'
import { LAN_PORT, WS_PORT } from './lan.js'

/* ── 主机：WS Server ── */

/**
 * 启动 WebSocket 服务器
 * @param {object} handlers
 * @param {(msg: object) => void} handlers.onMessage - 收到消息
 * @param {(clientId: string) => void} [handlers.onConnect]
 * @param {(clientId: string) => void} [handlers.onDisconnect]
 * @returns {{ wss: WebSocketServer, broadcast: (msg: object) => void }}
 */
export function createWSServer(handlers) {
  const wss = new WebSocketServer({ port: WS_PORT })
  const clients = new Map() // ws -> clientId
  let clientCounter = 0

  wss.on('connection', (ws) => {
    const clientId = `peer_${++clientCounter}`
    clients.set(ws, clientId)
    console.log(`[WS] Client connected: ${clientId}`)
    handlers.onConnect?.(clientId)

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        // 防回环：如果 source 不是当前 client，才处理
        handlers.onMessage(msg, clientId)
      } catch (e) {
        console.error('[WS] Invalid message:', e.message)
      }
    })

    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${clientId}`)
      clients.delete(ws)
      handlers.onDisconnect?.(clientId)
    })

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message)
    })
  })

  wss.on('error', (err) => {
    console.error('[WS] Server error:', err.message)
  })

  console.log(`[WS] Server listening on port ${WS_PORT}`)

  /** 向所有客户端广播消息 */
  function broadcast(msg) {
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg)
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    })
  }

  return { wss, broadcast }
}

/* ── 客户端：WS Client ── */

/**
 * 连接到 WebSocket 服务器
 * @param {string} host - 主机 IP 地址
 * @param {object} handlers
 * @param {(msg: object) => void} handlers.onMessage
 * @param {() => void} [handlers.onOpen]
 * @param {() => void} [handlers.onClose]
 * @param {(err: Error) => void} [handlers.onError]
 * @returns {{ ws: WebSocket, send: (msg: object) => void }}
 */
export function connectWS(host, handlers) {
  const url = `ws://${host}:${WS_PORT}`
  console.log(`[WS] Connecting to ${url}`)
  const ws = new WebSocket(url)

  ws.on('open', () => {
    console.log('[WS] Connected to host')
    handlers.onOpen?.()
  })

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      handlers.onMessage(msg)
    } catch (e) {
      console.error('[WS] Invalid message:', e.message)
    }
  })

  ws.on('close', () => {
    console.log('[WS] Disconnected')
    handlers.onClose?.()
  })

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message)
    handlers.onError?.(err)
  })

  function send(msg) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }

  return { ws, send }
}

export { WS_PORT }
