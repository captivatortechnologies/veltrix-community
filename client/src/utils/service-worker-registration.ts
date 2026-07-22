/**
 * Service Worker Registration Utilities
 * 
 * Handles registration, updates, and lifecycle of the service worker.
 * 
 * @module service-worker-registration
 */

/**
 * Service worker registration configuration
 */
interface ServiceWorkerConfig {
  /** Callback when service worker is registered */
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  /** Callback when service worker is updated */
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  /** Callback when registration fails */
  onError?: (error: Error) => void;
}

/**
 * Check if service workers are supported
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator;
}

/**
 * Register service worker
 */
export async function register(config: ServiceWorkerConfig = {}): Promise<void> {
  if (!isServiceWorkerSupported()) {
    console.log('Service workers are not supported in this browser');
    return;
  }

  // Only register in production or when explicitly enabled
  if (import.meta.env.DEV && !import.meta.env.VITE_SW_ENABLED) {
    console.log('Service worker registration skipped in development mode');
    return;
  }

  try {
    // A page controlled by a service worker keeps serving the SW's cached app
    // shell + bundle until a NEW worker takes control AND the page reloads. The
    // SW self-`skipWaiting()`s on install, so a new version activates and fires
    // `controllerchange`; reload once there to land the browser on the fresh
    // bundle automatically — this is what makes a deploy's client fixes reach
    // users without a manual hard-refresh. Guarded so it never loops and never
    // fires on the very first registration (no prior controller = first install,
    // not an update).
    const hadController = !!navigator.serviceWorker.controller;
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });

    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });

    console.log('Service worker registered successfully:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // A new version installed alongside the running one. Activate it now
          // (belt-and-suspenders: the SW also self-skipWaiting's); its takeover
          // fires `controllerchange`, which reloads the page onto the fresh
          // bundle via the handler above — no user prompt, no stale bundle.
          console.log('New service worker installed — activating and reloading');
          newWorker.postMessage({ type: 'SKIP_WAITING' });
          config.onUpdate?.(registration);
        }
      });
    });

    // Service worker is ready
    if (registration.active) {
      console.log('Service worker is active');
      config.onSuccess?.(registration);
    }

    // Check for updates periodically (every hour)
    setInterval(() => {
      registration.update();
    }, 60 * 60 * 1000);

  } catch (error) {
    console.error('Service worker registration failed:', error);
    config.onError?.(error as Error);
  }
}

/**
 * Unregister all service workers
 */
export async function unregister(): Promise<void> {
  if (!isServiceWorkerSupported()) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    
    for (const registration of registrations) {
      await registration.unregister();
      console.log('Service worker unregistered');
    }
  } catch (error) {
    console.error('Failed to unregister service worker:', error);
  }
}

/**
 * Skip waiting and activate new service worker immediately
 */
export function skipWaiting(): void {
  navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * Clear service worker cache
 */
export function clearCache(): void {
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHE' });
}

/**
 * Listen for service worker messages
 */
export function onMessage(callback: (event: MessageEvent) => void): () => void {
  if (!isServiceWorkerSupported()) {
    return () => {};
  }

  navigator.serviceWorker.addEventListener('message', callback);

  // Return cleanup function
  return () => {
    navigator.serviceWorker.removeEventListener('message', callback);
  };
}

/**
 * Check if app is running in offline mode
 */
export function isOffline(): boolean {
  return !navigator.onLine;
}

/**
 * Listen for online/offline events
 */
export function onNetworkChange(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

/**
 * Get service worker registration
 */
export async function getRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!isServiceWorkerSupported()) {
    return undefined;
  }

  return navigator.serviceWorker.getRegistration();
}

/**
 * Check for service worker updates manually
 */
export async function checkForUpdates(): Promise<void> {
  const registration = await getRegistration();
  
  if (registration) {
    await registration.update();
    console.log('Checked for service worker updates');
  }
}

/**
 * Wait for service worker to be ready
 */
export async function waitForReady(): Promise<ServiceWorkerRegistration> {
  if (!isServiceWorkerSupported()) {
    throw new Error('Service workers are not supported');
  }

  return navigator.serviceWorker.ready;
}

export default {
  register,
  unregister,
  skipWaiting,
  clearCache,
  onMessage,
  isOffline,
  onNetworkChange,
  getRegistration,
  checkForUpdates,
  waitForReady,
  isServiceWorkerSupported
};
