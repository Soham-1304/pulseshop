#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# PulseShop Live Fault & Judge Chaos Injector
# Usage:
#   ./scripts/inject-fault.sh bug-checkout
#   ./scripts/inject-fault.sh silent-order-drop
#   ./scripts/inject-fault.sh slow-query
#   ./scripts/inject-fault.sh payments-outage
#   ./scripts/inject-fault.sh kill-payments-container
# ---------------------------------------------------------------------------

FAULT="${1:-bug-checkout}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:4000}"

case "$FAULT" in
  bug-checkout)
    echo "[Fault Injector] Activating code fault: bug-checkout on orders service..."
    curl -sS -X POST "${GATEWAY_URL}/api/faults" \
      -H "Content-Type: application/json" \
      -d '{"target":"orders","mode":"bug-checkout"}'
    echo ""
    ;;
  silent-order-drop)
    echo "[Fault Injector] Activating silent business metric drop: silent-order-drop..."
    curl -sS -X POST "${GATEWAY_URL}/api/faults" \
      -H "Content-Type: application/json" \
      -d '{"target":"orders","mode":"silent-order-drop"}'
    echo ""
    ;;
  slow-query)
    echo "[Fault Injector] Activating latency spike: slow-query (+1450ms)..."
    curl -sS -X POST "${GATEWAY_URL}/api/faults" \
      -H "Content-Type: application/json" \
      -d '{"target":"orders","mode":"slow-query","latencyMs":1450}'
    echo ""
    ;;
  payments-outage)
    echo "[Fault Injector] Activating runtime fault: payments outage (no commit)..."
    curl -sS -X POST "${GATEWAY_URL}/api/faults" \
      -H "Content-Type: application/json" \
      -d '{"target":"payments","mode":"outage"}'
    echo ""
    ;;
  kill-payments-container)
    echo "[Fault Injector] Stopping pulseshop-payments container (live judge chaos)..."
    docker stop pulseshop-payments
    ;;
  *)
    echo "Unknown fault: $FAULT"
    echo "Valid faults: bug-checkout | silent-order-drop | slow-query | payments-outage | kill-payments-container"
    exit 1
    ;;
esac
