/**
 * Vite Plugin for Service Worker
 * 
 * Builds service worker as a separate entry point and copies it to the output directory.
 */

import type { Plugin } from 'vite';
import { build } from 'vite';
import path from 'path';

export function serviceWorkerPlugin(): Plugin {
  return {
    name: 'vite-plugin-service-worker',
    apply: 'build',
    
    async closeBundle() {
      console.log('Building service worker...');
      
      // Build service worker separately
      await build({
        configFile: false,
        build: {
          lib: {
            entry: path.resolve(__dirname, '../src/service-worker.ts'),
            name: 'ServiceWorker',
            formats: ['iife'],
            fileName: () => 'service-worker.js'
          },
          outDir: path.resolve(__dirname, '../dist'),
          emptyOutDir: false,
          rollupOptions: {
            output: {
              entryFileNames: 'service-worker.js',
              inlineDynamicImports: true
            }
          }
        }
      });
      
      console.log('Service worker built successfully');
    }
  };
}

export default serviceWorkerPlugin;
