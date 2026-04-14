import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'safari-pinned-tab.svg',
        'android-chrome-96x96.png'
      ],
      manifest: {
        name: 'PPA - Ceklis',
        short_name: 'PPA Ceklis',
        description: 'Checklist dashboard for the Personal Performance Application.',
        theme_color: '#2563EB',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'android-chrome-96x96.png',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: 'android-icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: {
    host: '0.0.0.0', // Expose to network
    allowedHosts: ['.trycloudflare.com'],
    //hmr: { protocol: 'wss', clientPort: 443 },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        headers: {
          Accept: 'application/json',
        },
      },
      '/storage': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    },
  },
})
