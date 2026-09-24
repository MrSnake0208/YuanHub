import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_TUNNEL_HOST = 'hubf.maayuan.fun'
const DEFAULT_TUNNEL_API_TARGET = 'http://127.0.0.1:8080'
const UNKNOWN_BUILD_VALUE = 'unknown'

/**
 * 产品版本唯一来源：仓库根目录 VERSION。缺失时降级，不让构建失败。
 */
export function readProductVersion(root = process.cwd()) {
  try {
    return readFileSync(resolve(root, 'VERSION'), 'utf8').trim() || UNKNOWN_BUILD_VALUE
  } catch (error) {
    return UNKNOWN_BUILD_VALUE
  }
}

/**
 * 当前前端 commit。无 Git 环境（源码压缩包、浅克隆等）时降级为 unknown。
 */
export function readFrontendCommit(root = process.cwd()) {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim()
    return sha || UNKNOWN_BUILD_VALUE
  } catch (error) {
    return UNKNOWN_BUILD_VALUE
  }
}

/** 注入到前端的构建信息，字段名与 src/config/buildInfo.js 保持一致。 */
export function collectBuildInfo(root = process.cwd(), now = new Date()) {
  return {
    productVersion: readProductVersion(root),
    frontendCommit: readFrontendCommit(root),
    buildTime: now.toISOString()
  }
}

export function buildDevServerConfig(mode, env = {}) {
  const isTunnel = mode === 'tunnel'
  const tunnelHost = env.YUANHUB_TUNNEL_HOST || DEFAULT_TUNNEL_HOST
  const apiTarget = env.YUANHUB_TUNNEL_API_TARGET || DEFAULT_TUNNEL_API_TARGET

  const config = {
    port: 5173,
    host: isTunnel ? '127.0.0.1' : true,
    allowedHosts: Array.from(new Set([DEFAULT_TUNNEL_HOST, tunnelHost].filter(Boolean)))
  }

  if (isTunnel) {
    const proxyTarget = {
      target: apiTarget,
      changeOrigin: true
    }
    config.proxy = {
      '/v1': proxyTarget,
      '/user': proxyTarget,
      '/hub': proxyTarget,
      '/open-api': proxyTarget,
      '/avatar': proxyTarget,
      '/ready': proxyTarget,
      '/version': proxyTarget
    }
  }

  return config
}

// @ 别名与参考项目（frontend-v2-plus）保持一致：'@' -> src
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
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
          id: '/',
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
    // 版本 / commit / 构建时间只在构建期注入一次，页面统一从 src/config/buildInfo.js 读取。
    define: {
      __YUANHUB_BUILD_INFO__: JSON.stringify(collectBuildInfo())
    },
    server: buildDevServerConfig(mode, env)
  }
})
