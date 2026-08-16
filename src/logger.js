'use strict';

/**
 * Application logger using pino.
 *
 * When the OTel SDK is loaded (via --require instrumentation.js), the
 * @opentelemetry/instrumentation-pino bridge automatically injects
 * trace_id and span_id into every log record, correlating logs with
 * distributed traces. Log records are also exported to Bluebox via the
 * OTel Logs SDK pipeline.
 *
 * Existing stdout output is preserved — pino writes structured JSON to
 * stdout by default, which is additive (the startup banner still prints
 * via console.log).
 */

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Keep the default pino JSON format — no custom formatters that could
  // conflict with trace correlation injection.
});

module.exports = logger;
