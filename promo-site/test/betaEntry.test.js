import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 宣传页是独立静态站，没有 DOM/组件测试环境，因此按本包既有约定对模板做契约断言：
// 断言的是用户可见的入口目标与主次关系，而不是按钮总数或实现语句的拼写/顺序。
// 所有「进入 YuanHub」入口必须指向同一个内测地址。
const BETA_ENTRY_URL = 'https://beta-hub.maayuan.com'

function source(path) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

function anchors(html) {
  return html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) || []
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`))
  return match ? match[1] : null
}

function visibleText(tag) {
  return tag.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

test('promo hero opens with the YuanHub beta entry as its primary action', function () {
  const hero = source('../src/App.vue').match(/<div class="hero-actions">([\s\S]*?)<\/div>/)
  assert.ok(hero, 'hero-actions block must exist')

  const actions = anchors(hero[1])
  assert.ok(actions.length > 0, 'hero must expose at least one action link')

  const entry = actions.find((action) => attribute(action, 'href') === BETA_ENTRY_URL)
  assert.ok(entry, 'hero must expose the YuanHub beta entry link')
  assert.equal(actions[0], entry, 'the beta entry must be the first hero action')
  assert.match(attribute(entry, 'class') || '', /(?:^|\s)primary-btn(?:\s|$)/,
    'the beta entry must be the hero primary action')
  assert.match(visibleText(entry), /YuanHub 内测/,
    'the beta entry must name the internal test explicitly')
})

test('every YuanHub entry link on the promo page targets the same beta address', function () {
  const app = source('../src/App.vue')

  const entries = anchors(app).filter((anchor) => visibleText(anchor).includes('进入 YuanHub'))
  assert.ok(entries.length >= 2, 'the promo page must keep its YuanHub entry links')
  for (const entry of entries) {
    assert.equal(attribute(entry, 'href'), BETA_ENTRY_URL,
      `unexpected entry target: ${visibleText(entry)}`)
  }

  assert.doesNotMatch(app, /data-placeholder="MAIN_APP(_OPERATOR)?_URL"/,
    'no placeholder entry may be left on the promo page')
  assert.doesNotMatch(app, /正式 URL 待填/, 'no unfinished entry copy may be published')
})
