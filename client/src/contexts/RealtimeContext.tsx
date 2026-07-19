import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react'
import { useLocation } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { API_URL } from '@/config'
import { getAuthToken, isAuthenticated } from '@/services/authService'

// ============================================================================
// RealtimeContext
//
// ONE Socket.IO connection for the whole portal (never a socket per component).
// It authenticates with the stored JWT; the server derives the tenant from the
// token's `customerId` claim and auto-joins the socket to `tenant:<customerId>`,
// so the client receives its own tenant's sandbox events (and nothing else).
//
//   - connects when a user is authenticated, disconnects on logout
//   - reconnects automatically with exponential backoff (socket.io built-in)
//   - fans sandbox:* events out to subscribers via a ref-held registry, so the
//     provider itself never re-renders on event traffic
//
// Consumers use `useSandboxEvents(sandboxId)` rather than touching the socket.
// ============================================================================

/** Sandbox realtime event names emitted by the server (module: sandbox.events). */
export const SANDBOX_EVENT_NAMES = [
  'sandbox:file-changed',
  'sandbox:validation',
  'sandbox:synced',
  'sandbox:status',
  'sandbox:log',
  'sandbox:run-result',
] as const

export type SandboxEventName = (typeof SANDBOX_EVENT_NAMES)[number]

export interface SandboxRealtimeEvent<T = Record<string, unknown>> {
  type: SandboxEventName
  /** Convenience copy of payload.sandboxId (all sandbox events carry it). */
  sandboxId?: string
  payload: T
  receivedAt: number
}

type EventHandler = (event: SandboxRealtimeEvent) => void

interface RealtimeContextValue {
  connected: boolean
  /** Subscribe to ALL sandbox events for the tenant; returns an unsubscribe fn. */
  subscribe: (handler: EventHandler) => () => void
}

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  subscribe: () => () => {},
})

export const useRealtime = () => useContext(RealtimeContext)

/** Socket.IO lives at the server root, not under /api — strip the API suffix. */
function resolveSocketUrl(): string {
  return API_URL.replace(/\/api\/?$/, '')
}

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const socketRef = useRef<Socket | null>(null)
  const handlersRef = useRef<Set<EventHandler>>(new Set())
  const [connected, setConnected] = useState(false)

  // Sits above <Routes> (see App.tsx) so it never unmounts on navigation.
  // Logout is a client-side transition, so re-evaluate auth on route change.
  const location = useLocation()

  const dispatch = useCallback((type: SandboxEventName, payload: Record<string, unknown>) => {
    const event: SandboxRealtimeEvent = {
      type,
      sandboxId: typeof payload?.sandboxId === 'string' ? payload.sandboxId : undefined,
      payload,
      receivedAt: Date.now(),
    }
    handlersRef.current.forEach((handler) => {
      try {
        handler(event)
      } catch {
        // A misbehaving subscriber must not break the fan-out.
      }
    })
  }, [])

  const teardown = useCallback(() => {
    const socket = socketRef.current
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
    setConnected(false)
  }, [])

  const connect = useCallback(() => {
    if (socketRef.current) return // already connected/connecting
    const token = getAuthToken()
    if (!token) return

    const socket = io(resolveSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      randomizationFactor: 0.5,
      // Do not force a fresh connection per mount; one shared manager.
      autoConnect: true,
    })

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setConnected(false))

    // Keep the auth token fresh across reconnects (JWT may have been refreshed).
    socket.io.on('reconnect_attempt', () => {
      socket.auth = { token: getAuthToken() ?? '' }
    })

    for (const name of SANDBOX_EVENT_NAMES) {
      socket.on(name, (payload: Record<string, unknown>) => dispatch(name, payload))
    }

    socketRef.current = socket
  }, [dispatch])

  // Reconcile the connection with auth state on mount and on every navigation.
  useEffect(() => {
    if (isAuthenticated()) {
      connect()
    } else {
      teardown()
    }
    // location.pathname is the trigger; connect/teardown are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, connect, teardown])

  // Disconnect cleanly when the provider unmounts (full app teardown).
  useEffect(() => () => teardown(), [teardown])

  const subscribe = useCallback((handler: EventHandler) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  return (
    <RealtimeContext.Provider value={{ connected, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// useSandboxEvents — the consumer-facing hook
// ---------------------------------------------------------------------------

const MAX_BUFFERED_EVENTS = 100

export interface UseSandboxEventsResult {
  connected: boolean
  /** Recent events for this sandbox (most recent last, capped). */
  events: SandboxRealtimeEvent[]
  lastEvent: SandboxRealtimeEvent | null
  /**
   * Imperatively subscribe to this sandbox's events (already filtered by
   * sandboxId) — use for live-applying `sandbox:file-changed` without
   * re-rendering on the buffered `events` array. Returns an unsubscribe fn.
   */
  subscribe: (handler: EventHandler) => () => void
}

/**
 * Subscribe to the realtime event stream for one sandbox. When `sandboxId` is
 * omitted, every tenant sandbox event is returned.
 */
export function useSandboxEvents(sandboxId?: string): UseSandboxEventsResult {
  const { connected, subscribe: subscribeAll } = useRealtime()
  const [events, setEvents] = useState<SandboxRealtimeEvent[]>([])

  // Only events for this sandbox (events without a sandboxId pass through).
  const subscribe = useCallback(
    (handler: EventHandler) =>
      subscribeAll((event) => {
        if (sandboxId && event.sandboxId && event.sandboxId !== sandboxId) return
        handler(event)
      }),
    [subscribeAll, sandboxId],
  )

  useEffect(() => {
    setEvents([]) // reset the buffer when the target sandbox changes
    const unsubscribe = subscribe((event) => {
      setEvents((prev) => {
        const next = [...prev, event]
        return next.length > MAX_BUFFERED_EVENTS
          ? next.slice(next.length - MAX_BUFFERED_EVENTS)
          : next
      })
    })
    return unsubscribe
  }, [subscribe])

  return {
    connected,
    events,
    lastEvent: events.length ? events[events.length - 1] : null,
    subscribe,
  }
}
