# 🧵 ThreadShop — E-Commerce Demo for OpenTelemetry

A simple e-commerce web app (Node.js / Express) designed to demonstrate and test OpenTelemetry instrumentation with [Bluebox](https://bluebox.ai).

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3000
```

Requires **Node.js 18+**.

### Running with Bluebox OTel export

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="https://<your-env>.live.dynatrace.com/api/v2/otlp"
export OTEL_EXPORTER_OTLP_HEADERS='Authorization=Bearer <YOUR_TOKEN>'
export OTEL_SERVICE_NAME="ecom-store"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
export OTEL_RESOURCE_ATTRIBUTES="service.namespace=ecom-demo,deployment.environment=production"
export OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE="delta"
npm start
```

## Features

- Browse products (t-shirts, socks, hoodies)
- Filter by category
- Add items to cart, adjust quantities
- Checkout with simulated payment processing
- View order history

## Architecture

```
┌──────────────────────────────────────────────┐
│              Frontend (Vanilla JS)            │
│         public/index.html + app.js           │
└─────────────────────┬────────────────────────┘
                      │ REST API
┌─────────────────────▼────────────────────────┐
│            Express Server (server.js)         │
├──────────────────────────────────────────────┤
│  /api/products   →  Product Service          │
│  /api/cart       →  Cart Service             │
│                      └→ Inventory Service    │
│  /api/orders     →  Order Service            │
│                      └→ Payment Gateway      │
│                           └→ Fraud Service   │
└──────────────────────────────────────────────┘
```

### Service Latencies

| Service | Latency | Notes |
|---------|---------|-------|
| Product Service | 20-80ms | Catalog lookups |
| Inventory Service | 20-80ms | Stock reads/writes with race window |
| Cart Service | 15-60ms | + inventory reservation calls |
| Fraud Service | 50ms → 3000ms+ | **Degrades over time** (memory leak) |
| Payment Gateway | 80-200ms | + fraud check (3s timeout) |
| Order Service | 30-80ms | Orchestrates payment flow |

---

## 🐛 Failure Scenarios

This app contains two realistic, production-like bugs designed for Bluebox to investigate.

---

### Scenario 1: Inventory Race Condition

**Problem:** The inventory service has a read-then-write race condition. Under concurrent requests for the same low-stock product, multiple requests can read the same stock level, all pass validation, and all reserve — resulting in over-committed inventory. A downstream fulfillment check catches the inconsistency and throws a 500.

**Affected products (low stock):**
- `hoodie-gray-zip` — stock: 2
- `socks-athletic-3pack` — stock: 3
- `tshirt-classic-white` — stock: 5

**How to trigger:**

```bash
# Create 4 separate carts
C1=$(curl -s -X POST http://localhost:3000/api/cart | jq -r '.cart.id')
C2=$(curl -s -X POST http://localhost:3000/api/cart | jq -r '.cart.id')
C3=$(curl -s -X POST http://localhost:3000/api/cart | jq -r '.cart.id')
C4=$(curl -s -X POST http://localhost:3000/api/cart | jq -r '.cart.id')

# Fire all 4 add-to-cart requests simultaneously for hoodie (only 2 in stock)
curl -s -X POST http://localhost:3000/api/cart/$C1/items -H "Content-Type: application/json" -d '{"productId":"hoodie-gray-zip","quantity":1,"size":"L"}' &
curl -s -X POST http://localhost:3000/api/cart/$C2/items -H "Content-Type: application/json" -d '{"productId":"hoodie-gray-zip","quantity":1,"size":"L"}' &
curl -s -X POST http://localhost:3000/api/cart/$C3/items -H "Content-Type: application/json" -d '{"productId":"hoodie-gray-zip","quantity":1,"size":"L"}' &
curl -s -X POST http://localhost:3000/api/cart/$C4/items -H "Content-Type: application/json" -d '{"productId":"hoodie-gray-zip","quantity":1,"size":"L"}' &
wait
```

**Expected result:** 1-2 requests succeed, the rest fail with:
```
500: Inventory inconsistency: stock cannot be negative for hoodie-gray-zip. Stock: 2, Reserved: 4, Overcommit: 2
```

**What Bluebox should find:**
- 500 errors on `POST /api/cart/:id/items` correlated to specific product IDs (low-stock items)
- The inventory-service `reserveStock` span succeeds but the subsequent `fulfillmentCheck` span fails
- Error logs: `INVENTORY INCONSISTENCY: Overcommitted stock for <productId>`
- Root cause: non-atomic read-then-write in `inventory-service.js` → `reserveStock()`

---

### Scenario 2: Cascading Payment Timeout (Fraud Service Memory Leak)

**Problem:** The fraud detection service has a memory leak — its scoring cache grows with every request and is never evicted. The "risk scoring" algorithm iterates the entire cache (O(n)), so response time degrades linearly. The payment gateway has a 3-second timeout on fraud checks. Once fraud exceeds 3s, the gateway returns a **misleading** "Payment processing failed" error. Timed-out fraud requests are NOT cancelled, so they keep running and make the leak worse — a cascading degradation.

**Degradation timeline:**
| Orders placed | Fraud check latency | Result |
|---------------|--------------------:|--------|
| 1-5 | ~350-650ms | ✅ All succeed |
| 6-12 | ~700-2000ms | ✅ Succeed but slow |
| 13-17 | ~2000-3000ms | ⚠️ Near timeout |
| 18+ | >3000ms | ❌ Timeout → 502 "Payment processing failed" |

**How to trigger:**

```bash
# Place ~20 orders sequentially — watch latency climb then fail
for i in $(seq 1 20); do
  C=$(curl -s -X POST http://localhost:3000/api/cart | jq -r '.cart.id')
  curl -s -X POST http://localhost:3000/api/cart/$C/items \
    -H "Content-Type: application/json" \
    -d '{"productId":"tshirt-black-premium","quantity":1,"size":"M"}' > /dev/null
  echo -n "Order #$i: "
  curl -s -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -d "{\"cartId\":\"$C\",\"customer\":{\"name\":\"User $i\",\"email\":\"u$i@test.com\",\"address\":\"123 Main St\"}}" | jq -r 'if .order then "OK (\(.order.id))" else "FAIL: \(.error)" end'
done
```

**Expected result:** First ~17 orders succeed (with increasing latency), then orders start failing with:
```
502: Payment processing failed. Please try again.
```

**What Bluebox should find:**
- Order endpoint p95 latency monotonically increasing over time
- The 502 error traces back to a **fraud-service** span timeout, NOT a payment processor issue
- The "Payment processing failed" error message is misleading — real root cause is upstream
- Fraud service response time is monotonically increasing (unbounded cache growth)
- Root cause: memory leak in `fraud-service.js` → `scoringCache` array never evicted, `_computeRiskScore()` is O(n) over growing cache

**Note:** Restart the server to reset the fraud service cache and start fresh.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (`?category=tshirts`) |
| GET | `/api/products/:id` | Get single product |
| GET | `/api/products/categories` | List categories |
| POST | `/api/cart` | Create new cart |
| GET | `/api/cart/:id` | Get cart contents |
| POST | `/api/cart/:id/items` | Add item to cart |
| PUT | `/api/cart/:id/items/:itemId` | Update quantity |
| DELETE | `/api/cart/:id/items/:itemId` | Remove item |
| POST | `/api/orders` | Place order (checkout) |
| GET | `/api/orders` | List all orders |
| GET | `/api/health` | Health check |

## License

MIT
