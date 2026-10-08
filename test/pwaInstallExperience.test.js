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

test('mounts the non-blocking invitation and keeps a stable manual entry', function () {
  const app = readSource('../src/App.vue')
  const prompt = readSource('../src/components/MobileInstallPrompt.vue')
  assert.match(app, /<MobileInstallPrompt\b/)
  assert.match(prompt, /role="region"/)
  assert.match(prompt, /to="\/install"/)
  assert.match(readSource('../src/components/IslandSidebar.vue'), /to="\/install"/)
  assert.doesNotMatch(prompt, /role="dialog"|aria-modal="true"/)
})

test('uses a stable manifest identity for the installed YuanHub app', function () {
  const viteConfig = readSource('../vite.config.js')
  assert.match(viteConfig, /manifest:\s*\{[\s\S]*?id:\s*'\/'/)
  assert.match(viteConfig, /display:\s*'standalone'/)
})
