/**
 * Service Worker for Veltrix Application
 * 
 * Provides offline capability and caching for static assets.
 * Implements a cache-first strategy for assets and network-first for API calls.
 * 
 * @module service-worker
 */

/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// Bump this on any deploy that must invalidate stale client caches. The activate
// handler deletes every cache whose name != CACHE_NAME, so bumping the version
// purges old precached assets (e.g. a stale JS bundle pointing at an old API URL)
// for all clients on their next visit.
// (v3 -> v4, 2026-07-22: purge stale caches + get every client onto the
// network-first-HTML SW; paired with auto-reload on SW takeover so client fixes
// actually reach browsers without a manual hard-refresh.)
const CACHE_VERSION = 'v4';
const CACHE_NAME = `veltrix-cache-${CACHE_VERSION}`;

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  NETWORK_ONLY: 'network-only',
  CACHE_ONLY: 'cache-only',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
} as const;

// Route patterns and their strategies
const ROUTE_STRATEGIES: Record<string, string> = {
  // Static assets - cache first
  '\\.js$': CACHE_STRATEGIES.CACHE_FIRST,
  '\\.css$': CACHE_STRATEGIES.CACHE_FIRST,
  '\\.woff2?$': CACHE_STRATEGIES.CACHE_FIRST,
  '\\.png$': CACHE_STRATEGIES.CACHE_FIRST,
  '\\.jpg$': CACHE_STRATEGIES.CACHE_FIRST,
  '\\.jpeg$': CACHE_STRATEGIES.CACHE_FIRST,
  '\\.svg$': CACHE_STRATEGIES.CACHE_FIRST,
  '\\.gif$': CACHE_STRATEGIES.CACHE_FIRST,
  '\\.ico$': CACHE_STRATEGIES.CACHE_FIRST,
  
  // API calls - network only (never cache API responses)
  '/api/': CACHE_STRATEGIES.NETWORK_ONLY,
  
  // HTML pages - stale while revalidate
  // HTML pages - NETWORK FIRST (fall back to cache only when offline). The app
  // shell must always reflect the latest deploy so it references the current
  // hashed JS bundle; serving a stale index.html (stale-while-revalidate) pinned
  // users to an outdated bundle after every deploy.
  '\\.html$': CACHE_STRATEGIES.NETWORK_FIRST
};

// Cache expiration times (in milliseconds)
const CACHE_EXPIRATION = {
  IMAGES: 30 * 24 * 60 * 60 * 1000, // 30 days
  FONTS: 365 * 24 * 60 * 60 * 1000, // 1 year
  SCRIPTS: 7 * 24 * 60 * 60 * 1000, // 7 days
  STYLES: 7 * 24 * 60 * 60 * 1000, // 7 days
  API: 5 * 60 * 1000, // 5 minutes
  HTML: 24 * 60 * 60 * 1000 // 1 day
};

/**
 * Install event - precache critical assets
 */
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log('[ServiceWorker] Installing...');
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[ServiceWorker] Precaching assets');
      
      try {
        await cache.addAll(PRECACHE_ASSETS);
        console.log('[ServiceWorker] Precaching complete');
      } catch (error) {
        console.error('[ServiceWorker] Precaching failed:', error);
      }
      
      // Force the waiting service worker to become the active service worker
      await self.skipWaiting();
    })()
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('[ServiceWorker] Activating...');
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[ServiceWorker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
      
      // Take control of all pages immediately
      await self.clients.claim();
      console.log('[ServiceWorker] Activated');
    })()
  );
});

/**
 * Fetch event - handle requests with appropriate caching strategy
 */
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // Determine strategy based on request
  const strategy = determineStrategy(url.pathname);
  
  event.respondWith(handleRequest(request, strategy));
});

/**
 * Message event - handle messages from clients
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  console.log('[ServiceWorker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        console.log('[ServiceWorker] Cache cleared');
        return self.clients.matchAll();
      }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'CACHE_CLEARED' });
        });
      })
    );
  }
});

/**
 * Determine caching strategy based on request URL
 */
function determineStrategy(pathname: string): string {
  for (const [pattern, strategy] of Object.entries(ROUTE_STRATEGIES)) {
    if (new RegExp(pattern).test(pathname)) {
      return strategy;
    }
  }
  
  // Default to network first
  return CACHE_STRATEGIES.NETWORK_FIRST;
}

/**
 * Handle request with specified strategy
 */
async function handleRequest(request: Request, strategy: string): Promise<Response> {
  switch (strategy) {
    case CACHE_STRATEGIES.CACHE_FIRST:
      return cacheFirst(request);
    case CACHE_STRATEGIES.NETWORK_FIRST:
      return networkFirst(request);
    case CACHE_STRATEGIES.NETWORK_ONLY:
      return networkOnly(request);
    case CACHE_STRATEGIES.CACHE_ONLY:
      return cacheOnly(request);
    case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
      return staleWhileRevalidate(request);
    default:
      return networkFirst(request);
  }
}

/**
 * Cache-first strategy: Check cache first, fallback to network
 */
async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached && !isExpired(cached)) {
    console.log('[ServiceWorker] Cache hit:', request.url);
    return cached;
  }
  
  console.log('[ServiceWorker] Cache miss, fetching:', request.url);
  
  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const responseToCache = response.clone();
      await cache.put(request, responseToCache);
    }
    
    return response;
  } catch (error) {
    console.error('[ServiceWorker] Fetch failed:', error);
    
    // Return cached version even if expired
    if (cached) {
      console.log('[ServiceWorker] Returning stale cache:', request.url);
      return cached;
    }
    
    // Return offline page or error response
    return createOfflineResponse();
  }
}

/**
 * Network-first strategy: Try network first, fallback to cache
 */
async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const responseToCache = response.clone();
      await cache.put(request, responseToCache);
    }
    
    return response;
  } catch (error) {
    console.error('[ServiceWorker] Network failed, trying cache:', error);
    
    const cached = await cache.match(request);
    if (cached) {
      console.log('[ServiceWorker] Returning cached version:', request.url);
      return cached;
    }
    
    return createOfflineResponse();
  }
}

/**
 * Network-only strategy: Always fetch from network
 */
async function networkOnly(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch (error) {
    console.error('[ServiceWorker] Network request failed:', error);
    return createOfflineResponse();
  }
}

/**
 * Cache-only strategy: Only return cached responses
 */
async function cacheOnly(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  return createOfflineResponse();
}

/**
 * Stale-while-revalidate strategy: Return cache immediately, update in background
 */
async function staleWhileRevalidate(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  // Fetch fresh version in background
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    return response;
  }).catch(error => {
    console.error('[ServiceWorker] Background fetch failed:', error);
    return cached || createOfflineResponse();
  });
  
  // Return cached version immediately if available
  if (cached) {
    console.log('[ServiceWorker] Returning stale cache, revalidating:', request.url);
    return cached;
  }
  
  // Otherwise wait for fetch
  return fetchPromise;
}

/**
 * Check if cached response is expired
 */
function isExpired(response: Response): boolean {
  const cachedDate = response.headers.get('date');
  if (!cachedDate) {
    return false;
  }
  
  const cachedTime = new Date(cachedDate).getTime();
  const now = Date.now();
  const url = response.url;
  
  // Determine expiration time based on resource type
  let maxAge = CACHE_EXPIRATION.API; // Default
  
  if (url.match(/\.(js|css)$/)) {
    maxAge = CACHE_EXPIRATION.SCRIPTS;
  } else if (url.match(/\.(png|jpg|jpeg|svg|gif)$/)) {
    maxAge = CACHE_EXPIRATION.IMAGES;
  } else if (url.match(/\.(woff2?|ttf|eot)$/)) {
    maxAge = CACHE_EXPIRATION.FONTS;
  } else if (url.match(/\.html$/)) {
    maxAge = CACHE_EXPIRATION.HTML;
  }
  
  return (now - cachedTime) > maxAge;
}

/**
 * Create offline response
 */
function createOfflineResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'offline',
      message: 'You are currently offline. Some features may not be available.'
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

export {};
