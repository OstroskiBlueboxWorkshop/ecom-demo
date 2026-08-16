'use strict';

/**
 * Order Service - handles checkout and order creation.
 *
 * Now uses the Payment Gateway (which calls Fraud Detection) instead of
 * a simple simulated payment. As the fraud service degrades over time,
 * orders start failing with "Payment processing failed" — a misleading
 * error that hides the real root cause (fraud service memory leak).
 */

const { v4: uuidv4 } = require('uuid');
const cartService = require('./cart-service');
const paymentGateway = require('./payment-gateway');
const logger = require('../logger');

// In-memory order storage
const orders = new Map();

class OrderService {
  /**
   * Create an order from a cart
   */
  async createOrder(cartId, customerInfo) {
    await this._simulateLatency(30, 80);

    const orderId = `ORD-${uuidv4().split('-')[0].toUpperCase()}`;

    logger.info({
      orderId,
      cartId,
      customerEmail: customerInfo?.email,
    }, `Order creation started: ${orderId}`);

    // Get cart
    const cart = await cartService.getCart(cartId);

    if (cart.items.length === 0) {
      const error = new Error('Cannot create order from empty cart');
      error.statusCode = 400;
      throw error;
    }

    // Validate customer info
    this._validateCustomerInfo(customerInfo);

    // Process payment through the gateway (fraud check → charge)
    const paymentResult = await paymentGateway.processPayment({
      orderId,
      amount: cart.total,
      customer: {
        name: customerInfo.name,
        email: customerInfo.email,
        address: customerInfo.address,
      },
      items: cart.items.map(i => ({ productId: i.productId, quantity: i.quantity, price: i.price })),
    });

    // Check if payment was declined
    if (paymentResult.status === 'declined') {
      const error = new Error(paymentResult.reason || 'Payment was declined');
      error.statusCode = 402;
      throw error;
    }

    // Create the order
    const order = {
      id: orderId,
      cartId,
      items: [...cart.items],
      subtotal: cart.subtotal,
      tax: cart.tax,
      shipping: cart.shipping,
      total: cart.total,
      customer: {
        name: customerInfo.name,
        email: customerInfo.email,
        address: customerInfo.address,
      },
      payment: {
        status: paymentResult.status,
        transactionId: paymentResult.transactionId,
        method: paymentResult.method || 'credit_card',
        last4: paymentResult.last4 || '4242',
        fraudScore: paymentResult.fraudScore,
      },
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      estimatedDelivery: this._getEstimatedDelivery(),
    };

    orders.set(order.id, order);

    logger.info({
      orderId: order.id,
      total: order.total,
      transactionId: paymentResult.transactionId,
      paymentTimeMs: paymentResult.processingTimeMs,
    }, `Order confirmed: ${order.id} — $${order.total}`);

    // Clear the cart after successful order
    await cartService.clearCart(cartId);

    return order;
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId) {
    await this._simulateLatency(10, 50);

    const order = orders.get(orderId);
    if (!order) {
      const error = new Error(`Order not found: ${orderId}`);
      error.statusCode = 404;
      throw error;
    }
    return order;
  }

  /**
   * List all orders (for demo purposes)
   */
  async listOrders() {
    await this._simulateLatency(20, 80);
    return Array.from(orders.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  /**
   * Validate customer info
   */
  _validateCustomerInfo(info) {
    if (!info || !info.name || !info.email || !info.address) {
      const error = new Error('Missing required customer information (name, email, address)');
      error.statusCode = 400;
      throw error;
    }
    if (!info.email.includes('@')) {
      const error = new Error('Invalid email address');
      error.statusCode = 400;
      throw error;
    }
  }

  /**
   * Calculate estimated delivery date (3-7 business days)
   */
  _getEstimatedDelivery() {
    const days = Math.floor(Math.random() * 5) + 3;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  async _simulateLatency(minMs, maxMs) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

module.exports = new OrderService();
