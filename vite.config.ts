import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/Synapse-/';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Colors of the dark theme; the design tokens follow in step 3.
const THEME_COLOR = '#0B0D12';

/**
 * Hosts of the one-time model download (step 12): huggingface.co answers the file requests
 * and redirects the large files to its storage CDN (cas-bridge.xethub.hf.co, cdn-lfs*.hf.co).
 */
const HUGGING_FACE = ['https://huggingface.co', 'https://*.hf.co'];

/**
 * Content-Security-Policy as meta tag. Only added to production builds, because the
 * Vite dev server relies on inline scripts/styles for HMR. Extend deliberately:
 * api.anthropic.com (step 6), Hugging Face model download (step 12).
 */
const CSP = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': compiling WebAssembly (ONNX runtime, SIMD link kernel), no JS eval.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // AI grading straight from the browser (step 6), model download (step 12).
  `connect-src 'self' https://api.anthropic.com ${HUGGING_FACE.join(' ')}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'synapse-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // transformers.js imports the WebGPU build of the ONNX runtime (27 MB asyncify .wasm).
      // Synapse only uses the WASM backend: the plain build is half the size and runs on
      // every Safari version (transformers.js itself falls back to it on older Safari).
      { find: /^onnxruntime-web\/webgpu$/, replacement: 'onnxruntime-web/wasm' },
    ],
  },
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon-180x180.png'],
      manifest: {
        id: BASE,
        name: 'Synapse',
        short_name: 'Synapse',
        description: 'Karteikarten lernen – mit Wissensgehirn.',
        lang: 'de',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: THEME_COLOR,
        theme_color: THEME_COLOR,
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Never precache the ONNX runtime (.wasm, ~14 MB) or model files: only devices
        // that use the brain download them, then they come from the runtime caches below.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/ort-wasm-simd-threaded[^/]*\.wasm$/,
            handler: 'CacheFirst',
            options: {
              // Same name as RUNTIME_CACHE_NAME in src/services/brain/modelCache.ts.
              cacheName: 'synapse-onnx-runtime',
              expiration: { maxEntries: 4 },
            },
          },
        ],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  build: {
    rolldownOptions: {
      output: {
        // Vendor chunks: smaller files and better caching across app updates.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
            },
            {
              name: 'motion',
              test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/,
            },
            { name: 'data', test: /node_modules[\\/](dexie|dexie-react-hooks|zod)[\\/]/ },
          ],
        },
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    // In-memory IndexedDB for repository tests.
    setupFiles: ['fake-indexeddb/auto'],
  },
});
