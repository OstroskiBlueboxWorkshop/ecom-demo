'use strict';

/**
 * Cart Service - manages shopping carts (in-memory)
 */

const { v4: uuidv4 } = require('uuid');
const productService = require('./product-service');

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

    // Verify product exists and is in stock
    const product = await productService.getProductById(productId);
    const stockCheck = await productService.checkStock(productId, quantity);

    if (!stockCheck.available) {
      const error = new Error(`Insufficient stock for ${product.name}. Available: ${stockCheck.stockCount}`);
      error.statusCode = 400;
      throw error;
    }

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

    // Check stock for new quantity
    const stockCheck = await productService.checkStock(item.productId, quantity);
    if (!stockCheck.available) {
      const error = new Error(`Insufficient stock. Available: ${stockCheck.stockCount}`);
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

    cart.items = [];
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
