'use strict';

const express = require('express');
const router = express.Router();
const cartService = require('../services/cart-service');

/**
 * POST /api/cart
 * Create a new cart
 */
router.post('/', async (req, res, next) => {
  try {
    const cart = await cartService.createCart();
    res.status(201).json({ cart });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cart/:cartId
 * Get cart contents
 */
router.get('/:cartId', async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.params.cartId);
    res.json({ cart });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cart/:cartId/items
 * Add item to cart
 */
router.post('/:cartId/items', async (req, res, next) => {
  try {
    const { productId, quantity, size, color } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }
    const cart = await cartService.addItem(
      req.params.cartId,
      productId,
      quantity || 1,
      size || 'M',
      color || null
    );
    res.json({ cart });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cart/:cartId/items/:itemId
 * Update item quantity
 */
router.put('/:cartId/items/:itemId', async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined) {
      return res.status(400).json({ error: 'quantity is required' });
    }
    const cart = await cartService.updateItemQuantity(
      req.params.cartId,
      req.params.itemId,
      quantity
    );
    res.json({ cart });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/cart/:cartId/items/:itemId
 * Remove item from cart
 */
router.delete('/:cartId/items/:itemId', async (req, res, next) => {
  try {
    const cart = await cartService.removeItem(req.params.cartId, req.params.itemId);
    res.json({ cart });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/cart/:cartId
 * Clear the cart
 */
router.delete('/:cartId', async (req, res, next) => {
  try {
    const cart = await cartService.clearCart(req.params.cartId);
    res.json({ cart });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
