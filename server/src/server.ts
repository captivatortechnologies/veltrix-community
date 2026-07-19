import fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config';
import { isFeatureEnabled, getFeatureFlags } from './config/feature-flags';
import { loggerService } from './module/logger/logger.service';

// ---- OSS route modules (see _ai_tasks/opensource-extraction master plan §2.3) ----
import toolRoutes from './module/tool/tool.route';
import tagRoutes from './module/tag/tag.route';
import environmentRoutes from './module/environment/environment.route';
import credentialRoutes from './module/credential/credential.route';
import componentRoutes from './module/component/component.route';
import { apiKeyRoutes } from './module/api-key/api-key.route';
import { apiKeyAuthRoutes } from './module/api-key/api-key.auth.route';
import logForwardingRoutes from './module/log-forwarding/log-forwarding.route';
import logEntryRoutes from './module/log-entry/log-entry.route';
import reportRoutes from './module/report/report.route';
import authRoutes from './module/auth/auth.route';
import meRoutes from './module/me/me.route';
import tailscaleRoutes from './module/tailscale/tailscale.route';
import tailscaleConfigRoutes from './module/tailscale-config/tailscale-config.route';
import { connectivityProviderRoutes } from './module/connectivity-provider/connectivity-provider.route';
import profileRoutes from './module/profile/profile.route';
import organizationRoutes from './module/organization/organization.route';
import emailRoutes from './module/email/email.route';
import connectivityRoutes from './module/connectivity/connectivity.route';
import customerToolRoutes from './module/customer-tool/customer-tool.route';
import cognitoRoutes from './module/cognito/cognito.route';
import googleRoutes from './module/google/google.route';
import microsoftRoutes from './module/microsoft/microsoft.route';
import oidcRoutes from './module/oidc/oidc.route';
import userRoleRoutes from './module/role/role.route';
import userRoutes from './module/user/user.route';
import { webhookRoutes } from './module/webhook/webhook.route';
import configurationHistoryController from './module/configuration-history/configuration-history.controller';
import configurationCanvasRoutes from './module/configuration-canvas/configuration-canvas.route';
import pipelineRoutes from './core/pipeline-engine/pipeline.route';
import appManagementRoutes from './core/app-engine/app-management.route';
import sandboxRoutes from './module/sandbox/sandbox.route';
import brandRoutes from './module/brand/brand.route';

// ---- NOT present in Community Edition (see _ai_tasks/opensource-extraction
// master plan §2.4): `ztna` (Veltrix-managed hosted Tailscale enrollment)
// and `cloud-account` (BYOC registration feeding hosted AWS provisioning)
// are both backed by Prisma models that were dropped from the pruned
// single-tenant schema (ZtnaEnrollment, CloudAccountConnection) — they are
// hosted-commercial-only concepts with no OSS equivalent, so per the HYBRID
// decision (commercial physically removed) their modules were never
// extracted and their route registrations below were removed rather than
// flag-gated. The `platform.hostedConnectivity` / `platform.cloudProvisioning`
// feature flags remain defined (client-visible via GET /api/feature-flags)
// so a hosted fork can reuse the same flag surface, but nothing in this
// server backs them. The generic connectivity-provider adapters
// (SSH/WireGuard/self-managed Tailscale) registered above are unaffected.
//
// `core/app-engine/connection-onboarding.route` + `module/connection-onboarding`
// (one-click Entra ID admin-consent + ARM role-assignment brokering for
// Azure BYOC) are ALSO not present, for the same reason: the token broker's
// only data source (`connector-app.repo.ts`) reads the centrally-owned
// `PlatformConnectorApp` table — explicitly in the dropped-model list
// (§2.4) — so this is Azure BYOC cloud-provisioning infrastructure, not a
// generic app-engine feature, despite being mounted under /api/apps in the
// source. Removed rather than flag-gated.

// ---- Wiring / infra ----
import { errorHandler, handleUnhandledRejection, handleUncaughtException } from './middlewares/errorHandler';
import { registerSecurityPlugins } from './config/security';
import { correlationMiddleware, correlationLoggerHook } from './middlewares/correlation.middleware';
import { createCsrfProtection } from './middlewares/csrf.middleware';
import { timeoutMiddleware, decorateTimeout, logSlowRequests } from './middlewares/timeout.middleware';
import seedAdminAccount from '../prisma/seed/admin-account';
import seedOAuthProviders from '../prisma/seed/oauth-providers';
import seedComplianceCatalog from '../prisma/seed/compliance-catalog';
import { initializePlatform, shutdownPlatform, registerAppRoutesWithServer } from './core/platform-bootstrap';
import { initializeRealtime } from './lib/realtime-bootstrap';

// ============================================================================
// NOTE for maintainers — deliberately NOT registered here (Community Edition
// excludes the hosted-commercial layer; see _ai_tasks/opensource-extraction):
//   /api/subscription, /api/stripe, /api/payment-methods, /api/payment/*,
//   /api/platform-admin, /api/group-admin, /api/mssp, /api/network (BYOL IPAM),
//   /api/customers (superseded by /api/organization — single-tenant, no
//   multi-customer admin listing needed).
//   /api/cloud-providers — the source module is a BYOL provider/region
//   *catalog* backed entirely by the CloudProvider/CloudProviderRegion tables
//   (raw SQL against those tables) and the cloud-account BYOC adapter
//   registry; both were dropped from the pruned schema (see §2.4), so this
//   is not a static/model-free list that could be kept — the whole module is
//   commercial cloud-provisioning infrastructure. Removed rather than
//   flag-gated (HYBRID decision).
//   /api/ztna, /api/cloud-accounts — see the larger note further down,
//   next to where their imports used to be.
// The RabbitMQ-based deployment-status consumer is also gone: deployment
// status now flows through the in-process app-events bus / BullMQ
// job-runner (core/) instead of an external broker.
// ============================================================================

const server = fastify({
  ajv: {
    customOptions: {
      allowUnionTypes: true
    }
  },
  logger: {
    level: config.logLevel,
  }
});

// Set up global error handler
server.setErrorHandler(errorHandler);

// Handle unhandled rejections and uncaught exceptions
process.on('unhandledRejection', handleUnhandledRejection);
process.on('uncaughtException', handleUncaughtException);

// Register correlation middleware globally
server.addHook('onRequest', correlationMiddleware);
server.addHook('onSend', correlationLoggerHook);

// Register timeout handling
decorateTimeout(server);
server.addHook('onRequest', timeoutMiddleware);
server.addHook('onResponse', logSlowRequests(5000)); // Log requests slower than 5s

// Register CSRF protection
const csrfProtection = createCsrfProtection({
  excludePaths: [
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/register',
    '/api/auth/check-user',
    '/api/auth/2fa', // 2FA setup/verify/disable/login routes use JWT (or a short-lived
                     // challenge token) authentication, matching their sibling auth routes above
    '/api/auth/forgot-password', // unauthenticated pre-login flow (like /login, /register)
    '/api/auth/reset-password',  // token-authenticated, unauthenticated session
    '/api/webhooks',
    '/api/health',
    '/api/google',
    '/api/microsoft',
    '/api/cognito',
    '/api/oidc',
    '/api/tags', // Tags routes use JWT authentication
    '/api/tools', // Tools routes use JWT authentication
    '/api/tailscale', // Tailscale routes use JWT authentication
    '/api/credentials', // Credentials routes use JWT authentication
    '/api/components', // Components routes use JWT authentication
    '/api/vendor-tools', // Vendor tools routes use JWT authentication
    '/api/configuration-canvas', // Configuration Canvas routes use JWT authentication
    '/api/environments', // Environments management routes use JWT authentication
    '/api/pipeline', // Security-as-Code pipeline routes use JWT authentication
    '/api/apps', // App management routes use JWT authentication
    '/api/connectivity-providers', // Connectivity provider routes use JWT + admin middleware
    '/api/sandboxes', // Sandbox routes use JWT or API key authentication (CLI clients cannot send CSRF tokens)
    '/api/reports', // Tenant reports routes use JWT authentication
    '/api/roles', // Roles/RBAC routes use JWT (bearer) authentication — CSRF-immune, like the data routes above
    '/api/users', // User management routes use JWT (bearer) authentication — CSRF-immune
  ],
});
server.addHook('onRequest', csrfProtection);

// Register security plugins first
server.register(async (fastify) => {
  await registerSecurityPlugins(fastify);
});

// Register cookie support for CSRF. No public fallback literal — config.ts
// fails fast at startup if COOKIE_SECRET is unset.
server.register(cookie, {
  secret: config.cookieSecret,
  parseOptions: {}
});

// Register multipart support for file uploads
server.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
    files: 1,
  },
});

// Register plugins
server.register(cors, {
  origin: config.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Customer-ID', 'X-API-Key', 'X-API-Key-ID', 'X-Correlation-ID', 'X-CSRF-Token', 'X-XSRF-TOKEN', 'csrf-token'],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'X-Correlation-ID', 'X-Page', 'X-Limit', 'X-Total', 'X-Total-Pages', 'X-Has-Next', 'X-Has-Prev', 'X-Cache', 'X-CSRF-Token', 'X-XSRF-TOKEN']
});

// Register Swagger
server.register(swagger, {
  swagger: {
    info: {
      title: 'Veltrix Community Edition API',
      description: 'API documentation for the Veltrix Security-as-Code platform (self-hosted, Community Edition)',
      version: '1.0.0'
    },
    externalDocs: {
      url: 'https://github.com/captivatortechnologies/veltrix-community',
      description: 'Find more info here'
    },
    host: `localhost:${config.port}`,
    schemes: ['http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [
      { name: 'auth', description: 'Authentication related endpoints' },
      { name: 'authentication', description: 'API key authentication endpoints' },
      { name: 'cognito', description: 'AWS Cognito OAuth endpoints (optional, flagged)' },
      { name: 'google', description: 'Google OAuth endpoints (optional, flagged)' },
      { name: 'microsoft', description: 'Microsoft Azure AD OAuth endpoints (optional, flagged)' },
      { name: 'oidc', description: 'Generic OpenID Connect (bring-your-own-issuer) OAuth endpoints (optional, flagged)' },
      { name: 'tools', description: 'Tools related endpoints' },
      { name: 'tags', description: 'Tags related endpoints' },
      { name: 'credentials', description: 'Credentials related endpoints' },
      { name: 'components', description: 'Components related endpoints' },
      { name: 'organizations', description: 'Organization related endpoints' },
      { name: 'apiKeys', description: 'API Keys related endpoints' },
      { name: 'logForwarding', description: 'Log forwarding related endpoints' },
      { name: 'logEntries', description: 'Log entries related endpoints' },
      { name: 'connectivity', description: 'Connectivity related endpoints' },
      { name: 'tailscale', description: 'Tailscale related endpoints' },
      { name: 'tailscale-config', description: 'Tailscale configuration endpoints' },
      { name: 'profile', description: 'User profile related endpoints' },
      { name: 'customer-tools', description: 'Per-tenant tool enablement endpoints' },
      { name: 'reports', description: 'Tenant reporting endpoints (audit, activity, resources, security, compliance)' },
      { name: 'webhooks', description: 'Webhook notification endpoints for external service integration (flagged)' },
      { name: 'pipeline', description: 'Security-as-Code pipeline endpoints' },
      { name: 'apps', description: 'App marketplace and management endpoints' },
      { name: 'sandboxes', description: 'Developer sandbox endpoints (Veltrix CLI dev mode, flagged)' },
      { name: 'brand', description: 'Public branding endpoint (name/tagline/logo)' },
    ],
    securityDefinitions: {
      apiKey: {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API Key for direct authentication'
      },
      bearerAuth: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description: 'JWT token with format: Bearer {token} or API Key with format: ApiKey {key}'
      }
    },
    security: [
      { apiKey: [] },
      { bearerAuth: [] }
    ]
  }
});

// Register Swagger UI
server.register(swaggerUi, {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  },
  uiHooks: {
    onRequest: function (request: FastifyRequest, reply: FastifyReply, next: () => void) { next() },
    preHandler: function (request: FastifyRequest, reply: FastifyReply, next: () => void) { next() }
  },
  staticCSP: false, // Disable Content Security Policy to allow inline styles
  transformSpecification: (swaggerObject: any, request: FastifyRequest, reply: FastifyReply) => { return swaggerObject },
  transformSpecificationClone: true
});

// Health check route
server.get('/', async (_, reply) => {
  reply.send({ status: 'ok', service: 'veltrix-server' });
});

// Feature flags (public, used by client to conditionally render UI)
server.get('/api/feature-flags', async (_, reply) => {
  reply.send(getFeatureFlags());
});

// ---- Register routes ----
server.register(brandRoutes, { prefix: '/api' }); // Public branding (no auth) — GET /api/brand
server.register(authRoutes, { prefix: '/api' });
server.register(meRoutes, { prefix: '/api' });
server.register(toolRoutes, { prefix: '/api' });
server.register(tagRoutes, { prefix: '/api' });
server.register(environmentRoutes, { prefix: '/api/environments' }); // Environments management (Tag + policy + ownership)
server.register(credentialRoutes, { prefix: '/api' });
server.register(componentRoutes, { prefix: '/api/components' });
server.register(apiKeyRoutes, { prefix: '/api' });
server.register(apiKeyAuthRoutes, { prefix: '/api' });
server.register(logForwardingRoutes, { prefix: '/api' });
server.register(logEntryRoutes, { prefix: '/api' });
server.register(reportRoutes, { prefix: '/api/reports' }); // Tenant-scoped reports (audit, activity, resources, security, compliance)
server.register(tailscaleRoutes, { prefix: '/api' });
server.register(tailscaleConfigRoutes, { prefix: '/api' });
server.register(connectivityProviderRoutes, { prefix: '/api' });
server.register(profileRoutes, { prefix: '/api' });
server.register(organizationRoutes, { prefix: '/api/organization' });
server.register(emailRoutes, { prefix: '/api' }); // Email/SMTP settings (admin) -> /api/email-settings
server.register(connectivityRoutes, { prefix: '/api/connectivity' });
server.register(customerToolRoutes, { prefix: '/api' });
server.register(userRoleRoutes, { prefix: '/api' });
server.register(userRoutes, { prefix: '/api' }); // Tenant-scoped user management (GET/POST /users, PUT/DELETE /users/:id)
server.register(configurationHistoryController, { prefix: '/api/configuration-history' });
server.register(configurationCanvasRoutes, { prefix: '/api/configuration-canvas' });
server.register(pipelineRoutes, { prefix: '/api/pipeline' }); // Security-as-Code pipeline routes
server.register(appManagementRoutes, { prefix: '/api/apps' }); // App management routes
server.register(sandboxRoutes, { prefix: '/api/sandboxes' }); // Developer sandbox routes (self-gates on platform.sandbox; off by default)

// Optional SSO providers — route plugins are only registered when their
// feature flag is on (default OFF; local email+password auth is the
// self-host default). See config/feature-flags.ts `oauth.*`.
if (isFeatureEnabled('oauth.cognito')) {
  server.register(cognitoRoutes, { prefix: '/api/cognito' });
}
if (isFeatureEnabled('oauth.google')) {
  server.register(googleRoutes, { prefix: '/api/google' });
}
if (isFeatureEnabled('oauth.microsoft')) {
  server.register(microsoftRoutes, { prefix: '/api/microsoft' });
}
if (isFeatureEnabled('oauth.oidc')) {
  server.register(oidcRoutes, { prefix: '/api/oidc' });
}

// Outbound webhooks — on by default, can be turned off via FEATURE_WEBHOOKS.
if (isFeatureEnabled('platform.webhooks')) {
  server.register(webhookRoutes, { prefix: '/api' });
}

// `ztna` (Veltrix-managed hosted Tailscale) and `cloud-account` (BYOC
// registration feeding hosted AWS provisioning) are NOT registered — see the
// note next to the removed imports above. The generic connectivity-provider
// adapters (SSH/WireGuard/self-managed Tailscale) registered above are
// unaffected.

// Start server
const start = async () => {
    try {
        // Run database seeding before starting the server
        loggerService.info('🌱 Running database seeding...');
        try {
            await seedAdminAccount();
            await seedOAuthProviders();
            await seedComplianceCatalog();
            loggerService.info('✅ Database seeding completed');
        } catch (seedError) {
            loggerService.warn('⚠️  Database seeding failed (this is normal if data already exists):', seedError);
        }

        // Initialize platform core services (AppRegistry, JobRunner, PipelineService)
        loggerService.info('Initializing platform core services...');
        try {
            await initializePlatform();
            await registerAppRoutesWithServer(server);
            loggerService.info('Platform core services initialized');
        } catch (platformError) {
            loggerService.warn('Platform services initialization skipped (non-fatal):', platformError);
        }

        // Attach the realtime WebSocket server (Socket.IO) and inject it into
        // event publishers. Must happen before ready() — decorations are
        // frozen afterwards.
        initializeRealtime(server);

        // Generate Swagger documentation
        await server.ready();

        // Log all registered routes
        loggerService.info('Registered routes:');
        server.printRoutes();

        // Start server
        // Bind dual-stack ('::' with ipv6Only:false, Node's default) rather than IPv4-only
        // ('0.0.0.0'): on this toolchain (Node 20+), `dns.lookup('localhost')` honors the OS
        // resolver's verbatim order, which on many Windows/dev setups returns the IPv6 loopback
        // (`::1`) first. An IPv4-only bind then makes any client that resolves `localhost` to
        // `::1` fail with `ECONNREFUSED ::1:<port>` intermittently. Binding both stacks makes
        // the port reachable via `127.0.0.1` and `::1`/`localhost` alike, regardless of
        // resolver order.
        await server.listen({ port: Number(config.port), host: '::' });
        loggerService.info(`🚀 Server running at http://localhost:${config.port}`);
        loggerService.info(`📚 API Documentation available at http://localhost:${config.port}/documentation`);
    } catch (err) {
        loggerService.error('Error starting server:', err);
        process.exit(1);
    }
};

start();

// Graceful shutdown
const shutdown = async (signal: string) => {
    loggerService.info(`${signal} received. Shutting down gracefully...`);
    await shutdownPlatform();
    await server.close();
    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
