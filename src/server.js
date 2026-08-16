'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// --- Static files (frontend) ---
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API Routes ---
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ecom-store',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// --- Error handling middleware ---
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[ERROR] ${req.method} ${req.url} - ${statusCode}: ${message}`);
  if (statusCode === 500) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: message,
    statusCode,
    path: req.url,
    timestamp: new Date().toISOString(),
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   🧵 ThreadShop - E-Commerce Demo Server    ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║   URL:  http://localhost:${PORT}              ║`);
  console.log('║                                              ║');
  console.log('║   API Endpoints:                             ║');
  console.log('║     GET  /api/products                       ║');
  console.log('║     GET  /api/products/:id                   ║');
  console.log('║     GET  /api/products/categories            ║');
  console.log('║     POST /api/cart                           ║');
  console.log('║     GET  /api/cart/:id                       ║');
  console.log('║     POST /api/cart/:id/items                 ║');
  console.log('║     POST /api/orders                         ║');
  console.log('║     GET  /api/orders                         ║');
  console.log('║     GET  /api/health                         ║');
  console.log('║                                              ║');
  console.log('║   Ready for OpenTelemetry instrumentation!   ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
