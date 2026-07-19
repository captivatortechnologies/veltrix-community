// ========================================================================
// Live Role Catalog (R4, RBAC/IdP hardening 2026-07-10)
//
// Replaces the old hardcoded 9-resource placeholder in role.service.ts
// (users/roles/customers/tools/components/credentials/logs/apiKeys/settings
// — plural names that didn't match a single real hasPermission() call site)
// with the resources actually enforced across the platform, PLUS each
// installed app's declared AppPermissionDefinitions and configuration
// types (design decision 1: config types use resource = configTypeId).
//
// Keep this list in sync with every `hasPermission('<resource>', ...)` /
// `hasAppPermission(...)` call site — it's the source for the role-editor
// UI's resource picker (Wave C) and for validating that a role's granted
// permissions target something real.
// ========================================================================

import prisma from '../../db';

/** A resource entry in the catalog: a name, its valid actions, and scope. */
export interface CatalogResource {
  resource: string;
  actions: string[];
  /** null = platform-scoped resource; a real App.id = app-scoped. */
  appId: string | null;
  /** Present for app-scoped entries — the app's display name. */
  appName?: string;
  description?: string;
}

const commonCrud = ['read', 'write'];

/**
 * Platform (built-in) resources — appId is always null. Mirrors every
 * `hasPermission('<resource>', ...)` call site in the codebase; keep this
 * list current when adding a new gated route group.
 */
export const PLATFORM_RESOURCE_CATALOG: readonly Omit<CatalogResource, 'appId'>[] = [
  { resource: 'role', actions: commonCrud, description: 'Roles and permission management' },
  { resource: 'user', actions: commonCrud, description: 'Tenant user accounts (local + federated)' },
  { resource: 'apps', actions: commonCrud, description: 'App marketplace install/enable/disable' },
  { resource: 'component', actions: commonCrud, description: 'Access servers / infrastructure components' },
  { resource: 'connectivity', actions: commonCrud, description: 'Legacy per-component connectivity (Tailscale keys)' },
  { resource: 'configuration-canvas', actions: commonCrud, description: 'Security-as-Code configuration authoring & pipeline' },
  { resource: 'customer', actions: ['read', 'create', 'update', 'delete'], description: 'Tenant/customer records' },
  { resource: 'credential', actions: commonCrud, description: 'Stored tool credentials' },
  { resource: 'tag', actions: commonCrud, description: 'Environments (tags)' },
  { resource: 'tool', actions: commonCrud, description: 'Tool catalog' },
  { resource: 'logForwarding', actions: commonCrud, description: 'Log forwarding destinations' },
  { resource: 'logEntry', actions: commonCrud, description: 'Platform log entries' },
  { resource: 'tailscale', actions: commonCrud, description: 'Tailscale device/key management' },
  { resource: 'apiKey', actions: commonCrud, description: 'Tenant API keys' },
  { resource: 'payment', actions: commonCrud, description: 'Payment methods and billing operations' },
  { resource: 'subscription', actions: ['read'], description: 'Subscription tier and usage (read-only)' },
  { resource: 'organization', actions: commonCrud, description: 'Organization profile and branding' },
  { resource: 'report', actions: commonCrud, description: 'Compliance & security reports' },
] as const;

const commonActionsFallback = ['read', 'create', 'update', 'delete'];

/**
 * Full catalog for a customer: every platform resource, plus every
 * ENABLED app's declared AppPermissionDefinitions (grouped by resource,
 * appId set to the app's id) and its configuration types (resource =
 * configTypeId, action 'read' — the only action R3 currently enforces on
 * that identity; apps that need write/deploy-level app resources declare
 * them explicitly via `permissions.app` in their manifest instead).
 */
export async function getResourceCatalog(customerId: string): Promise<CatalogResource[]> {
  const platformEntries: CatalogResource[] = PLATFORM_RESOURCE_CATALOG.map((e) => ({
    ...e,
    appId: null,
  }));

  const installations = await prisma.appInstallation.findMany({
    where: { customerId, enabled: true, status: 'ENABLED' },
    include: {
      app: {
        include: {
          permissions: true,
          configTypes: true,
        },
      },
    },
  });

  const appEntries: CatalogResource[] = [];

  for (const installation of installations) {
    const { app } = installation;

    // App-declared resources (manifest permissions.app), grouped by resource.
    const grouped = new Map<string, { actions: Set<string>; description?: string }>();
    for (const perm of app.permissions) {
      const existing = grouped.get(perm.resource);
      if (existing) {
        existing.actions.add(perm.action);
      } else {
        grouped.set(perm.resource, { actions: new Set([perm.action]), description: perm.description ?? undefined });
      }
    }
    for (const [resource, { actions, description }] of grouped) {
      appEntries.push({
        resource,
        actions: Array.from(actions),
        appId: app.id,
        appName: app.name,
        description,
      });
    }

    // Configuration types (design decision 1: resource = configTypeId).
    // Only 'read' is currently enforced on this identity (app-config-template
    // routes); apps declare their own write/deploy actions via permissions.app
    // if they need finer-grained gating on the same resource name.
    for (const ct of app.configTypes) {
      if (grouped.has(ct.configTypeId)) continue; // app already declared this resource explicitly
      appEntries.push({
        resource: ct.configTypeId,
        actions: ['read'],
        appId: app.id,
        appName: app.name,
        description: `${ct.name} configuration authoring`,
      });
    }
  }

  return [...platformEntries, ...appEntries];
}

/**
 * Actions available for one resource, optionally scoped to an app. Falls
 * back to the generic CRUD set for an unrecognized resource — matches the
 * pre-R4 placeholder's permissive behavior so a role can still be granted
 * a resource this catalog doesn't yet know about (e.g. mid-app-development,
 * or a resource whose defining app was since disabled/uninstalled).
 */
export async function getResourceActions(
  resource: string,
  customerId: string,
  appId?: string | null,
): Promise<string[]> {
  const catalog = await getResourceCatalog(customerId);
  const match = catalog.find(
    (entry) => entry.resource === resource && (appId ? entry.appId === appId : entry.appId === null),
  );
  if (match) return match.actions;

  // Not found scoped as requested — fall back to an unscoped match (e.g. an
  // app resource looked up without an appId), then the generic default.
  const anyMatch = catalog.find((entry) => entry.resource === resource);
  if (anyMatch) return anyMatch.actions;

  return commonActionsFallback;
}
