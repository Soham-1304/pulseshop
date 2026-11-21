/**
 * PulseShop Continuous Traffic & Checkout Load Generator
 * Sends steady catalog requests and realistic customer checkouts
 * so Prometheus counters, histograms, and business metrics are always active.
 */

const TARGET_URL = process.env.TARGET_URL || "http://localhost:4000";
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 2500);
const MAX_ITERATIONS = process.env.MAX_ITERATIONS ? Number(process.env.MAX_ITERATIONS) : Infinity;

const SAMPLE_SKUS = [
  { sku: "PS-KB-01", name: "Keychron Q1 Pro Wireless Custom Mechanical Keyboard", unitPrice: 199.0 },
  { sku: "PS-MN-02", name: "ProDisplay 34\" WQHD 165Hz Curved OLED Monitor", unitPrice: 749.0 },
  { sku: "PS-DK-03", name: "CalDigit TS4 Thunderbolt 4 18-Port Workstation Dock", unitPrice: 379.0 },
  { sku: "PS-AU-04", name: "Audeze Maxwell Planar Magnetic Studio Headset", unitPrice: 299.0 },
  { sku: "PS-MS-05", name: "MX Master 3S Ultra-Fast MagSpeed Ergonomic Mouse", unitPrice: 99.0 },
  { sku: "PS-ST-06", name: "NVMe Gen5 2TB M.2 12,400MB/s Heatsink SSD", unitPrice: 229.0 },
];

const SAMPLE_PROMOS = [null, null, null, "PULSE10", "SRE15"];

let iteration = 0;

async function tick() {
  iteration += 1;
  const pick = SAMPLE_SKUS[iteration % SAMPLE_SKUS.length];
  const promoCode = SAMPLE_PROMOS[iteration % SAMPLE_PROMOS.length];

  try {
    // 1. Browse catalog
    await fetch(`${TARGET_URL}/api/products`);

    // 2. Place checkout order
    const res = await fetch(`${TARGET_URL}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerEmail: `customer.${(iteration % 20) + 1}@pulseshop.io`,
        items: [{ ...pick, quantity: 1 }],
        promoCode,
      }),
    });

    const data = await res.json().catch(() => ({}));
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        generator: "pulseshop-loadgen",
        iteration,
        sku: pick.sku,
        status: res.status,
        orderId: data?.order?.orderId || null,
        error: data?.message || null,
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        generator: "pulseshop-loadgen",
        iteration,
        error: err.message,
      })
    );
  }

  if (iteration >= MAX_ITERATIONS) {
    process.exit(0);
  }
}

console.log(`Starting PulseShop load generator -> ${TARGET_URL} every ${INTERVAL_MS}ms`);
tick();
setInterval(tick, INTERVAL_MS);
