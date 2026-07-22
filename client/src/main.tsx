// MUST stay the first import: installs globalThis.__VELTRIX_APP_RUNTIME__
// (host React instance, shared AppContext, authFetch) before anything that
// could dynamically import a marketplace app client bundle.
import './appRuntime/installHostRuntime';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { register as registerServiceWorker } from './utils/service-worker-registration';
import { loadBrand } from './brand';

// Kick off the (optional) /api/brand override once, up front, so every
// `useBrand()` consumer across the app shares a single fetch instead of each
// one triggering its own — see brand.ts for the resolution order.
void loadBrand();

// Veltrix Community Edition application entry point
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for offline capability and caching
registerServiceWorker({
  onSuccess: () => {
    console.log('Service worker registered successfully');
  },
  onUpdate: (registration) => {
    // A new version installed. It self-activates and the registration's
    // controllerchange handler reloads the page onto the fresh bundle
    // automatically — no confirm dialog needed.
    console.log('New version installed — reloading to apply');
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  },
  onError: (error) => {
    console.error('Service worker registration failed:', error);
  }
});
