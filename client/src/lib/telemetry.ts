/**
 * OpenTelemetry configuration for the Veltrix client — browser-based
 * distributed tracing and metrics, OFF by default for self-hosted
 * Community Edition installs.
 *
 * Tracing only starts if a consumer explicitly calls `initTelemetry()` AND
 * `VITE_OTEL_ENABLE_TRACING` is set to the literal string `"true"`. The
 * previous version of this module built a `WebTracerProvider`, registered it
 * as the process-wide tracer, and started a `BatchSpanProcessor` shipping
 * spans to an OTLP endpoint the instant the module was imported — regardless
 * of the `enableTracing` flag, which only gated the auto-instrumentation
 * registration further down. Combined with a default of "enabled unless
 * explicitly set to 'false'", simply importing this file made real network
 * calls with no self-hosted OTLP collector configured. `initTelemetry()`
 * makes startup an explicit, opt-in action and the "off" default genuinely
 * off — no provider, no exporter, no network traffic — until called.
 */
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { trace, context, SpanStatusCode, type Span } from '@opentelemetry/api';

const config = {
  serviceName: import.meta.env.VITE_OTEL_SERVICE_NAME || 'veltrix-client',
  serviceVersion: import.meta.env.VITE_APP_VERSION || '0.1.0',
  environment: import.meta.env.MODE || 'development',
  otlpEndpoint: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  // Opt-IN: tracing is off unless explicitly set to "true" (was `!== 'false'`
  // — i.e. on by default — before this Community Edition pass).
  enableTracing: import.meta.env.VITE_OTEL_ENABLE_TRACING === 'true',
  sampleRate: parseFloat(import.meta.env.VITE_OTEL_SAMPLE_RATE || '1.0'),
};

let initialized = false;

/**
 * Starts OpenTelemetry web tracing. Safe to call unconditionally at app
 * bootstrap (e.g. from `main.tsx`) — it no-ops unless
 * `VITE_OTEL_ENABLE_TRACING=true`, and only ever runs once.
 */
export function initTelemetry(): void {
  if (initialized || !config.enableTracing) return;
  initialized = true;

  const resource = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${config.otlpEndpoint}/v1/traces`,
    headers: {},
  });

  const provider = new WebTracerProvider({
    resource,
    sampler: {
      shouldSample: () =>
        Math.random() < config.sampleRate
          ? { decision: 1 } // RECORD_AND_SAMPLED
          : { decision: 0 }, // NOT_RECORD
      toString: () => `TraceIdRatioBasedSampler{${config.sampleRate}}`,
    },
    spanProcessors: [
      new BatchSpanProcessor(traceExporter, {
        maxQueueSize: 100,
        maxExportBatchSize: 10,
        scheduledDelayMillis: 5000,
      }),
    ],
  });

  provider.register({ contextManager: new ZoneContextManager() });

  registerInstrumentations({
    instrumentations: [
      getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-xml-http-request': {
          enabled: true,
          ignoreUrls: [/\/metrics/, /\/health/],
          propagateTraceHeaderCorsUrls: [new RegExp(import.meta.env.VITE_API_URL || 'http://localhost:5000')],
        },
        '@opentelemetry/instrumentation-fetch': {
          enabled: true,
          ignoreUrls: [/\/metrics/, /\/health/],
          propagateTraceHeaderCorsUrls: [new RegExp(import.meta.env.VITE_API_URL || 'http://localhost:5000')],
        },
        '@opentelemetry/instrumentation-document-load': { enabled: true },
        '@opentelemetry/instrumentation-user-interaction': { enabled: true, eventNames: ['click', 'submit'] },
      }),
    ],
  });

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(
      `OpenTelemetry initialized for ${config.serviceName} (${config.environment}) -> ${config.otlpEndpoint}, sample rate ${config.sampleRate * 100}%`,
    );
  }
}

/** True once `initTelemetry()` has actually started the SDK (not just been called while disabled). */
export function isTelemetryInitialized(): boolean {
  return initialized && config.enableTracing;
}

// ---------------------------------------------------------------------------
// Span helpers — safe no-ops whenever tracing hasn't been initialized:
// `trace.getTracer`/`getActiveSpan` fall back to the OTel API package's own
// no-op tracer/span when no provider has been registered, so these never
// throw even if `initTelemetry()` was never called or is still disabled.
// ---------------------------------------------------------------------------

export function getTracer(name?: string) {
  return trace.getTracer(name || config.serviceName, config.serviceVersion);
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name);

  if (attributes) span.setAttributes(attributes);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    throw error;
  } finally {
    span.end();
  }
}

export function addSpanEvent(name: string, attributes?: Record<string, string | number>): void {
  trace.getActiveSpan()?.addEvent(name, attributes);
}

export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  trace.getActiveSpan()?.setAttributes(attributes);
}

export function recordSpanException(error: Error): void {
  const span = trace.getActiveSpan();
  span?.recordException(error);
  span?.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
}

export function traceComponentRender(componentName: string, props?: Record<string, unknown>): void {
  const span = getTracer().startSpan(`React.Render: ${componentName}`);
  span.setAttributes({
    'component.name': componentName,
    'component.props.count': props ? Object.keys(props).length : 0,
  });
  span.end();
}

export function traceUserInteraction(action: string, target: string, metadata?: Record<string, unknown>): void {
  const span = getTracer().startSpan(`User.${action}`);
  span.setAttributes({ 'user.action': action, 'user.target': target, ...(metadata as Record<string, string>) });
  span.end();
}

export function traceRouteChange(from: string, to: string): void {
  const span = getTracer().startSpan('Route.Change');
  span.setAttributes({ 'route.from': from, 'route.to': to });
  span.end();
}

export function recordErrorBoundary(error: Error, errorInfo: { componentStack?: string | null }): void {
  const span = getTracer().startSpan('React.ErrorBoundary');
  span.recordException(error);
  span.setAttributes({ 'error.component_stack': errorInfo.componentStack || '' });
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.end();
}

export function recordWebVital(name: string, value: number, rating: string): void {
  const span = getTracer().startSpan(`WebVital.${name}`);
  span.setAttributes({ 'web_vital.name': name, 'web_vital.value': value, 'web_vital.rating': rating });
  span.end();
}

export const telemetryConfig = config;
