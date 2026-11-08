import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
  // In development, account calls go to the game server (npm run server).
  server: { port: 5173, proxy: { '/api': 'http://localhost:8001' } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 20000 },
} as never);
