/**
 * Electron 主进程
 *
 * 职责：
 *   1. 创建 BrowserWindow
 *   2. 启动 UDP LAN 发现（主机模式）
 *   3. 启动 WebSocket 服务器
 *   4. IPC 桥接：renderer ↔ 主进程 ↔ WS
 */

import { networkInterfaces } from 'os'
import { app, BrowserWindow, ipcMain } from 'electron'
import { startHostDiscovery, stopDiscovery } from '../sync/lan.js'
import { createWSServer } from '../sync/transport.js'
import { initDB } from '../db/sqlite.js'

let mainWindow = null
let udpSocket = null
let wssData = null

/** 获取本机局域网 IPv4 地址 */
function getLanIP() {
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: new URL('preload.js', import.meta.url).pathname,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Dual Note Sync',
  })

  // 开发模式加载本地文件
  const uiPath = new URL('../ui/index.html', import.meta.url).pathname
  mainWindow.loadFile(uiPath)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/* ── 启动同步服务 ── */

function startSyncServices() {
  // 1. UDP LAN 发现
  udpSocket = startHostDiscovery()

  // 2. WebSocket 服务
  wssData = createWSServer({
    onMessage(msg, clientId) {
      // 转发消息到渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync-message', msg)
      }
    },
    onConnect(clientId) {
      console.log(`[Main] Peer joined: ${clientId}`)
      if (mainWindow) {
        mainWindow.webContents.send('peer-connected', clientId)
      }
    },
    onDisconnect(clientId) {
      console.log(`[Main] Peer left: ${clientId}`)
      if (mainWindow) {
        mainWindow.webContents.send('peer-disconnected', clientId)
      }
    },
  })
}

/* ── IPC: 渲染进程发消息到 WS ── */

ipcMain.on('send-message', (_event, msg) => {
  if (wssData) {
    wssData.broadcast(msg)
  }
})

ipcMain.handle('get-ws-status', () => {
  return { running: !!wssData, lanIP: getLanIP() }
})

ipcMain.handle('get-lan-ip', () => {
  return getLanIP()
})

/* ── 应用生命周期 ── */

app.whenReady().then(async () => {
  await initDB()
  createWindow()
  startSyncServices()
})

app.on('window-all-closed', () => {
  stopDiscovery(udpSocket)
  if (wssData?.wss) wssData.wss.close()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
