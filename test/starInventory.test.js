import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { getCurrentStarInventory, putCurrentStarInventory } from '../src/api/starInventory.js'
import { auth } from '../src/store/auth.js'
import { disposeYuanStarHandle, waitForYuanStarDisposal } from '../src/pages/star/embedLifecycle.js'
import { createHostStarInventorySync } from '../src/pages/star/hostStarInventorySync.js'

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

test('星石快照 API 编码 account_id 并经认证 request 发送 PUT', async function () {
  const previousFetch = globalThis.fetch
  const previousToken = auth.accessToken
  const accountId = 'acc /?&中文'
  const body = { effective_at: '2026-08-31T10:00:00.000Z', entries: [] }
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
      json: async function () { return { status_code: 200, data: { saved: true } } }
    }
  }

  try {
    const result = await putCurrentStarInventory(accountId, body)
    assert.deepEqual(result, { saved: true })
    assert.match(receivedUrl, /\/v1\/star-inventory\/current\?account_id=acc%20%2F%3F%26%E4%B8%AD%E6%96%87$/)
    assert.equal(receivedOptions.method, 'PUT')
    assert.equal(receivedOptions.headers.Authorization, 'Bearer test-access-token')
    assert.equal(receivedOptions.body, JSON.stringify(body))
  } finally {
    auth.accessToken = previousToken
    globalThis.fetch = previousFetch
  }
})

test('显式星石同步使用当前 YuanHub 账号、边界 DTO，并保留独立实例', async function () {
  const calls = []
  const sync = createHostStarInventorySync(
    function () { return { accountId: 'hub-account-1' } },
    async function (accountId, body) { calls.push({ accountId, body }); return { saved: true } },
  )
  const payload = {
    localAccount: { localAccountId: 'hub-account-1', name: '本地名', game: '如鸢' },
    snapshot: {
      effective_at: '2026-08-31T10:00:00.000Z',
      entries: [
        { instance_id: 'main-1', kind: 'main', name: '天府', quality: 'orange', level: 60, targetLevel: 60 },
        { instance_id: 'main-2', kind: 'main', name: '天府', quality: 'orange', level: 60, targetLevel: 1 },
        { instance_id: 'support-1', kind: 'support', name: '文曲', quality: 'white', level: 1 },
      ],
    },
  }

  assert.deepEqual(await sync.sync(payload), { saved: true })
  assert.deepEqual(calls, [{
    accountId: 'hub-account-1',
    body: {
      effective_at: '2026-08-31T10:00:00.000Z',
      entries: [
        { instance_id: 'main-1', kind: 'main', name: '天府', quality: 'orange', level: 60 },
        { instance_id: 'main-2', kind: 'main', name: '天府', quality: 'orange', level: 60 },
        { instance_id: 'support-1', kind: 'support', name: '文曲', quality: 'white', level: 1 },
      ],
    },
  }])
})

test('显式星石同步在账号或本地工作区账号无效时拒绝且不 PUT', async function () {
  const calls = []
  const put = async function () { calls.push('put') }
  const missingAccount = createHostStarInventorySync(function () { return null }, put)
  const matchingAccount = createHostStarInventorySync(function () { return { accountId: 'hub-account-1' } }, put)
  const mismatchedAccount = createHostStarInventorySync(function () { return { accountId: 'hub-account-1' } }, put)
  const snapshot = { effective_at: '2026-08-31T10:00:00.000Z', entries: [] }

  await assert.rejects(missingAccount.sync({ snapshot }), /请先登录并选择 YuanHub 子账号/)
  await assert.rejects(matchingAccount.sync({ snapshot }), /无法确认当前 YuanStar 工作区账号/)
  await assert.rejects(matchingAccount.sync({ localAccount: {}, snapshot }), /无法确认当前 YuanStar 工作区账号/)
  await assert.rejects(matchingAccount.sync({ localAccount: { localAccountId: '   ' }, snapshot }), /无法确认当前 YuanStar 工作区账号/)
  await assert.rejects(mismatchedAccount.sync({ localAccount: { localAccountId: 'other-account' }, snapshot }), /当前 YuanStar 工作区与 YuanHub 子账号不一致/)
  assert.deepEqual(calls, [])
})

test('创建 Host 同步回调本身不会 PUT', function () {
  let puts = 0
  createHostStarInventorySync(
    function () { return { accountId: 'hub-account-1' } },
    async function () { puts += 1 },
  )
  assert.equal(puts, 0)
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
  assert.match(page, /starInventorySync/)
  assert.match(page, /同步背包/)
  assert.doesNotMatch(page, /同步当前背包/)
  assert.match(page, /RefreshCw/)
  assert.match(page, /\.star-sync-action\s*\{[^}]*border:\s*1\.5px solid var\(--line\)/)
  assert.match(page, /async function syncCurrentInventoryToCloud\(\)[\s\S]*await handle\.syncCurrentStarInventory\(\)/)
  assert.equal((page.match(/syncCurrentStarInventory/g) || []).length, 1)
  assert.doesNotMatch(page, /putCurrentStarInventory/)
  assert.match(page, /onSummaryChange: function \(nextSummary\) \{ summary\.value = nextSummary \}/)
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
