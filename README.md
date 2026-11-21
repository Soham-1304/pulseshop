# PulseShop — Production Microservices Store & SRE Observability Target

**PulseShop** is a full-stack **Electronics & Developer Gear E-Commerce Platform** built as the target microservices system (**Piece 0**) for our **AI Site-Reliability Agent + Sietch Supply-Chain Gate (AIA-02)**.

It supports **dual-mode deployment**:
1. **Cloud Hosted (Vercel + MongoDB Atlas)** via `vercel.json` and `api/index.js`.
2. **Containerized Microservices Stack (GCP VM / Local Docker Compose)** with **Nginx Canary routing, Prometheus (5-second scrape), Grafana, Redis, MongoDB, and a continuous Load Generator**.

---

## Architecture

| Component | Port | Tech Stack | Role |
|---|---|---|---|
| `frontend` | `5173` / `80` | React 18, Vite, CSS | Storefront UI, Cart Checkout, Live Orders Feed, and SRE Chaos Lab |
| `nginx` | `8080` | Nginx 1.27 | Reverse proxy + 90/10 Canary weight routing between `orders-v1` and `orders-v2` |
| `gateway` | `4000` | Node.js, Express | API Gateway routing `/api/products`, `/api/checkout`, `/api/orders`, `/api/telemetry` |
| `orders` | `4001` | Node.js, Express, Mongoose | Product catalog, promo discounts, order persistence, `shop_orders_created_total` metric |
| `payments` | `4002` | Node.js, Express, Mongoose | Payment authorization (`POST /pay`) & transaction ledger |
| `prometheus` | `9090` | Prometheus | Scrapes `/metrics` across `gateway`, `orders`, and `payments` every **5 seconds** |
| `grafana` | `3000` | Grafana | Live RED metrics & business metrics dashboard (`monitoring/grafana-dashboard.json`) |

---

## Quick Start

### 1. Run Locally (Node Microservices + Vite Frontend)
```bash
npm install
npm test
npm run dev:gateway
# In a second terminal:
npm run dev:frontend
```

### 2. Run Full Docker Compose Stack (GCP VM or Local)
```bash
docker compose up -d --build
# Storefront (via Nginx): http://localhost:8080
# Gateway API:            http://localhost:4000/api/health
# Prometheus Metrics:     http://localhost:4000/metrics
# Prometheus UI:          http://localhost:9090
# Grafana UI:             http://localhost:3000 (admin / admin)
```

### 3. Deploy to Vercel + MongoDB Atlas
1. Push this repository to GitHub.
2. Import the repository in **Vercel** (uses root `vercel.json` automatically).
3. Add `MONGODB_URI` (your MongoDB Atlas connection string) in Vercel Environment Variables.

---

## Pre-Wired Fault Scenarios (For Demo & Live Judge Testing)

| Fault Scenario | Trigger Command | What Breaks | How the SRE Agent Detects It |
|---|---|---|---|
| **`bug-checkout` (Code Fault)** | `./scripts/inject-fault.sh bug-checkout` *(or push branch `bug-checkout`)* | `TypeError: Cannot read properties of undefined (reading 'percentage')` in `services/orders/src/routes/orders.js` | `5xx` rate spikes > 5%; JSON error log emits `topFrame` (`services/orders/src/routes/orders.js:49`); `git blame` identifies the culprit commit. |
| **`silent-order-drop` (Business Metric Drop)** | `./scripts/inject-fault.sh silent-order-drop` | Checkout returns `201 Created` with zero 5xx errors, but skips `Order.create()` | `shop_orders_created_total` per minute drops to 0 while request rate stays normal. |
| **`slow-query` (p95 Latency Spike)** | `./scripts/inject-fault.sh slow-query` *(or push branch `slow-query`)* | `POST /orders` delayed by `1450ms` | `http_request_duration_seconds` p95 doubles for > 2 minutes. |
| **`payments-outage` / `kill-payments-container` (Runtime Fault)** | `./scripts/inject-fault.sh payments-outage` or `docker stop pulseshop-payments` | `payments` service returns `503` or refuses connections with **no new git commit** | Tagged as **`runtime fault`** (no release in 15-min window); Brain inspects container state & prescribes instance recovery / restart via *The Hands*. |
| **`bad-package` (Sietch Sandbox Block)** | Open PR from branch `bad-package` | Adds `@sietch-demo/currency-format-lite` with malicious `postinstall` script | Sietch detonates tarball in locked Docker sandbox, catches `~/.npmrc` & `~/.aws/credentials` read, blocks PR. |

### Instant Reset (5 Seconds)
```bash
./scripts/reset.sh
```
