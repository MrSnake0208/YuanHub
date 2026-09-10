import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// @ 别名与参考项目（frontend-v2-plus）保持一致：'@' -> src
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: [
        'pwa/apple-touch-icon.png',
        'pwa/icon-192.png',
        'pwa/icon-512.png',
        'pwa/icon-maskable-512.png'
      ],
      manifest: {
        name: 'YuanHub · 鸢鸢相抱',
        short_name: 'YuanHub',
        description: '代号鸢 / 如鸢礼包计算、库存清点、密探与通关作业工具。',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F6EDD0',
        theme_color: '#F6EDD0',
        icons: [
          {
            src: '/pwa/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      // 第一阶段只缓存应用壳层，不缓存业务 API、账户数据、OCR 模型和大批静态资料图。
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        globIgnores: ['yuanstar-embed/**'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html'
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['hubf.maayuan.fun']
  }
})
