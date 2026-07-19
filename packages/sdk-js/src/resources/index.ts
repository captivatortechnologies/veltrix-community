// This file exports all resource classes exposed by the Veltrix Community SDK.
// The surface mirrors the OSS server's registered routes and is kept in
// lock-step with the Python SDK (`veltrix_sdk`). Billing (payment/
// payment_methods/subscription), BYOL cloud provisioning, multi-tenant
// customer/MSSP admin, and network (IPAM) resources from the upstream SDK are
// intentionally omitted so the surface matches the OSS server API.

export * from './auth';
export * from './me';
export * from './profile';
export * from './organization';
export * from './users';
export * from './roles';
export * from './api_keys';
export * from './tools';
export * from './customer_tools';
export * from './components';
export * from './credentials';
export * from './tags';
export * from './environments';
export * from './connectivity';
export * from './connectivity_providers';
export * from './tailscale';
export * from './tailscale_config';
export * from './log_forwarding';
export * from './log_entries';
export * from './reports';
export * from './configuration_canvas';
export * from './configuration_history';
export * from './pipeline';
export * from './apps';
export * from './sandboxes';
export * from './webhooks';
export * from './brand';
export * from './feature_flags';
export * from './cognito';

// Export the base class for extension by advanced consumers.
export * from './base';
