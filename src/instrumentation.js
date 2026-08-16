'use strict';

/**
 * OpenTelemetry SDK initialization for Bluebox.
 * Loaded via --require before the application starts.
 *
 * Signals: traces + logs + metrics (Level 3)
 * Protocol: http/protobuf (Bluebox/Dynatrace direct-ingest contract)
 * Metrics temporality: delta (required by Bluebox ingest)
 *
 * All config is read from environment variables — no secrets in code.
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-proto');
const { PeriodicExportingMetricReader, AggregationTemporality } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor, LoggerProvider } = require('@opentelemetry/sdk-logs');
const { logs } = require('@opentelemetry/api-logs');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} = require('@opentelemetry/semantic-conventions');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');

// --- Diagnostic logging (set OTEL_LOG_LEVEL=debug for verbose output) ---
const logLevel = (process.env.OTEL_LOG_LEVEL || 'info').toLowerCase();
const diagLevel = logLevel === 'debug' ? DiagLogLevel.DEBUG
  : logLevel === 'verbose' ? DiagLogLevel.VERBOSE
  : DiagLogLevel.INFO;
diag.setLogger(new DiagConsoleLogger(), diagLevel);

// --- Resource: service identity ---
// OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES are read automatically by the SDK.
// We set a fallback service name here; the env var always wins.
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'ecom-store',
  [ATTR_SERVICE_VERSION]: '1.0.0',
});

// --- Trace exporter (http/protobuf) ---
const traceExporter = new OTLPTraceExporter();

// --- Metrics exporter (http/protobuf, delta temporality) ---
const metricExporter = new OTLPMetricExporter({
  temporalityPreference: AggregationTemporality.DELTA,
});

const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 30000,
});

// --- Log exporter (http/protobuf) ---
// Create LoggerProvider manually to avoid SDK compatibility issues with logRecordProcessors
const logExporter = new OTLPLogExporter();
const loggerProvider = new LoggerProvider({
  processors: [new BatchLogRecordProcessor({ exporter: logExporter })],
});

// Register the log provider globally so pino bridge can emit log records
logs.setGlobalLoggerProvider(loggerProvider);

// --- SDK setup ---
const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReaders: [metricReader],
  loggerProvider,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy/low-value instrumentations
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      // Enable pino instrumentation for trace correlation
      '@opentelemetry/instrumentation-pino': { enabled: true },
    }),
  ],
});

sdk.start();
console.log('[OTel] OpenTelemetry SDK initialized (traces + logs + metrics)');
console.log(`[OTel] Service: ${process.env.OTEL_SERVICE_NAME || 'ecom-store'}`);
console.log(`[OTel] OTLP endpoint: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '(not set — telemetry will not export)'}`);

// --- Graceful shutdown ---
const shutdown = () => {
  Promise.all([sdk.shutdown(), loggerProvider.shutdown()])
    .then(() => console.log('[OTel] SDK shut down successfully'))
    .catch((err) => console.error('[OTel] Error shutting down SDK:', err))
    .finally(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
