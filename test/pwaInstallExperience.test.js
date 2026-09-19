import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { routes } from '../src/router/routes.js'

function readSource(path) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

test('registers the public install guide route without primary desktop navigation exposure', function () {
  const route = routes.find(function (item) { return item.path === '/install' })
  assert.ok(route)
  assert.equal(route.name, 'install')
  assert.equal(route.display, false)
  assert.match(route.meta.title, /添加到桌面/)
})

test('mounts a global mobile install prompt with install and tutorial paths', function () {
  const app = readSource('../src/App.vue')
  const prompt = readSource('../src/components/MobileInstallPrompt.vue')
  assert.match(app, /<MobileInstallPrompt\s*\/>/)
  assert.match(prompt, /立即添加/)
  assert.match(prompt, /pwaInstallState\.installable && !pwaInstallState\.ios/)
  assert.match(prompt, /查看添加方法/)
  assert.match(prompt, /to="\/install"/)
  assert.match(prompt, /route\.path !== '\/install'/)
  assert.match(prompt, /打开浏览器的“分享”菜单/)
  assert.match(prompt, /添加桌面快捷方式/)
  assert.match(prompt, /创建桌面快捷方式/)
  assert.match(prompt, /系统设置 → 应用\/应用管理 → 当前浏览器 → 权限\/其他权限/)
  assert.match(prompt, /result\.outcome === 'unavailable' \|\| result\.outcome === 'failed'/)
  assert.doesNotMatch(prompt, /建议先使用 Safari 打开 YuanHub/)
  assert.match(prompt, /七天内不再显示/)
})

test('keeps iOS installation manual and Android installation progressively enhanced', function () {
  const guide = readSource('../src/pages/install/index.vue')
  assert.match(guide, /iPhone \/ iPad 不提供网页内的一键安装按钮/)
  assert.match(guide, /浏览器的系统分享菜单/)
  assert.match(guide, /作为 Web App 打开/)
  assert.doesNotMatch(guide, /当前不是 Safari/)
  assert.match(guide, /v-if="pwaInstallState\.installable/)
  assert.match(guide, /添加到主屏幕/)
  assert.match(guide, /YuanHub 网页无法直接读取或替你开启这项权限/)
  assert.match(guide, /添加桌面快捷方式 \/ 创建桌面快捷方式/)
  assert.match(guide, /系统设置 → 应用 \/ 应用管理 → 当前浏览器 → 权限 \/ 其他权限/)
})

test('keeps install failures recoverable so the permission guide can stay visible', function () {
  const install = readSource('../src/utils/pwaInstall.js')
  assert.match(install, /installHelpNeeded/)
  assert.match(install, /return \{ outcome: 'failed', error \}/)
  assert.match(install, /pwaInstallState\.installHelpNeeded = true/)
  assert.match(install, /pwaInstallState\.installable \|\| pwaInstallState\.ios \|\| pwaInstallState\.android \|\| pwaInstallState\.installHelpNeeded/)
})

test('uses a stable manifest identity for the installed YuanHub app', function () {
  const viteConfig = readSource('../vite.config.js')
  assert.match(viteConfig, /manifest:\s*\{[\s\S]*?id:\s*'\/'/)
  assert.match(viteConfig, /display:\s*'standalone'/)
})
