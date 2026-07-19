/**
 * OpenTelemetry Configuration for Veltrix Server
 * Implements distributed tracing, metrics, and logging
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { 
  trace, 
  context, 
  SpanStatusCode,
  Span,
  Tracer 
} from '@opentelemetry/api';

// Enable diagnostic logging in development
if (process.env.NODE_ENV === 'development') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

// Configuration
const config = {
  serviceName: process.env.OTEL_SERVICE_NAME || 'veltrix-server',
  serviceVersion: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  prometheusPort: parseInt(process.env.PROMETHEUS_PORT || '9464'),
  enableTracing: process.env.OTEL_ENABLE_TRACING !== 'false',
  enableMetrics: process.env.OTEL_ENABLE_METRICS !== 'false',
};

// Resource describing the service
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
  [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment,
});

// OTLP Trace Exporter (for Jaeger, Zipkin, etc.)
const traceExporter = new OTLPTraceExporter({
  url: `${config.otlpEndpoint}/v1/traces`,
  headers: {},
});

// OTLP Metric Exporter
const metricExporter = new OTLPMetricExporter({
  url: `${config.otlpEndpoint}/v1/metrics`,
  headers: {},
});

// Prometheus Exporter (pull-based metrics)
const prometheusExporter = new PrometheusExporter({
  port: config.prometheusPort,
  endpoint: '/metrics',
});

// Metric Reader with 60s export interval
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60000,
});

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  resource,
  traceExporter: config.enableTracing ? traceExporter : undefined,
  metricReader: config.enableMetrics ? prometheusExporter : undefined,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Fastify instrumentation
      '@opentelemetry/instrumentation-fastify': {
        enabled: true,
      },
      // HTTP instrumentation
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingPaths: ['/health', '/metrics'],
      },
      // PostgreSQL instrumentation
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
        enhancedDatabaseReporting: true,
      },
      // Redis instrumentation
      '@opentelemetry/instrumentation-ioredis': {
        enabled: true,
      },
      // Disable unwanted instrumentations
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
      '@opentelemetry/instrumentation-dns': {
        enabled: false,
      },
    }),
  ],
});

// Start the SDK
export function startTelemetry(): void {
  try {
    sdk.start();
    console.log(`✅ OpenTelemetry initialized for ${config.serviceName}`);
    console.log(`   - Tracing: ${config.enableTracing ? 'enabled' : 'disabled'}`);
    console.log(`   - Metrics: ${config.enableMetrics ? 'enabled' : 'disabled'}`);
    console.log(`   - OTLP Endpoint: ${config.otlpEndpoint}`);
    console.log(`   - Prometheus Port: ${config.prometheusPort}`);
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry:', error);
  }
}

// Graceful shutdown
export async function stopTelemetry(): Promise<void> {
  try {
    await sdk.shutdown();
    console.log('OpenTelemetry SDK shut down successfully');
  } catch (error) {
    console.error('Error shutting down OpenTelemetry SDK:', error);
  }
}

// Get tracer instance
export function getTracer(name?: string): Tracer {
  return trace.getTracer(name || config.serviceName, config.serviceVersion);
}

// Utility: Create and execute a span
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name);
  
  if (attributes) {
    span.setAttributes(attributes);
  }

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: (error as Error).message,
    });
    throw error;
  } finally {
    span.end();
  }
}

// Utility: Add event to current span
export function addSpanEvent(name: string, attributes?: Record<string, string | number>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

// Utility: Set span attributes
export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

// Utility: Record exception in current span
export function recordSpanException(error: Error): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

// Decorator: Trace method calls
export function Trace(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const spanName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return withSpan(
        spanName,
        async (span) => {
          span.setAttributes({
            'method.name': propertyKey,
            'method.args.count': args.length,
          });
          return originalMethod.apply(this, args);
        }
      );
    };

    return descriptor;
  };
}

// Export configuration for external use
export const telemetryConfig = config;

// Register shutdown handlers
process.on('SIGTERM', async () => {
  await stopTelemetry();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await stopTelemetry();
  process.exit(0);
});
