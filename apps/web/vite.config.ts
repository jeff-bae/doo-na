import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Tauri CLI가 빌드할 때 TAURI_ENV_PLATFORM 을 설정한다 → 데스크톱 앱에는 서비스워커 불필요
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

/** 데스크톱 앱 빌드에는 PWA 플러그인이 없으므로, 앱 코드가 쓰는 가상 모듈을 빈 구현으로 대신한다 */
const pwaRegisterStub = {
  name: 'doona:pwa-register-stub',
  resolveId: (id: string) => (id === 'virtual:pwa-register' ? '\0pwa-register-stub' : null),
  load: (id: string) => (id === '\0pwa-register-stub' ? 'export const registerSW = () => async () => {};' : null),
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    isTauri && pwaRegisterStub,
    !isTauri &&
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'theme-init.js'],
        manifest: {
          name: '두나 Doona',
          short_name: '두나',
          description: '사내 AI 질문·답변 채팅',
          lang: 'ko',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#5B5FEE',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // 폰트 조각(92개)은 미리 받지 않고, 쓰일 때 받아 캐시한다
          globPatterns: ['**/*.{js,css,html,svg,png}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          // API 응답은 캐시하지 않는다 (항상 네트워크). 폰트만 캐시 우선
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.endsWith('.woff2'),
              handler: 'CacheFirst',
              options: { cacheName: 'fonts', expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
      }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: isTauri ? 'es2022' : 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
