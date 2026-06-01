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
const startTime = Date.now()

/* ── 终端管理命令 ── */
function setupCLI() {
  import('readline').then(({ createInterface }) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' })
    rl.prompt()
    rl.on('line', (line) => {
      const cmd = line.trim().toLowerCase()
      if (cmd === 'help' || cmd === 'h' || cmd === '?') {
        console.log(`\n  管理命令:`)
        console.log(`    list / ls        查看所有房间`)
        console.log(`    info              查看服务器状态`)
        console.log(`    clear <room>      清空指定房间数据`)
        console.log(`    kick <room>       断开指定房间所有客户端`)
        console.log(`    exit / quit       关闭服务器`)
        console.log(`    help / ?          显示此帮助\n`)
      } else if (cmd === 'list' || cmd === 'ls') {
        if (rooms.size === 0) { console.log('  (无活跃房间)\n') }
        else {
          rooms.forEach((r, code) => {
            const age = Math.round((Date.now() - r.createdAt) / 1000)
            const ttl = r.timer ? ` (${Math.round(ROOM_TTL / 1000 - (Date.now() - (r.createdAt + r.peers.size * 10000))) / 100}s后销毁)` : ''
            console.log(`  [${code}] ${r.peers.size}人 | ${r.history.length}笔 | 存活${age}s${ttl}`)
          })
          console.log(`  共 ${rooms.size}/${MAX_ROOMS} 个房间\n`)
        }
      } else if (cmd === 'info') {
        const mem = process.memoryUsage()
        const uptime = Math.round((Date.now() - startTime) / 1000)
        let totalPeers = 0, totalStrokes = 0
        rooms.forEach((r) => { totalPeers += r.peers.size; totalStrokes += r.history.length })
        console.log(`\n  运行时间: ${uptime}s | 内存: ${Math.round(mem.heapUsed/1024/1024)}MB`)
        console.log(`  房间: ${rooms.size}/${MAX_ROOMS} | 客户端: ${totalPeers} | 笔画: ${totalStrokes}\n`)
      } else if (cmd.startsWith('clear ')) {
        const target = cmd.slice(6).trim().toUpperCase()
        const r = rooms.get(target)
        if (r) { r.history = []; console.log(`  已清空房间 ${target} 的数据\n`) }
        else console.log(`  房间 ${target} 不存在\n`)
      } else if (cmd.startsWith('kick ')) {
        const target = cmd.slice(5).trim().toUpperCase()
        const r = rooms.get(target)
        if (r) {
          r.peers.forEach((c) => { try { c.close(4000, '管理员踢出') } catch (_) {} })
          console.log(`  已踢出房间 ${target} 的所有客户端\n`)
        } else console.log(`  房间 ${target} 不存在\n`)
      } else if (cmd === 'exit' || cmd === 'quit') {
        console.log('  正在关闭服务器...\n')
        rooms.forEach((r) => { r.peers.forEach((c) => { try { c.close() } catch (_) {} }) })
        rl.close()
        process.exit(0)
      } else if (cmd) {
        console.log(`  未知命令: ${cmd}，输入 help 查看帮助\n`)
      }
      rl.prompt()
    })
  })
}

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
  console.log('  输入 help 查看管理命令')
  console.log('═══════════════════════════════════\n')
  setupCLI()
})
