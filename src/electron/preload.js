/**
 * Electron Preload — 暴露安全 API 到渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron'

const api = {
  /** 发送同步消息（stroke/text/image/erase） */
  sendMessage(msg) {
    ipcRenderer.send('send-message', msg)
  },

  /** 监听远程同步消息 */
  onSyncMessage(callback) {
    const handler = (_event, msg) => callback(msg)
    ipcRenderer.on('sync-message', handler)
    return () => ipcRenderer.removeListener('sync-message', handler)
  },

  /** 监听对端连接事件 */
  onPeerConnected(callback) {
    const handler = (_event, clientId) => callback(clientId)
    ipcRenderer.on('peer-connected', handler)
    return () => ipcRenderer.removeListener('peer-connected', handler)
  },

  /** 监听对端断开事件 */
  onPeerDisconnected(callback) {
    const handler = (_event, clientId) => callback(clientId)
    ipcRenderer.on('peer-disconnected', handler)
    return () => ipcRenderer.removeListener('peer-disconnected', handler)
  },

  /** 查询 WS 服务状态（含本机 IP） */
  async getWSStatus() {
    return ipcRenderer.invoke('get-ws-status')
  },

  /** 获取本机局域网 IP */
  async getLanIP() {
    return ipcRenderer.invoke('get-lan-ip')
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
