/**
 * Prometheus Metrics Collection for Veltrix Server
 * Custom business and application metrics
 */

import { metrics, ValueType } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: 'veltrix-server',
});

// Create Prometheus exporter
const prometheusExporter = new PrometheusExporter({
  port: parseInt(process.env.PROMETHEUS_PORT || '9464'),
  endpoint: '/metrics',
});

// Create meter provider
const meterProvider = new MeterProvider({
  resource,
  readers: [prometheusExporter],
});

// Set global meter provider
metrics.setGlobalMeterProvider(meterProvider);

// Get meter for this service
const meter = metrics.getMeter('veltrix-server', '1.0.0');

// ====================
// HTTP Metrics
// ====================

export const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
  valueType: ValueType.INT,
});

export const httpRequestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
  valueType: ValueType.DOUBLE,
  unit: 'seconds',
});

export const httpRequestsInFlight = meter.createUpDownCounter('http_requests_in_flight', {
  description: 'Current number of HTTP requests being processed',
  valueType: ValueType.INT,
});

export const httpResponseSize = meter.createHistogram('http_response_size_bytes', {
  description: 'HTTP response size in bytes',
  valueType: ValueType.INT,
  unit: 'bytes',
});

// ====================
// Database Metrics
// ====================

export const dbQueriesTotal = meter.createCounter('db_queries_total', {
  description: 'Total number of database queries',
  valueType: ValueType.INT,
});

export const dbQueryDuration = meter.createHistogram('db_query_duration_seconds', {
  description: 'Database query duration in seconds',
  valueType: ValueType.DOUBLE,
  unit: 'seconds',
});

export const dbConnectionsActive = meter.createUpDownCounter('db_connections_active', {
  description: 'Number of active database connections',
  valueType: ValueType.INT,
});

export const dbConnectionPoolSize = meter.createObservableGauge('db_connection_pool_size', {
  description: 'Database connection pool size',
  valueType: ValueType.INT,
});

// ====================
// Authentication Metrics
// ====================

export const authAttemptsTotal = meter.createCounter('auth_attempts_total', {
  description: 'Total authentication attempts',
  valueType: ValueType.INT,
});

export const authSuccessTotal = meter.createCounter('auth_success_total', {
  description: 'Successful authentication attempts',
  valueType: ValueType.INT,
});

export const authFailuresTotal = meter.createCounter('auth_failures_total', {
  description: 'Failed authentication attempts',
  valueType: ValueType.INT,
});

export const activeSessionsGauge = meter.createObservableGauge('active_sessions', {
  description: 'Number of active user sessions',
  valueType: ValueType.INT,
});

// ====================
// Business Metrics
// ====================

export const alertsCreatedTotal = meter.createCounter('alerts_created_total', {
  description: 'Total number of security alerts created',
  valueType: ValueType.INT,
});

export const alertsResolvedTotal = meter.createCounter('alerts_resolved_total', {
  description: 'Total number of security alerts resolved',
  valueType: ValueType.INT,
});

export const deploymentsTotal = meter.createCounter('deployments_total', {
  description: 'Total number of deployments',
  valueType: ValueType.INT,
});

export const deploymentDuration = meter.createHistogram('deployment_duration_seconds', {
  description: 'Deployment duration in seconds',
  valueType: ValueType.DOUBLE,
  unit: 'seconds',
});

export const activeDeployments = meter.createObservableGauge('active_deployments', {
  description: 'Number of deployments currently in progress',
  valueType: ValueType.INT,
});

export const apiKeysActive = meter.createObservableGauge('api_keys_active', {
  description: 'Number of active API keys',
  valueType: ValueType.INT,
});

// ====================
// Cache Metrics
// ====================

export const cacheHitsTotal = meter.createCounter('cache_hits_total', {
  description: 'Total number of cache hits',
  valueType: ValueType.INT,
});

export const cacheMissesTotal = meter.createCounter('cache_misses_total', {
  description: 'Total number of cache misses',
  valueType: ValueType.INT,
});

export const cacheSize = meter.createObservableGauge('cache_size_bytes', {
  description: 'Current cache size in bytes',
  valueType: ValueType.INT,
  unit: 'bytes',
});

// ====================
// Queue Metrics (RabbitMQ)
// ====================

export const queueMessagesPublished = meter.createCounter('queue_messages_published_total', {
  description: 'Total number of messages published to queue',
  valueType: ValueType.INT,
});

export const queueMessagesConsumed = meter.createCounter('queue_messages_consumed_total', {
  description: 'Total number of messages consumed from queue',
  valueType: ValueType.INT,
});

export const queueMessagesFailed = meter.createCounter('queue_messages_failed_total', {
  description: 'Total number of failed message processing',
  valueType: ValueType.INT,
});

export const queueDepth = meter.createObservableGauge('queue_depth', {
  description: 'Current number of messages in queue',
  valueType: ValueType.INT,
});

// ====================
// Error Metrics
// ====================

export const errorsTotal = meter.createCounter('errors_total', {
  description: 'Total number of errors',
  valueType: ValueType.INT,
});

export const criticalErrorsTotal = meter.createCounter('critical_errors_total', {
  description: 'Total number of critical errors',
  valueType: ValueType.INT,
});

// ====================
// System Metrics
// ====================

export const systemMemoryUsage = meter.createObservableGauge('system_memory_usage_bytes', {
  description: 'System memory usage in bytes',
  valueType: ValueType.INT,
  unit: 'bytes',
});

export const systemCpuUsage = meter.createObservableGauge('system_cpu_usage_percent', {
  description: 'System CPU usage percentage',
  valueType: ValueType.DOUBLE,
  unit: 'percent',
});

// ====================
// Helper Functions
// ====================

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number,
  size?: number
): void {
  const attributes = {
    method,
    route,
    status_code: statusCode.toString(),
  };

  httpRequestsTotal.add(1, attributes);
  httpRequestDuration.record(duration / 1000, attributes); // Convert to seconds

  if (size) {
    httpResponseSize.record(size, attributes);
  }
}

/**
 * Record database query metrics
 */
export function recordDbQuery(
  operation: string,
  table: string,
  duration: number,
  success: boolean
): void {
  const attributes = {
    operation,
    table,
    success: success.toString(),
  };

  dbQueriesTotal.add(1, attributes);
  dbQueryDuration.record(duration / 1000, attributes); // Convert to seconds
}

/**
 * Record authentication attempt
 */
export function recordAuthAttempt(
  method: string,
  success: boolean,
  reason?: string
): void {
  const attributes = {
    method,
    reason: reason || 'none',
  };

  authAttemptsTotal.add(1, attributes);

  if (success) {
    authSuccessTotal.add(1, attributes);
  } else {
    authFailuresTotal.add(1, attributes);
  }
}

/**
 * Record security alert
 */
export function recordAlert(
  severity: string,
  type: string,
  vendor?: string
): void {
  const attributes = {
    severity,
    type,
    vendor: vendor || 'unknown',
  };

  alertsCreatedTotal.add(1, attributes);
}

/**
 * Record alert resolution
 */
export function recordAlertResolution(
  severity: string,
  type: string,
  resolutionTime: number
): void {
  const attributes = {
    severity,
    type,
  };

  alertsResolvedTotal.add(1, attributes);
}

/**
 * Record deployment
 */
export function recordDeployment(
  environment: string,
  strategy: string,
  success: boolean,
  duration: number
): void {
  const attributes = {
    environment,
    strategy,
    success: success.toString(),
  };

  deploymentsTotal.add(1, attributes);
  deploymentDuration.record(duration, attributes);
}

/**
 * Record cache operation
 */
export function recordCacheOperation(
  operation: 'hit' | 'miss',
  key: string
): void {
  const attributes = { key_prefix: key.split(':')[0] || 'unknown' };

  if (operation === 'hit') {
    cacheHitsTotal.add(1, attributes);
  } else {
    cacheMissesTotal.add(1, attributes);
  }
}

/**
 * Record queue message
 */
export function recordQueueMessage(
  operation: 'publish' | 'consume' | 'fail',
  queue: string
): void {
  const attributes = { queue };

  switch (operation) {
    case 'publish':
      queueMessagesPublished.add(1, attributes);
      break;
    case 'consume':
      queueMessagesConsumed.add(1, attributes);
      break;
    case 'fail':
      queueMessagesFailed.add(1, attributes);
      break;
  }
}

/**
 * Record error
 */
export function recordError(
  type: string,
  severity: 'critical' | 'error' | 'warning',
  message: string
): void {
  const attributes = {
    type,
    severity,
  };

  errorsTotal.add(1, attributes);

  if (severity === 'critical') {
    criticalErrorsTotal.add(1, attributes);
  }
}

// ====================
// Observable Metrics Setup
// ====================

/**
 * Update system metrics periodically
 */
export function setupSystemMetrics(): void {
  // Memory usage
  systemMemoryUsage.addCallback((observableResult) => {
    const usage = process.memoryUsage();
    observableResult.observe(usage.heapUsed, { type: 'heap' });
    observableResult.observe(usage.rss, { type: 'rss' });
    observableResult.observe(usage.external, { type: 'external' });
  });

  // CPU usage (requires process.cpuUsage())
  let lastCpuUsage = process.cpuUsage();
  let lastMeasureTime = Date.now();

  systemCpuUsage.addCallback((observableResult) => {
    const currentCpuUsage = process.cpuUsage();
    const currentTime = Date.now();
    const timeDiff = currentTime - lastMeasureTime;

    if (timeDiff > 0) {
      const userCpuPercent = ((currentCpuUsage.user - lastCpuUsage.user) / timeDiff / 1000) * 100;
      const systemCpuPercent = ((currentCpuUsage.system - lastCpuUsage.system) / timeDiff / 1000) * 100;

      observableResult.observe(userCpuPercent, { type: 'user' });
      observableResult.observe(systemCpuPercent, { type: 'system' });

      lastCpuUsage = currentCpuUsage;
      lastMeasureTime = currentTime;
    }
  });
}

// Initialize system metrics
setupSystemMetrics();

console.log('✅ Prometheus metrics initialized');
