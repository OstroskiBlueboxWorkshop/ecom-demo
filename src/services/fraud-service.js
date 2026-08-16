'use strict';

/**
 * Fraud Detection Service — scores transactions for fraud risk.
 *
 * BUG: Contains a memory leak in the scoring cache. The cache accumulates
 * entries without eviction. After ~50 requests, response time starts
 * degrading as the "scoring model" iterates over the growing cache to
 * compute correlation scores. This simulates a real-world leak where a
 * cache or buffer grows unbounded and causes GC pressure + CPU overhead.
 *
 * Degradation timeline:
 *   Requests 1-20:   ~50-100ms (normal)
 *   Requests 20-50:  ~200-400ms (noticeable slowdown)
 *   Requests 50-80:  ~800-1500ms (SLO breach territory)
 *   Requests 80+:    ~2000-4000ms+ (triggers upstream timeouts)
 */

const logger = require('../logger');

// The leaking cache — never evicted, grows with every request
const scoringCache = [];

// Request counter for degradation curve
let requestCount = 0;

class FraudService {
  /**
   * Score a transaction for fraud risk.
   * Returns a risk score (0-100) and a decision (approve/review/decline).
   */
  async scoreTransaction(transactionData) {
    requestCount++;
    const startTime = Date.now();

    logger.info({
      orderId: transactionData.orderId,
      amount: transactionData.amount,
      requestNum: requestCount,
      cacheSize: scoringCache.length,
    }, `Fraud check started: order ${transactionData.orderId}, amount $${transactionData.amount}`);

    // Accumulate into the leaking cache (never cleaned up)
    // Each entry simulates a "fraud pattern" being cached for correlation
    scoringCache.push({
      timestamp: Date.now(),
      orderId: transactionData.orderId,
      amount: transactionData.amount,
      email: transactionData.email,
      fingerprint: this._generateFingerprint(transactionData),
      // Intentionally storing large objects to accelerate memory pressure
      correlationMatrix: this._buildCorrelationData(transactionData),
      rawFeatures: JSON.parse(JSON.stringify(transactionData)),
    });

    // "Score" the transaction by iterating over the ENTIRE cache
    // This is the O(n) operation that makes response time degrade linearly
    const riskScore = await this._computeRiskScore(transactionData);

    const duration = Date.now() - startTime;

    logger.info({
      orderId: transactionData.orderId,
      riskScore,
      decision: this._makeDecision(riskScore),
      durationMs: duration,
      cacheSize: scoringCache.length,
      requestNum: requestCount,
    }, `Fraud check completed: score=${riskScore}, decision=${this._makeDecision(riskScore)}, took ${duration}ms`);

    return {
      orderId: transactionData.orderId,
      riskScore,
      decision: this._makeDecision(riskScore),
      factors: this._getRiskFactors(riskScore, transactionData),
      processingTimeMs: duration,
    };
  }

  /**
   * Compute risk score — deliberately O(n) over the leaking cache.
   * Each cached entry adds processing time for "correlation analysis".
   * Degradation curve: ~100ms at start → ~3s+ after ~8-10 orders
   */
  async _computeRiskScore(transactionData) {
    // Base processing time (the actual fraud scoring)
    await this._simulateWork(40, 80);

    // For every entry in the cache, simulate correlation analysis
    // This is where the degradation comes from — quadratic growth
    for (let i = 0; i < scoringCache.length; i++) {
      // Per-entry delay grows quadratically with cache size
      const perEntryDelay = 40 + scoringCache.length * 8;
      await this._simulateWork(perEntryDelay * 0.8, perEntryDelay);

      // Every 3rd entry, simulate a heavier "deep correlation" check
      if (i % 3 === 0 && i > 0) {
        await this._simulateWork(30, 60);
      }
    }

    // Generate a mostly-safe score (low fraud rate for realism)
    const baseScore = Math.random() * 30; // 0-30 base
    const emailRisk = transactionData.email?.includes('test') ? 5 : 0;
    const amountRisk = transactionData.amount > 200 ? 10 : 0;

    return Math.min(100, Math.round(baseScore + emailRisk + amountRisk));
  }

  /**
   * Make a decision based on risk score
   */
  _makeDecision(score) {
    if (score >= 80) return 'decline';
    if (score >= 50) return 'review';
    return 'approve';
  }

  /**
   * Get human-readable risk factors
   */
  _getRiskFactors(score, data) {
    const factors = [];
    if (score >= 20) factors.push('elevated_velocity');
    if (data.amount > 100) factors.push('high_value_transaction');
    if (data.email?.includes('test')) factors.push('suspicious_email_pattern');
    if (factors.length === 0) factors.push('no_risk_factors_identified');
    return factors;
  }

  /**
   * Generate a transaction fingerprint (for cache key)
   */
  _generateFingerprint(data) {
    return `fp-${data.email?.split('@')[0] || 'anon'}-${data.amount}-${Date.now()}`;
  }

  /**
   * Build correlation data (intentionally large to accelerate memory pressure)
   */
  _buildCorrelationData(data) {
    // Create a moderately large object per cache entry
    const matrix = {};
    for (let i = 0; i < 50; i++) {
      matrix[`feature_${i}`] = {
        weight: Math.random(),
        correlation: Math.random() - 0.5,
        samples: Array(20).fill(0).map(() => Math.random()),
        metadata: { source: 'fraud-model-v3', version: '3.2.1', timestamp: Date.now() },
      };
    }
    return matrix;
  }

  /**
   * Get service health metrics (useful for monitoring)
   */
  getHealthMetrics() {
    return {
      cacheSize: scoringCache.length,
      requestCount,
      estimatedMemoryMB: Math.round((scoringCache.length * 50 * 200) / 1024 / 1024 * 100) / 100,
      avgProcessingTimeEstimateMs: Math.round(50 + scoringCache.length * 25),
    };
  }

  async _simulateWork(minMs, maxMs) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

module.exports = new FraudService();
