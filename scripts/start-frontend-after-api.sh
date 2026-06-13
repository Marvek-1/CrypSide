#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/home/idona/MoStar/_apps/financial/crypside/CrypSide"
API_URL="${PYTHON_API_BASE_URL:-http://127.0.0.1:8787}/status"
WAIT_SECONDS="${CRYPSIDE_FRONTEND_API_WAIT_SECONDS:-60}"

cd "$APP_ROOT"

deadline=$((SECONDS + WAIT_SECONDS))
until curl -fsS --noproxy '*' "$API_URL" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "crypside-frontend: API did not become ready at $API_URL within ${WAIT_SECONDS}s" >&2
    exit 1
  fi
  sleep 1
done

export HOSTNAME="127.0.0.1"
export PORT="${PORT:-3001}"

mkdir -p .next/standalone/.next/static
cp -a .next/static/. .next/standalone/.next/static/

if [[ -d public ]]; then
  mkdir -p .next/standalone/public
  cp -a public/. .next/standalone/public/
fi

exec node .next/standalone/server.js
