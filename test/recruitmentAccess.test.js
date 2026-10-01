import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecruitmentAccessStore } from '../src/store/recruitmentAccess.js'
import { normalizeRecruitmentAccess } from '../src/api/recruitmentAccess.js'

test('normalizes snake case limited/public access payloads', () => {
  assert.deepEqual(normalizeRecruitmentAccess({ access_mode: 'LIMITED', granted: true, can_access: true }), {
    accessMode: 'LIMITED',
    granted: true,
    canAccess: true
  })
  assert.deepEqual(normalizeRecruitmentAccess({ access_mode: 'PUBLIC', granted: false, can_access: true }), {
    accessMode: 'PUBLIC',
    granted: false,
    canAccess: true
  })
})

test('access store is fail-closed, follows server result and resets on identity changes', async () => {
  let result = { accessMode: 'LIMITED', granted: false, canAccess: false }
  let calls = 0
  const store = createRecruitmentAccessStore({
    async getRecruitmentAccess() { calls++; return result }
  }, () => 100)

  store.setIdentity('u')
  await store.refresh({ force: true })
  assert.equal(store.canAccess, false)
  assert.equal(store.status.accessMode, 'LIMITED')

  result = { accessMode: 'LIMITED', granted: true, canAccess: true }
  await store.refresh({ force: true })
  assert.equal(store.canAccess, true)

  result = { accessMode: 'PUBLIC', granted: false, canAccess: true }
  await store.refresh({ force: true })
  assert.equal(store.canAccess, true)
  assert.equal(calls, 3)

  store.setIdentity('other')
  assert.equal(store.status, null)
  assert.equal(store.canAccess, false)
  assert.equal(store.loaded, false)
})

test('access store denies locally when status lookup fails', async () => {
  const store = createRecruitmentAccessStore({
    async getRecruitmentAccess() { throw new Error('offline') }
  })
  store.setIdentity('u')
  await store.refresh({ force: true })
  assert.equal(store.canAccess, false)
  assert.equal(store.loaded, true)
  assert.equal(store.error, 'offline')
})
