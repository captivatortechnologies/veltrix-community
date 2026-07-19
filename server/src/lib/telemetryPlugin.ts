/**
 * Fastify Plugin for OpenTelemetry Integration
 * Automatic tracing and metrics for all routes
 */

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { 
  recordHttpRequest, 
  httpRequestsInFlight,
  recordError 
} from './metrics';

const telemetryPlugin: FastifyPluginAsync = async (fastify) => {
  const tracer = trace.getTracer('veltrix-server-http', '1.0.0');

  // Request hook - start span and record metrics
  fastify.addHook('onRequest', async (request, reply) => {
    const startTime = Date.now();
    
    // Create span for this request
    const span = tracer.startSpan(`${request.method} ${request.routerPath || request.url}`, {
      attributes: {
        'http.method': request.method,
        'http.url': request.url,
        'http.target': request.routerPath || request.url,
        'http.host': request.hostname,
        'http.scheme': request.protocol,
        'http.user_agent': request.headers['user-agent'] || 'unknown',
        'http.client_ip': request.ip,
      },
    });

    // Store span and start time in request context
    (request as any).telemetry = {
      span,
      startTime,
      spanContext: trace.setSpan(context.active(), span),
    };

    // Increment in-flight requests
    httpRequestsInFlight.add(1, {
      method: request.method,
      route: request.routerPath || 'unknown',
    });
  });

  // Response hook - end span and record metrics
  fastify.addHook('onResponse', async (request, reply) => {
    const telemetry = (request as any).telemetry;
    if (!telemetry) return;

    const { span, startTime } = telemetry;
    const duration = Date.now() - startTime;
    const statusCode = reply.statusCode;

    // Set span attributes
    span.setAttributes({
      'http.status_code': statusCode,
      'http.response_content_length': reply.getHeader('content-length') || 0,
    });

    // Set span status
    if (statusCode >= 500) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${statusCode}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // End span
    span.end();

    // Record HTTP metrics
    recordHttpRequest(
      request.method,
      request.routerPath || 'unknown',
      statusCode,
      duration,
      parseInt(reply.getHeader('content-length') as string) || undefined
    );

    // Decrement in-flight requests
    httpRequestsInFlight.add(-1, {
      method: request.method,
      route: request.routerPath || 'unknown',
    });
  });

  // Error hook - record errors
  fastify.addHook('onError', async (request, reply, error) => {
    const telemetry = (request as any).telemetry;
    if (telemetry?.span) {
      const { span } = telemetry;
      
      // Record exception in span
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }

    // Record error metrics
    recordError(
      error.name || 'UnknownError',
      reply.statusCode >= 500 ? 'critical' : 'error',
      error.message
    );
  });

  // Add utility method to get current span
  fastify.decorateRequest('getSpan', function () {
    return (this as any).telemetry?.span;
  });

  // Add utility method to add span event
  fastify.decorateRequest('addSpanEvent', function (name: string, attributes?: Record<string, any>) {
    const span = (this as any).telemetry?.span;
    if (span) {
      span.addEvent(name, attributes);
    }
  });

  // Add utility method to set span attributes
  fastify.decorateRequest('setSpanAttributes', function (attributes: Record<string, any>) {
    const span = (this as any).telemetry?.span;
    if (span) {
      span.setAttributes(attributes);
    }
  });

  fastify.log.info('Telemetry plugin loaded');
};

export default fp(telemetryPlugin, {
  name: 'telemetry-plugin',
  fastify: '>=4.0.0',
});
