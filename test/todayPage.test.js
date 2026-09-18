import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { routes } from '../src/router/routes.js'

test('uses 今日一览 as the default page', function () {
  const route = routes.find(function (item) { return item.path === '/' })
  assert.equal(route.name, 'today')
  assert.equal(route.alias, '/today')
  assert.equal(route.redirect, undefined)
  assert.match(String(route.component), /pages\/today\/index\.vue/)

  const sidebar = readFileSync(new URL('../src/components/IslandSidebar.vue', import.meta.url), 'utf8')
  assert.match(sidebar, /<House :size="19"/)
  assert.match(sidebar, /<span class="no">00<\/span>今日一览/)
  assert.equal(route.text, '今日一览')
  assert.equal(route.meta.title, '今日一览 — 鸢鸢相抱 · YuanHub')

  const page = readFileSync(new URL('../src/pages/today/index.vue', import.meta.url), 'utf8')
  assert.match(page, /今天先做/)
  assert.match(page, /你可以在这里/)
  assert.match(page, /密探名册/)
  assert.match(page, /库存追踪/)
  assert.match(page, /广陵账房/)
  assert.match(page, /getOperatorCurrent/)
  assert.match(page, /getUnreadNotificationCount/)
  assert.doesNotMatch(page, /DemoPage|OperatorGrowthTracker/)
})

test('keeps guest demo state inside the hub and the full demo route isolated', function () {
  const today = readFileSync(new URL('../src/pages/today/index.vue', import.meta.url), 'utf8')
  assert.match(today, /DEMO_SUMMARY/)
  assert.match(today, /if \(!auth\.isLoggedIn\) return/)
  assert.match(today, /演示数据/)

  const route = routes.find(function (item) { return item.path === '/demo' })
  assert.match(String(route.component), /pages\/demo\/index\.vue/)
  const demo = readFileSync(new URL('../src/pages/demo/index.vue', import.meta.url), 'utf8')
  assert.match(demo, /今天，先把杨修练完/)
  assert.doesNotMatch(demo, /getOperatorCurrent|listAccounts|listAgentFavorites/)
})
