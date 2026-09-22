import test from 'node:test'
import assert from 'node:assert/strict'
import { createBetaStore } from '../src/store/beta.js'
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const campaign = { campaignId: 'test', accessMode: 'BETA', publicState: 'OPEN_REGISTRATION', serverNow: '2026-09-21T12:00:00Z', reservedUntil: '2026-09-24T12:00:00Z' }
const me = (status = 'ACTIVE', mode = 'BETA') => ({ campaign: { ...campaign, accessMode: mode }, enrollmentStatus: status, canUseBetaFeatures: status === 'ACTIVE' || mode === 'OPEN' })
test('guest never requests personal data and merges concurrent personal reads', async () => {
  let calls = 0; const pending = deferred()
  const beta = createBetaStore({ getBetaMe: () => { calls++; return pending.promise } })
  await beta.loadMe(); assert.equal(calls, 0)
  beta.setIdentity('a'); const first = beta.loadMe(); const second = beta.loadMe()
  assert.equal(calls, 1); pending.resolve(me()); await Promise.all([first, second]); assert.equal(beta.canUseBetaFeatures, true)
})
test('late user A result can never authorize user B', async () => {
  const a = deferred(), b = deferred(); let calls = 0
  const beta = createBetaStore({ getBetaMe: () => (++calls === 1 ? a.promise : b.promise) })
  beta.setIdentity('A'); const requestA = beta.loadMe()
  beta.setIdentity('B'); const requestB = beta.loadMe()
  a.resolve(me()); await requestA; assert.equal(beta.mine, null)
  b.resolve(me('WAITING')); await requestB; assert.equal(beta.canUseBetaFeatures, false)
})
test('server failure clears old ACTIVE and never pretends the account is full', async () => {
  let fail = false
  const beta = createBetaStore({ getBetaMe: async () => { if (fail) throw new Error('offline'); return me() } })
  beta.setIdentity('A'); await beta.loadMe(); assert.equal(beta.canUseBetaFeatures, true)
  fail = true; await beta.loadMe({ force: true }); assert.equal(beta.canUseBetaFeatures, false); assert.equal(beta.mine, null); assert.equal(beta.personalError, 'offline')
})
test('join result wins over an old GET, returns result and never counts locally', async () => {
  const get = deferred(), join = deferred()
  const beta = createBetaStore({ getBetaMe: () => get.promise, joinBeta: () => join.promise })
  beta.setIdentity('A'); const old = beta.loadMe(); const mutation = beta.join({})
  join.resolve(me()); assert.equal((await mutation).enrollmentStatus, 'ACTIVE')
  get.resolve(me('WAITING')); await old; assert.equal(beta.mine.enrollmentStatus, 'ACTIVE')
})
test('GET started during a mutation cannot later overwrite its committed result', async () => {
  const get = deferred(), join = deferred()
  const beta = createBetaStore({ getBetaMe: () => get.promise, joinBeta: () => join.promise })
  beta.setIdentity('A'); const mutation = beta.join({}); const stale = beta.loadMe()
  join.resolve(me()); await mutation; get.resolve(me('WAITING')); await stale
  assert.equal(beta.canUseBetaFeatures, true); assert.equal(beta.personalLoading, false)
})
test('uncertain join re-queries authoritative membership without submitting twice', async () => {
  let joins = 0
  const beta = createBetaStore({ joinBeta: async () => { joins++; throw new Error('network timeout') }, getBetaMe: async () => me() })
  beta.setIdentity('A'); await assert.rejects(beta.join({}), /timeout/)
  assert.equal(joins, 1); assert.equal(beta.canUseBetaFeatures, true)
})
test('withdraw returns real result and OPEN admits historical waiters while CLOSED blocks ACTIVE', async () => {
  const beta = createBetaStore({ withdrawBeta: async () => me('WITHDRAWN'), getBetaMe: async () => me('WAITING', 'OPEN') })
  beta.setIdentity('A'); assert.equal((await beta.withdraw()).enrollmentStatus, 'WITHDRAWN')
  await beta.loadMe({ force: true }); assert.equal(beta.canUseBetaFeatures, true)
  beta.campaign = { ...campaign, accessMode: 'CLOSED' }; assert.equal(beta.canUseBetaFeatures, false)
  beta.setIdentity(''); assert.equal(beta.mine, null)
})
