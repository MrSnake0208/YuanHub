import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Deliberately separate from vite.config.js: no PWA builds, dev proxy, or .env API calls.
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['behavior/**/*.spec.js'],
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://127.0.0.1/' } },
    setupFiles: ['./behavior/setup.js'],
    restoreMocks: true,
    maxWorkers: 2,
    minWorkers: 1,
    testTimeout: 10000,
    reporters: ['default']
  }
})
