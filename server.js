/**
 * 主机服务端 — 多房间中继 + 静态文件服务
 * 启动: node server.js
 */

import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { extname, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { networkInterfaces } from 'os'
import { WebSocketServer } from 'ws'

const WS_PORT = process.env.PORT || 3000

/* ── WebSocket ── */
const MAX_ROOMS = 10
const ROOM_TTL = 10 * 60 * 1000
const rooms = new Map()

function destroyRoom(room, r) {
  clearTimeout(r.timer)
  rooms.delete(room)
  console.log(`  - 房间 ${room}  已销毁 (超时)`)
}

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  const room = (url.searchParams.get('room') || 'default').toUpperCase()

  if (!rooms.has(room) && rooms.size >= MAX_ROOMS) {
    ws.close(4002, '房间已满')
    return
  }

  let r = rooms.get(room)
  if (!r) {
    r = { peers: new Set(), history: [], timer: null, createdAt: Date.now() }
    rooms.set(room, r)
    console.log(`  + 房间 ${room}  已创建  [${rooms.size}/${MAX_ROOMS}]`)
  } else {
    clearTimeout(r.timer)
    r.timer = null
  }

  r.peers.add(ws)
  console.log(`  + 房间 ${room}  客户端加入  (${r.peers.size} 人)`)

  if (r.history.length > 0) {
    ws.send(JSON.stringify({ type: 'sync', history: r.history }))
  }

  ws.on('message', (data) => {
    const msg = data.toString()
    r.history.push(msg)
    if (r.history.length > 10000) r.history = r.history.slice(-5000)
    r.peers.forEach((c) => { if (c !== ws && c.readyState === 1) c.send(msg) })
  })
  ws.on('close', () => {
    r.peers.delete(ws)
    if (r.peers.size === 0) {
      r.timer = setTimeout(() => destroyRoom(room, r), ROOM_TTL)
      console.log(`  - 房间 ${room}  空闲，10分钟后销毁`)
    } else {
      console.log(`  - 房间 ${room}  客户端离开  (${r.peers.size} 人)`)
    }
  })
})

/* ── HTTP ── */
const __dirname = dirname(fileURLToPath(import.meta.url))
const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json' }

const http = createServer((req, res) => {
  if (req.headers.upgrade?.toLowerCase() === 'websocket') {
    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => wss.emit('connection', ws, req))
    return
  }
  if (req.url === '/api/status') {
    const list = []
    rooms.forEach((r, code) => list.push({ room: code, clients: r.peers.size, createdAt: r.createdAt }))
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ name: 'handwriting-sync', rooms: list, port: WS_PORT }))
    return
  }
  let filePath = req.url.split('?')[0]
  filePath = filePath === '/' ? '/index.html' : filePath
  const fullPath = join(__dirname, 'public', filePath)
  if (existsSync(fullPath)) {
    res.writeHead(200, { 'Content-Type': MIME[extname(fullPath)] || 'application/octet-stream' })
    res.end(readFileSync(fullPath))
  } else {
    res.writeHead(404); res.end('Not found')
  }
})

http.listen(WS_PORT, '0.0.0.0', () => {
  const ifaces = networkInterfaces()
  console.log('\n═══════════════════════════════════')
  console.log('  Handwriting Sync 主机已启动')
  console.log('═══════════════════════════════════')
  console.log(`  端口: ${WS_PORT}\n`)

  console.log('  --- 局域网地址 (平板连这个) ---')
  for (const [, addrs] of Object.entries(ifaces)) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log(`  →  http://${a.address}:${WS_PORT}`)
      }
    }
  }

  console.log('\n  客户端打开上述地址即可创建/加入房间')
  console.log('  房间码在客户端页面随机生成，无需预设')
  console.log('═══════════════════════════════════\n')
})
