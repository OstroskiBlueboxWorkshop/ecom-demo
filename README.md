# 🧵 ThreadShop — E-Commerce Demo for OpenTelemetry

A simple e-commerce web app (Node.js / Express) designed to demonstrate and test OpenTelemetry instrumentation.

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3000
```

Requires **Node.js 18+**.

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
│  /api/products  →  Product Service           │
│  /api/cart      →  Cart Service              │
│  /api/orders    →  Order Service             │
└──────────────────────────────────────────────┘
```

All services simulate realistic latency:
- **Product Service**: 20-80ms (catalog lookups)
- **Cart Service**: 15-60ms (cart operations + stock validation)
- **Order Service**: 100-500ms (checkout + payment processing, 10% failure rate)

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
