# Dual Note Sync

双人手写笔记同步实验 — Electron + UDP 广播 + WebSocket

## 快速开始

```bash
npm install
npm start
```

在两台电脑上同时启动，同一 WiFi 下自动发现并连接。

## 架构

```
src/
├── electron/
│   ├── main.js        # Electron 主进程（UDP + WS 服务）
│   └── preload.js     # 安全 IPC 桥接
├── sync/
│   ├── lan.js         # UDP 广播发现（port 41234）
│   ├── transport.js   # WebSocket 传输（port 3000）
│   └── protocol.js    # JSON 消息协议
├── db/
│   └── sqlite.js      # SQLite 本地存储
├── renderer/
│   └── index.js       # UI ↔ Sync 胶水层
└── ui/
    ├── index.html      # 主界面
    └── app.js          # Canvas 手写 + 同步逻辑
```

## 同步协议

```json
{
  "id": "uuid",
  "pageId": "page_a",
  "userId": "user_a",
  "type": "stroke | text | image | erase",
  "payload": {},
  "ts": 1700000000,
  "source": "A"
}
```

- 每台设备只写自己的页面（pageId + userId 隔离）
- source 字段防回环
- 只同步增量操作

## 端口

| 端口 | 用途 |
|------|------|
| 41234 | UDP 广播发现 |
| 3000  | WebSocket 同步数据 |

## 公网扩展

- STUN（公网 IP 发现）
- TURN（coturn 中继，校园网兜底）
- Transport 抽象层，上层不变
