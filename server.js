/**
 * 云服务器版 — 公网 IP 中继同步
 *
 * 启动: ROOM=你的房间码 node server.js
 * 客户端: http://你的IP:3000?room=你的房间码
 */

import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { extname, join, dirname } from 'path'
import { fileURLToPath } from 'url'

const { ROOM } = process.env
if (!ROOM) {
  console.error('请设置房间码: ROOM=你的密码 node server.js')
  process.exit(1)
}

import { WebSocketServer, WebSocket } from 'ws'

const WS_PORT = process.env.PORT || 3000

/* ── WebSocket 同步 ── */
const rooms = new Map() // roomCode -> Set<ws>

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  const room = url.searchParams.get('room')
  if (room !== ROOM) {
    ws.close(4001, '房间码错误')
    return
  }
  if (!rooms.has(room)) rooms.set(room, new Set())
  const peers = rooms.get(room)
  peers.add(ws)
  console.log(`[WS] Client joined room: ${room} (${peers.size} peers)`)

  ws.on('message', (data) => {
    const msg = data.toString()
    peers.forEach((c) => { if (c !== ws && c.readyState === WebSocket.OPEN) c.send(msg) })
  })
  ws.on('close', () => {
    peers.delete(ws)
    console.log(`[WS] Client left room: ${room} (${peers.size} peers)`)
    if (peers.size === 0) rooms.delete(room)
  })
  ws.on('error', () => {})
})

/* ── HTTP + 静态文件 ── */
const __dirname = dirname(fileURLToPath(import.meta.url))
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }

const http = createServer((req, res) => {
  if (req.headers.upgrade?.toLowerCase() === 'websocket') {
    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => wss.emit('connection', ws, req))
    return
  }
  let filePath = req.url.split('?')[0]
  filePath = filePath === '/' ? '/index.html' : filePath
  const fullPath = join(__dirname, 'public', filePath)
  if (existsSync(fullPath)) {
    const ext = extname(fullPath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(readFileSync(fullPath))
  } else {
    res.writeHead(404); res.end('Not found')
  }
})

http.listen(WS_PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${WS_PORT}`)
  console.log(`Room: ${ROOM}`)
  console.log(`Client URL: http://<服务器IP>:${WS_PORT}?room=${ROOM}`)
})
