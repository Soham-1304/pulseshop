#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# PulseShop 5-Second Demo Reset Script
# Restores all services to healthy state, restarts any killed container,
# and resets product stock counts.
# ---------------------------------------------------------------------------

GATEWAY_URL="${GATEWAY_URL:-http://localhost:4000}"

echo "[Reset] Resetting all active faults via Gateway API..."
curl -sS -X POST "${GATEWAY_URL}/api/faults" \
  -H "Content-Type: application/json" \
  -d '{"target":"reset-all","resetStock":true}' || true
echo ""

if command -v docker >/dev/null 2>&1; then
  if docker ps -a --format '{{.Names}}' | grep -q '^pulseshop-payments$'; then
    echo "[Reset] Ensuring pulseshop-payments container is running..."
    docker start pulseshop-payments >/dev/null 2>&1 || true
  fi
fi

echo "[Reset] PulseShop restored to healthy baseline."
