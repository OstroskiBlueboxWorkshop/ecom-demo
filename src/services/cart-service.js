'use strict';

/**
 * Cart Service - manages shopping carts (in-memory)
 */

const { v4: uuidv4 } = require('uuid');
const productService = require('./product-service');
const inventoryService = require('./inventory-service');
const logger = require('../logger');

// In-memory cart storage (keyed by session/cart ID)
const carts = new Map();

class CartService {
  /**
   * Create a new cart
   */
  async createCart() {
    await this._simulateLatency(5, 20);

    const cartId = uuidv4();
    const cart = {
      id: cartId,
      items: [],
      reservations: [], // Track inventory reservations for this cart
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    carts.set(cartId, cart);
    return cart;
  }

  /**
   * Get cart by ID
   */
  async getCart(cartId) {
    await this._simulateLatency(10, 30);

    const cart = carts.get(cartId);
    if (!cart) {
      const error = new Error(`Cart not found: ${cartId}`);
      error.statusCode = 404;
      throw error;
    }
    return this._calculateTotals(cart);
  }

  /**
   * Add an item to the cart
   */
  async addItem(cartId, productId, quantity = 1, size = 'M', color = null) {
    await this._simulateLatency(15, 60);

    const cart = carts.get(cartId);
    if (!cart) {
      const error = new Error(`Cart not found: ${cartId}`);
      error.statusCode = 404;
      throw error;
    }

    // Verify product exists
    const product = await productService.getProductById(productId);

    // Validate size against product's available sizes
    if (!product.sizes.includes(size)) {
      const error = new Error(`Invalid size '${size}' for item ${product.name}. Available: ${product.sizes.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    // Reserve stock through inventory service (this is where the race condition lives)
    const reservation = await inventoryService.reserveStock(productId, quantity, cartId);

    // Run fulfillment consistency check
    // This catches race conditions where concurrent requests over-reserved
    const fulfillment = await inventoryService.fulfillmentCheck(productId);

    logger.info({
      productId,
      cartId,
      reservationId: reservation.id,
      fulfillmentConsistent: fulfillment.consistent,
    }, `Item added with reservation: ${reservation.id}`);

    // Check if item already in cart (same product, size, color)
    const existingIndex = cart.items.findIndex(
      (item) => item.productId === productId && item.size === size && item.color === color
    );

    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += quantity;
    } else {
      cart.items.push({
        id: uuidv4(),
        productId,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity,
        size,
        color: color || product.colors[0],
      });
    }

    // Track the reservation
    cart.reservations.push({
      reservationId: reservation.id,
      productId,
      quantity,
    });

    cart.updatedAt = new Date().toISOString();
    return this._calculateTotals(cart);
  }

  /**
   * Remove an item from the cart
   */
  async removeItem(cartId, itemId) {
    await this._simulateLatency(10, 40);

    const cart = carts.get(cartId);
    if (!cart) {
      const error = new Error(`Cart not found: ${cartId}`);
      error.statusCode = 404;
      throw error;
    }

    const itemIndex = cart.items.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) {
      const error = new Error(`Item not found in cart: ${itemId}`);
      error.statusCode = 404;
      throw error;
    }

    const removedItem = cart.items[itemIndex];

    // Release the inventory reservation
    const reservation = cart.reservations.find(r => r.productId === removedItem.productId);
    if (reservation) {
      await inventoryService.releaseReservation(removedItem.productId, reservation.reservationId);
      cart.reservations = cart.reservations.filter(r => r.reservationId !== reservation.reservationId);
    }

    cart.items.splice(itemIndex, 1);
    cart.updatedAt = new Date().toISOString();
    return this._calculateTotals(cart);
  }

  /**
   * Update item quantity
   */
  async updateItemQuantity(cartId, itemId, quantity) {
    await this._simulateLatency(10, 40);

    const cart = carts.get(cartId);
    if (!cart) {
      const error = new Error(`Cart not found: ${cartId}`);
      error.statusCode = 404;
      throw error;
    }

    const item = cart.items.find((item) => item.id === itemId);
    if (!item) {
      const error = new Error(`Item not found in cart: ${itemId}`);
      error.statusCode = 404;
      throw error;
    }

    if (quantity <= 0) {
      return this.removeItem(cartId, itemId);
    }

    // Check stock for new quantity via inventory service
    const stock = await inventoryService.getStock(item.productId);
    if (stock.available - stock.reserved < quantity) {
      const error = new Error(`Insufficient stock. Available: ${stock.available - stock.reserved}`);
      error.statusCode = 400;
      throw error;
    }

    item.quantity = quantity;
    cart.updatedAt = new Date().toISOString();
    return this._calculateTotals(cart);
  }

  /**
   * Clear the cart
   */
  async clearCart(cartId) {
    await this._simulateLatency(5, 20);

    const cart = carts.get(cartId);
    if (!cart) {
      const error = new Error(`Cart not found: ${cartId}`);
      error.statusCode = 404;
      throw error;
    }

    // Release all reservations
    for (const reservation of cart.reservations) {
      await inventoryService.releaseReservation(reservation.productId, reservation.reservationId);
    }

    cart.items = [];
    cart.reservations = [];
    cart.updatedAt = new Date().toISOString();
    return this._calculateTotals(cart);
  }

  /**
   * Calculate cart totals
   */
  _calculateTotals(cart) {
    const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * 0.08; // 8% tax
    const shipping = subtotal > 50 ? 0 : 5.99; // Free shipping over $50
    const total = subtotal + tax + shipping;

    return {
      ...cart,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      shipping,
      total: Math.round(total * 100) / 100,
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  async _simulateLatency(minMs, maxMs) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

module.exports = new CartService();
