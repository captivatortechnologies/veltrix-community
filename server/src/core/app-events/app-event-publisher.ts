// ========================================================================
// App event publisher (platform side) — Community Edition
//
// Gives an app a generic way to publish events/messages to the platform's
// event bus, without the platform knowing anything about the payload.
//
// Upstream (hosted) Veltrix routes these through RabbitMQ (a durable topic
// exchange) so out-of-process workers can subscribe. The community edition
// has no message broker dependency: events are published on the in-memory
// `AppEventBus` (./event-bus) using the same `<appId>.<topic>` naming
// convention, so any app or platform code running in THIS process can
// subscribe with `appEventBus.on('<appId>.<topic>', handler)`.
//
// This keeps the exact publish-side contract app authors already code
// against (`events.publish(topic, payload)`); the only observable
// difference from the hosted broker is scope — subscribers must run in the
// same Node process (fine for the self-hosted, single-instance deployment
// this edition targets). A future BullMQ-backed or broker-backed publisher
// can implement the same `AppEventPublisher` interface without touching
// any app code.
//
// This is the outbound half of the app<->platform provisioning boundary; the
// inbound half is AppRegistry.dispatchWebhook / AppRegistry.dispatchEvent.
// ========================================================================

import { AppEventBus } from './event-bus'
import { loggerService } from '../../module/logger/logger.service'

export interface AppEventPublisher {
  publish(topic: string, payload: unknown): Promise<void>
}

/** Process-wide in-memory bus every app publisher instance shares. */
export const appEventBus = new AppEventBus()

/**
 * Build an event publisher scoped to one app. The app calls
 * `events.publish('infrastructure.created', payload)`; the platform emits it
 * on the shared in-memory bus as `<appId>.infrastructure.created`, matching
 * the routing-key convention the hosted RabbitMQ transport used.
 */
export function createAppEventPublisher(
  appId: string,
  bus: AppEventBus = appEventBus,
): AppEventPublisher {
  return {
    async publish(topic: string, payload: unknown): Promise<void> {
      const eventName = `${appId}.${topic}`
      const envelope = { appId, topic, payload, publishedAt: new Date().toISOString() }
      try {
        await bus.emit(eventName, envelope)
      } catch (err) {
        loggerService.error(`[AppEvents] publish failed for "${eventName}":`, err)
        throw err
      }
    },
  }
}
