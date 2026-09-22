import { installBetaAccessFixture } from '../test-support/betaContractFixture.js'
installBetaAccessFixture()
import test from 'node:test'
import assert from 'node:assert/strict'
import { createStarLoadoutPresetStore, normalizePresetSnapshot, validatePresetDraft } from '../src/domain/starLoadoutPresets.js'
import { applySessionPreset } from '../src/domain/starLoadoutUi.js'
import { getCurrentStarLoadoutPresets, putCurrentStarLoadoutPresets } from '../src/api/starLoadoutPresets.js'
import { auth } from '../src/store/auth.js'

function snapshot(revision = 0, main = [], support = []) {
  return { revision, main_presets: main, support_presets: support, updated_at: revision ? '2026-09-17T00:00:00Z' : null }
}

const mainPreset = { id: 'main-1', name: '预设1', star_names: ['天府', '武曲', '天机'] }

test('preset API is authenticated user-global GET and PUT with no account query', async function () {
  const previousFetch = globalThis.fetch
  const previousToken = auth.accessToken
  const calls = []
  auth.accessToken = 'test-access-token'
  globalThis.fetch = async function (url, options) {
    calls.push({ url, options })
    return { ok: true, status: 200, statusText: 'OK', json: async function () { return { status_code: 200, data: snapshot() } } }
  }
  try {
    await getCurrentStarLoadoutPresets()
    await putCurrentStarLoadoutPresets({ expected_revision: 0, main_presets: [], support_presets: [] })
    assert.match(calls[0].url, /\/v1\/star-loadout-presets\/current$/)
    assert.doesNotMatch(calls[0].url, /account_id/)
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-access-token')
    assert.equal(calls[1].options.method, 'PUT')
  } finally {
    auth.accessToken = previousToken
    globalThis.fetch = previousFetch
  }
})

test('preset snapshot normalizes snake case cloud fields to canonical-name UI values', function () {
  assert.deepEqual(normalizePresetSnapshot(snapshot(1, [mainPreset])), {
    revision: 1,
    main: [{ id: 'main-1', name: '预设1', names: ['天府', '武曲', '天机'] }],
    support: [],
    updatedAt: '2026-09-17T00:00:00Z',
  })
})

test('initial GET is reused for the same user scope and account switches do not clear presets', async function () {
  let gets = 0
  const store = createStarLoadoutPresetStore({
    getCurrent: async function () { gets += 1; return snapshot(1, [mainPreset]) },
    putCurrent: async function () { throw new Error('unexpected PUT') },
  })

  await store.load('user-a')
  await store.load('user-a')

  assert.equal(gets, 1)
  assert.equal(store.state.main[0].name, '预设1')
})

test('manager save performs one PUT and a new store reloads the persisted cloud snapshot', async function () {
  let cloud = snapshot()
  let puts = 0
  const api = {
    getCurrent: async function () { return cloud },
    putCurrent: async function (body) {
      puts += 1
      cloud = snapshot(body.expected_revision + 1, body.main_presets, body.support_presets)
      return cloud
    },
  }
  const draft = { main: [{ id: 'main-1', name: '预设1', names: ['天府', '武曲', '天机'] }], support: [] }
  const first = createStarLoadoutPresetStore(api)
  await first.load('user-a')
  await first.save(draft)
  const reloaded = createStarLoadoutPresetStore(api)
  await reloaded.load('user-a')

  assert.equal(puts, 1)
  assert.deepEqual(reloaded.state.main, draft.main)
})

test('conflict and network failures keep current snapshot and caller-owned draft intact', async function () {
  const draft = { main: [{ id: 'main-2', name: '新草稿', names: ['武曲'] }], support: [] }
  for (const failure of [
    Object.assign(new Error('conflict'), { code: 'star_loadout_preset_revision_conflict', status: 409 }),
    new Error('Failed to fetch'),
  ]) {
    const store = createStarLoadoutPresetStore({
      getCurrent: async function () { return snapshot(1, [mainPreset]) },
      putCurrent: async function () { throw failure },
    })
    await store.load('user-a')
    await assert.rejects(store.save(draft))
    assert.equal(store.state.main[0].id, 'main-1')
    assert.equal(draft.main[0].id, 'main-2')
  }
})

test('invalid presets never PUT and applying a preset only changes the loadout draft', async function () {
  let puts = 0
  const store = createStarLoadoutPresetStore({
    getCurrent: async function () { return snapshot() },
    putCurrent: async function () { puts += 1; return snapshot(1) },
  })
  await store.load('user-a')
  await assert.rejects(store.save({ main: [{ id: 'bad', name: '错误', names: ['紫薇'] }], support: [] }))
  const loadout = applySessionPreset({
    names: ['天府'],
    kind: 'main',
    draftLoadouts: { target: { main1: null, main2: null, main3: null, support1: null, support2: null, support3: null } },
    targetOperator: { id: 'target', prof: '地', subProf: '龙盾' },
    inventoryEntries: [{ instance_id: 'star-1', kind: 'main', name: '天府', quality: 'orange', level: 60 }],
  })

  assert.equal(puts, 0)
  assert.equal(loadout.loadouts.target.main1, 'star-1')
})

test('frontend validation enforces canonical kind, uniqueness and max twenty per group', function () {
  assert.equal(validatePresetDraft({ main: [{ id: 'a', name: 'A', names: ['天府'] }], support: [] }).valid, true)
  assert.equal(validatePresetDraft({ main: [{ id: 'a', name: 'A', names: ['文曲'] }], support: [] }).valid, false)
  assert.equal(validatePresetDraft({ main: [{ id: 'a', name: 'A', names: ['天府', '武曲', '天机', '太阳'] }], support: [] }).valid, false)
  assert.equal(validatePresetDraft({ main: [{ id: 'a', name: 'A', names: ['天府', '天府'] }], support: [] }).valid, false)
  assert.equal(validatePresetDraft({ main: [{ id: 'a', name: 'A', names: ['紫薇'] }], support: [] }).valid, false)
  assert.equal(validatePresetDraft({ main: Array.from({ length: 21 }, (_, index) => ({ id: String(index), name: 'P' + index, names: ['天府'] })), support: [] }).valid, false)
})
