import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_TUNNEL_HOST = 'hubf.maayuan.fun'
const DEFAULT_DEV_API_TARGET = 'https://api-hub.maayuan.com'
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
  const apiTarget = isTunnel
    ? env.YUANHUB_TUNNEL_API_TARGET || env.YUANHUB_DEV_API_TARGET || DEFAULT_DEV_API_TARGET
    : env.YUANHUB_DEV_API_TARGET || DEFAULT_DEV_API_TARGET

  const config = {
    port: 5173,
    host: isTunnel ? '127.0.0.1' : true,
    allowedHosts: Array.from(new Set([DEFAULT_TUNNEL_HOST, tunnelHost].filter(Boolean)))
  }

  const proxyTarget = {
    target: apiTarget,
    changeOrigin: true,
    configure(proxy) {
      // 浏览器对同源 POST 也会携带 Origin；如果原样转发到公网 API，
      // 后端会把 localhost / Tunnel 来源判为无效 CORS 请求并返回 403。
      // 开发代理是服务端到服务端转发，因此在发往上游前移除 Origin。
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('origin')
      })
    }
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

  return config
}

// @ 别名与参考项目（frontend-v2-plus）保持一致：'@' -> src
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      vue(),
      VitePWA({
        // 不让旧 Service Worker 长时间等待用户手动确认更新。
        // 这里不接入 virtual:pwa-register 的自动 reload，因此不会在用户编辑表单时强制刷新页面；
        // 新 worker 会立即激活并接管，下一次导航自然进入最新构建。
        registerType: 'autoUpdate',
        // 注册代码直接内联到 index.html，避免再引入一个固定文件名的 registerSW.js 缓存点。
        injectRegister: 'inline',
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
        // 只预缓存带内容 hash 的 JS / CSS，不缓存 index.html。
        // HTML 导航始终走网络，避免旧 worker 把旧 index.html 再次送回浏览器造成版本回退。
        // 业务 API、账户数据、OCR 模型和大批静态资料图仍不进入 Workbox 缓存。
        workbox: {
          globPatterns: ['**/*.{js,css}'],
          globIgnores: ['yuanstar-embed/**'],
          cleanupOutdatedCaches: true,
          navigateFallback: null,
          clientsClaim: true,
          skipWaiting: true
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
