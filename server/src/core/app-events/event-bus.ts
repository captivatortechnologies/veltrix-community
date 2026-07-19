// ========================================================================
// App Event Bus
//
// Typed event emitter for platform and app events.
// Apps subscribe to platform events and can emit their own (prefixed).
// Used for cross-app communication and lifecycle hooks.
// ========================================================================

type EventHandler = (data: unknown) => void | Promise<void>

export class AppEventBus {
  private handlers = new Map<string, Set<EventHandler>>()

  /**
   * Subscribe to an event.
   */
  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler)
    }
  }

  /**
   * Emit an event. All handlers run concurrently.
   * Errors in handlers are caught and logged, never bubble up.
   */
  async emit(event: string, data: unknown): Promise<void> {
    const handlers = this.handlers.get(event)
    if (!handlers || handlers.size === 0) return

    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(data)
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err)
      }
    })

    await Promise.all(promises)
  }

  /**
   * Remove all handlers for an event.
   */
  off(event: string): void {
    this.handlers.delete(event)
  }

  /**
   * Remove all handlers (used during shutdown).
   */
  clear(): void {
    this.handlers.clear()
  }
}

// Platform events (well-known event names)
export const PlatformEvents = {
  // Component lifecycle
  COMPONENT_CREATED: 'component:created',
  COMPONENT_UPDATED: 'component:updated',
  COMPONENT_DELETED: 'component:deleted',

  // Credential lifecycle
  CREDENTIAL_CREATED: 'credential:created',
  CREDENTIAL_UPDATED: 'credential:updated',
  CREDENTIAL_DELETED: 'credential:deleted',

  // Canvas / Pipeline lifecycle
  CANVAS_CREATED: 'canvas:created',
  CANVAS_UPDATED: 'canvas:updated',
  CANVAS_VALIDATED: 'canvas:validated',
  CANVAS_APPROVAL_REQUESTED: 'canvas:approval_requested',
  CANVAS_APPROVED: 'canvas:approved',
  CANVAS_REJECTED: 'canvas:rejected',
  CANVAS_DEPLOYED: 'canvas:deployed',
  CANVAS_DEPLOYMENT_FAILED: 'canvas:deployment_failed',
  CANVAS_ROLLED_BACK: 'canvas:rolled_back',

  // Drift
  DRIFT_DETECTED: 'drift:detected',
  DRIFT_RESOLVED: 'drift:resolved',

  // Tag / Environment
  TAG_CREATED: 'tag:created',
  TAG_UPDATED: 'tag:updated',
  TAG_DELETED: 'tag:deleted',

  // User
  USER_CREATED: 'user:created',
  USER_UPDATED: 'user:updated',

  // App lifecycle
  APP_INSTALLED: 'app:installed',
  APP_ENABLED: 'app:enabled',
  APP_DISABLED: 'app:disabled',
  APP_UNINSTALLED: 'app:uninstalled',
} as const
