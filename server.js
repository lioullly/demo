/**
 * 主机服务端 — 多房间中继 + 静态文件服务
 * 启动: node server.js
 */

import { createServer } from 'http'
import { readFile } from 'fs'
import { extname, join, dirname, normalize, sep } from 'path'
import { fileURLToPath } from 'url'
import { networkInterfaces } from 'os'
import { WebSocketServer } from 'ws'

const WS_PORT = process.env.PORT || 3000
const startTime = Date.now()
const MAX_MSG_SIZE = 1024 * 1024 // 1MB per message
const MAX_ROOM_NAME = 20

/* ── 终端管理命令 ── */
function setupCLI() {
  import('readline').then(({ createInterface }) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' })
    rl.prompt()
    rl.on('line', (line) => {
      const cmd = line.trim().toLowerCase()
      if (cmd === 'help' || cmd === 'h' || cmd === '?') {
        console.log('\n  Commands:')
        console.log('    list / ls        List all rooms')
        console.log('    info              Server status')
        console.log('    clear <room>      Clear room data')
        console.log('    kick <room>       Disconnect all clients in room')
        console.log('    exit / quit       Stop server')
        console.log('    help / ?          This help\n')
      } else if (cmd === 'list' || cmd === 'ls') {
        if (rooms.size === 0) { console.log('  (no active rooms)\n') }
        else {
          rooms.forEach((r, code) => {
            const age = Math.round((Date.now() - r.createdAt) / 1000)
            let ttlStr = ''
            if (r.timer) {
              const remaining = Math.max(0, Math.round((ROOM_TTL - (Date.now() - (r.createdAt + r.peers.size * 60000))) / 1000))
              ttlStr = ` (${remaining}s until destroy)`
            }
            console.log(`  [${code}] ${r.peers.size} clients | ${r.history.length} strokes | alive ${age}s${ttlStr}`)
          })
          console.log(`  Total: ${rooms.size}/${MAX_ROOMS} rooms\n`)
        }
      } else if (cmd === 'info') {
        const mem = process.memoryUsage()
        const uptime = Math.round((Date.now() - startTime) / 1000)
        let totalPeers = 0, totalStrokes = 0
        rooms.forEach((r) => { totalPeers += r.peers.size; totalStrokes += r.history.length })
        console.log(`\n  Uptime: ${uptime}s | Memory: ${Math.round(mem.heapUsed/1024/1024)}MB`)
        console.log(`  Rooms: ${rooms.size}/${MAX_ROOMS} | Clients: ${totalPeers} | Strokes: ${totalStrokes}\n`)
      } else if (cmd.startsWith('clear ')) {
        const target = cmd.slice(6).trim().toUpperCase()
        const r = rooms.get(target)
        if (r) { r.history = []; console.log(`  Cleared room ${target}\n`) }
        else console.log(`  Room ${target} not found\n`)
      } else if (cmd.startsWith('kick ')) {
        const target = cmd.slice(5).trim().toUpperCase()
        const r = rooms.get(target)
        if (r) {
          const peers = Array.from(r.peers)
          peers.forEach((c) => { try { c.close(4000, 'kicked') } catch (_) {} })
          console.log(`  Kicked all clients from room ${target}\n`)
        } else console.log(`  Room ${target} not found\n`)
      } else if (cmd === 'exit' || cmd === 'quit') {
        console.log('  Shutting down...\n')
        rooms.forEach((r) => { Array.from(r.peers).forEach((c) => { try { c.close() } catch (_) {} }) })
        rl.close()
        process.exit(0)
      } else if (cmd) {
        console.log(`  Unknown: ${cmd}. Type help for commands.\n`)
      }
      rl.prompt()
    })
  }).catch((e) => console.error('[CLI] Failed to init:', e.message))
}

/* ── WebSocket ── */
const MAX_ROOMS = 10
const ROOM_TTL = 10 * 60 * 1000
const rooms = new Map()

function destroyRoom(room, r) {
  clearTimeout(r.timer)
  const current = rooms.get(room)
  if (current !== r) return // Stale closure guard
  rooms.delete(room)
  console.log(`  - Room ${room} destroyed (timeout)`)
}

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_SIZE })
wss.on('connection', (ws, req) => {
  const roomRaw = new URL(req.url, 'http://localhost').searchParams.get('room') || 'default'
  const room = roomRaw.slice(0, MAX_ROOM_NAME).toUpperCase()

  if (!rooms.has(room) && rooms.size >= MAX_ROOMS) {
    ws.close(4002, 'room full')
    return
  }

  let r = rooms.get(room)
  if (!r) {
    r = { peers: new Set(), history: [], timer: null, createdAt: Date.now() }
    rooms.set(room, r)
    console.log(`  + Room ${room} created [${rooms.size}/${MAX_ROOMS}]`)
  } else {
    clearTimeout(r.timer)
    r.timer = null
  }

  r.peers.add(ws)
  console.log(`  + Room ${room} client joined (${r.peers.size} peers)`)

  if (r.history.length) {
    try { ws.send(JSON.stringify({ type: 'sync', history: r.history })) } catch (_) {}
  }

  ws.on('message', (data) => {
    try {
      const msg = data.toString().slice(0, MAX_MSG_SIZE)
      r.history.push(msg)
      if (r.history.length > 5000) r.history = r.history.slice(-3000)
      for (const c of r.peers) {
        if (c !== ws && c.readyState === 1) {
          try { c.send(msg) } catch (_) { r.peers.delete(c) }
        }
      }
    } catch (_) {}
  })
  ws.on('close', () => {
    r.peers.delete(ws)
    if (r.peers.size === 0) {
      r.timer = setTimeout(() => destroyRoom(room, r), ROOM_TTL)
      console.log(`  - Room ${room} idle, will destroy in 10min`)
    } else {
      console.log(`  - Room ${room} client left (${r.peers.size} peers)`)
    }
  })
  ws.on('error', () => { r.peers.delete(ws) })
})

/* ── HTTP ── */
const __dirname = dirname(fileURLToPath(import.meta.url))
const publicRoot = join(__dirname, 'public') + sep
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
  // Path traversal protection
  const normalized = normalize(filePath)
  if (normalized.includes('..')) { res.writeHead(403); res.end('Forbidden'); return }
  const fullPath = join(publicRoot, normalized)
  if (!fullPath.startsWith(publicRoot)) { res.writeHead(403); res.end('Forbidden'); return }

  readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found') }
    else {
      res.writeHead(200, { 'Content-Type': MIME[extname(fullPath)] || 'application/octet-stream' })
      res.end(data)
    }
  })
})

http.on('error', (err) => {
  console.error('[HTTP] Fatal error:', err.message)
  process.exit(1)
})

http.listen(WS_PORT, '0.0.0.0', () => {
  const ifaces = networkInterfaces()
  console.log('\n=========================================')
  console.log('  Handwriting Sync Server started')
  console.log('=========================================')
  console.log(`  Port: ${WS_PORT}\n`)
  console.log('  --- LAN addresses ---')
  for (const [, addrs] of Object.entries(ifaces)) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log(`  ->  http://${a.address}:${WS_PORT}`)
      }
    }
  }
  console.log('\n  Open the above URL on tablets to join.')
  console.log('  Type help for admin commands.')
  console.log('=========================================\n')
  setupCLI()
})
