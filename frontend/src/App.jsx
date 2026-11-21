import React, { useEffect, useRef, useState } from "react";

const CATEGORIES = ["All", "Peripherals", "Displays", "Connectivity", "Audio", "Storage"];

const FAULT_PRESETS = [
  {
    id: "healthy",
    label: "Healthy Baseline (Reset All)",
    target: "reset-all",
    mode: "healthy",
    badge: "ok",
    description: "Restores all microservices to normal latency and zero error state.",
  },
  {
    id: "bug-checkout",
    label: "Code Fault: bug-checkout (500 TypeError)",
    target: "orders",
    mode: "bug-checkout",
    badge: "err",
    description:
      "Simulates pushing commit on branch bug-checkout: unguarded discount.percentage access in services/orders/src/routes/orders.js throws TypeError with stack trace.",
  },
  {
    id: "silent-order-drop",
    label: "Silent Business Fault: silent-order-drop",
    target: "orders",
    mode: "silent-order-drop",
    badge: "warn",
    description:
      "Checkout returns HTTP 201 OK with zero 5xx logs, but orders are not persisted to MongoDB. Caught by Watcher business metric drop rule.",
  },
  {
    id: "slow-query",
    label: "Latency Spike: slow-query (+1450ms p95)",
    target: "orders",
    mode: "slow-query",
    latencyMs: 1450,
    badge: "warn",
    description:
      "Injects a 1.45s delay in orders service, causing p95 response time to exceed 2x baseline.",
  },
  {
    id: "payments-outage",
    label: "Runtime Fault: Payments Outage (No Commit)",
    target: "payments",
    mode: "outage",
    badge: "err",
    description:
      "Simulates live judge chaos on payments service without a release commit. SRE Agent tags this as a runtime fault.",
  },
];

export default function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [faults, setFaults] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [promoCode, setPromoCode] = useState("");
  const [customerEmail, setCustomerEmail] = useState("sre.demo@pulseshop.io");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);

  const cartDialogRef = useRef(null);
  const chaosDialogRef = useRef(null);

  // Attach modern-web-guidance light-dismiss fallback for browsers without native HTMLDialogElement.prototype.closedBy
  useEffect(() => {
    const dialogs = [cartDialogRef.current, chaosDialogRef.current].filter(Boolean);
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const cleanups = dialogs.map((dialog) => {
      const handleClick = (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener("click", handleClick);
      return () => dialog.removeEventListener("click", handleClick);
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  async function refreshAll() {
    try {
      const [prodRes, ordRes, telRes, logRes, faultRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/orders?limit=12"),
        fetch("/api/telemetry"),
        fetch("/api/logs"),
        fetch("/api/faults"),
      ]);

      if (prodRes.ok) {
        const pData = await prodRes.json();
        setProducts(pData.products || []);
      }
      if (ordRes.ok) {
        const oData = await ordRes.json();
        setOrders(oData.orders || []);
      }
      if (telRes.ok) {
        setTelemetry(await telRes.json());
      }
      if (logRes.ok) {
        const lData = await logRes.json();
        setLogs(lData.logs || []);
      }
      if (faultRes.ok) {
        setFaults(await faultRes.json());
      }
    } catch (_err) {
      // keep existing UI state if backend is momentarily restarting
    }
  }

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 3000);
    return () => clearInterval(interval);
  }, []);

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.sku === product.sku);
      if (existing) {
        return prev.map((i) => (i.sku === product.sku ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          sku: product.sku,
          name: product.name,
          unitPrice: product.price,
          quantity: 1,
        },
      ];
    });
  }

  async function executeCheckout(itemsToBuy, customPromo = promoCode) {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail,
          items: itemsToBuy,
          promoCode: customPromo ? customPromo.trim() : null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setBanner({
          type: "err",
          title: `Checkout Failed (${res.status} ${data.error || "Error"}) in ${data.service || "service"}`,
          message: data.message || "Unexpected checkout failure",
          topFrame: data.topFrame,
          commit: data.commit,
        });
      } else if (data.order && data.order.persisted === false) {
        setBanner({
          type: "warn",
          title: `HTTP 201 Returned · Order ${data.order.orderId} Pending Async Sync`,
          message:
            "Notice: HTTP status was 201 Created with zero 5xx errors, but order persistence was skipped (silent business logic bug).",
        });
        setCart([]);
      } else {
        setBanner({
          type: "ok",
          title: `Order Confirmed · ${data.order.orderId}`,
          message: `Authorized ${data.payment.paymentId} for $${data.order.totalAmount.toFixed(2)} via orders-${data.order.serviceVersion}.`,
        });
        setCart([]);
      }
    } catch (err) {
      setBanner({
        type: "err",
        title: "Network / Gateway Unreachable",
        message: err.message,
      });
    } finally {
      setBusy(false);
      await refreshAll();
    }
  }

  async function triggerFaultPreset(preset) {
    setBusy(true);
    try {
      await fetch("/api/faults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: preset.target,
          mode: preset.mode,
          latencyMs: preset.latencyMs || 0,
        }),
      });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function fireTrafficBurst(count = 5) {
    setBusy(true);
    try {
      const sampleProduct = products[0] || {
        sku: "PS-KB-01",
        name: "Keychron Q1 Pro Wireless Custom Mechanical Keyboard",
        price: 199.0,
      };
      for (let i = 0; i < count; i++) {
        await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerEmail: `load.user.${i + 1}@pulseshop.io`,
            items: [{ sku: sampleProduct.sku, name: sampleProduct.name, unitPrice: sampleProduct.price, quantity: 1 }],
          }),
        });
      }
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  const filteredProducts =
    selectedCategory === "All"
      ? products
      : products.filter((p) => p.category === selectedCategory);

  const ordersMode = faults?.orders?.mode || "healthy";
  const paymentsMode = faults?.payments?.mode || "healthy";
  const systemHealthy = ordersMode === "healthy" && paymentsMode === "healthy";

  const gwMetrics = telemetry?.gateway || {};
  const ordMetrics = telemetry?.orders || {};
  const cartTotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div>
      {/* Live Prometheus & Microservice Telemetry Bar */}
      <div className="telemetry-bar">
        <div className="telemetry-metrics">
          <span className="metric-chip">
            <span className={`status-dot ${systemHealthy ? "ok" : "err"}`} />
            <strong>SYSTEM:</strong>
            <span className="mono-num">
              {systemHealthy ? "HEALTHY" : `FAULT (${ordersMode !== "healthy" ? ordersMode : paymentsMode})`}
            </span>
          </span>

          <span className="metric-chip">
            <strong>RELEASE:</strong>
            <span className="mono-num">
              orders-{ordMetrics.version || "v1"} @ {(ordMetrics.commit || "HEAD").slice(0, 7)}
            </span>
          </span>

          <span className="metric-chip">
            <strong>5XX RATE (1M):</strong>
            <span
              className="mono-num"
              style={{
                color: (ordMetrics.errorRatePct || 0) > 5 ? "#f87171" : "#34d399",
                fontWeight: 600,
              }}
            >
              {ordMetrics.errorRatePct ?? 0}%
            </span>
          </span>

          <span className="metric-chip">
            <strong>P95 LATENCY:</strong>
            <span
              className="mono-num"
              style={{
                color: (ordMetrics.p95LatencyMs || 12) > 400 ? "#fbbf24" : "#f3f5f8",
                fontWeight: 600,
              }}
            >
              {ordMetrics.p95LatencyMs ?? 12.0} ms
            </span>
          </span>

          <span className="metric-chip">
            <strong>ORDERS/MIN:</strong>
            <span className="mono-num" style={{ color: "#34d399", fontWeight: 600 }}>
              {ordMetrics.ordersCreatedPerMin ?? 0}/min
            </span>
          </span>

          <span className="metric-chip">
            <strong>REQ/MIN:</strong>
            <span className="mono-num">{gwMetrics.requestsPerMin ?? 0}</span>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            className="btn"
            onClick={() => fireTrafficBurst(5)}
            disabled={busy}
          >
            Simulate 5 Checkouts
          </button>
          <button
            type="button"
            className={`btn ${systemHealthy ? "" : "btn-danger"}`}
            onClick={() => chaosDialogRef.current?.showModal()}
          >
            SRE Fault & Chaos Lab
          </button>
        </div>
      </div>

      {/* Storefront Header */}
      <header className="site-header">
        <div>
          <h1 className="brand-title">
            PulseShop
            <span className={`badge-pill ${systemHealthy ? "ok" : "err"}`}>
              {systemHealthy ? "PRODUCTION · V1" : `INCIDENT · ${ordersMode !== "healthy" ? ordersMode.toUpperCase() : paymentsMode.toUpperCase()}`}
            </span>
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <a
            href="/metrics"
            target="_blank"
            rel="noreferrer"
            className="btn mono-num"
            style={{ textDecoration: "none" }}
          >
            /metrics
          </a>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className="btn mono-num"
            style={{ textDecoration: "none" }}
          >
            /api/health
          </a>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => cartDialogRef.current?.showModal()}
          >
            Checkout Cart
            <span className="mono-num">
              ({cartCount} · ${cartTotal.toFixed(0)})
            </span>
          </button>
        </div>
      </header>

      <main className="main-container">
        {/* Live Checkout Result / Stack Trace Alert Banner */}
        {banner && (
          <div className={`alert-banner ${banner.type}`} role="status">
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <strong style={{ fontSize: "0.9375rem" }}>{banner.title}</strong>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                {banner.message}
              </span>
              {banner.topFrame && (
                <div className="mono-num" style={{ fontSize: "0.75rem", marginTop: "4px", color: "#fca5a5" }}>
                  Culprit Frame: {banner.topFrame.file}:{banner.topFrame.line}:{banner.topFrame.column} (fn:{" "}
                  {banner.topFrame.function}) · Commit: {banner.commit || "HEAD"}
                </div>
              )}
            </div>
            <button type="button" className="btn" onClick={() => setBanner(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* Category Filter Bar */}
        <div className="filter-row">
          <div className="category-tabs" role="tablist" aria-label="Hardware Categories">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`tab-btn ${selectedCategory === category ? "active" : ""}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="mono-num" style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Promo Codes: <strong>PULSE10</strong> (10%) · <strong>SRE15</strong> (15%) · <strong>DEV20</strong> (20%)
          </div>
        </div>

        {/* Hardware Product Catalog Grid */}
        <section className="product-grid" aria-label="Hardware Catalog">
          {filteredProducts.map((product) => (
            <article key={product.sku} className="product-card">
              <div>
                <div className="product-meta">
                  <span className="badge-pill mono-num">{product.sku}</span>
                  <span className="badge-pill ok mono-num">{product.stock} in stock</span>
                </div>
                <h2 className="product-title">{product.name}</h2>
                <p className="product-desc">{product.description}</p>
              </div>

              <div className="product-footer">
                <span className="price-tag">${product.price.toFixed(2)}</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => addToCart(product)}
                    disabled={busy}
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      executeCheckout([
                        {
                          sku: product.sku,
                          name: product.name,
                          unitPrice: product.price,
                          quantity: 1,
                        },
                      ])
                    }
                    disabled={busy}
                  >
                    1-Click Buy
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>

        {/* Bottom Split: Real-time MongoDB Orders Table + Structured JSON Error Log Stream */}
        <section className="bottom-split">
          <div className="panel-box">
            <div className="panel-header">
              <h2 className="panel-title">Live Persisted Orders (MongoDB)</h2>
              <span className="badge-pill mono-num">{orders.length} recent</span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Version</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((ord) => (
                    <tr key={ord.orderId}>
                      <td className="mono-num" style={{ fontWeight: 600 }}>
                        {ord.orderId}
                      </td>
                      <td>{ord.customerEmail}</td>
                      <td className="mono-num">${Number(ord.totalAmount || 0).toFixed(2)}</td>
                      <td className="mono-num">{ord.paymentId}</td>
                      <td className="mono-num">orders-{ord.serviceVersion || "v1"}</td>
                      <td>
                        <span className="badge-pill ok">{ord.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel-box">
            <div className="panel-header">
              <h2 className="panel-title">Structured JSON Telemetry & Error Stream</h2>
              <span className="badge-pill mono-num">GET /api/logs</span>
            </div>

            <div className="log-feed">
              {logs.length === 0 ? (
                <div className="log-item" style={{ color: "var(--text-secondary)" }}>
                  No unhandled exceptions logged. All services operating normally.
                </div>
              ) : (
                logs.slice(0, 12).map((entry, idx) => (
                  <div key={`${entry.timestamp}-${idx}`} className={`log-item ${entry.level}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <strong style={{ color: entry.level === "error" ? "#f87171" : "#34d399" }}>
                        [{entry.level.toUpperCase()}] {entry.service} ({entry.version})
                      </strong>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div>{entry.message}</div>
                    {entry.topFrame && (
                      <div style={{ color: "#fbbf24", marginTop: "4px" }}>
                        ↳ {entry.topFrame.file}:{entry.topFrame.line} ({entry.topFrame.function})
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Native Modal Dialog 1: Cart & Checkout (Follows modern-web-guidance dialog & light-dismiss-a-dialog) */}
      <dialog ref={cartDialogRef} closedby="any" aria-labelledby="cart-dialog-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 id="cart-dialog-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>
            Checkout Cart ({cartCount} items)
          </h2>
          <form method="dialog">
            <button type="submit" className="btn">
              Close
            </button>
          </form>
        </div>

        {cart.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Your cart is empty. Add any hardware item or use 1-Click Buy on the catalog.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {cart.map((item) => (
              <div
                key={item.sku}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: "10px",
                  borderBottom: "1px solid var(--border-hairline)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  <div className="mono-num" style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {item.sku} · Qty {item.quantity} × ${item.unitPrice.toFixed(2)}
                  </div>
                </div>
                <div className="mono-num" style={{ fontWeight: 600 }}>
                  ${(item.unitPrice * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label
                  htmlFor="checkout-email"
                  style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px" }}
                >
                  Customer Email
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  className="input-field"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="checkout-promo"
                  style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "4px" }}
                >
                  Promo Code (Optional)
                </label>
                <input
                  id="checkout-promo"
                  type="text"
                  placeholder="PULSE10"
                  className="input-field mono-num"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "12px",
                borderTop: "1px solid var(--border-hairline)",
              }}
            >
              <span className="mono-num" style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                Total: ${cartTotal.toFixed(2)}
              </span>
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" className="btn" onClick={() => setCart([])}>
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={async () => {
                    await executeCheckout(cart, promoCode);
                    cartDialogRef.current?.close();
                  }}
                >
                  Authorize & Place Order
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>

      {/* Native Modal Dialog 2: SRE Fault & Judge Chaos Lab */}
      <dialog ref={chaosDialogRef} closedby="any" aria-labelledby="chaos-dialog-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 id="chaos-dialog-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>
            SRE Fault & Judge Live-Break Lab
          </h2>
          <form method="dialog">
            <button type="submit" className="btn">
              Close
            </button>
          </form>
        </div>

        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: 0, marginBottom: "16px" }}>
          Inject any CORE 1 / CORE 2 fault scenario live or reset the shop to healthy in one tap.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {FAULT_PRESETS.map((preset) => {
            const isActive =
              (preset.target === "reset-all" && systemHealthy) ||
              (preset.target === "orders" && ordersMode === preset.mode) ||
              (preset.target === "payments" && paymentsMode === preset.mode);

            return (
              <div
                key={preset.id}
                style={{
                  background: "#0c0e14",
                  border: isActive ? "1px solid var(--accent-emerald)" : "1px solid var(--border-hairline)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}>
                    <span>{preset.label}</span>
                    {isActive && <span className="badge-pill ok">ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {preset.description}
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn ${preset.badge === "err" ? "btn-danger" : preset.badge === "ok" ? "btn-primary" : ""}`}
                  disabled={busy}
                  onClick={() => triggerFaultPreset(preset)}
                >
                  {preset.target === "reset-all" ? "Reset" : "Activate"}
                </button>
              </div>
            );
          })}
        </div>
      </dialog>
    </div>
  );
}
