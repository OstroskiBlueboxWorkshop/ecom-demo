'use strict';

/**
 * Payment Gateway Service — orchestrates payment processing.
 *
 * Calls the Fraud Detection Service before processing payment.
 * Has a 3-second timeout on the fraud check. When fraud detection
 * degrades (due to its memory leak), this gateway starts timing out
 * and returns a generic "Payment processing failed" error — which is
 * MISLEADING because the real root cause is fraud service latency,
 * not a payment processing issue.
 *
 * BUG: Does NOT cancel the timed-out fraud request, so the fraud service
 * keeps processing in the background, consuming more memory and making
 * the leak worse — a cascading degradation loop.
 */

const { v4: uuidv4 } = require('uuid');
const fraudService = require('./fraud-service');
const logger = require('../logger');

const FRAUD_CHECK_TIMEOUT_MS = 3000; // 3 second timeout on fraud check

class PaymentGateway {
  /**
   * Process a payment — the main entry point.
   * Steps: fraud check → charge card → return result
   */
  async processPayment(paymentRequest) {
    const transactionId = `TXN-${uuidv4().split('-')[0].toUpperCase()}`;
    const startTime = Date.now();

    logger.info({
      transactionId,
      orderId: paymentRequest.orderId,
      amount: paymentRequest.amount,
      customerEmail: paymentRequest.customer.email,
    }, `Payment processing started: ${transactionId}`);

    try {
      // Step 1: Fraud check (with timeout)
      const fraudResult = await this._runFraudCheck(paymentRequest, transactionId);

      // Step 2: Check fraud decision
      if (fraudResult.decision === 'decline') {
        logger.warn({
          transactionId,
          riskScore: fraudResult.riskScore,
          factors: fraudResult.factors,
        }, `Payment declined by fraud check: score=${fraudResult.riskScore}`);

        return {
          status: 'declined',
          transactionId,
          reason: 'Transaction declined by fraud detection',
          riskScore: fraudResult.riskScore,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Step 3: Process the actual charge (simulated)
      const chargeResult = await this._chargeCard(paymentRequest, transactionId);

      const totalTime = Date.now() - startTime;
      logger.info({
        transactionId,
        status: chargeResult.status,
        amount: paymentRequest.amount,
        processingTimeMs: totalTime,
        fraudCheckMs: fraudResult.processingTimeMs,
      }, `Payment completed: ${transactionId} — ${chargeResult.status} in ${totalTime}ms`);

      return {
        status: chargeResult.status,
        transactionId,
        amount: paymentRequest.amount,
        last4: '4242',
        method: 'credit_card',
        fraudScore: fraudResult.riskScore,
        processingTimeMs: totalTime,
      };

    } catch (error) {
      const totalTime = Date.now() - startTime;

      // Generic error message that hides the real cause (fraud timeout)
      logger.error({
        transactionId,
        orderId: paymentRequest.orderId,
        error: error.message,
        processingTimeMs: totalTime,
        isTimeout: error.isTimeout || false,
      }, `Payment processing failed: ${transactionId} — ${error.message} (${totalTime}ms)`);

      const gatewayError = new Error('Payment processing failed. Please try again.');
      gatewayError.statusCode = 502;
      gatewayError.transactionId = transactionId;
      throw gatewayError;
    }
  }

  /**
   * Run fraud check with a timeout.
   *
   * BUG: When the timeout fires, we do NOT cancel the fraud service call.
   * The fraud service continues processing in the background, consuming
   * memory and CPU, making the leak worse with each timed-out request.
   */
  async _runFraudCheck(paymentRequest, transactionId) {
    const fraudData = {
      orderId: paymentRequest.orderId,
      amount: paymentRequest.amount,
      email: paymentRequest.customer.email,
      name: paymentRequest.customer.name,
      address: paymentRequest.customer.address,
      transactionId,
    };

    // Race between fraud check and timeout
    // NOTE: The fraud check is NOT aborted on timeout — it keeps running
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(
          `Fraud check timed out after ${FRAUD_CHECK_TIMEOUT_MS}ms for transaction ${transactionId}`
        );
        error.isTimeout = true;
        error.service = 'fraud-detection';
        reject(error);
      }, FRAUD_CHECK_TIMEOUT_MS);
    });

    // Start the fraud check — this reference is intentionally NOT cancelled
    const fraudPromise = fraudService.scoreTransaction(fraudData);

    // Race: whoever finishes first wins
    return Promise.race([fraudPromise, timeoutPromise]);
  }

  /**
   * Simulate charging a credit card.
   * Occasional random failures (~5%) for realism.
   */
  async _chargeCard(paymentRequest, transactionId) {
    // Simulate payment processor latency
    await this._simulateLatency(80, 200);

    // 5% chance of card decline (realistic)
    if (Math.random() < 0.05) {
      const error = new Error('Card declined by issuing bank');
      error.statusCode = 402;
      error.isCardDecline = true;
      throw error;
    }

    return {
      status: 'approved',
      chargeId: `CHG-${uuidv4().split('-')[0].toUpperCase()}`,
      amount: paymentRequest.amount,
      transactionId,
    };
  }

  /**
   * Get gateway health metrics
   */
  getHealthMetrics() {
    const fraudHealth = fraudService.getHealthMetrics();
    return {
      fraudService: fraudHealth,
      timeoutThresholdMs: FRAUD_CHECK_TIMEOUT_MS,
      estimatedWillTimeout: fraudHealth.avgProcessingTimeEstimateMs > FRAUD_CHECK_TIMEOUT_MS,
    };
  }

  async _simulateLatency(minMs, maxMs) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

module.exports = new PaymentGateway();
