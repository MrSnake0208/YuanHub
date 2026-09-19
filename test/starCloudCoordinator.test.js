import test from 'node:test'
import assert from 'node:assert/strict'
import { createStarCloudCoordinator } from '../src/pages/star/starCloudCoordinator.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }
}
function snapshot() {
  return { inventory: [{ starInstanceId: 'main-1', kind: '主星', name: '天府', quality: '橙', level: 10 }], planTargets: { 'main-1': 20 }, bag: { currentCount: 3, capacity: 40 }, experience: { orange: 1, purple: null, white: 2 } }
}
function tick() { return new Promise(resolve => setTimeout(resolve, 0)) }
function deferred() {
  let resolve
  return { promise: new Promise(done => { resolve = done }), resolve }
}

test('emitted recovery state follows clean, pending, and writer error states', async function () {
  const states = [], inventoryGate = deferred()
  let failWorkspace = false
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-recovery-state' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putInventory: async (_account, body) => await inventoryGate.promise.then(() => ({ revision: 2, entries: body.entries })),
    putWorkspace: async (_account, body) => {
      if (failWorkspace) throw new Error('workspace down')
      return { revision: 2, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience }
    },
    onState: state => states.push(state),
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  assert.deepEqual(states.at(-1).hasOrderedHold, false)
  assert.deepEqual(states.at(-1).needsRetry, false)
  assert.deepEqual(states.at(-1).recoveryRequired, false)

  coordinator.committed({ accountId: 'account-recovery-state', inventoryChanged: true, workspaceChanged: false, snapshot: snapshot() })
  await tick()
  assert.equal(states.at(-1).hasOrderedHold, false)
  assert.equal(states.at(-1).needsRetry, true)
  assert.equal(states.at(-1).recoveryRequired, false)
  inventoryGate.resolve()
  await tick(); await tick()
  assert.equal(states.at(-1).needsRetry, false)
  assert.equal(states.at(-1).recoveryRequired, false)

  failWorkspace = true
  coordinator.committed({ accountId: 'account-recovery-state', inventoryChanged: false, workspaceChanged: true, snapshot: snapshot() })
  await tick(); await tick()
  assert.equal(states.at(-1).hasOrderedHold, false)
  assert.equal(states.at(-1).needsRetry, true)
  assert.equal(states.at(-1).recoveryRequired, true)
})

test('empty cloud bootstraps independent inventory and workspace domains without a hydrate loop', async function () {
  let accountId = 'account-a', applied = 0, inventoryPuts = 0, workspacePuts = 0
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => { applied += 1 } }
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 0, entries: [] }), getWorkspace: async () => ({ revision: 0 }),
    putInventory: async (_account, body) => { inventoryPuts += 1; return { revision: inventoryPuts, entries: body.entries } },
    putWorkspace: async (_account, body) => { workspacePuts += 1; return { revision: workspacePuts, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience } },
  })
  assert.equal(await coordinator.enter(handle), true)
  await tick(); await tick()
  assert.equal(applied, 0)
  assert.equal(inventoryPuts, 1)
  assert.equal(workspacePuts, 1)
  assert.equal(coordinator.committed({ accountId, inventoryChanged: false, workspaceChanged: false, snapshot: snapshot() }), false)
  await tick()
  assert.equal(inventoryPuts, 1, 'unchanged business state must not PUT')
  assert.equal(workspacePuts, 1, 'unchanged business state must not PUT')
})

test('existing cloud data hydrates the combined business snapshot', async function () {
  let applied = null
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-a' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 2, entries: [{ instance_id: 'support-1', kind: 'support', name: '文曲', quality: 'white', level: 3 }] }),
    getWorkspace: async () => ({ revision: 4, plan_targets: { 'support-1': 30 }, bag: { current_count: 9, capacity: 60 }, experience: { orange: 5, purple: 4, white: 3 } }),
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async value => { applied = value } })
  assert.deepEqual(applied, { inventory: [{ starInstanceId: 'support-1', kind: '辅星', name: '文曲', quality: '白', level: 3 }], planTargets: { 'support-1': 30 }, bag: { currentCount: 9, capacity: 60 }, experience: { orange: 5, purple: 4, white: 3 } })
})

test('mixed cloud domains hydrate one compatible side and bootstrap only the other', async function () {
  const local = snapshot()
  const compatibleInventoryLocal = { ...local, inventory: [{ starInstanceId: 'support-1', kind: '辅星', name: '文曲', quality: '白', level: 3 }], planTargets: { 'support-1': 20 } }
  const inventoryOnlyApplies = [], inventoryOnlyPuts = { inventory: 0, workspace: 0 }
  const inventoryOnly = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-inventory' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 2, entries: [{ instance_id: 'support-1', kind: 'support', name: '文曲', quality: 'white', level: 3 }] }),
    getWorkspace: async () => ({ revision: 0 }),
    putInventory: async () => { inventoryOnlyPuts.inventory += 1 },
    putWorkspace: async (_account, body) => { inventoryOnlyPuts.workspace += 1; return { revision: 1, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience } },
  })
  await inventoryOnly.enter({ getCloudBusinessSnapshot: async () => compatibleInventoryLocal, applyCloudBusinessSnapshot: async value => inventoryOnlyApplies.push(value) })
  await tick(); await tick()
  assert.equal(inventoryOnlyPuts.inventory, 0)
  assert.equal(inventoryOnlyPuts.workspace, 1)
  assert.deepEqual(inventoryOnlyApplies[0], compatibleInventoryLocal)

  const workspaceOnlyApplies = [], workspaceOnlyPuts = { inventory: 0, workspace: 0 }
  const workspaceOnly = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-workspace' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 0, entries: [] }),
    getWorkspace: async () => ({ revision: 4, plan_targets: { 'main-1': 30 }, bag: { current_count: 8, capacity: 88 }, experience: { orange: 7, purple: 6, white: 5 } }),
    putInventory: async (_account, body) => { workspaceOnlyPuts.inventory += 1; return { revision: 1, entries: body.entries } },
    putWorkspace: async () => { workspaceOnlyPuts.workspace += 1 },
  })
  await workspaceOnly.enter({ getCloudBusinessSnapshot: async () => local, applyCloudBusinessSnapshot: async value => workspaceOnlyApplies.push(value) })
  await tick(); await tick()
  assert.equal(workspaceOnlyPuts.inventory, 1)
  assert.equal(workspaceOnlyPuts.workspace, 0)
  assert.deepEqual(workspaceOnlyApplies[0], { ...local, planTargets: { 'main-1': 30 }, bag: { currentCount: 8, capacity: 88 }, experience: { orange: 7, purple: 6, white: 5 } })
})

test('incompatible mixed cloud domains fail hydration without bootstrap or local replacement', async function () {
  const local = snapshot()
  let localBusinessSnapshot = structuredClone(local)
  let inventoryPuts = 0, workspacePuts = 0
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-incompatible' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 2, entries: [{ instance_id: 'support-1', kind: 'support', name: '文曲', quality: 'white', level: 3 }] }),
    getWorkspace: async () => ({ revision: 0 }),
    putInventory: async () => { inventoryPuts += 1 },
    putWorkspace: async () => { workspacePuts += 1 },
  })
  const handle = {
    getCloudBusinessSnapshot: async () => localBusinessSnapshot,
    applyCloudBusinessSnapshot: async value => {
      const inventoryIds = new Set(value.inventory.map(item => item.starInstanceId))
      if (Object.keys(value.planTargets).some(instanceId => !inventoryIds.has(instanceId))) throw new Error('养成计划引用了当前背包中不存在的星石实例。')
      localBusinessSnapshot = value
    },
  }
  assert.equal(await coordinator.enter(handle), false)
  await tick(); await tick()
  assert.equal(inventoryPuts, 0)
  assert.equal(workspacePuts, 0)
  assert.deepEqual(localBusinessSnapshot, local)
  assert.match(coordinator.state().error.message, /不存在的星石实例/)
})

test('network failure retains the account-bound pending workspace draft for retry', async function () {
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-network' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putInventory: async (_account, body) => ({ revision: 2, entries: body.entries }),
    putWorkspace: async () => { throw new Error('network down') },
  })
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} }
  await coordinator.enter(handle)
  assert.equal(coordinator.committed({ accountId: 'account-network', inventoryChanged: false, workspaceChanged: true, snapshot: snapshot() }), true)
  await tick(); await tick()
  const state = coordinator.state().workspace.state()
  assert.match(state.error.message, /network down/)
  assert.deepEqual(state.pending.planTargets, { 'main-1': 20 })
})

test('an inventory-only business commit uses now when remote effective_at is missing and sends no workspace PUT', async function () {
  const inventoryBodies = []
  let workspacePuts = 0
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-effective-at' }), storage: memoryStorage(), now: () => '2026-09-15T00:00:00.000Z',
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putInventory: async (_account, body) => { inventoryBodies.push(body); return { revision: 2, entries: body.entries } },
    putWorkspace: async () => { workspacePuts += 1; return { revision: 2 } },
  })
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} }
  await coordinator.enter(handle)
  coordinator.committed({ accountId: 'account-effective-at', inventoryChanged: true, workspaceChanged: false, snapshot: snapshot() })
  await tick(); await tick()
  assert.equal(inventoryBodies.length, 1)
  assert.match(inventoryBodies[0].effective_at, /^2026-09-15T00:00:00\.000Z$/)
  assert.deepEqual(inventoryBodies[0].entries, [{ instance_id: 'main-1', kind: 'main', name: '天府', quality: 'orange', level: 10 }])
  assert.equal(workspacePuts, 0)
})

test('inventory effective_at is strictly after the remote floor and increases for consecutive writes', async function () {
  const inventoryBodies = []
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-remote-effective-at' }), storage: memoryStorage(), now: () => '2026-09-15T00:00:00.000Z',
    getInventory: async () => ({ revision: 7, effective_at: '2026-09-16T00:00:00.000Z', entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putInventory: async (_account, body) => { inventoryBodies.push(body); return { revision: 8 + inventoryBodies.length, entries: body.entries } },
  })
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} }
  await coordinator.enter(handle)
  coordinator.committed({ accountId: 'account-remote-effective-at', inventoryChanged: true, workspaceChanged: false, snapshot: snapshot() })
  await tick(); await tick()
  const nextSnapshot = snapshot(); nextSnapshot.inventory[0].level = 11
  coordinator.committed({ accountId: 'account-remote-effective-at', inventoryChanged: true, workspaceChanged: false, snapshot: nextSnapshot })
  await tick(); await tick()
  assert.equal(inventoryBodies.length, 2)
  assert.ok(Date.parse(inventoryBodies[0].effective_at) > Date.parse('2026-09-16T00:00:00.000Z'))
  assert.ok(Date.parse(inventoryBodies[1].effective_at) > Date.parse(inventoryBodies[0].effective_at))
})

test('a fresh both-domain ordered hold waits for workspace without requiring recovery', async function () {
  const workspaceGate = deferred(), writes = [], states = []
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-ordered' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async (_account, body) => {
      writes.push(['workspace', body.plan_targets])
      return await workspaceGate.promise
    },
    putInventory: async (_account, body) => {
      writes.push(['inventory', body.entries])
      return { revision: 2, entries: body.entries }
    },
    onState: state => states.push(state),
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  coordinator.committed({ accountId: 'account-ordered', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() })
  await tick()
  assert.deepEqual(writes, [['workspace', { 'main-1': 20 }]])
  assert.equal(states.at(-1).hasOrderedHold, true)
  assert.equal(states.at(-1).needsRetry, true)
  assert.equal(states.at(-1).recoveryRequired, false)
  workspaceGate.resolve({ revision: 2, plan_targets: { 'main-1': 20 }, bag: snapshot().bag, experience: snapshot().experience })
  await tick(); await tick()
  assert.deepEqual(writes.map(([domain]) => domain), ['workspace', 'inventory'])
})

test('a failed ordered workspace save retains its error and never sends inventory', async function () {
  let inventoryPuts = 0
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-ordered-failure' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async () => { throw new Error('workspace down') },
    putInventory: async () => { inventoryPuts += 1 },
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  coordinator.committed({ accountId: 'account-ordered-failure', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() })
  await tick(); await tick()
  assert.equal(inventoryPuts, 0)
  assert.match(coordinator.state().workspace.state().error.message, /workspace down/)
  assert.deepEqual(coordinator.state().workspace.state().pending.planTargets, { 'main-1': 20 })
})

test('a failed ordered hold prevents later inventory-only commits from bypassing workspace', async function () {
  const storage = memoryStorage()
  let inventoryPuts = 0
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-ordered-hold' }), storage,
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async () => { throw new Error('workspace down') },
    putInventory: async () => { inventoryPuts += 1 },
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  coordinator.committed({ accountId: 'account-ordered-hold', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() })
  await tick(); await tick()
  const latest = snapshot(); latest.inventory[0].level = 22; latest.planTargets = { 'main-1': 40 }
  coordinator.committed({ accountId: 'account-ordered-hold', inventoryChanged: true, workspaceChanged: false, snapshot: latest })
  await tick(); await tick()
  assert.equal(inventoryPuts, 0)
  assert.equal(coordinator.needsRetry(), true)
  const hold = JSON.parse(storage.getItem('yuanhub.star-cloud:account-ordered-hold:ordered'))
  assert.deepEqual({ inventory: hold.inventory, planTargets: hold.planTargets, bag: hold.bag, experience: hold.experience }, latest)
  assert.equal(typeof hold.lease, 'string')
})

test('an ordered hold survives localStorage failure in memory and retries after storage recovers', async function () {
  const stored = memoryStorage(), writes = []
  let storageUnavailable = false
  const storage = {
    getItem: stored.getItem,
    removeItem: stored.removeItem,
    setItem: function (key, value) {
      if (storageUnavailable) throw new Error('quota exceeded')
      stored.setItem(key, value)
    },
  }
  const states = []
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-storage-failure' }), storage,
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async (_account, body) => {
      writes.push('workspace')
      return { revision: 2, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience }
    },
    putInventory: async (_account, body) => {
      writes.push('inventory')
      return { revision: 2, entries: body.entries }
    },
    onState: state => states.push(state),
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  storageUnavailable = true

  assert.equal(coordinator.committed({ accountId: 'account-storage-failure', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() }), false)
  assert.deepEqual(writes, [])
  assert.equal(coordinator.needsRetry(), true)
  assert.match(states.at(-1).error.message, /quota exceeded/)
  assert.equal(states.at(-1).recoveryRequired, true)

  storageUnavailable = false
  await coordinator.retry()
  assert.deepEqual(writes, ['workspace', 'inventory'])
  assert.equal(states.at(-1).error, null)
  assert.equal(states.at(-1).recoveryRequired, false)
})

test('retry sends the newest ordered hold after a workspace failure', async function () {
  let workspaceAttempts = 0
  const writes = []
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-ordered-latest' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async (_account, body) => {
      writes.push(['workspace', body.plan_targets])
      workspaceAttempts += 1
      if (workspaceAttempts === 1) throw new Error('workspace down')
      return { revision: workspaceAttempts, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience }
    },
    putInventory: async (_account, body) => {
      writes.push(['inventory', body.entries[0].level])
      return { revision: 2, entries: body.entries }
    },
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  coordinator.committed({ accountId: 'account-ordered-latest', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() })
  await tick(); await tick()
  const latest = snapshot(); latest.inventory[0].level = 22; latest.planTargets = { 'main-1': 40 }
  coordinator.committed({ accountId: 'account-ordered-latest', inventoryChanged: true, workspaceChanged: false, snapshot: latest })
  await coordinator.retry()
  assert.deepEqual(writes.slice(-2), [['workspace', { 'main-1': 40 }], ['inventory', 22]])
})

test('a newer hold during Workspace A sends Workspace B before Inventory B', async function () {
  const workspaceGate = deferred(), writes = []
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-ordered-generation' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async (_account, body) => {
      writes.push(['workspace', body.plan_targets])
      if (writes.length === 1) return await workspaceGate.promise
      return { revision: 3, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience }
    },
    putInventory: async (_account, body) => {
      writes.push(['inventory', body.entries[0].level])
      return { revision: 2, entries: body.entries }
    },
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  const first = snapshot()
  const latest = snapshot(); latest.inventory[0].level = 22; latest.planTargets = { 'main-1': 40 }
  coordinator.committed({ accountId: 'account-ordered-generation', inventoryChanged: true, workspaceChanged: true, snapshot: first })
  await tick()
  coordinator.committed({ accountId: 'account-ordered-generation', inventoryChanged: true, workspaceChanged: true, snapshot: latest })
  workspaceGate.resolve({ revision: 2, plan_targets: first.planTargets, bag: first.bag, experience: first.experience })
  await tick(); await tick(); await tick()
  assert.deepEqual(writes, [
    ['workspace', { 'main-1': 20 }],
    ['workspace', { 'main-1': 40 }],
    ['inventory', 22],
  ])
})

test('a persisted ordered hold survives reload, retries in order, and clears after success', async function () {
  const storage = memoryStorage(), writes = []
  const states = []
  let workspaceAttempts = 0
  const options = {
    selectedHostAccount: () => ({ accountId: 'account-ordered-reload' }), storage,
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async (_account, body) => {
      writes.push('workspace')
      workspaceAttempts += 1
      if (workspaceAttempts === 1) throw new Error('workspace down')
      return { revision: 2, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience }
    },
    putInventory: async (_account, body) => {
      writes.push('inventory')
      return { revision: 2, entries: body.entries }
    },
    onState: state => states.push(state),
  }
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} }
  const original = createStarCloudCoordinator(options)
  await original.enter(handle)
  original.committed({ accountId: 'account-ordered-reload', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() })
  await tick(); await tick()
  assert.ok(storage.getItem('yuanhub.star-cloud:account-ordered-reload:ordered'))

  const reloaded = createStarCloudCoordinator(options)
  await reloaded.enter(handle)
  assert.equal(reloaded.needsRetry(), true)
  assert.equal(states.at(-1).hasOrderedHold, true)
  assert.equal(states.at(-1).needsRetry, true)
  assert.equal(states.at(-1).restoredHoldAwaitingRetry, true)
  assert.equal(states.at(-1).recoveryRequired, true)
  assert.deepEqual(writes, ['workspace'], 'enter must not silently retry the hold')
  await reloaded.retry()
  assert.deepEqual(writes, ['workspace', 'workspace', 'inventory'])
  assert.equal(storage.getItem('yuanhub.star-cloud:account-ordered-reload:ordered'), null)
  assert.equal(states.at(-1).recoveryRequired, false)
})

test('reloading during an ordered Workspace request cannot let the old session clear the hold', async function () {
  const storage = memoryStorage(), workspaceGate = deferred()
  let firstWorkspace = true
  const options = {
    selectedHostAccount: () => ({ accountId: 'account-ordered-inflight-reload' }), storage,
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async (_account, body) => {
      if (firstWorkspace) {
        firstWorkspace = false
        return await workspaceGate.promise
      }
      return { revision: 2, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience }
    },
    putInventory: async (_account, body) => ({ revision: 2, entries: body.entries }),
  }
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} }
  const original = createStarCloudCoordinator(options)
  await original.enter(handle)
  original.committed({ accountId: 'account-ordered-inflight-reload', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() })
  await tick()
  const reloaded = createStarCloudCoordinator(options)
  await reloaded.enter(handle)
  workspaceGate.resolve({ revision: 2, plan_targets: snapshot().planTargets, bag: snapshot().bag, experience: snapshot().experience })
  await tick(); await tick(); await tick()
  assert.equal(reloaded.needsRetry(), true)
  assert.ok(storage.getItem('yuanhub.star-cloud:account-ordered-inflight-reload:ordered'))
})

test('an account A ordered hold does not block account B', async function () {
  const storage = memoryStorage(), writes = []
  let accountId = 'account-a'
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId }), storage,
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async account => { if (account === 'account-a') throw new Error('workspace down'); return { revision: 2 } },
    putInventory: async (account, body) => { writes.push([account, body.entries[0].level]); return { revision: 2, entries: body.entries } },
  })
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} }
  await coordinator.enter(handle)
  coordinator.committed({ accountId: 'account-a', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() })
  await tick(); await tick()
  accountId = 'account-b'
  await coordinator.enter(handle)
  const b = snapshot(); b.inventory[0].level = 33
  coordinator.committed({ accountId: 'account-b', inventoryChanged: true, workspaceChanged: false, snapshot: b })
  await tick(); await tick()
  assert.deepEqual(writes, [['account-b', 33]])
  assert.ok(storage.getItem('yuanhub.star-cloud:account-a:ordered'))
  assert.equal(storage.getItem('yuanhub.star-cloud:account-b:ordered'), null)
})

test('retrying a failed ordered workspace save sends its held inventory draft only after workspace succeeds', async function () {
  let workspaceAttempts = 0, inventoryPuts = 0
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-ordered-retry' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async (_account, body) => {
      workspaceAttempts += 1
      if (workspaceAttempts === 1) throw new Error('workspace down')
      return { revision: 2, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience }
    },
    putInventory: async (_account, body) => {
      inventoryPuts += 1
      return { revision: 2, entries: body.entries }
    },
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  coordinator.committed({ accountId: 'account-ordered-retry', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() })
  await tick(); await tick()
  assert.equal(inventoryPuts, 0)
  await coordinator.retry()
  assert.equal(workspaceAttempts, 2)
  assert.equal(inventoryPuts, 1)
})

test('later commits coalesce behind an ordered commit instead of overtaking it', async function () {
  const workspaceGate = deferred(), writes = []
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-barrier' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async (_account, body) => {
      writes.push(['workspace', body.plan_targets])
      return await workspaceGate.promise
    },
    putInventory: async (_account, body) => {
      writes.push(['inventory', body.entries[0].level])
      return { revision: writes.filter(([domain]) => domain === 'inventory').length + 1, entries: body.entries }
    },
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  const first = snapshot()
  const second = snapshot(); second.inventory[0].level = 11
  coordinator.committed({ accountId: 'account-barrier', inventoryChanged: true, workspaceChanged: true, snapshot: first })
  coordinator.committed({ accountId: 'account-barrier', inventoryChanged: true, workspaceChanged: false, snapshot: second })
  await tick()
  assert.deepEqual(writes.map(([domain]) => domain), ['workspace'])
  workspaceGate.resolve({ revision: 2, plan_targets: first.planTargets, bag: first.bag, experience: first.experience })
  await tick(); await tick(); await tick()
  assert.deepEqual(writes, [
    ['workspace', { 'main-1': 20 }],
    ['inventory', 11],
  ])
})

test('an account switch cannot redirect an ordered session write to the new account', async function () {
  let accountId = 'account-a'
  const workspaceGate = deferred(), writes = []
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putWorkspace: async (account, body) => {
      writes.push(['workspace', account])
      return await workspaceGate.promise.then(() => ({ revision: 2, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience }))
    },
    putInventory: async (account, body) => {
      writes.push(['inventory', account])
      return { revision: 2, entries: body.entries }
    },
  })
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} }
  await coordinator.enter(handle)
  coordinator.committed({ accountId: 'account-a', inventoryChanged: true, workspaceChanged: true, snapshot: snapshot() })
  await tick()
  accountId = 'account-b'
  await coordinator.enter(handle)
  workspaceGate.resolve()
  await tick(); await tick(); await tick()
  assert.deepEqual(writes, [['workspace', 'account-a'], ['inventory', 'account-a']])
})

test('account switch keeps delayed writes bound to their original account and conflicts preserve pending state', async function () {
  let accountId = 'account-a', releaseA, writes = []
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putInventory: async (account, body) => { writes.push(account); if (account === 'account-a') return await new Promise(resolve => { releaseA = () => resolve({ revision: 2, entries: body.entries }) }); return { revision: 2, entries: body.entries } },
    putWorkspace: async (_account, body) => ({ revision: 2, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience }),
  })
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} }
  await coordinator.enter(handle)
  coordinator.committed({ accountId: 'account-a', inventoryChanged: true, workspaceChanged: false, snapshot: snapshot() })
  await tick()
  accountId = 'account-b'
  await coordinator.enter(handle)
  releaseA(); await tick(); await tick()
  assert.deepEqual(writes, ['account-a'], 'A write must never be redirected to B after switch')

  const conflict = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-c' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 1, entries: [] }), getWorkspace: async () => ({ revision: 1 }),
    putInventory: async (_account, body) => ({ revision: 2, entries: body.entries }),
    putWorkspace: async () => { throw Object.assign(new Error('conflict'), { status: 409 }) },
  })
  await conflict.enter(handle)
  conflict.committed({ accountId: 'account-c', inventoryChanged: false, workspaceChanged: true, snapshot: snapshot() })
  await tick(); await tick()
  assert.equal(conflict.state().workspace.state().error?.status, 409, 'CAS conflict must remain visible for explicit retry/discard')
})

test('replacement import sends one CAS request, adopts both revisions, and never uses normal PUTs', async function () {
  let inventoryPuts = 0, workspacePuts = 0, replacement = null
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-replace' }), storage: memoryStorage(), now: () => '2026-09-17T00:00:00.000Z',
    getInventory: async () => ({ revision: 7, entries: [{ instance_id: 'old', kind: 'main', name: '天府', quality: 'orange', level: 10 }] }),
    getWorkspace: async () => ({ revision: 9, plan_targets: { old: 20 }, bag: { current_count: 2, capacity: 20 }, experience: { orange: 1, purple: 2, white: 3 } }),
    putInventory: async () => { inventoryPuts += 1 }, putWorkspace: async () => { workspacePuts += 1 },
    replace: async body => {
      replacement = body
      return {
        inventory: { revision: 8, entries: body.inventory.entries },
        workspace: { revision: 10, plan_targets: body.workspace.plan_targets, bag: body.workspace.bag, experience: body.workspace.experience },
      }
    },
  })
  const handle = { getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} }
  await coordinator.enter(handle)
  const imported = { inventory: [{ starInstanceId: 'new-main', kind: '主星', name: '天府', quality: '橙', level: 33 }], planTargets: { 'new-main': 40 }, bag: { currentCount: 8, capacity: 88 }, experience: { orange: 5, purple: 4, white: 3 } }
  await coordinator.replaceImport(imported)
  assert.deepEqual(replacement, {
    account_id: 'account-replace',
    inventory: { expected_revision: 7, effective_at: '2026-09-17T00:00:00.000Z', entries: [{ instance_id: 'new-main', kind: 'main', name: '天府', quality: 'orange', level: 33 }] },
    workspace: { expected_revision: 9, plan_targets: { 'new-main': 40 }, bag: { current_count: 8, capacity: 88 }, experience: { orange: 5, purple: 4, white: 3 } },
  })
  assert.equal(inventoryPuts, 0)
  assert.equal(workspacePuts, 0)
  assert.equal(coordinator.state().inventory.state().revision, 8)
  assert.equal(coordinator.state().workspace.state().revision, 10)
})

test('replacement import preserves both writer bases when Backend rejects stale CAS', async function () {
  const coordinator = createStarCloudCoordinator({
    selectedHostAccount: () => ({ accountId: 'account-stale' }), storage: memoryStorage(),
    getInventory: async () => ({ revision: 3, entries: [] }), getWorkspace: async () => ({ revision: 4 }),
    replace: async () => { throw Object.assign(new Error('star_inventory_revision_conflict'), { status: 409 }) },
  })
  await coordinator.enter({ getCloudBusinessSnapshot: async () => snapshot(), applyCloudBusinessSnapshot: async () => {} })
  await assert.rejects(coordinator.replaceImport(snapshot()), error => error.status === 409)
  assert.equal(coordinator.state().inventory.state().revision, 3)
  assert.equal(coordinator.state().workspace.state().revision, 4)
})
