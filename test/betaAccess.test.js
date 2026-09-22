import test from 'node:test'
import assert from 'node:assert/strict'
import { requiresBetaApi, safeBetaRedirect, betaEntryTarget, betaStatusCopy, betaAccessError } from '../src/utils/betaAccess.js'

const base = { accessMode: 'BETA', publicState: 'OPEN_REGISTRATION', reservedRemaining: 25, admissionsPaused: false }
test('beta gate protects cloud roots and token writes, never public escape routes', () => {
  for (const path of ['/v1/accounts', '/v1/accounts/a/events', '/v1/inventory/current', '/v1/operator/training-workspace', '/v1/star-state', '/v1/star-loadout', '/v1/star-loadout-presets', '/v1/star/captures/abc', '/hub/ledger/plan']) {
    assert.equal(requiresBetaApi('GET', path), true, path)
  }
  for (const path of ['/v1/inventory/catalog', '/v1/operator/catalog', '/v1/operator/share/view/token', '/v1/works', '/v1/reports', '/v1/notifications', '/v1/beta/me', '/v1/admin/beta', '/user/open-api/tokens', '/user/register']) {
    assert.equal(requiresBetaApi('GET', path), false, path)
  }
  assert.equal(requiresBetaApi('POST', '/user/open-api/token'), true)
  assert.equal(requiresBetaApi('PATCH', '/user/open-api/tokens/t/scopes'), true)
  assert.equal(requiresBetaApi('DELETE', '/user/open-api/tokens/t'), false)
  assert.equal(requiresBetaApi('POST', '/v1/operator/catalog'), true)
  assert.equal(requiresBetaApi('GET', '/v1/accounts-lookalike'), false)
})
test('redirect only keeps safe internal destinations without authentication loops', () => {
  assert.equal(safeBetaRedirect('/inventory?tab=rewards#today'), '/inventory?tab=rewards#today')
  assert.equal(safeBetaRedirect('/beta?redirect=%2Finventory'), '/beta?redirect=%2Finventory')
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/%2fevil.test', '/%5cevil.test', '/login', '/register?redirect=/', '/forgot', '/\n/evil.test', null]) {
    assert.equal(safeBetaRedirect(value, '/beta'), '/beta', String(value))
  }
  assert.equal(betaEntryTarget('/beta?redirect=/'), '/')
})
test('state text distinguishes public full, reserved eligibility, paused, CLOSED and failures', () => {
  assert.match(betaStatusCopy({ ...base, publicState: 'PUBLIC_FULL_RESERVED_REMAIN' }, null).title, /公开.*已满/)
  assert.match(betaStatusCopy(base, { shareSnapshotEligible: true }).title, /Share/)
  assert.match(betaStatusCopy({ ...base, localTestMode: true }, { shareSnapshotEligible: true }).title, /本地模拟/)
  assert.match(betaStatusCopy({ ...base, accessMode: 'CLOSED' }, { canUseBetaFeatures: true }).title, /维护/)
  assert.match(betaStatusCopy({ ...base, admissionsPaused: true }, { canUseBetaFeatures: true }).title, /已获得/)
  assert.match(betaStatusCopy({ ...base, accessMode: 'OPEN' }, { enrollmentStatus: 'WAITING' }).title, /正式开放/)
  assert.match(betaStatusCopy(base, null, 'offline').title, /无法读取/)
  assert.equal(betaAccessError({ personalError: 'offline' }).status, 503)
})

test('actual routes protect only the intended workspaces, never the landing page itself', async () => {
  const { routes } = await import('../src/router/routes.js')
  assert.deepEqual(routes.filter(route => route.meta?.requiresBeta).map(route => route.path).sort(), ['/', '/inventory', '/operator', '/operator/quick', '/star'].sort())
  const landing = routes.find(route => route.path === '/beta')
  assert.notEqual(landing.meta.requiresBeta, true)
  assert.notEqual(landing.meta.requiresAuth, true)
  const admin = routes.find(route => route.path === '/admin/beta')
  assert.equal(admin.meta.requiredPermission, 'beta:manage')
  assert.notEqual(admin.meta.requiresBeta, true)
  assert.equal(routes.find(route => route.path === '/').alias, '/today')
})
