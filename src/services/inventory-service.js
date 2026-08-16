'use strict';

/**
 * Inventory Service — manages real-time stock levels.
 *
 * BUG: Contains a classic read-then-write race condition.
 * Under concurrent requests for the same product, two requests can both
 * read the same stock level, both pass validation, and both decrement —
 * resulting in negative inventory. A downstream fulfillment check catches
 * the inconsistency and throws a 500.
 */

const logger = require('../logger');

// Simulated database — stock levels per product ID
const stockDb = new Map([
  ['tshirt-classic-white', 5],    // LOW STOCK — race condition target
  ['tshirt-black-premium', 89],
  ['tshirt-navy-vneck', 64],
  ['socks-athletic-3pack', 3],    // LOW STOCK — race condition target
  ['socks-wool-cozy', 45],
  ['socks-novelty-pizza', 78],
  ['hoodie-gray-zip', 2],         // LOW STOCK — race condition target
  ['hoodie-blue-pullover', 0],    // Out of stock
]);

// Track reservations (simulates a separate reservations table)
const reservations = new Map();

class InventoryService {
  /**
   * Check current stock level for a product.
   */
  async getStock(productId) {
    await this._dbRead(15, 40);
    const stock = stockDb.get(productId);
    if (stock === undefined) {
      const error = new Error(`Product not found in inventory: ${productId}`);
      error.statusCode = 404;
      throw error;
    }
    return { productId, available: stock, reserved: this._getReserved(productId) };
  }

  /**
   * Reserve stock for a cart item.
   *
   * BUG: This is a non-atomic read-then-write. Under concurrent access:
   * 1. Request A reads stock = 2
   * 2. Request B reads stock = 2 (same value, no lock)
   * 3. Request A writes stock = 1 (reserves 1)
   * 4. Request B writes stock = 1 (also reserves 1, but thinks stock was 2)
   * Result: 2 units reserved from 2 stock — OK in this case.
   * But if stock = 1: both read 1, both validate OK, both write 0...
   * two reservations from 1 unit of stock → inconsistency caught downstream.
   */
  async reserveStock(productId, quantity, cartId) {
    // Step 1: READ current stock (simulated DB latency)
    await this._dbRead(20, 60);
    const currentStock = stockDb.get(productId);

    if (currentStock === undefined) {
      const error = new Error(`Product not found in inventory: ${productId}`);
      error.statusCode = 404;
      throw error;
    }

    const effectiveStock = currentStock - this._getReserved(productId);

    logger.info({
      productId,
      currentStock,
      reserved: this._getReserved(productId),
      effectiveStock,
      requestedQty: quantity,
    }, `Inventory check: ${productId} stock=${currentStock}, reserved=${this._getReserved(productId)}, effective=${effectiveStock}`);

    // Step 2: VALIDATE availability
    if (effectiveStock < quantity) {
      const error = new Error(`Insufficient inventory for ${productId}. Available: ${effectiveStock}, Requested: ${quantity}`);
      error.statusCode = 409;
      throw error;
    }

    // Step 3: WRITE reservation (simulated DB write latency)
    // BUG: Gap between read and write allows concurrent requests to both pass validation
    await this._dbWrite(30, 80);

    const reservationId = `res-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const reservation = {
      id: reservationId,
      productId,
      quantity,
      cartId,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    if (!reservations.has(productId)) {
      reservations.set(productId, []);
    }
    reservations.get(productId).push(reservation);

    logger.info({
      reservationId,
      productId,
      quantity,
      cartId,
      newReservedTotal: this._getReserved(productId),
    }, `Stock reserved: ${reservationId}`);

    return reservation;
  }

  /**
   * Fulfillment check — verifies inventory consistency before confirming.
   * This catches race conditions where more stock was reserved than exists.
   */
  async fulfillmentCheck(productId) {
    await this._dbRead(10, 30);
    const currentStock = stockDb.get(productId);
    const totalReserved = this._getReserved(productId);

    if (totalReserved > currentStock) {
      logger.error({
        productId,
        currentStock,
        totalReserved,
        overcommit: totalReserved - currentStock,
      }, `INVENTORY INCONSISTENCY: Overcommitted stock for ${productId}`);

      const error = new Error(
        `Inventory inconsistency: stock cannot be negative for ${productId}. ` +
        `Stock: ${currentStock}, Reserved: ${totalReserved}, Overcommit: ${totalReserved - currentStock}`
      );
      error.statusCode = 500;
      error.inventoryInconsistency = true;
      throw error;
    }

    return { productId, currentStock, totalReserved, consistent: true };
  }

  /**
   * Release a reservation (e.g., cart expired or item removed)
   */
  async releaseReservation(productId, reservationId) {
    await this._dbWrite(15, 40);
    const productReservations = reservations.get(productId);
    if (productReservations) {
      const idx = productReservations.findIndex(r => r.id === reservationId);
      if (idx >= 0) {
        productReservations[idx].status = 'released';
        return true;
      }
    }
    return false;
  }

  /**
   * Confirm reservation (convert to actual stock decrement on order completion)
   */
  async confirmReservation(productId, reservationId) {
    await this._dbWrite(20, 50);
    const productReservations = reservations.get(productId);
    if (productReservations) {
      const reservation = productReservations.find(r => r.id === reservationId);
      if (reservation && reservation.status === 'active') {
        reservation.status = 'confirmed';
        // Actually decrement stock
        const current = stockDb.get(productId) || 0;
        stockDb.set(productId, current - reservation.quantity);
        return true;
      }
    }
    return false;
  }

  /**
   * Replenish stock (background job)
   */
  async replenishStock(productId, quantity) {
    await this._dbWrite(10, 30);
    const current = stockDb.get(productId) || 0;
    stockDb.set(productId, current + quantity);
    logger.info({ productId, previousStock: current, newStock: current + quantity }, `Stock replenished: ${productId}`);
    return { productId, previousStock: current, newStock: current + quantity };
  }

  /**
   * Get total reserved quantity for a product
   */
  _getReserved(productId) {
    const productReservations = reservations.get(productId) || [];
    return productReservations
      .filter(r => r.status === 'active')
      .reduce((sum, r) => sum + r.quantity, 0);
  }

  /**
   * Simulate database read latency
   */
  async _dbRead(minMs, maxMs) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Simulate database write latency (slightly slower than reads)
   */
  async _dbWrite(minMs, maxMs) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

module.exports = new InventoryService();
