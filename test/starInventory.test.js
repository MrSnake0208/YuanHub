import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { getCurrentStarInventory } from '../src/api/starInventory.js'
import { auth } from '../src/store/auth.js'
import { disposeYuanStarHandle, waitForYuanStarDisposal } from '../src/pages/star/embedLifecycle.js'

test('星石快照 API 编码 account_id 并经认证 request 发送 GET', async function () {
  const previousFetch = globalThis.fetch
  const previousToken = auth.accessToken
  const accountId = 'acc /?&中文'
  let receivedUrl = ''
  let receivedOptions = null
  auth.accessToken = 'test-access-token'
  globalThis.fetch = async function (url, options) {
    receivedUrl = url
    receivedOptions = options
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async function () { return { status_code: 200, data: { account_id: accountId, entries: [] } } }
    }
  }

  try {
    const result = await getCurrentStarInventory(accountId)
    assert.equal(result.account_id, accountId)
    assert.match(receivedUrl, /\/v1\/star-inventory\/current\?account_id=acc%20%2F%3F%26%E4%B8%AD%E6%96%87$/)
    assert.equal(receivedOptions.method, 'GET')
    assert.equal(receivedOptions.headers.Authorization, 'Bearer test-access-token')
  } finally {
    auth.accessToken = previousToken
    globalThis.fetch = previousFetch
  }
})

test('星石路由与桌面、移动导航均提供入口', function () {
  const routes = readFileSync(new URL('../src/router/routes.js', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../src/components/IslandSidebar.vue', import.meta.url), 'utf8')

  assert.match(routes, /path: '\/star'/)
  assert.match(routes, /name: 'star'/)
  assert.match(routes, /src\/pages\/star\/index\.vue/)
  assert.match(sidebar, /to="\/star"/)
  assert.match(sidebar, /<span class="no">04<\/span>我的星石/)
  assert.match(sidebar, /<span class="no">05<\/span>个人中心/)
  assert.match(sidebar, /<span>星石<\/span>/)
})

test('星石页以 YuanHub 壳层挂载已构建的 YuanStar 产品', function () {
  const page = readFileSync(new URL('../src/pages/star/index.vue', import.meta.url), 'utf8')
  assert.match(page, /id="product-root" ref="mountRoot"/)
  assert.match(page, /onMounted[\s\S]*mountProduct/)
  assert.match(page, /onBeforeUnmount[\s\S]*disposeYuanStarHandle\(current\)/)
  assert.match(page, /Function\('url', 'return import\(url\)'\)\(EMBED_MODULE_URL\)/)
  assert.match(page, /<AccountWorkspace[\s\S]*heading-title="选择要查看的账号"/)
  assert.match(page, /<AccountWorkspace[\s\S]*\bstacked\b/)
  assert.match(page, /\.page-star\s*\{\s*--wm:\s*'星石'/)
  assert.match(page, /class="star-tabs"[\s\S]*导入识别[\s\S]*人工核对/)
  assert.match(page, /embedded: true/)
  assert.match(page, /hostAccount: selectedHostAccount\(\)/)
  assert.match(page, /onSummaryChange/)
  assert.match(page, /position: sticky; top: 24px; z-index: 45/)
  assert.match(page, /position: fixed; top: auto; right: 0; bottom: 0; left: 0; z-index: 55/)
  assert.match(page, /yuanstar-embed\.css/)
  assert.doesNotMatch(page, /demoMode|DEMO_STAR_SNAPSHOT|星石总数/)
})

test('嵌入 handle 的异步 dispose 会在下一次 mount 前串行完成', async function () {
  const calls = []
  let finishFirst
  const first = { dispose: function () {
    calls.push('first:start')
    return new Promise(function (resolve) { finishFirst = function () { calls.push('first:end'); resolve() } })
  } }
  const second = { dispose: async function () { calls.push('second') } }

  const firstDisposal = disposeYuanStarHandle(first)
  const secondDisposal = disposeYuanStarHandle(second)
  await Promise.resolve()
  assert.deepEqual(calls, ['first:start'])
  finishFirst()
  await firstDisposal
  await secondDisposal
  await waitForYuanStarDisposal()
  assert.deepEqual(calls, ['first:start', 'first:end', 'second'])
})
