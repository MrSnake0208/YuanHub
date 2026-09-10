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
  assert.match(prompt, /七天内不再显示/)
})

test('keeps iOS installation manual and Android installation progressively enhanced', function () {
  const guide = readSource('../src/pages/install/index.vue')
  assert.match(guide, /iPhone \/ iPad 不提供网页内的一键安装按钮/)
  assert.match(guide, /v-if="pwaInstallState\.installable/)
  assert.match(guide, /添加到主屏幕/)
})
