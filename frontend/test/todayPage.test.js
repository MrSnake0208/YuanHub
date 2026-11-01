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
  assert.equal(route.meta.requiresBeta, true)
  assert.notEqual(route.meta.requiresAuth, true)

  const sidebar = readFileSync(new URL('../src/components/IslandSidebar.vue', import.meta.url), 'utf8')
  assert.match(sidebar, /<House :size="20"/)
  assert.match(sidebar, /<router-link\s+to="\/"[^>]*>[\s\S]*?<House :size="20" aria-hidden="true" \/><span>今日一览<\/span>\s*<\/router-link>/)
  assert.equal(route.text, '今日一览')
  assert.equal(route.meta.title, '今日一览 — 鸢鸢相抱 · YuanHub')

  const page = readFileSync(new URL('../src/pages/today/index.vue', import.meta.url), 'utf8')
  // Keep static architecture boundaries here; behavior lives in the mounted SFC tests.
  const layout = readFileSync(new URL('../src/components/today/TodayLayout.vue', import.meta.url), 'utf8')
  assert.match(page, /<TodayLayout/)
  assert.match(layout, /data-tour="today-overview"/)
  assert.match(page, /DataAccountContextBar/)
  assert.doesNotMatch(page, /createTodayAccount/)
  assert.doesNotMatch(page, /DemoPage|OperatorGrowthTracker/)
  assert.doesNotMatch(page, /演示数据/)

})

test('keeps guest onboarding separate from the isolated demo route', function () {
  const today = readFileSync(new URL('../src/pages/today/index.vue', import.meta.url), 'utf8')
  assert.match(today, /if \(!auth\.isLoggedIn\) return/)
  assert.doesNotMatch(today, /演示数据/)

  const route = routes.find(function (item) { return item.path === '/demo' })
  assert.match(String(route.component), /pages\/demo\/index\.vue/)
  const demo = readFileSync(new URL('../src/pages/demo/index.vue', import.meta.url), 'utf8')
  assert.match(demo, /今天优先推进杨修/)
  assert.doesNotMatch(demo, /getOperatorCurrent|listAccounts|listAgentFavorites/)
})
