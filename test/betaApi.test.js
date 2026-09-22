import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBetaStatus, normalizeBetaMe, normalizeBetaAdmin } from '../src/api/beta.js'
const wire = { campaign_id: 'test', access_mode: 'BETA', public_state: 'FULL', server_now: '2026-09-21T12:00:00Z', initial_capacity: 100, capacity: 150, max_capacity: 200, reserved_initial: 25, reserved_remaining: 0, granted_count: 150, public_remaining: 0, local_test_mode: true }
test('normalizes actual snake_case campaign and me/admin nested contracts', () => {
  assert.equal(normalizeBetaStatus(wire).reservedInitial, 25)
  assert.equal(normalizeBetaStatus(wire).localTestMode, true)
  const mine = normalizeBetaMe({ campaign: wire, enrollment_status: 'WAITING', can_use_beta_features: false })
  assert.equal(mine.canUseBetaFeatures, false)
  assert.equal(mine.campaign.capacity, 150)
  const admin = normalizeBetaAdmin({ campaign: wire, config_version: 2, waiting_count: 45 })
  assert.equal(admin.configVersion, 2)
  assert.equal(admin.waitingCount, 45)
})
test('missing or invalid backend data is an error, never fabricated full or grant', () => {
  assert.throws(() => normalizeBetaStatus({}), /响应/)
  assert.throws(() => normalizeBetaStatus({ ...wire, granted_count: -1 }), /异常/)
  assert.throws(() => normalizeBetaMe({ campaign: wire, enrollment_status: 'UNRECOGNIZED' }), /异常/)
  assert.throws(() => normalizeBetaAdmin({ campaign: wire }), /缺失/)
  assert.equal(normalizeBetaMe({ campaign: wire, enrollment_status: 'ACTIVE', can_use_beta_features: 'true' }).canUseBetaFeatures, false)
})

test('admin audit normalization retains beta before/after instead of dropping the change', async () => {
  const { normalizeAdminAuditLog } = await import('../src/api/admin.js')
  const { betaAuditSnapshotParts } = await import('../src/utils/betaAccess.js')
  const log = normalizeAdminAuditLog({ action: 'BETA_UPDATED', before: { beta: { capacity: '100' } }, after: { beta: { capacity: '150', admissions_paused: 'false', reason: '开放下一批' } } })
  assert.equal(log.before.beta.capacity, '100')
  assert.equal(log.after.beta.capacity, '150')
  assert.ok(betaAuditSnapshotParts(log.after.beta).includes('变更原因：开放下一批'))
})
