import React, { useEffect, useRef, useState } from "react";

const CATEGORIES = ["All", "Peripherals", "Displays", "Connectivity", "Audio", "Storage"];

const FAULT_PRESETS = [
  {
    id: "healthy",
    label: "Healthy Baseline (Reset All)",
    target: "reset-all",
    mode: "healthy",
    tone: "ok",
    description: "Restores all microservices to normal latency and zero error state.",
  },
  {
    id: "bug-checkout",
    label: "Code Fault: bug-checkout (500 TypeError)",
    target: "orders",
    mode: "bug-checkout",
    tone: "err",
    description:
      "Simulates commit b5de597 on branch bug-checkout: unguarded discountMeta.percentage access in services/orders/src/routes/orders.js throws TypeError.",
  },
  {
    id: "silent-order-drop",
    label: "Silent Business Fault: silent-order-drop",
    target: "orders",
    mode: "silent-order-drop",
    tone: "warn",
    description:
      "Checkout returns HTTP 201 OK with zero 5xx logs, but orders are not saved to MongoDB. Caught by Watcher business metric drop rule.",
  },
  {
    id: "slow-query",
    label: "Latency Spike: slow-query (+1450ms p95)",
    target: "orders",
    mode: "slow-query",
    latencyMs: 1450,
    tone: "warn",
    description:
      "Injects a 1.45s delay in orders service, causing p95 response time to exceed 2x baseline.",
  },
  {
    id: "payments-outage",
    label: "Runtime Fault: Payments Outage (No Commit)",
    target: "payments",
    mode: "outage",
    tone: "err",
    description:
      "Simulates live judge chaos on payments service without a release commit. SRE Agent tags this as a runtime fault.",
  },
];

function HardwareSchematic({ category }) {
  switch (category) {
    case "Peripherals":
      return (
        <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
          <rect x="2" y="8" width="68" height="28" rx="4" stroke="currentColor" strokeWidth="1.5" />
          <rect x="8" y="14" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="17" y="14" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="26" y="14" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="35" y="14" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="44" y="14" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="53" y="14" width="11" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="18" y="24" width="36" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "Displays":
      return (
        <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="64" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M36 32V40M24 40H48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="36" cy="18" r="5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "Connectivity":
      return (
        <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
          <rect x="6" y="14" width="60" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="16" cy="22" r="2.5" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="26" cy="22" r="2.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="36" y="19" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="48" y="19" width="10" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "Audio":
      return (
        <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
          <path
            d="M18 26V20C18 10.6112 26.0589 3 36 3C45.9411 3 54 10.6112 54 20V26"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect x="13" y="23" width="8" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <rect x="51" y="23" width="8" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    default:
      return (
        <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
          <rect x="8" y="12" width="56" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M16 12V8M26 12V8M36 12V8M46 12V8M56 12V8" stroke="currentColor" strokeWidth="1.2" />
          <rect x="16" y="18" width="14" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="36" y="18" width="20" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
}

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
        fetch("/api/orders?limit=10"),
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
          message: data.message || "Unexpected checkout failure. Inspect the stack trace below or open a fix PR.",
          topFrame: data.topFrame,
          commit: data.commit,
        });
      } else if (data.order && data.order.persisted === false) {
        setBanner({
          type: "warn",
          title: `HTTP 201 Returned — Order ${data.order.orderId} Unpersisted`,
          message:
            "HTTP 201 Created returned with zero 5xx logs, but database persistence was skipped (silent business metric drop).",
        });
        setCart([]);
      } else {
        setBanner({
          type: "ok",
          title: `Order Confirmed — ${data.order.orderId}`,
          message: `Authorized payment ${data.payment.paymentId} for $${data.order.totalAmount.toFixed(2)} via orders-${data.order.serviceVersion}.`,
        });
        setCart([]);
      }
    } catch (err) {
      setBanner({
        type: "err",
        title: "Gateway Service Unreachable",
        message: `${err.message}. Verify that the gateway container is running or run reset.sh.`,
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
            items: [
              {
                sku: sampleProduct.sku,
                name: sampleProduct.name,
                unitPrice: sampleProduct.price,
                quantity: 1,
              },
            ],
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
  const activeFaultName = ordersMode !== "healthy" ? ordersMode : paymentsMode;

  const gwMetrics = telemetry?.gateway || {};
  const ordMetrics = telemetry?.orders || {};
  const cartTotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div>
      {/* Top Live Telemetry & Release Strip */}
      <div className="telemetry-strip">
        <div className="telemetry-cluster">
          <span className="telemetry-stat">
            <span className={`status-indicator ${systemHealthy ? "ok" : "err"}`} />
            <span className="telemetry-label">STATUS</span>
            <span className={`telemetry-value ${systemHealthy ? "tone-ok" : "tone-err"}`}>
              {systemHealthy ? "HEALTHY" : `FAULT (${activeFaultName})`}
            </span>
          </span>

          <span className="telemetry-stat">
            <span className="telemetry-label">RELEASE</span>
            <span className="telemetry-value">
              orders-{ordMetrics.version || "v1"} @ {(ordMetrics.commit || "HEAD").slice(0, 7)}
            </span>
          </span>

          <span className="telemetry-stat">
            <span className="telemetry-label">5XX RATE</span>
            <span
              className={`telemetry-value ${(ordMetrics.errorRatePct || 0) > 5 ? "tone-err" : "tone-ok"}`}
            >
              {ordMetrics.errorRatePct ?? 0}%
            </span>
          </span>

          <span className="telemetry-stat">
            <span className="telemetry-label">P95 LATENCY</span>
            <span
              className={`telemetry-value ${(ordMetrics.p95LatencyMs || 12) > 400 ? "tone-warn" : ""}`}
            >
              {ordMetrics.p95LatencyMs ?? 12.0} ms
            </span>
          </span>

          <span className="telemetry-stat">
            <span className="telemetry-label">ORDERS/MIN</span>
            <span className="telemetry-value tone-ok">{ordMetrics.ordersCreatedPerMin ?? 0}</span>
          </span>

          <span className="telemetry-stat">
            <span className="telemetry-label">REQ/MIN</span>
            <span className="telemetry-value">{gwMetrics.requestsPerMin ?? 0}</span>
          </span>
        </div>

        <div className="telemetry-actions">
          <button
            type="button"
            className="btn"
            onClick={() => fireTrafficBurst(5)}
            disabled={busy}
          >
            Run 5 Checkouts
          </button>
          <button
            type="button"
            className={`btn ${systemHealthy ? "" : "btn-danger"}`}
            onClick={() => chaosDialogRef.current?.showModal()}
          >
            SRE Fault Lab
          </button>
        </div>
      </div>

      {/* Main Storefront Header */}
      <header className="store-header">
        <div className="brand-group">
          <div className="brand-row">
            <h1 className="brand-mark">PulseShop</h1>
            <span className={`tag ${systemHealthy ? "ok" : "err"}`}>
              {systemHealthy ? "v1.0.0" : activeFaultName}
            </span>
          </div>
          <p className="brand-summary">
            Precision developer workstations, mechanical input hardware, and studio audio interfaces.
          </p>
        </div>

        <div className="header-controls">
          <a href="/metrics" target="_blank" rel="noreferrer" className="btn mono-num">
            /metrics
          </a>
          <a href="/api/health" target="_blank" rel="noreferrer" className="btn mono-num">
            /api/health
          </a>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => cartDialogRef.current?.showModal()}
          >
            <span>Cart</span>
            <span className="mono-num">
              ({cartCount} / ${cartTotal.toFixed(0)})
            </span>
          </button>
        </div>
      </header>

      <main className="workspace-shell">
        {/* Live Checkout Result / Stack Trace Alert Banner */}
        {banner && (
          <div className={`feedback-banner ${banner.type}`} role="status">
            <div className="feedback-copy">
              <span className="feedback-title">{banner.title}</span>
              <span className="feedback-detail">{banner.message}</span>
              {banner.topFrame && (
                <div className="feedback-trace">
                  Stack Frame: {banner.topFrame.file}:{banner.topFrame.line}:{banner.topFrame.column} (
                  {banner.topFrame.function}) — Commit: {banner.commit || "HEAD"}
                </div>
              )}
            </div>
            <button type="button" className="btn" onClick={() => setBanner(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* Catalog Filter Toolbar */}
        <div className="catalog-toolbar">
          <div className="filter-pills" role="tablist" aria-label="Hardware Categories">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                className={`filter-btn ${selectedCategory === category ? "active" : ""}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="promo-hint">
            <span>Codes:</span>
            <strong>PULSE10</strong>
            <strong>SRE15</strong>
            <strong>DEV20</strong>
          </div>
        </div>

        {/* Architectural Hardware Catalog Matrix */}
        <section className="catalog-matrix" aria-label="Hardware Catalog">
          {filteredProducts.map((product) => (
            <article key={product.sku} className="hardware-cell">
              <div>
                <div className="hardware-top">
                  <span className="hardware-sku">{product.sku}</span>
                  <span className="tag ok">{product.stock} in stock</span>
                </div>
                <div className="hardware-visual">
                  <HardwareSchematic category={product.category} />
                </div>
                <h2 className="hardware-name">{product.name}</h2>
                <p className="hardware-spec">{product.description}</p>
              </div>

              <div className="hardware-bottom">
                <span className="hardware-price">${product.price.toFixed(2)}</span>
                <div className="hardware-actions">
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

        {/* Open Hairline Ledgers: Live Orders + Structured JSON Telemetry Stream */}
        <section className="ledger-grid">
          <div className="ledger-section">
            <div className="ledger-header">
              <h2 className="ledger-title">Persisted Orders Ledger</h2>
              <span className="tag">{orders.length} records</span>
            </div>

            <div className="table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Service</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((ord) => (
                    <tr key={ord.orderId}>
                      <td className="mono-num">{ord.orderId}</td>
                      <td>{ord.customerEmail}</td>
                      <td className="mono-num">${Number(ord.totalAmount || 0).toFixed(2)}</td>
                      <td className="mono-num">{ord.paymentId}</td>
                      <td className="mono-num">orders-{ord.serviceVersion || "v1"}</td>
                      <td>
                        <span className="tag ok">{ord.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ledger-section">
            <div className="ledger-header">
              <h2 className="ledger-title">Structured JSON Telemetry Stream</h2>
              <span className="tag">GET /api/logs</span>
            </div>

            <div className="stream-list">
              {logs.length === 0 ? (
                <div className="stream-row">
                  <span className="stream-msg">
                    No unhandled exceptions logged. Microservices operating within SLO.
                  </span>
                </div>
              ) : (
                logs.slice(0, 12).map((entry, idx) => (
                  <div key={`${entry.timestamp}-${idx}`} className="stream-row">
                    <div className="stream-meta">
                      <span className={`stream-service ${entry.level}`}>
                        [{entry.level.toUpperCase()}] {entry.service} ({entry.version})
                      </span>
                      <span className="stream-time">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="stream-msg">{entry.message}</div>
                    {entry.topFrame && (
                      <div className="stream-frame">
                        Frame: {entry.topFrame.file}:{entry.topFrame.line} ({entry.topFrame.function})
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Native Modal Dialog 1: Cart & Checkout */}
      <dialog ref={cartDialogRef} closedby="any" aria-labelledby="cart-dialog-title">
        <div className="dialog-header">
          <h2 id="cart-dialog-title" className="dialog-title">
            Checkout Cart ({cartCount})
          </h2>
          <form method="dialog">
            <button type="submit" className="btn">
              Close
            </button>
          </form>
        </div>

        {cart.length === 0 ? (
          <p className="dialog-lead">
            Your cart is empty. Add any hardware item from the catalog or use 1-Click Buy.
          </p>
        ) : (
          <div className="cart-list">
            {cart.map((item) => (
              <div key={item.sku} className="cart-row">
                <div>
                  <div className="cart-item-title">{item.name}</div>
                  <div className="cart-item-meta">
                    {item.sku} — Qty {item.quantity} x ${item.unitPrice.toFixed(2)}
                  </div>
                </div>
                <div className="mono-num">${(item.unitPrice * item.quantity).toFixed(2)}</div>
              </div>
            ))}

            <div className="form-split">
              <div>
                <label htmlFor="checkout-email" className="field-label">
                  Customer Email
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  className="field-input"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="checkout-promo" className="field-label">
                  Promo Code
                </label>
                <input
                  id="checkout-promo"
                  type="text"
                  placeholder="PULSE10"
                  className="field-input mono-num"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                />
              </div>
            </div>

            <div className="dialog-footer">
              <span className="dialog-total">Total: ${cartTotal.toFixed(2)}</span>
              <div className="hardware-actions">
                <button type="button" className="btn" onClick={() => setCart([])}>
                  Clear Cart
                </button>
                <button
                  type="button"
                  className="btn btn-accent"
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
        <div className="dialog-header">
          <h2 id="chaos-dialog-title" className="dialog-title">
            SRE Fault & Judge Live-Break Lab
          </h2>
          <form method="dialog">
            <button type="submit" className="btn">
              Close
            </button>
          </form>
        </div>

        <p className="dialog-lead">
          Trigger any CORE 1 or CORE 2 fault scenario live or restore the baseline in one click.
        </p>

        <div className="preset-list">
          {FAULT_PRESETS.map((preset) => {
            const isActive =
              (preset.target === "reset-all" && systemHealthy) ||
              (preset.target === "orders" && ordersMode === preset.mode) ||
              (preset.target === "payments" && paymentsMode === preset.mode);

            return (
              <div key={preset.id} className="preset-row">
                <div>
                  <div className="preset-title-row">
                    <span>{preset.label}</span>
                    {isActive && <span className="tag ok">ACTIVE</span>}
                  </div>
                  <div className="preset-desc">{preset.description}</div>
                </div>
                <button
                  type="button"
                  className={`btn ${
                    preset.tone === "err"
                      ? "btn-danger"
                      : preset.tone === "ok"
                        ? "btn-accent"
                        : ""
                  }`}
                  disabled={busy}
                  onClick={() => triggerFaultPreset(preset)}
                >
                  {preset.target === "reset-all" ? "Restore" : "Inject"}
                </button>
              </div>
            );
          })}
        </div>
      </dialog>
    </div>
  );
}
