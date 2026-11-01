import { installBetaAccessFixture } from '../test-support/betaContractFixture.js'
installBetaAccessFixture()
import test from 'node:test'
import assert from 'node:assert/strict'
import { auth } from '../src/store/auth.js'
import { getCurrentStarState, patchCurrentStarState, rebuildStarState, listStarRecoveryPoints, restoreStarRecoveryPoint, getPendingStarPlanInheritance, confirmStarPlanInheritance, discardStarPlanInheritance } from '../src/api/starState.js'

test('StarState API encodes account and recovery IDs and sends authenticated generation commands', async () => {
  const previousFetch = globalThis.fetch, previousToken = auth.accessToken
  const calls = []
  auth.accessToken = 'test-access-token'
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ status_code: 200, data: { ok: true } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const account = 'acc /中文', point = 'old/point'
    const body = { expected_generation: 3, expected_revision: 7 }
    await getCurrentStarState(account)
    await patchCurrentStarState(account, body)
    await rebuildStarState(account, { ...body, reason: 'pre_ocr_rebuild' })
    await listStarRecoveryPoints(account)
    await restoreStarRecoveryPoint(account, point, body)
    await getPendingStarPlanInheritance(account)
    const plan = { ...body, operation_id: '11111111-1111-4111-8111-111111111111', source_recovery_point_id: point, plan_targets: { 'new.1': 60 } }
    await confirmStarPlanInheritance(account, plan)
    await discardStarPlanInheritance(account, { ...body, operation_id: plan.operation_id, source_recovery_point_id: point })
    assert.deepEqual(calls.map(call => call.options.method), ['GET', 'PATCH', 'POST', 'GET', 'POST', 'GET', 'POST', 'POST'])
    assert.ok(calls.every(call => call.url.includes('account_id=acc%20%2F%E4%B8%AD%E6%96%87')))
    assert.ok(calls.every(call => call.options.headers.Authorization === 'Bearer test-access-token'))
    assert.match(calls[5].url, /plan-inheritance\/pending/)
    assert.match(calls[6].url, /plan-inheritance\/confirm/)
    assert.match(calls[7].url, /plan-inheritance\/discard/)
    assert.deepEqual(JSON.parse(calls[6].options.body), plan)
    assert.equal(Object.hasOwn(JSON.parse(calls[7].options.body), 'plan_targets'), false)
    assert.match(calls[4].url, /recovery-points\/old%2Fpoint\/restore/)
    assert.deepEqual(JSON.parse(calls[1].options.body), body)
    assert.equal(JSON.parse(calls[2].options.body).reason, 'pre_ocr_rebuild')
  } finally { globalThis.fetch = previousFetch; auth.accessToken = previousToken }
})
