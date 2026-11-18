import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Fretboard',
        short_name: 'Fretboard',
        description: 'Learn songs on guitar: tabs, chords, strums, auto-scroll and Spotify.',
        theme_color: '#1c1917',
        background_color: '#1c1917',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/callback/], maximumFileSizeToCacheInBytes: 4_000_000 },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8788' } },
  test: { environment: 'node' },
})
