import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['tas-mark.png', 'tas-logo.png'],
      manifest: {
        name: 'RS TAS - Reportes de Servicio',
        short_name: 'RS TAS',
        description: 'Crea y administra reportes de servicio de TAS Honduras.',
        lang: 'es-HN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#C20E1A',
        background_color: '#F4F5F7',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,ico}']
      }
    })
  ],
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' }
});
