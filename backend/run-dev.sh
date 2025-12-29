#!/usr/bin/env bash
set -euo pipefail

# This script is intended to LIVE INSIDE: TrueMatch Final/backend/run-dev.sh
# It will:
# 1) start an ngrok tunnel to your backend PORT
# 2) read the LIVE ngrok public URL
# 3) start your Node server with that URL exported

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"

cd "$BACKEND_DIR"

# ---- Read PORT from backend/.env (default 3000) ----
PORT="3000"
if [[ -f ".env" ]]; then
  PORT_LINE="$(grep -E '^[[:space:]]*PORT[[:space:]]*=' ".env" | tail -n 1 || true)"
  if [[ -n "${PORT_LINE:-}" ]]; then
    PORT="${PORT_LINE#*=}"
    PORT="${PORT//$'\r'/}"
    PORT="${PORT//\"/}"
    PORT="${PORT//\'/}"
    PORT="$(echo "$PORT" | xargs)"
  fi
fi

# ---- Sanity checks ----
for cmd in node npm ngrok curl grep; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: '$cmd' is not installed or not in PATH."
    exit 1
  fi
done

# ---- Start ngrok (background) ----
echo "[1/3] Starting ngrok tunnel -> http://127.0.0.1:${PORT}"
ngrok http "${PORT}" --log=stdout > "${BACKEND_DIR}/ngrok.log" 2>&1 &
NGROK_PID=$!

cleanup() {
  echo ""
  echo "Stopping ngrok..."
  kill "$NGROK_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# ---- Get LIVE ngrok URL from ngrok local API ----
echo "[2/3] Waiting for ngrok public URL (http://127.0.0.1:4040)..."
NGROK_PUBLIC_URL=""
i=0
while [ "$i" -lt 160 ]; do
  json="$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null || true)"
  # Grab the first https URL from the JSON (keeps it simple + avoids regex parentheses issues)
  NGROK_PUBLIC_URL="$(echo "$json" | grep -oE 'https://[^"]+' | head -n 1 || true)"
  if [[ -n "${NGROK_PUBLIC_URL:-}" ]]; then
    break
  fi
  i="$(expr "$i" + 1)"
  sleep 0.25
done

if [[ -z "${NGROK_PUBLIC_URL:-}" ]]; then
  echo "ERROR: Could not read ngrok URL from http://127.0.0.1:4040."
  echo "Open ${BACKEND_DIR}/ngrok.log to see why ngrok failed."
  exit 1
fi

echo "LIVE ngrok URL: ${NGROK_PUBLIC_URL}"
echo "ngrok Inspector: http://127.0.0.1:4040"
echo ""

# ---- Export URL for your app (use whichever your code expects) ----
export APP_BASE_URL="${NGROK_PUBLIC_URL}"
export NGROK_URL="${NGROK_PUBLIC_URL}"
export PUBLIC_URL="${NGROK_PUBLIC_URL}"

# ---- Start server ----
echo "[3/3] Starting server..."
# Prefer backend/package.json if present; otherwise run from project root
if [[ -f "${BACKEND_DIR}/package.json" ]]; then
  cd "$BACKEND_DIR"
  npm start
elif [[ -f "${PROJECT_ROOT}/package.json" ]]; then
  cd "$PROJECT_ROOT"
  npm start
else
  node "${BACKEND_DIR}/server.js"
fi
