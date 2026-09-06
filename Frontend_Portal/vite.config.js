import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Portal runs on 5173; the backend listens on 8000 (see .env).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'NiyamNetra Portal',
        short_name: 'NiyamNetra',
        description: 'Legal Metrology compliance inspection portal',
        theme_color: '#0F2A44',
        background_color: '#F8FAFC',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Evidence images are runtime uploads under the backend's evidence
        // store, never part of this bundle, so the glob below cannot match
        // them. The `png` entry exists only for the small static PWA icons
        // (icon-192.png, icon-512.png); a stale icon is harmless, a stale
        // evidence image would be an integrity problem.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Deep SPA routes (e.g. /inspector/inspections/12/capture) must serve
        // index.html on reload/offline; /api traffic must never fall back.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
})
