import test from 'node:test'
import assert from 'node:assert/strict'
import { auth } from '../src/store/auth.js'
import { getAchievementCatalog } from '../src/api/achievement.js'
import { getBondCatalog } from '../src/api/bonds.js'
import { viewOperatorShare } from '../src/api/operator.js'
import { hasAnyAdminCapability } from '../src/utils/authPermissions.js'

test('受限目录和分享请求携带当前身份，游客仍可读取公开 BOX', async () => {
  const previousFetch = globalThis.fetch, previousToken = auth.accessToken, calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return new Response(JSON.stringify({ status_code: 200, data: {} }), { headers: { 'Content-Type': 'application/json' } })
  }
  try {
    auth.accessToken = 'fixture-token'
    await getAchievementCatalog('如鸢')
    await getBondCatalog('如鸢')
    await viewOperatorShare('fixture')
    assert.equal(calls.length, 3)
    assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer fixture-token'))
    auth.accessToken = ''
    await viewOperatorShare('fixture')
    assert.equal(calls[3].options.headers.Authorization, undefined)
  } finally { globalThis.fetch = previousFetch; auth.accessToken = previousToken }
})

test('功能使用授权不会额外授予管理能力', () => {
  assert.equal(hasAnyAdminCapability({ permissions: ['archive:access', 'operator_panel:use', 'operator_relationship:use'] }), false)
  assert.equal(hasAnyAdminCapability({ permissions: ['archive:access', 'admin:role:manage'] }), true)
})
