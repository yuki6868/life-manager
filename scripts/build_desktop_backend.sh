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
  --collect-submodules app \
  --distpath dist \
  --workpath build

echo "backend/dist/life-manager-backend を作成しました。"
