/**
 * 局域网发现 — UDP Broadcast
 *
 * 主机: 监听 UDP 41234 端口，收到 PROBE 回复 PONG
 * 客户端: 广播 PROBE，收到 PONG 后获取主机 IP 和 WS 端口
 */

import dgram from 'dgram'

export const LAN_PORT = 41234
export const WS_PORT = 3000
const PROBE_MSG = Buffer.from('MULTINOTE_PROBE')
const PONG_MSG = Buffer.from('MULTINOTE_PONG')

/**
 * 启动主机端 LAN 广播响应
 * @returns {dgram.Socket} UDP socket
 */
export function startHostDiscovery() {
  const sock = dgram.createSocket('udp4')

  sock.on('message', (msg, rinfo) => {
    if (msg.equals(PROBE_MSG)) {
      // 回复 PONG 附上 WS 端口
      const reply = Buffer.from(`MULTINOTE_PONG:${WS_PORT}`)
      sock.send(reply, 0, reply.length, rinfo.port, rinfo.address, (err) => {
        if (err) console.error('[LAN] PONG send error:', err.message)
        else console.log(`[LAN] PONG sent to ${rinfo.address}:${rinfo.port}`)
      })
    }
  })

  sock.on('error', (err) => {
    console.error('[LAN] UDP error:', err.message)
  })

  sock.bind(LAN_PORT, () => {
    console.log(`[LAN] Host discovery listening on UDP ${LAN_PORT}`)
  })

  return sock
}

/**
 * 客户端：发送 UDP 广播发现主机
 * @param {number} timeout - 等待超时 ms
 * @returns {Promise<{host: string, port: number}|null>}
 */
export function discoverHost(timeout = 3000) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4')
    let resolved = false

    sock.on('message', (msg) => {
      if (resolved) return
      const text = msg.toString()
      if (text.startsWith('MULTINOTE_PONG:')) {
        const port = parseInt(text.split(':')[1], 10) || WS_PORT
        resolved = true
        sock.close()
        resolve({ host: sock._boundAddr || 'localhost', port })
      }
    })

    sock.on('error', (err) => {
      if (!resolved) {
        resolved = true
        sock.close()
        console.error('[LAN] Discovery error:', err.message)
        resolve(null)
      }
    })

    // 发送广播
    sock.bind(() => {
      sock.setBroadcast(true)
      sock.send(PROBE_MSG, 0, PROBE_MSG.length, LAN_PORT, '255.255.255.255', (err) => {
        if (err) console.error('[LAN] Broadcast error:', err.message)
      })
    })

    // 超时
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        sock.close()
        resolve(null)
      }
    }, timeout)
  })
}

/**
 * 停止 LAN 发现
 * @param {dgram.Socket} sock
 */
export function stopDiscovery(sock) {
  if (sock) {
    try { sock.close() } catch (_) { /* ignore */ }
  }
}
