/**
 * 主机服务端 — UDP 广播 + WebSocket 同步 + H5 客户端托管
 *
 * 启动：node server.js
 * 平板：打开 http://主机IP:3000
 */

import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { extname, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { networkInterfaces } from 'os'
import dgram from 'dgram'

import { WebSocketServer, WebSocket } from 'ws'

const UDP_PORT = 41234
const WS_PORT = 3000
const PROBE_MSG = Buffer.from('MULTINOTE_PROBE')

/* ── 获取本机局域网 IP ── */
function getLanIP() {
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

/* ── UDP 广播响应 ── */
const udp = dgram.createSocket('udp4')
udp.on('message', (msg, rinfo) => {
  if (msg.equals(PROBE_MSG)) {
    const reply = Buffer.from(`MULTINOTE_PONG:${WS_PORT}`)
    udp.send(reply, 0, reply.length, rinfo.port, rinfo.address)
  }
})
udp.on('error', (err) => console.error('[UDP]', err.message))
udp.bind(UDP_PORT, () => console.log(`[UDP] Listening on ${UDP_PORT}`))

/* ── WebSocket 同步 ── */
const clients = new Set()
const wss = new WebSocketServer({ noServer: true })
wss.on('connection', (ws) => {
  clients.add(ws)
  console.log('[WS] Client connected')
  ws.on('message', (data) => {
    const msg = data.toString()
    clients.forEach((c) => { if (c !== ws && c.readyState === WebSocket.OPEN) c.send(msg) })
  })
  ws.on('close', () => { clients.delete(ws); console.log('[WS] Client disconnected') })
  ws.on('error', () => {})
})

/* ── HTTP 服务 + 静态文件 ── */
const __dirname = dirname(fileURLToPath(import.meta.url))
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }

const http = createServer((req, res) => {
  // WebSocket upgrade
  if (req.headers.upgrade?.toLowerCase() === 'websocket') {
    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => wss.emit('connection', ws, req))
    return
  }
  // API: 主机状态（客户端扫描用）
  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ name: 'handwriting-sync', version: '1.0.0', ip: getLanIP(), port: WS_PORT, clients: clients.size }))
    return
  }
  // 静态文件
  let filePath = req.url === '/' ? '/index.html' : req.url
  const fullPath = join(__dirname, 'public', filePath)
  if (existsSync(fullPath)) {
    const ext = extname(fullPath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(readFileSync(fullPath))
  } else {
    res.writeHead(404)
    res.end('Not found')
  }
})

http.listen(WS_PORT, () => {
  const ip = getLanIP()
  console.log(`\n  H5 客户端: http://${ip}:${WS_PORT}`)
  console.log(`  平板打开上面的地址即可连接\n`)
})
