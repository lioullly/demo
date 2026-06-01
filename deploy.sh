#!/bin/bash
# 云服务器部署脚本
# 使用: ROOM=你的密码 bash deploy.sh

set -e

ROOM=${ROOM:-demo1234}
PORT=${PORT:-3000}

echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>/dev/null || true
apt-get install -y nodejs 2>/dev/null || yum install -y nodejs 2>/dev/null || true

echo "Installing dependencies..."
npm install --production

echo "Starting server on port $PORT with room code: $ROOM"
echo "Client URL: http://$(curl -s ifconfig.me):$PORT?room=$ROOM"
echo ""

ROOM=$ROOM PORT=$PORT node server.js
