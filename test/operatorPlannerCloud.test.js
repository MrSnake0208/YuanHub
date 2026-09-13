import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyTrainingWorkspace, trainingWorkspaceKey } from '../src/data/operatorTrainingPlans.js'
import { createFixedSchedule } from '../src/data/fixedPlannerSchedule.js'
import { createGain, createSpend, normalizePlannerSnapshot, plannerStorageKey } from '../src/data/cultivationPlanner.js'
import { buildPlannerMigration, plannerDateInZone, plannerTimezone, readLocalPlannerBundle, scheduleBody, scheduleFromRemote, workspaceBody, workspaceFromRemote } from '../src/data/operatorPlannerRemote.js'
import { createPlannerSnapshotWriter } from '../src/data/plannerSnapshotWriter.js'
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  const accountId = 'account'
  const snapshot = { ...normalizePlannerSnapshot(null, accountId), timezone: 'Asia/Shanghai' }
  const id = 'char_001_yangxiu'
  const context = { date: '2026-09-12', initialState: { [id]: { shuijing: 2000, __xp__: 12000 } }, requiredState: { [id]: { shuijing: 2000, __xp__: 12000 } },
    stock: {}, goals: { [id]: [80, 13, 7] }, levels: { fh: 12, ds: 12, yy: 12, experience: 8 }, strategy: 'overall', agentOrder: [id], preferences: snapshot.preferences }
  snapshot.manualPlans['2026-09-12'] = { gains: [createGain('natural')], spends: [{ ...createSpend('custom', { yield: { shuijing: 2, __xp__: 7 } }), value: 1.5 }] }
  snapshot.schedule = createFixedSchedule(context, snapshot.manualPlans)
  return { accountId, snapshot, id }
}
test('current simulator snapshot survives remote wire roundtrip including invalid drafts and dynamic IDs', () => {
  const { accountId, snapshot } = fixture()
  const wire = scheduleBody(snapshot, 2)
  assert.equal(wire.schedule.context.initial_state.char_001_yangxiu.__xp__, 12000)
  assert.equal(wire.manual_plans['2026-09-12'].spends[0].value, 1.5)
  const restored = scheduleFromRemote({ ...wire, account_id: accountId, revision: 3 }, accountId)
  assert.deepEqual(restored.schedule, snapshot.schedule)
  assert.deepEqual(restored.manualPlans, snapshot.manualPlans)
  assert.throws(() => scheduleFromRemote({ ...wire, account_id: 'other' }, accountId))
  const workspace = emptyTrainingWorkspace(accountId)
  workspace.plans.push({ id: crypto.randomUUID(), name: '主队', source: 'custom', operatorIds: [], excludedOperatorIds: [], targets: { x: { level: 80, elite: 13, starLevel: 7, revision: 8 } } })
  const body = workspaceBody(workspace, 2)
  assert.deepEqual(Object.keys(body.plans[1].targets.x).sort(), ['elite', 'level', 'star_level'])
  assert.equal(workspaceFromRemote({ ...body, account_id: accountId, revision: 3 }, accountId).revision, 3)
})
test('migration preserves originals, uses legacy default schedule, and adds independent plans to an existing cloud', () => {
  const { accountId, snapshot, id } = fixture(), storage = memory()
  const local = emptyTrainingWorkspace(accountId)
  storage.setItem(trainingWorkspaceKey(accountId), JSON.stringify(local))
  storage.setItem(plannerStorageKey(accountId), JSON.stringify(snapshot))
  const bundle = readLocalPlannerBundle(storage, accountId)
  const cloud = emptyTrainingWorkspace(accountId); cloud.revision = 4
  const request = buildPlannerMigration(bundle, cloud, new Set([id]), { [id]: { level: 50, elite: 7, starLevel: 1 } })
  assert.deepEqual(request.workspace.plans[0], workspaceBody(cloud).plans[0])
  assert.equal(request.workspace.plans[1].source, 'custom')
  assert.deepEqual(request.workspace.plans[1].operator_ids, [id])
  assert.equal(request.workspace.plans[1].targets[id].level, 50)
  assert.equal(Object.keys(request.schedules)[0], request.workspace.plans[1].id)
  assert.equal(request.workspace.expected_revision, 4)
  assert.equal(storage.getItem(plannerStorageKey(accountId)), JSON.stringify(snapshot))
  const first = buildPlannerMigration(bundle, emptyTrainingWorkspace(accountId), new Set(), {})
  assert.ok(first.schedules.favorites)
})
test('日期工具仍支持午夜兼容检查，并可按北京时间 5 点切日', () => {
  assert.equal(plannerTimezone(), 'Asia/Shanghai')
  assert.equal(plannerDateInZone('Asia/Shanghai', new Date('2026-09-12T16:00:00Z')), '2026-09-13')
  assert.equal(plannerDateInZone('America/New_York', new Date('2026-09-12T16:00:00Z')), '2026-09-12')
  assert.equal(plannerDateInZone('Asia/Shanghai', new Date('2026-09-12T20:59:59Z'), 5), '2026-09-12')
  assert.equal(plannerDateInZone('Asia/Shanghai', new Date('2026-09-12T21:00:00Z'), 5), '2026-09-13')
})
function writerFixture(write) {
  let remote = { revision: 0, value: 0 }
  const storage = memory(), calls = []
  const writer = createPlannerSnapshotWriter({ initial: remote, storage, key: 'draft', read: async () => remote,
    body: (x, revision) => ({ value: x.value, expected_revision: revision }),
    write: async body => { calls.push(body); return write ? write(body, value => { remote = value }) : (remote = { value: body.value, revision: body.expected_revision + 1 }) }
  })
  return { writer, storage, calls, setRemote: value => { remote = value } }
}
test('rapid edits serialize and coalesce while retaining the latest draft', async () => {
  let release
  const f = writerFixture(async (body, set) => { if (body.expected_revision === 0) await new Promise(resolve => { release = resolve }); const saved = { value: body.value, revision: body.expected_revision + 1 }; set(saved); return saved })
  const first = f.writer.save({ value: 1 }); await tick()
  f.writer.save({ value: 2 }); f.writer.save({ value: 3 })
  assert.equal(f.calls.length, 1)
  release(); assert.equal(await first, true)
  assert.deepEqual(f.calls, [{ value: 1, expected_revision: 0 }, { value: 3, expected_revision: 1 }])
  assert.equal(f.storage.getItem('draft'), null)
})
test('lost response reconciles committed write then saves the newer pending edit', async () => {
  let release
  const f = writerFixture(async (body, set) => {
    const saved = { value: body.value, revision: body.expected_revision + 1 }; set(saved)
    if (body.expected_revision === 0) { await new Promise(resolve => { release = resolve }); throw new Error('response lost') }
    return saved
  })
  const first = f.writer.save({ value: 1 }); await tick(); f.writer.save({ value: 2 }); release(); await first
  assert.ok(f.storage.getItem('draft'))
  assert.equal(await f.writer.retry(), true)
  assert.deepEqual(f.calls.map(x => x.expected_revision), [0, 1])
  assert.equal(f.writer.state().pending, null)
})
test('conflict preserves draft across reload and requires explicit discard', async () => {
  const f = writerFixture(async () => { throw Object.assign(new Error('conflict'), { status: 409 }) })
  await f.writer.save({ value: 4 })
  f.setRemote({ value: 9, revision: 1 })
  assert.equal(await f.writer.retry(), false)
  assert.equal(f.calls.length, 1)
  const resumed = createPlannerSnapshotWriter({ initial: { revision: 1, value: 9 }, storage: f.storage, key: 'draft',
    body: (x, expected_revision) => ({ value: x.value, expected_revision }), read: async () => ({ revision: 1, value: 9 }), write: () => assert.fail('must not overwrite') })
  assert.equal(resumed.state().pending.value, 4)
  assert.equal(await resumed.retry(), false)
  assert.equal(await resumed.discard(), true)
  assert.equal(f.storage.getItem('draft'), null)
})
test('GET in flight cannot replace a newly edited draft', async () => {
  let releaseRead, releaseWrite, applied = []
  const writer = createPlannerSnapshotWriter({ initial: { revision: 0 }, storage: memory(), key: 'draft', body: x => x,
    read: () => new Promise(resolve => { releaseRead = resolve }), write: () => new Promise(resolve => { releaseWrite = resolve }), onSaved: x => applied.push(x) })
  const refresh = writer.refresh(); const save = writer.save({ value: 2 }); await tick()
  releaseRead({ revision: 0, value: 0 }); await refresh
  assert.equal(applied.length, 0)
  releaseWrite({ revision: 1, value: 2 }); await save
  assert.equal(applied[0].value, 2)
})


test('pending drafts and late saves stay in their own account and plan session', async () => {
  const storage = memory(), seen = []; let release
  const writer = (key, write) => createPlannerSnapshotWriter({ initial: { revision: 0, value: 0 }, key, storage,
    body: (x, expected_revision) => ({ value: x.value, expected_revision }), read: async () => ({ revision: 0, value: 0 }), write,
    onSaved: value => seen.push({ key, value }) })
  const a = writer('account-a:plan-a', () => new Promise(resolve => { release = resolve }))
  const b = writer('account-b:plan-b', async body => ({ revision: 1, value: body.value }))
  const first = a.save({ value: 4 }); await tick()
  assert.ok(storage.getItem('account-a:plan-a'))
  await b.save({ value: 8 })
  assert.ok(storage.getItem('account-a:plan-a'))
  release({ revision: 1, value: 4 }); await first
  assert.deepEqual(seen.map(x => [x.key, x.value.value]), [['account-b:plan-b', 8], ['account-a:plan-a', 4]])
})


test('returning to an account cannot let its older in-flight response overwrite a newer draft', async () => {
  const storage = memory(); let rejectOld, rejectNew
  const options = { initial: { revision: 0, value: 0 }, key: 'same-account:plan', storage,
    body: (x, expected_revision) => ({ value: x.value, expected_revision }), read: async () => ({ revision: 0, value: 0 }) }
  const old = createPlannerSnapshotWriter({ ...options, write: () => new Promise((_, reject) => { rejectOld = reject }) })
  const oldSave = old.save({ value: 1 }); await tick()
  const current = createPlannerSnapshotWriter({ ...options, write: () => new Promise((_, reject) => { rejectNew = reject }) })
  await current.discard()
  const newSave = current.save({ value: 2 }); await tick()
  rejectOld(new Error('late old failure')); await oldSave
  assert.equal(JSON.parse(storage.getItem(options.key)).pending.value, 2)
  rejectNew(new Error('new failure')); await newSave
  assert.equal(JSON.parse(storage.getItem(options.key)).pending.value, 2)
})
