import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Photos Unsplash/Pexels des TripCards
            urlPattern: /^https:\/\/(images\.unsplash\.com|images\.pexels\.com)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'trip-photos',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Trips sauvegardés — disponibles offline, réseau prioritaire
            urlPattern: /\/api\/trips.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'saved-trips',
              networkTimeoutSeconds: 4,
            },
          },
        ],
      },
      manifest: {
        name: 'TRIPTIC — Plan, Explore, Repeat.',
        short_name: 'TRIPTIC',
        description:
          "Planification d'aventures multi-modales (road trip, trek, bikepacking) propulsée par IA.",
        theme_color: '#1A6BDB',
        background_color: '#0D1B2A',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
  },
});
