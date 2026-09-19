import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function file(path) {
  return fileURLToPath(new URL(path, import.meta.url))
}

function source(path) {
  return readFileSync(file(path), 'utf8')
}

test('promo page exposes the same YuanHub PWA identity and icon set', function () {
  const manifest = JSON.parse(source('../public/manifest.webmanifest'))
  assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.short_name, 'YuanHub')
  assert.equal(existsSync(file('../public/brand/yuanhub-logo.png')), true)
  for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
    assert.equal(existsSync(file(`../public/pwa/${name}`)), true, `${name} must exist`)
  }
})

test('promo document advertises manifest and Apple home-screen metadata', function () {
  const html = source('../index.html')
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(html, /rel="icon" href="\/pwa\/icon-192\.png"/)
  assert.match(html, /rel="apple-touch-icon"[^>]+\/pwa\/apple-touch-icon\.png/)
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/)
  assert.match(html, /apple-mobile-web-app-title" content="YuanHub"/)
})

test('promo service worker stays network-only so the future main site can replace it', function () {
  const worker = source('../public/sw.js')
  assert.match(worker, /self\.skipWaiting\(\)/)
  assert.match(worker, /self\.clients\.claim\(\)/)
  assert.match(worker, /event\.respondWith\(fetch\(event\.request\)\)/)
  assert.doesNotMatch(worker, /caches\.(?:open|match)|cache\.put/)
})

test('promo app initializes install handling and exposes a manual save CTA', function () {
  const main = source('../src/main.js')
  const app = source('../src/App.vue')
  const prompt = source('../src/PromoInstallPrompt.vue')
  assert.match(main, /initPwaInstall\(\)/)
  assert.match(main, /serviceWorker\.register\('\/sw\.js'/)
  assert.match(app, /<PromoInstallPrompt v-model:open="installPanelOpen"/)
  assert.match(app, /\/brand\/yuanhub-logo\.png/)
  assert.match(app, /先保存 YuanHub 到桌面/)
  assert.match(prompt, /立即添加/)
  assert.match(prompt, /打开当前浏览器的“分享”菜单/)
  assert.match(prompt, /作为 Web App 打开/)
  assert.match(prompt, /添加桌面快捷方式/)
  assert.match(prompt, /创建桌面快捷方式/)
  assert.match(prompt, /系统设置 → 应用\/应用管理 → 当前浏览器 → 权限\/其他权限/)
  assert.match(prompt, /result\.outcome === 'unavailable' \|\| result\.outcome === 'failed'/)
  assert.match(prompt, /七天内不再主动显示/)
  assert.doesNotMatch(prompt, /建议先使用 Safari/)
})

test('promo install state preserves Android progressive install and seven-day cooldown', function () {
  const install = source('../src/pwaInstall.js')
  assert.match(install, /beforeinstallprompt/)
  assert.match(install, /appinstalled/)
  assert.match(install, /7 \* 24 \* 60 \* 60 \* 1000/)
  assert.match(install, /display-mode: standalone/)
  assert.match(install, /yuanhub:pwa-install-prompt-dismissed-until:v1/)
  assert.match(install, /installHelpNeeded/)
  assert.match(install, /return \{ outcome: 'failed', error \}/)
  assert.match(install, /pwaInstallState\.installable \|\| pwaInstallState\.ios \|\| pwaInstallState\.android \|\| pwaInstallState\.installHelpNeeded/)
})
