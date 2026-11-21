import React, { useEffect, useRef, useState } from "react";

const CATEGORIES = ["All", "Peripherals", "Displays", "Connectivity", "Audio", "Storage"];

const DEFAULT_CATALOG = [
  {
    sku: "PS-KB-01",
    name: "Keychron Q1 Pro Wireless Mechanical Keyboard",
    category: "Peripherals",
    price: 199.0,
    stock: 42,
    rating: 4.9,
    reviews: 184,
    badge: "Bestseller",
    image: "https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=800&q=80",
    description: "CNC machined aluminum body, hot-swappable tactile switches, QMK/VIA wireless.",
  },
  {
    sku: "PS-MN-02",
    name: "ProDisplay 34\" WQHD 165Hz Curved OLED Monitor",
    category: "Displays",
    price: 749.0,
    stock: 18,
    rating: 4.8,
    reviews: 96,
    badge: "New Arrival",
    image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=800&q=80",
    description: "0.03ms response time, 99% DCI-P3 cinema color gamut, 90W USB-C single-cable dock.",
  },
  {
    sku: "PS-DK-03",
    name: "CalDigit TS4 Thunderbolt 4 18-Port Workstation Dock",
    category: "Connectivity",
    price: 379.0,
    stock: 31,
    rating: 4.9,
    reviews: 215,
    badge: "Pro Gear",
    image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80",
    description: "98W host charging, 2.5GbE Ethernet, dual 6K 60Hz display output, UHS-II SD reader.",
  },
  {
    sku: "PS-AU-04",
    name: "Audeze Maxwell Planar Magnetic Wireless Headphones",
    category: "Audio",
    price: 299.0,
    stock: 25,
    rating: 4.8,
    reviews: 142,
    badge: "Studio Pick",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
    description: "90mm planar magnetic drivers, 80-hour battery life, ultra-low latency USB-C dongle.",
  },
  {
    sku: "PS-MS-05",
    name: "MX Master 3S MagSpeed Ergonomic Wireless Mouse",
    category: "Peripherals",
    price: 99.0,
    stock: 64,
    rating: 4.9,
    reviews: 410,
    badge: "Essential",
    image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&q=80",
    description: "8K DPI Darkfield optical sensor tracks on glass, quiet tactile clicks, USB-C quick charge.",
  },
  {
    sku: "PS-ST-06",
    name: "NVMe Gen5 2TB Portable Aluminum SSD (10,500MB/s)",
    category: "Storage",
    price: 229.0,
    stock: 50,
    rating: 4.9,
    reviews: 88,
    badge: "Fastest",
    image: "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=800&q=80",
    description: "Thunderbolt 4 / USB4 rugged anodized enclosure with hardware AES-256 encryption.",
  },
];

const PRODUCT_IMAGES_BY_SKU = Object.fromEntries(
  DEFAULT_CATALOG.map((item) => [item.sku, item.image])
);

const PROMO_RATES = {
  PULSE10: 0.1,
  SRE15: 0.15,
  DEV20: 0.2,
};

export default function App() {
  const [products, setProducts] = useState(DEFAULT_CATALOG);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState([
    {
      sku: "PS-KB-01",
      name: "Keychron Q1 Pro Wireless Mechanical Keyboard",
      unitPrice: 199.0,
      quantity: 1,
    },
  ]);

  // Checkout Step: "bag" | "payment" | "receipt"
  const [checkoutStep, setCheckoutStep] = useState("bag");
  const [fullName, setFullName] = useState("Aarav Mehta");
  const [customerEmail, setCustomerEmail] = useState("aarav.mehta@gmail.com");
  const [shippingAddress, setShippingAddress] = useState("42 Indiranagar 100 Feet Rd, Bengaluru");
  const [cardNumber, setCardNumber] = useState("4532 •••• •••• 4242");
  const [cardExpiry, setCardExpiry] = useState("08/29");
  const [cardCvc, setCardCvc] = useState("842");
  const [promoCode, setPromoCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [notice, setNotice] = useState(null);

  const checkoutDialogRef = useRef(null);

  // Light-dismiss fallback for browsers without native HTMLDialogElement.prototype.closedBy
  useEffect(() => {
    const dialog = checkoutDialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    const handleClick = (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isInside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isInside) return;
      dialog.close();
    };
    dialog.addEventListener("click", handleClick);
    return () => dialog.removeEventListener("click", handleClick);
  }, []);

  async function fetchProducts() {
    try {
      const prodRes = await fetch("/api/products");
      if (prodRes.ok) {
        const pData = await prodRes.json();
        if (Array.isArray(pData.products) && pData.products.length > 0) {
          setProducts(
            pData.products.map((p, idx) => ({
              ...DEFAULT_CATALOG[idx % DEFAULT_CATALOG.length],
              ...p,
              image: PRODUCT_IMAGES_BY_SKU[p.sku] || DEFAULT_CATALOG[idx % DEFAULT_CATALOG.length].image,
            }))
          );
        }
      }
    } catch (_e) {
      // Fallback catalog stays active
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  function addToBag(product, openImmediately = false) {
    setCart((prev) => {
      const found = prev.find((item) => item.sku === product.sku);
      if (found) {
        return prev.map((item) =>
          item.sku === product.sku ? { ...item, quantity: item.quantity + 1 } : item
        );
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

    setCheckoutError(null);
    if (openImmediately) {
      setCheckoutStep("payment");
      checkoutDialogRef.current?.showModal();
    } else {
      setNotice({
        type: "ok",
        title: `Added ${product.name} to your bag`,
        message: "Click Shopping Bag in the top bar whenever you are ready to checkout.",
      });
    }
  }

  function updateQuantity(sku, delta) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.sku === sku ? { ...item, quantity: item.quantity + delta } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  async function submitPayment(e) {
    e.preventDefault();
    if (cart.length === 0) return;

    setBusy(true);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail,
          items: cart,
          promoCode: promoCode ? promoCode.trim() : null,
          paymentMethod: "card_visa_4242",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setCheckoutError(
          "We couldn't process your order right now. Please try again in a moment."
        );
        return;
      }

      setLastReceipt({
        orderId: data.order.orderId,
        paymentId: data.payment.paymentId,
        totalAmount: data.order.totalAmount,
        items: cart,
        customerEmail,
        shippingAddress,
      });
      setCart([]);
      setCheckoutStep("receipt");
      await fetchProducts();
    } catch (_err) {
      setCheckoutError(
        "Unable to reach payment gateway. Please check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  const visibleProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === "All" || product.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const bagCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const bagSubtotal = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const normalizedPromo = promoCode.trim().toUpperCase();
  const discountRate = PROMO_RATES[normalizedPromo] || 0;
  const discountAmount = Number((bagSubtotal * discountRate).toFixed(2));
  const bagTotal = Number(Math.max(0, bagSubtotal - discountAmount).toFixed(2));
  const heroProduct = products[0] || DEFAULT_CATALOG[0];

  return (
    <div>
      {/* Top Store Promo Announcement Bar */}
      <div className="promo-bar">
        <span>Free express shipping on all studio & desk gear over $150</span>
        <span className="promo-code-chip">USE CODE: PULSE10 FOR 10% OFF</span>
      </div>

      {/* Storefront Navigation Header */}
      <div className="navbar-wrap">
        <header className="navbar">
          <a href="#top" className="brand-logo">
            <span className="brand-dot" />
            <span>PulseShop</span>
          </a>

          <div className="search-box">
            <input
              type="search"
              className="search-input"
              placeholder="Search mechanical keyboards, monitors, docks, audio..."
              aria-label="Search store catalog"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="nav-actions">
            <button
              type="button"
              className="btn btn-dark"
              onClick={() => {
                setCheckoutError(null);
                setCheckoutStep("bag");
                checkoutDialogRef.current?.showModal();
              }}
            >
              <span>Shopping Bag</span>
              <span className="mono-num">
                ({bagCount} / ${bagTotal.toFixed(0)})
              </span>
            </button>
          </div>
        </header>
      </div>

      {/* Hero Showcase Banner */}
      <section className="hero-section">
        <div className="hero-banner">
          <div>
            <h1 className="hero-headline">
              Precision hardware built for engineers and creators.
            </h1>
            <p className="hero-copy">
              CNC-machined wireless keyboards, calibrated OLED displays, Thunderbolt 4 workstation docks, and planar magnetic studio audio.
            </p>
            <div className="hero-cta-row">
              <button
                type="button"
                className="btn btn-light"
                onClick={() => addToBag(heroProduct, true)}
                disabled={busy}
              >
                Buy Featured Q1 Pro — ${heroProduct.price.toFixed(0)}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => addToBag(heroProduct, false)}
                disabled={busy}
              >
                Add to Bag
              </button>
            </div>
          </div>

          <div className="hero-feature-card">
            <img
              src={heroProduct.image}
              alt={heroProduct.name}
              className="hero-feature-img"
            />
            <div>
              <span className="promo-code-chip">FEATURED RELEASE</span>
              <h2 className="hero-feature-title">{heroProduct.name}</h2>
              <div className="hero-feature-price">${heroProduct.price.toFixed(2)} — In Stock</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Shopping Catalog */}
      <main className="store-main">
        {notice && (
          <div className={`notice-banner ${notice.type}`} role="status">
            <div className="notice-content">
              <span className="notice-title">{notice.title}</span>
              <span className="notice-desc">{notice.message}</span>
            </div>
            <div className="nav-actions">
              <button
                type="button"
                className="btn btn-dark"
                onClick={() => {
                  setNotice(null);
                  setCheckoutStep("bag");
                  checkoutDialogRef.current?.showModal();
                }}
              >
                View Bag & Checkout
              </button>
              <button type="button" className="btn" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Category Filter Pills */}
        <div className="category-bar">
          <div className="category-list" role="tablist" aria-label="Product Categories">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                className={`cat-pill ${selectedCategory === category ? "active" : ""}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <span className="results-count">
            Showing {visibleProducts.length} products
          </span>
        </div>

        {/* Product Grid */}
        <section className="product-grid" aria-label="Products">
          {visibleProducts.map((product) => (
            <article key={product.sku} className="product-card">
              <div>
                <div className="product-img-wrap">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="product-img"
                    loading="lazy"
                  />
                  {product.badge && <span className="product-badge">{product.badge}</span>}
                </div>

                <div className="product-body">
                  <div className="product-cat-row">
                    <span>{product.category}</span>
                    <span className="product-rating">Rating {product.rating || 4.9}/5</span>
                  </div>
                  <h2 className="product-name">{product.name}</h2>
                  <p className="product-desc">{product.description}</p>
                </div>
              </div>

              <div className="product-footer">
                <div className="price-stock-row">
                  <span className="product-price">${product.price.toFixed(2)}</span>
                  <span className="stock-status">{product.stock} in stock</span>
                </div>

                <div className="card-btn-row">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => addToBag(product, false)}
                    disabled={busy}
                  >
                    Add to Bag
                  </button>
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={() => addToBag(product, true)}
                    disabled={busy}
                  >
                    Buy Now
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>

      {/* Clean Customer Store Footer */}
      <footer className="store-footer">
        <div className="footer-inner">
          <div>
            <strong>PulseShop</strong> — Official Hardware & Studio Peripherals Store
          </div>
          <div>
            2-Year Warranty · Free Express Shipping · 30-Day Returns
          </div>
        </div>
      </footer>

      {/* Multi-Step Shopping Bag -> Shipping & Payment -> Order Confirmation Dialog */}
      <dialog ref={checkoutDialogRef} closedby="any" aria-labelledby="checkout-modal-title">
        <div className="modal-top">
          <h2 id="checkout-modal-title" className="modal-title">
            {checkoutStep === "bag" && `Shopping Bag (${bagCount})`}
            {checkoutStep === "payment" && "Shipping & Payment"}
            {checkoutStep === "receipt" && "Order Confirmed"}
          </h2>
          <form method="dialog">
            <button type="submit" className="btn">
              Close
            </button>
          </form>
        </div>

        {/* STEP 1: SHOPPING BAG */}
        {checkoutStep === "bag" && (
          <div>
            {cart.length === 0 ? (
              <p className="product-desc">
                Your shopping bag is empty. Browse our catalog and add items to checkout.
              </p>
            ) : (
              <div>
                <div className="bag-items">
                  {cart.map((item) => (
                    <div key={item.sku} className="bag-row">
                      <div>
                        <div className="bag-item-name">{item.name}</div>
                        <div className="bag-item-sub mono-num">
                          ${item.unitPrice.toFixed(2)} each
                        </div>
                      </div>
                      <div className="nav-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => updateQuantity(item.sku, -1)}
                        >
                          -
                        </button>
                        <span className="mono-num">{item.quantity}</span>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => updateQuantity(item.sku, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bag-summary">
                  <span className="bag-total">Subtotal: ${bagSubtotal.toFixed(2)}</span>
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={() => {
                      setCheckoutError(null);
                      setCheckoutStep("payment");
                    }}
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: SHIPPING & CARD PAYMENT */}
        {checkoutStep === "payment" && (
          <form onSubmit={submitPayment}>
            {checkoutError && (
              <div className="notice-banner err" role="alert">
                <div className="notice-content">
                  <span className="notice-title">Payment / Checkout Error</span>
                  <span className="notice-desc">{checkoutError}</span>
                </div>
              </div>
            )}

            <div className="checkout-form-grid">
              <div>
                <label htmlFor="ship-name" className="input-label">
                  Full Name
                </label>
                <input
                  id="ship-name"
                  type="text"
                  required
                  className="text-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="ship-email" className="input-label">
                  Email Address
                </label>
                <input
                  id="ship-email"
                  type="email"
                  required
                  className="text-input"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="field-block">
              <label htmlFor="ship-addr" className="input-label">
                Delivery Address
              </label>
              <input
                id="ship-addr"
                type="text"
                required
                className="text-input"
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
              />
            </div>

            <div className="field-block">
              <label htmlFor="card-num" className="input-label">
                Card Number
              </label>
              <input
                id="card-num"
                type="text"
                required
                className="text-input mono-num"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
            </div>

            <div className="checkout-form-grid">
              <div>
                <label htmlFor="card-exp" className="input-label">
                  Expiry Date
                </label>
                <input
                  id="card-exp"
                  type="text"
                  required
                  className="text-input mono-num"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="card-cvc" className="input-label">
                  Security Code (CVC)
                </label>
                <input
                  id="card-cvc"
                  type="text"
                  required
                  className="text-input mono-num"
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value)}
                />
              </div>
            </div>

            <div className="field-block">
              <label htmlFor="bag-promo" className="input-label">
                Promo Code (Optional)
              </label>
              <input
                id="bag-promo"
                type="text"
                placeholder="PULSE10"
                className="text-input mono-num"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
              />
            </div>

            <div className="bag-summary">
              <div>
                <div className="bag-item-sub">
                  Shipping: Free {discountAmount > 0 ? `(Saved $${discountAmount.toFixed(2)})` : ""}
                </div>
                <div className="bag-total">Total: ${bagTotal.toFixed(2)}</div>
              </div>
              <div className="nav-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCheckoutStep("bag")}
                  disabled={busy}
                >
                  Back
                </button>
                <button type="submit" className="btn btn-green" disabled={busy}>
                  {busy ? "Processing..." : `Pay $${bagTotal.toFixed(2)}`}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* STEP 3: ORDER CONFIRMATION RECEIPT */}
        {checkoutStep === "receipt" && lastReceipt && (
          <div className="receipt-box">
            <div className="notice-banner ok">
              <div className="notice-content">
                <span className="notice-title">
                  Thank you, {fullName}! Your order is confirmed.
                </span>
                <span className="notice-desc">
                  Order #{lastReceipt.orderId} · Payment Reference {lastReceipt.paymentId}
                </span>
              </div>
            </div>

            <div className="bag-items">
              {lastReceipt.items.map((item) => (
                <div key={item.sku} className="bag-row">
                  <div>
                    <div className="bag-item-name">{item.name}</div>
                    <div className="bag-item-sub">Qty {item.quantity}</div>
                  </div>
                  <div className="mono-num">
                    ${(item.unitPrice * item.quantity).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="bag-summary">
              <span className="bag-total">
                Paid: ${Number(lastReceipt.totalAmount || 0).toFixed(2)}
              </span>
              <button
                type="button"
                className="btn btn-dark"
                onClick={() => checkoutDialogRef.current?.close()}
              >
                Continue Shopping
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
