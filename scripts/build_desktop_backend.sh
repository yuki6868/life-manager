#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"

PYTHON_BIN="${PYTHON:-python3}"
if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
fi

"$PYTHON_BIN" -m PyInstaller desktop_server.py \
  --onefile \
  --name life-manager-backend \
  --clean \
  --paths . \
  --hidden-import app.main \
  --hidden-import uvicorn \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import fastapi \
  --hidden-import starlette \
  --hidden-import aiosqlite \
  --hidden-import sqlalchemy.dialects.sqlite.aiosqlite \
  --collect-submodules app \
  --collect-submodules uvicorn \
  --collect-submodules fastapi \
  --collect-submodules starlette \
  --collect-submodules sqlalchemy \
  --collect-submodules aiosqlite \
  --distpath dist \
  --workpath build

echo "backend/dist/life-manager-backend を作成しました。"
