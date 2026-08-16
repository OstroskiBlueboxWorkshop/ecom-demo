'use strict';

const express = require('express');
const router = express.Router();
const productService = require('../services/product-service');

/**
 * GET /api/products
 * List all products, optionally filtered by category
 */
router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;
    const products = await productService.getAllProducts(category || null);
    res.json({ products, count: products.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/categories
 * List available product categories
 */
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await productService.getCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:id
 * Get a single product by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:id/stock
 * Check stock availability
 */
router.get('/:id/stock', async (req, res, next) => {
  try {
    const quantity = parseInt(req.query.quantity) || 1;
    const stock = await productService.checkStock(req.params.id, quantity);
    res.json(stock);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
