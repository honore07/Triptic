import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Le .env vit à la racine du monorepo (cf. .env.example) — sans envDir,
  // Vite ne lirait que apps/web/.env et VITE_MAPBOX_PUBLIC_TOKEN resterait vide.
  envDir: '../../',
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
        // Charte v2 : trail (Shadow Grey) pour la barre, cloud pour le splash
        theme_color: '#1E1E24',
        background_color: '#F6FAFD',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          // PNG requis pour l'installabilité Android/iOS (l'icône SVG seule
          // dégrade l'install prompt) — générés depuis icon.svg (charte v2).
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
