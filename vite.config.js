import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Invibe Vendite',
        short_name: 'Vendite',
        description: 'Pannello controllo venditori Invibe',
        theme_color: '#0b141d',
        background_color: '#0b141d',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          { urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkFirst',
            options: { cacheName: 'iv-vendite-html', networkTimeoutSeconds: 4 } },
          { urlPattern: ({ url }) => url.href.includes('.supabase.co/rest'), handler: 'NetworkFirst',
            options: { cacheName: 'iv-vendite-dati', networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] } } }
        ]
      }
    })
  ]
})
