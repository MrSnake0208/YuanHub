import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createOperatorShare,
  getOperatorShare,
  regenerateOperatorShare,
  revokeOperatorShare,
  viewOperatorShare
} from '../src/api/operator.js'
import {
  mergeOperatorShareEntries,
  operatorShareStarLabel,
  parseOperatorShareToken
} from '../src/utils/operatorShare.js'

function read(rel) {
  return readFileSync(new URL('../' + rel, import.meta.url), 'utf8')
}

const routes = read('src/router/routes.js')
const sharePage = read('src/pages/operator/share.vue')
const operatorPage = read('src/pages/operator/index.vue')
const manager = read('src/components/operator/OperatorShareManager.vue')

test('神秘代码输入同时支持原始代码和完整链接', () => {
  const token = '550e8400-e29b-41d4-a716-446655440000'
  assert.equal(parseOperatorShareToken(token), token)
  assert.equal(parseOperatorShareToken('https://yuan.example/operator/share/' + token + '?from=copy#box'), token)
  assert.equal(parseOperatorShareToken('/operator/share/' + token), token)
  assert.equal(parseOperatorShareToken('https://yuan.example/operator/not-share/' + token), '')
  assert.equal(parseOperatorShareToken('https://yuan.example/operator/share/bad%20token'), '')
  assert.equal(parseOperatorShareToken('https://yuan.example/operator/share/%'), '')
  assert.equal(parseOperatorShareToken(''), '')
  assert.equal(parseOperatorShareToken('bad token'), '')
})

test('匿名 entries 按公共密探 ID 合并图鉴字段并保留 snake_case 养成数据', () => {
  const entries = mergeOperatorShareEntries({
    entries: {
      char_b: { level: 80, star_level: 21 },
      char_a: { level: 90, star_level: 27 },
      char_missing: { level: 70, star_level: 15 }
    }
  }, {
    operators: [
      { id: 'char_a', name: '甲', avatar: '/avatar/a.webp', prof: ['阳'], oddity_schema: { attack: { name: '攻击力', max: 500 } } },
      { id: 'char_b', name: '乙', sub_prof: ['辅助'] }
    ]
  })

  assert.deepEqual(entries.map((entry) => entry.id), ['char_a', 'char_b', 'char_missing'])
  assert.equal(entries[0].name, '甲')
  assert.equal(entries[0].avatar, '/avatar/a.webp')
  assert.deepEqual(entries[0].prof, ['阳'])
  assert.equal(entries[0].oddity_schema.attack.max, 500)
  assert.equal(entries[0].growth.star_level, 27)
  assert.equal(entries[2].name, '未知密探')
  assert.notEqual(entries[2].name, entries[2].id)
})

test('化极文案区分普通密探、SP 密探与觉醒', () => {
  assert.equal(operatorShareStarLabel(27, false), '5 星 · 2 节点')
  assert.equal(operatorShareStarLabel(3, true), '3 星')
  assert.equal(operatorShareStarLabel(31, false), '觉醒')
})

test('分享 API 方法、路径、参数与认证边界符合固定契约', async () => {
  const previousFetch = globalThis.fetch
  const { auth } = await import('../src/store/auth.js')
  const previousToken = auth.accessToken
  const calls = []
  auth.accessToken = 'share-test-token'
  globalThis.fetch = async function (url, options) {
    calls.push({ url: String(url), options: options || {} })
    return new Response(JSON.stringify({ status_code: 200, data: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    await getOperatorShare('acc one')
    await createOperatorShare('acc one')
    await regenerateOperatorShare('acc one')
    await revokeOperatorShare('acc one')
    await viewOperatorShare('code/one')
  } finally {
    globalThis.fetch = previousFetch
    auth.accessToken = previousToken
  }

  assert.deepEqual(calls.map(function (call) { return [call.options.method, call.url] }), [
    ['GET', '/v1/operator/share?account_id=acc+one'],
    ['PUT', '/v1/operator/share?account_id=acc+one'],
    ['POST', '/v1/operator/share/regenerate?account_id=acc+one'],
    ['DELETE', '/v1/operator/share?account_id=acc+one'],
    ['GET', '/v1/operator/share/view/code%2Fone']
  ])
  calls.slice(0, 4).forEach(function (call) {
    assert.equal(call.options.headers.Authorization, 'Bearer share-test-token')
  })
  assert.equal(calls[4].options.headers.Authorization, undefined)
})

test('公开分享路由懒加载且不要求登录', () => {
  const route = routes.match(/\{\s*path: '\/operator\/share\/:token\?'[\s\S]*?\n\s*\},/)
  assert.ok(route)
  assert.match(route[0], /component: \(\) => import\('\/src\/pages\/operator\/share\.vue'\)/)
  assert.doesNotMatch(route[0], /requiresAuth/)
})

test('匿名页仅读：只请求匿名数据和公共图鉴，不引入写操作', () => {
  assert.match(sharePage, /Promise\.all\(\[\s*viewOperatorShare\(token\),\s*getOperatorCatalog\(\)/)
  assert.match(sharePage, /status\.value = err && \(err\.status === 404 \|\| err\.code === 'share_not_found'\)/)
  assert.match(sharePage, /status\.value = entries\.value\.length \? 'ready' : 'empty'/)
  assert.doesNotMatch(sharePage, /getOperatorCurrent|patchOperatorCurrent|importOperator|exportOperator|putOperatorAnnotation|GrowthTarget/)
  assert.doesNotMatch(sharePage, /localStorage|sessionStorage|navigator\.clipboard|method:\s*['"](?:POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(sharePage, /<code>\s*\{\{\s*entry\.id\s*\}\}\s*<\/code>/)
})

test('当前子账号工作区提供分享管理，账号切换会使旧请求失效', () => {
  assert.match(operatorPage, /<OperatorShareManager[\s\S]*v-if="auth\.isLoggedIn && accountId"[\s\S]*:account-id="accountId"/)
  assert.match(manager, /watch\(function \(\) \{ return props\.accountId \}, loadShare, \{ immediate: true, flush: 'sync' \}\)/)
  assert.match(manager, /props\.accountId === accountId && seq === requestSeq/)
  assert.equal((manager.match(/const seq = requestSeq\s+const ok = await dialog\.confirm/g) || []).length, 2)
  assert.equal((manager.match(/ok && current\(accountId, seq\)/g) || []).length, 2)
  assert.match(manager, /window\.location\.origin \+ '\/operator\/share\/'/)
  assert.match(manager, /dialog\.confirm/)
  assert.match(manager, /createOperatorShare|regenerateOperatorShare|revokeOperatorShare/)
})
