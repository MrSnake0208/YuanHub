import test from 'node:test'
import assert from 'node:assert/strict'
import { establishSession, ensureAccounts, sessionPaths } from './browser.mjs'

const identity = { email: 'agent-user-fixture@example.test', password: 'synthetic-password-for-unit-only' }
const expectedId = 'synthetic-user'
const load = auth => async () => ({ auth })

test('fresh session logs in using the auth service and verifies the returned identity', async () => {
  let calls = 0
  const auth = { login: async (email, password) => {
    assert.equal(email, identity.email); assert.equal(password, identity.password); calls++
    auth.userInfo = { id: expectedId }; auth.accessToken = 'unit-token'
  } }
  assert.deepEqual(await establishSession({ identity, expectedId }, load(auth)), { mode: 'login', userId: expectedId })
  assert.equal(calls, 1)
})

test('existing session uses refresh, rejected refresh relogs in, temporary failure refuses', async () => {
  for (const [refreshed, rejected, expected] of [[true, false, 'refresh'], [false, true, 'login'], [false, false, 'error']]) {
    let logins = 0
    const auth = { userInfo: { id: expectedId }, accessToken: 'unit-token', refreshRejected: rejected,
      refresh: async () => refreshed, login: async () => { logins++ } }
    if (expected === 'error') {
      await assert.rejects(establishSession({ identity, expectedId }, load(auth)), /SESSION_REFRESH_TEMPORARY/)
    } else {
      assert.equal((await establishSession({ identity, expectedId }, load(auth))).mode, expected)
    }
    assert.equal(logins, expected === 'login' ? 1 : 0)
  }
})

test('role crossing refuses before login, and a false login success is rejected', async () => {
  let called = false
  await assert.rejects(establishSession({ identity, expectedId }, load({ userInfo: { id: 'other' }, login: () => { called = true } })), /WRONG_IDENTITY/)
  assert.equal(called, false)
  await assert.rejects(establishSession({ identity, expectedId }, load({ login: async () => {} })), /IDENTITY_REJECTED/)
})

test('user/admin and parallel browser sessions have separate state/profile paths', () => {
  const paths = [sessionPaths('/private', 'user', 'one'), sessionPaths('/private', 'admin', 'one'), sessionPaths('/private', 'user', 'two')]
  assert.equal(new Set(paths.map(p => p.state)).size, 3)
  assert.equal(new Set(paths.map(p => p.profile)).size, 3)
  assert.throws(() => sessionPaths('/private', '../admin', 'one'))
})

test('account init is repeatable, preserves renamed accounts and adds only a missing game', async () => {
  const accounts = []
  let writes = 0
  const api = async (_, options) => {
    if (!options) return accounts
    writes++
    const account = { id: `unit-${writes}`, ...options.body }
    accounts.push(account)
    return account
  }
  const saved = await ensureAccounts(api)
  assert.equal(writes, 2)
  accounts[0].name = 'Agent 修改后的名称'
  await ensureAccounts(api, saved)
  assert.equal(writes, 2)
  accounts.pop()
  await ensureAccounts(api, saved)
  assert.equal(writes, 3)
  accounts[0].game = '如鸢'
  await assert.rejects(ensureAccounts(api, saved), /GAME_CHANGED/)
})
