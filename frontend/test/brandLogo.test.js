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

test('uses the official YuanHub logo across primary brand surfaces', function () {
  assert.equal(existsSync(file('../public/brand/yuanhub-logo.png')), true)

  for (const path of [
    '../src/components/IslandSidebar.vue',
    '../src/components/AuthLayout.vue',
    '../src/components/DetailSidebar.vue',
    '../src/pages/promo/index.vue'
  ]) {
    assert.match(source(path), /\/brand\/yuanhub-logo\.png/)
  }

  assert.match(source('../src/pages/demo/index.vue'), /<IslandSidebar \/>/)

  const index = source('../index.html')
  assert.match(index, /rel="icon" href="\/pwa\/icon-192\.png"/)
})

test('keeps official YuanHub PWA icon files at stable paths', function () {
  for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
    assert.equal(existsSync(file(`../public/pwa/${name}`)), true, `${name} must exist`)
  }

  assert.doesNotMatch(source('../public/pwa/README.md'), /临时 PWA 识别资产/)
})
