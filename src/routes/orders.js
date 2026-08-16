'use strict';

const express = require('express');
const router = express.Router();
const orderService = require('../services/order-service');

/**
 * POST /api/orders
 * Create an order (checkout)
 */
router.post('/', async (req, res, next) => {
  try {
    const { cartId, customer } = req.body;
    if (!cartId) {
      return res.status(400).json({ error: 'cartId is required' });
    }
    if (!customer) {
      return res.status(400).json({ error: 'customer information is required' });
    }
    const order = await orderService.createOrder(cartId, customer);
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders
 * List all orders
 */
router.get('/', async (req, res, next) => {
  try {
    const orders = await orderService.listOrders();
    res.json({ orders, count: orders.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:orderId
 * Get order details
 */
router.get('/:orderId', async (req, res, next) => {
  try {
    const order = await orderService.getOrder(req.params.orderId);
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
