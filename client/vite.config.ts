import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { serviceWorkerPlugin } from './vite-plugins/service-worker';

// Veltrix Community Edition — client build configuration
export default defineConfig({
    plugins: [react(), serviceWorkerPlugin()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    server: {
        proxy: {
            '/api': {
                target: process.env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:5000',
                changeOrigin: true,
                secure: false
            }
        }
    },
    css: {
        // postcss.config.js at the project root is auto-detected by Vite —
        // no explicit path needed (the source project's reference to a
        // nonexistent postcss.config.cjs has been dropped).
        devSourcemap: process.env.NODE_ENV === 'development',
        modules: {
            localsConvention: 'camelCase'
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: process.env.NODE_ENV === 'development',
        // Optimize chunk splitting for better caching
        rollupOptions: {
            output: {
                // No custom manualChunks. A previous split of React into its own
                // `react-vendor` chunk (via a broad `id.includes('react')`) created a
                // circular dependency with the catch-all `vendor` chunk — react-dom
                // pulls `scheduler` (which landed in `vendor`), while `vendor`
                // libraries import React (in `react-vendor`). Rollup's resulting init
                // order accessed `React` before it was defined, throwing
                // "Cannot read properties of undefined (reading 'useLayoutEffect')"
                // at load and rendering the app blank. Automatic chunking orders
                // React and its consumers correctly.
                // Better chunk names for debugging
                chunkFileNames: (chunkInfo) => {
                    const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop() : 'chunk';
                    return `assets/${facadeModuleId}-[hash].js`;
                },
                entryFileNames: 'assets/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    const name = assetInfo.name || '';
                    if (name.endsWith('.css')) {
                        return 'css/[name]-[hash][extname]';
                    }
                    if (/\.(png|jpe?g|svg|gif|ico|webp)$/.test(name)) {
                        return 'images/[name]-[hash][extname]';
                    }
                    if (/\.(woff2?|eot|ttf|otf)$/.test(name)) {
                        return 'fonts/[name]-[hash][extname]';
                    }
                    return 'assets/[name]-[hash][extname]';
                }
            }
        },
        // Increase chunk size warning limit (500kb)
        chunkSizeWarningLimit: 500,
        // Enable minification with esbuild (faster than terser)
        minify: 'esbuild',
        // CSS code splitting
        cssCodeSplit: true,
        // Target modern browsers for smaller bundles
        target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
        // Enable tree-shaking
        modulePreload: {
            polyfill: false
        },
        // Report compressed size
        reportCompressedSize: true,
        // Optimize dependencies
        commonjsOptions: {
            include: [/node_modules/],
            transformMixedEsModules: true
        }
    }
});
