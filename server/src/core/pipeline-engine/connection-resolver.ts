import prisma from '../../db'
import { decryptCredentialSecrets } from '../../module/credential/credential.service'
import type { ComponentRef, CredentialRef } from './types'

export interface ResolvedConnection {
  component: ComponentRef | null
  credential: CredentialRef | null
}

/**
 * Resolve the deploy target (component) + decrypted credential for a config
 * type, mirroring the deploy path (DeploymentOrchestrator.getTargetComponents +
 * getComponentAccess) so the Validate step and the /config-options endpoint see
 * the same connection the deploy will use. Environment-independent, exactly like
 * deploy (which filters components only by customer + the config type's
 * componentTypes). Best-effort: returns nulls when nothing is registered, so
 * callers degrade gracefully (validate stays static; the picker reports "save a
 * connection first").
 */
export async function resolveConnectionForConfigType(
  customerId: string,
  appId: string,
  configTypeId: string,
): Promise<ResolvedConnection> {
  const app = await prisma.app.findUnique({ where: { appId } })
  const ct = app
    ? await prisma.appConfigurationType.findFirst({ where: { appId: app.id, configTypeId } })
    : null

  const component = await prisma.component.findFirst({
    where: {
      customerId,
      ...(ct?.componentTypes?.length ? { type: { hasSome: ct.componentTypes } } : {}),
    },
  })
  if (!component) return { component: null, credential: null }

  const raw = component.credentialId
    ? await prisma.credential.findUnique({ where: { id: component.credentialId } })
    : await prisma.credential.findFirst({ where: { toolId: component.toolId, customerId } })
  const decrypted = raw ? decryptCredentialSecrets(raw) : null

  const componentRef: ComponentRef = {
    id: component.id,
    hostname: component.hostname,
    port: component.port,
    type: component.type,
    toolId: component.toolId,
  }
  const credential: CredentialRef | null = decrypted
    ? {
        id: decrypted.id,
        name: decrypted.name,
        username: decrypted.username ?? '',
        password: decrypted.password ?? '',
        apiToken: decrypted.apiToken ?? null,
        certificate: decrypted.certificate ?? null,
      }
    : null

  return { component: componentRef, credential }
}
