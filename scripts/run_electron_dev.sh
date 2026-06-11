#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d "backend/.venv" ]; then
  echo "backend/.venv がありません。先に backend のセットアップをしてください。" >&2
  exit 1
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "frontend/node_modules がありません。先に frontend で npm install を実行してください。" >&2
  exit 1
fi

cleanup() {
  if [ -n "${FRONTEND_PID:-}" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd frontend
npm run dev -- --host 127.0.0.1 > /tmp/life-manager-vite.log 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 2
npm run electron:dev
