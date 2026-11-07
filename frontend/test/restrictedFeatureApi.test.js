import test from 'node:test'
import assert from 'node:assert/strict'
import { auth } from '../src/store/auth.js'
import { beta } from '../src/store/beta.js'
import { getAchievementCatalog } from '../src/api/achievement.js'
import { getBondCatalog } from '../src/api/bonds.js'
import { viewOperatorShare } from '../src/api/operator.js'
import { hasAnyAdminCapability } from '../src/utils/authPermissions.js'

test('目录请求携带当前身份，羁绊要求内测资格，游客仍可读取公开 BOX', async () => {
  const previousFetch = globalThis.fetch, previousToken = auth.accessToken, previousUser = auth.userInfo, calls = []
  const campaign = { campaign_id: 'fixture', access_mode: 'BETA', public_state: 'OPEN_REGISTRATION', server_now: '2026-11-07T00:00:00Z', initial_capacity: 100, capacity: 100, reserved_initial: 25, reserved_remaining: 0, granted_count: 1, public_remaining: 99 }
  let granted = true
  globalThis.fetch = async (url, options) => {
    const isBeta = String(url).includes('/v1/beta/me')
    if (!isBeta) calls.push({ url, options })
    return new Response(JSON.stringify({ status_code: 200, data: isBeta ? { can_use_beta_features: granted, enrollment_status: granted ? 'ACTIVE' : 'WAITING', campaign } : {} }), { headers: { 'Content-Type': 'application/json' } })
  }
  try {
    auth.accessToken = 'fixture-token'
    auth.userInfo = { id: 'beta-member' }
    await getAchievementCatalog('如鸢')
    await getBondCatalog('如鸢')
    await viewOperatorShare('fixture')
    assert.equal(calls.length, 3)
    assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer fixture-token'))
    auth.accessToken = ''
    await viewOperatorShare('fixture')
    assert.equal(calls[3].options.headers.Authorization, undefined)
    auth.accessToken = 'fixture-token'; granted = false; beta.invalidate()
    await assert.rejects(getBondCatalog('如鸢'), error => error.status === 403 && error.code === 'beta_access_required')
    assert.equal(calls.length, 4)
  } finally { globalThis.fetch = previousFetch; auth.accessToken = previousToken; auth.userInfo = previousUser; beta.setIdentity(previousUser?.id || '') }
})

test('功能使用授权不会额外授予管理能力', () => {
  assert.equal(hasAnyAdminCapability({ permissions: ['archive:access', 'operator_panel:use', 'operator_relationship:use', 'operator_reserve:use'] }), false)
  assert.equal(hasAnyAdminCapability({ permissions: ['archive:access', 'admin:role:manage'] }), true)
})
