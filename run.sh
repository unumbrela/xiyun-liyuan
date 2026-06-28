#!/usr/bin/env bash
# 一键启动：后端(FastAPI) + 前端(Vite)。先确保已跑完 pipeline（见 README）。
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
source ~/anaconda3/etc/profile.d/conda.sh
conda activate llm

# 端口预检：被占用时给出明确提示（否则后端会静默绑定失败、前端报"后端未连接"）。
port_busy() { ss -ltn 2>/dev/null | grep -q ":$1 "; }
check_port() {
  if port_busy "$1"; then
    echo "✗ 端口 $1 已被占用（$2）。请先释放：fuser -k $1/tcp   或   kill \$(ss -ltnp | grep :$1 | grep -oP 'pid=\\K[0-9]+')"
    exit 1
  fi
}
check_port 8000 后端
check_port 5173 前端

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$LAN_IP" ] || LAN_IP="127.0.0.1"

echo "[1/2] 启动后端 http://$LAN_IP:8000 ..."
( cd "$ROOT" && uvicorn backend.main:app --host 0.0.0.0 --port 8000 ) &
BACK=$!
trap "kill $BACK 2>/dev/null" EXIT

echo "[2/2] 启动前端 http://$LAN_IP:5173 ..."
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
npm run dev
