# Handwriting Sync — iPad H5 手写笔记实时同步

两台 iPad 局域网实时同步手写笔记。纯 H5，无需安装 App。

## 快速开始

```bash
npm install
npm start
```

主机启动后：
- 主机 IP 显示在终端
- 平板浏览器打开 `http://主机IP:3000`
- 点 **扫描** 自动发现主机，或手动输入 IP

## 架构

```
iPad A (主机)                iPad B (客户端)
┌──────────────┐            ┌──────────────┐
│ node server  │◄── WS ───▶│  H5 浏览器    │
│ UDP 广播响应 │            │  IndexedDB   │
│ 静态文件服务  │            │  Canvas 手写 │
└──────────────┘            └──────────────┘
```

## 技术栈

| 层 | 技术 |
|---|---|
| 主机 | Node.js + ws |
| 客户端 | HTML5 Canvas + WebSocket + IndexedDB |
| 网络发现 | UDP 广播 + HTTP 扫描 |
| 同步格式 | JSON 增量操作 (stroke/erase) |
