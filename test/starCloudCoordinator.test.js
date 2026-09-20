import test from 'node:test'
import assert from 'node:assert/strict'
import { createStarCloudCoordinator } from '../src/pages/star/starCloudCoordinator.js'

const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
const local = () => ({ inventory: [{ starInstanceId: 'main.1', kind: '主星', name: '天府', quality: '橙', level: 20 }], planTargets: { 'main.1': 40 }, bag: { currentCount: 1, capacity: 40 }, experience: { orange: 2, purple: null, white: null } })
const remote = (generation = 2, revision = 5) => ({ generation, revision, inventory: [{ instance_id: 'main.1', kind: 'main', name: '天府', quality: 'orange', level: 20 }], plan_targets: { 'main.1': 40 }, bag: { current_count: 1, capacity: 40 }, experience: { orange: 2, purple: null, white: null } })
const handle = () => ({ getCloudBusinessSnapshot: async () => local(), applyCloudBusinessSnapshot: async () => {} })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done }), resolve } }

test('one StarState writer hydrates and sends generation fenced PATCH', async () => {
  const writes = []
  const coordinator = createStarCloudCoordinator({ selectedHostAccount: () => ({ accountId: 'a' }), storage: storage(),
    getState: async () => remote(), patchState: async (_account, body) => {
      writes.push(body)
      return { state: { ...remote(), revision: 6, bag: body.bag } }
    } })
  assert.equal(await coordinator.enter(handle()), true)
  const changed = local(); changed.bag.currentCount = 2
  assert.equal(coordinator.committed({ accountId: 'a', snapshot: changed }), true)
  await tick(); await tick()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].expected_generation, 2)
  assert.equal(writes[0].expected_revision, 5)
  assert.deepEqual(writes[0].inventory.map(item => item.instance_id), ['main.1'])
  assert.equal(coordinator.state().writer.state().revision, 6)
})

test('network failure retains one account bound draft for retry', async () => {
  let fail = true
  const coordinator = createStarCloudCoordinator({ selectedHostAccount: () => ({ accountId: 'a' }), storage: storage(),
    getState: async () => remote(), patchState: async (_account, body) => {
      if (fail) throw new Error('network down')
      return { state: { ...remote(), revision: 6, bag: body.bag } }
    } })
  await coordinator.enter(handle())
  const changed = local(); changed.bag.currentCount = 2
  coordinator.committed({ accountId: 'a', snapshot: changed })
  await tick(); await tick()
  assert.equal(coordinator.needsRetry(), true)
  assert.equal(coordinator.state().writer.state().pending.bag.currentCount, 2)
  fail = false
  assert.equal(await coordinator.retry(), true)
  assert.equal(coordinator.needsRetry(), false)
})

test('inflight account A PATCH remains bound to A and its late response cannot replace account B state', async () => {
  let selected = 'a'
  const started = deferred(), response = deferred(), writes = [], states = []
  const coordinator = createStarCloudCoordinator({ selectedHostAccount: () => ({ accountId: selected }), storage: storage(),
    getState: async account => account === 'a' ? remote(2, 5) : remote(7, 11),
    patchState: async (account, body) => { writes.push({ account, body }); started.resolve(); return response.promise },
    onState: state => states.push(state) })
  assert.equal(await coordinator.enter(handle()), true)
  const changed = local(); changed.bag.currentCount = 2
  assert.equal(coordinator.committed({ accountId: 'a', snapshot: changed }), true)
  await started.promise
  selected = 'b'
  assert.equal(await coordinator.enter(handle()), true)
  response.resolve({ state: { ...remote(2, 6), bag: { current_count: 2, capacity: 40 } } })
  await tick(); await tick()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].account, 'a')
  assert.equal(writes[0].body.expected_generation, 2)
  assert.equal(coordinator.state().accountId, 'b')
  assert.equal(coordinator.state().generation, 7)
  assert.equal(coordinator.state().writer.state().revision, 11)
  assert.equal(states.at(-1).accountId, 'b')
  assert.equal(coordinator.committed({ accountId: 'a', snapshot: changed }), false)
})

test('failed account A write retries only A and refuses a newer generation', async () => {
  let selected = 'a', fail = true, newerGeneration = false
  const writes = []
  const coordinator = createStarCloudCoordinator({ selectedHostAccount: () => ({ accountId: selected }), storage: storage(),
    getState: async account => account === 'b' ? remote(8, 3) : newerGeneration ? remote(3, 7) : remote(2, 5),
    patchState: async (account, body) => {
      writes.push({ account, body })
      if (fail) throw new Error('network down')
      return { state: { ...remote(2, 6), bag: body.bag } }
    } })
  await coordinator.enter(handle())
  const changed = local(); changed.bag.currentCount = 2
  coordinator.committed({ accountId: 'a', snapshot: changed })
  await tick(); await tick()
  assert.equal(coordinator.needsRetry(), true)
  selected = 'b'
  await coordinator.enter(handle())
  assert.equal(coordinator.needsRetry(), false)
  selected = 'a'
  await coordinator.enter(handle())
  assert.equal(coordinator.needsRetry(), true)
  fail = false
  assert.equal(await coordinator.retry(), true)
  assert.equal(writes.length, 2)
  assert.ok(writes.every(write => write.account === 'a' && write.body.expected_generation === 2))
  assert.equal(coordinator.needsRetry(), false)

  const next = local(); next.bag.currentCount = 3
  fail = true
  coordinator.committed({ accountId: 'a', snapshot: next })
  await tick(); await tick()
  assert.equal(coordinator.needsRetry(), true)
  const beforeRetry = writes.length
  newerGeneration = true
  assert.equal(await coordinator.retry(), false)
  assert.equal(writes.length, beforeRetry)
  assert.equal(coordinator.needsRetry(), true)
})

test('OCR rebuild clears plan and adopts new generation without PATCH', async () => {
  let body = null, patches = 0
  const coordinator = createStarCloudCoordinator({ selectedHostAccount: () => ({ accountId: 'a' }), storage: storage(),
    getState: async () => remote(), patchState: async () => { patches++; throw new Error('unexpected PATCH') },
    rebuildState: async (_account, request) => { body = request; return { state: { ...remote(3, 6), plan_targets: {} } } } })
  await coordinator.enter(handle())
  await coordinator.rebuildOcr(local(), 'point-1')
  assert.equal(body.reason, 'pre_ocr_rebuild')
  assert.equal(body.expected_generation, 2)
  assert.equal(body.recovery_point_id, 'point-1')
  assert.deepEqual(body.plan_targets, {})
  assert.equal(coordinator.state().generation, 3)
  assert.equal(patches, 0)
})

test('JSON replacement and restore use rebuild or restore with generation CAS', async () => {
  const requests = []
  const coordinator = createStarCloudCoordinator({ selectedHostAccount: () => ({ accountId: 'a' }), storage: storage(),
    getState: async () => remote(), rebuildState: async (_account, body) => {
      requests.push(body)
      return { state: remote(3, 6), recovery_point: { recovery_point_id: 'safety' } }
    }, restorePoint: async (_account, pointId, body) => {
      requests.push({ pointId, ...body })
      return { state: remote(4, 7), recovery_summary: { restored_slots: 2 }, recovery_point: { recovery_point_id: 'restore-safety' } }
    } })
  await coordinator.enter(handle())
  const importResult = await coordinator.replaceImport(local())
  assert.equal(importResult.recovery_point.recovery_point_id, 'safety')
  assert.equal(requests[0].reason, 'import_data_safety')
  const restored = await coordinator.restorePoint('old')
  assert.equal(requests[1].pointId, 'old')
  assert.equal(requests[1].expected_generation, 3)
  assert.equal(restored.summary.restored_slots, 2)
  assert.equal(restored.snapshot.generation, 4)
  assert.equal(restored.recovery_point.recovery_point_id, 'restore-safety')
})

test('local restore exposes Backend safety RecoveryPoint ID', async () => {
  const coordinator = createStarCloudCoordinator({ selectedHostAccount: () => ({ accountId: 'a' }), storage: storage(),
    getState: async () => remote(), rebuildState: async () => ({ state: remote(3, 6),
      recovery_point: { recovery_point_id: 'local-restore-safety' }, recovery_summary: { skipped_invalid_slots: 1 } }) })
  await coordinator.enter(handle())
  const restored = await coordinator.restoreLocal(local())
  assert.equal(restored.recovery_point.recovery_point_id, 'local-restore-safety')
  assert.equal(restored.summary.skipped_invalid_slots, 1)
})

test('recovery point list normalizes cloud metadata including absent historical loadout', async () => {
  const coordinator = createStarCloudCoordinator({ selectedHostAccount: () => ({ accountId: 'a' }), storage: storage(),
    getState: async () => remote(), listPoints: async () => [{ recovery_point_id: 'old', reason: 'pre_ocr_rebuild',
      created_at: '2026-09-19T00:00:00Z', source_generation: 2, inventory_count: 1, planned_count: 1,
      bag: { current_count: 1, capacity: 40 }, loadout_available: false, slot_count: null }] })
  await coordinator.enter(handle())
  assert.deepEqual(await coordinator.listRecoveryPoints(), [{ restorePointId: 'old', reason: 'pre_ocr_rebuild',
    createdAt: '2026-09-19T00:00:00Z', workspaceRevision: 2, inventoryCount: 1, plannedCount: 1,
    bagCurrentCount: 1, bagCapacity: 40, loadoutCount: null, loadoutOperatorCount: null, historicalLoadoutAvailable: false }])
})
