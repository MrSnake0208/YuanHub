import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { routes } from '../src/router/routes.js'

test('uses TODAY as the default page and keeps both navigation entries', function () {
  const route = routes.find(function (item) { return item.path === '/' })
  assert.equal(route.name, 'today')
  assert.equal(route.alias, '/today')
  assert.equal(route.redirect, undefined)
  assert.match(String(route.component), /pages\/demo\/index\.vue/)

  const sidebar = readFileSync(new URL('../src/components/IslandSidebar.vue', import.meta.url), 'utf8')
  assert.match(sidebar, /<House :size="19"/)
  assert.match(sidebar, /<span class="no">00<\/span>TODAY/)

  const page = readFileSync(new URL('../src/pages/demo/index.vue', import.meta.url), 'utf8')
  assert.match(page, /<IslandSidebar \/>/)
  assert.match(page, /今天，先把杨修练完/)
})
