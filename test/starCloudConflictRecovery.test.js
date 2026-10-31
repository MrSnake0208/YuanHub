import test from 'node:test'
import assert from 'node:assert/strict'
import { createStarCloudCoordinator } from '../src/pages/star/starCloudCoordinator.js'

const clone = value => JSON.parse(JSON.stringify(value))
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const gate = () => { let resolve; return { promise: new Promise(done => { resolve = done }), resolve } }
const local = count => ({ inventory: [], planTargets: {}, experience: { orange: null, purple: null, white: null }, bag: { currentCount: count, capacity: 40 } })
const remote = (revision = 5, count = 1, generation = 2) => ({ generation, revision, inventory: [], plan_targets: {}, experience: local(count).experience, bag: { current_count: count, capacity: 40 } })

function fixture() {
  const values = new Map(), writes = [], applications = [], reads = []
  const f = { selected: 'a', remote: remote(), fail: null, read: null, apply: null }
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const handle = {
    snapshot: local(1),
    getCloudBusinessSnapshot: async () => clone(handle.snapshot),
    applyCloudBusinessSnapshot: async value => {
      applications.push(clone(value))
      if (f.apply) await f.apply(value)
      handle.snapshot = clone(value)
    },
  }
  const options = {
    selectedHostAccount: () => ({ accountId: f.selected }), storage,
    getState: async account => { reads.push(account); return clone(f.read ? await f.read(account) : f.remote) },
    patchState: async (account, body) => {
      writes.push({ account, body: clone(body) })
      if (f.fail) return f.fail(body)
      assert.equal(body.expected_generation, f.remote.generation)
      assert.equal(body.expected_revision, f.remote.revision)
      f.remote = { ...f.remote, inventory: body.inventory, plan_targets: body.plan_targets, bag: body.bag, experience: body.experience, revision: f.remote.revision + 1 }
      return { state: clone(f.remote) }
    },
  }
  Object.assign(f, { values, writes, applications, reads, storage, handle, options, c: createStarCloudCoordinator(options) })
  f.edit = async count => {
    handle.snapshot = local(count)
    assert.equal(f.c.committed({ accountId: f.selected, snapshot: handle.snapshot }), true)
    await tick()
  }
  f.key = 'yuanhub.star-state:a'
  f.backups = () => [...values.entries()].filter(([key]) => key.startsWith('yuanhub.star-state-backup:'))
  return f
}

test('persistent 409 survives retries/reload; explicit recovery backs up, hydrates and permits new CAS edits', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Object.assign(Error('conflict'), { status: 409 }) }
  await f.edit(2); f.remote = remote(6, 9)
  const pending = f.storage.getItem(f.key)
  assert.equal(await f.c.retry(), false)
  assert.equal(await f.c.retry(), false)
  assert.equal(f.writes.length, 1)
  assert.equal(f.storage.getItem(f.key), pending)
  f.c = createStarCloudCoordinator(f.options); await f.c.enter(f.handle)
  assert.equal(await f.c.retry(), false)
  f.storage.setItem('yuanhub.star-state:b', 'other-account')
  assert.equal(f.c.canReloadCloud(), true)
  assert.equal(await f.c.discardAndReload(), true)
  assert.equal(f.storage.getItem(f.key), null)
  assert.equal(f.storage.getItem('yuanhub.star-state:b'), 'other-account')
  assert.equal(f.handle.snapshot.bag.currentCount, 9)
  const backup = JSON.parse(f.backups()[0][1])
  assert.equal(backup.accountId, 'a'); assert.equal(backup.pendingRaw, pending)
  assert.equal(JSON.parse(backup.pendingRaw).pending.bag.currentCount, 2)
  assert.equal(f.c.needsRetry(), false)
  f.fail = null; await f.edit(10)
  assert.equal(f.writes.at(-1).body.expected_revision, 6)
  assert.equal(f.remote.bag.current_count, 10)
})

for (const committed of [true, false]) test(`internal lossless retry reconciles a lost PATCH after refresh without product hydration (committed=${committed})`, async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async body => {
    if (committed) f.remote = { ...remote(6, body.bag.current_count), bag: body.bag }
    throw new TypeError('timeout')
  }
  await f.edit(2)
  f.c = createStarCloudCoordinator(f.options); await f.c.enter(f.handle)
  f.fail = null
  assert.equal(await f.c.retry(), true)
  assert.equal(f.writes.length, committed ? 1 : 2)
  assert.equal(f.c.state().writer.state().base.bag.currentCount, 2)
  assert.equal(f.storage.getItem(f.key), null)
  await f.edit(3)
  assert.equal(f.writes.at(-1).body.expected_revision, 6)
  assert.equal(f.remote.bag.current_count, 3)
})

for (const changed of [true, false]) test(`unsent pending draft refresh recovery never rebases over another revision (${changed})`, async () => {
  const f = fixture()
  f.storage.setItem(f.key, JSON.stringify({ revision: 5, pending: { ...local(2), generation: 2, revision: 5 }, sent: null }))
  if (changed) f.remote = remote(6, 8)
  await f.c.enter(f.handle)
  assert.equal(await f.c.retry(), !changed)
  assert.equal(f.writes.length, changed ? 0 : 1)
  assert.equal(Boolean(f.storage.getItem(f.key)), changed)
  if (!changed) assert.equal(f.c.state().writer.state().base.bag.currentCount, 2)
})

test('later local commits remain pending behind a failed request, including after refresh', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }
  await f.edit(2); await f.edit(3)
  const saved = JSON.parse(f.storage.getItem(f.key))
  assert.equal(saved.sent.bag.currentCount, 2)
  assert.equal(saved.pending.bag.currentCount, 3)
  f.c = createStarCloudCoordinator(f.options); await f.c.enter(f.handle); f.fail = null
  assert.equal(await f.c.retry(), true)
  assert.equal(f.remote.bag.current_count, 3)
  assert.equal(f.c.state().writer.state().base.bag.currentCount, 3)
})

for (const failure of ['read', 'malformed', 'stale', 'backup', 'hydrate', 'mismatch']) test(`failed recovery (${failure}) retains the exact pending record and can be retried`, async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const pending = f.storage.getItem(f.key), setItem = f.storage.setItem, getSnapshot = f.handle.getCloudBusinessSnapshot
  f.remote = remote(6, 8)
  if (failure === 'read') f.read = async () => { throw Error('offline') }
  if (failure === 'malformed') f.read = async () => ({ generation: 2, revision: 6 })
  if (failure === 'stale') f.remote = remote(4, 8)
  if (failure === 'backup') f.storage.setItem = (key, value) => { if (key.includes('backup:')) throw Error('quota'); setItem(key, value) }
  if (failure === 'hydrate') f.apply = async () => { throw Error('IDB failure') }
  if (failure === 'mismatch') f.handle.getCloudBusinessSnapshot = async () => local(99)
  assert.equal(await f.c.discardAndReload(), false)
  assert.equal(f.storage.getItem(f.key), pending)
  assert.equal(f.c.needsRetry(), true)
  if (['read', 'malformed', 'stale', 'backup'].includes(failure)) assert.equal(f.applications.length, 1, 'do not replace the view before a verified backup')
  f.read = null; f.remote = remote(6, 8); f.storage.setItem = setItem; f.apply = null; f.handle.getCloudBusinessSnapshot = getSnapshot
  assert.equal(await f.c.discardAndReload(), true)
  assert.equal(f.handle.snapshot.bag.currentCount, 8)
})

for (const prefix of ['yuanhub.star-rebuild-pending:', 'yuanhub.star-plan-pending:']) test(`ordinary recovery cannot clear or bypass ${prefix}`, async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const pending = f.storage.getItem(f.key)
  f.storage.setItem(prefix + 'a', 'separate-intent')
  assert.equal(f.c.canReloadCloud(), false)
  assert.equal(await f.c.discardAndReload(), false)
  assert.equal(await f.c.retry(), false)
  assert.equal(f.storage.getItem(prefix + 'a'), 'separate-intent')
  assert.equal(f.storage.getItem(f.key), pending)
})

for (const operation of ['retry', 'discardAndReload']) test(`${operation} read late after account switch cannot clear A or affect B`, async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const pending = f.storage.getItem(f.key), read = gate()
  f.read = () => read.promise
  const outcome = f.c[operation](); await tick()
  f.selected = 'b'; f.read = null; f.remote = remote(10, 10, 4)
  await f.c.enter(f.handle)
  const applications = f.applications.length
  read.resolve(remote(6, 9))
  assert.equal(await outcome, false)
  assert.equal(f.storage.getItem(f.key), pending)
  assert.equal(f.applications.length, applications)
  assert.equal(f.c.state().accountId, 'b')
  assert.equal(f.c.state().writer.state().revision, 10)
  assert.equal(f.backups().length, 0)
})

test('stopped/re-entered writer cannot drain its queued old snapshot after a late PATCH', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  const response = gate()
  f.fail = () => response.promise
  await f.edit(2); await f.edit(3)
  await f.c.enter(f.handle)
  const pending = f.storage.getItem(f.key)
  response.resolve({ state: remote(6, 2) }); await tick()
  assert.equal(f.writes.length, 1)
  assert.equal(f.storage.getItem(f.key), pending)
  f.remote = remote(6, 2); f.fail = null
  assert.equal(await f.c.retry(), true)
  assert.equal(f.remote.bag.current_count, 3)
})

test('another tab changing a durable draft during recovery is never erased', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const read = gate(); f.read = () => read.promise
  const outcome = f.c.discardAndReload(); await tick()
  const newer = JSON.stringify({ pending: { ...local(4), generation: 2, revision: 5 }, sent: null, revision: 5 })
  f.storage.setItem(f.key, newer); read.resolve(remote(6, 8))
  assert.equal(await outcome, false)
  assert.equal(f.storage.getItem(f.key), newer)
  assert.equal(f.backups().length, 0)
  assert.equal(f.applications.length, 1)
})

test('command intent created during recovery prevents hydration and remains independent', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const read = gate(); f.read = () => read.promise
  const outcome = f.c.discardAndReload(); await tick()
  f.storage.setItem('yuanhub.star-rebuild-pending:a', 'new-command'); read.resolve(remote(6, 8))
  assert.equal(await outcome, false)
  assert.ok(f.storage.getItem(f.key))
  assert.equal(f.storage.getItem('yuanhub.star-rebuild-pending:a'), 'new-command')
  assert.equal(f.applications.length, 1)
})

test('hydration/no-op commit after OCR rebuild does not create an ordinary PATCH', async () => {
  const f = fixture()
  f.options.rebuildState = async () => ({ state: remote(6, 1, 3) })
  f.c = createStarCloudCoordinator(f.options); await f.c.enter(f.handle)
  await f.c.rebuildOcr(local(1), 'recovery-point')
  await f.edit(1)
  assert.equal(f.writes.length, 0)
})

for (const legacy of [true, false]) test(`restored generation fence refuses a different generation even at equal revision (legacy=${legacy})`, async () => {
  const f = fixture(), draft = { ...local(2), generation: 2, revision: 5 }
  f.storage.setItem(f.key, JSON.stringify({ pending: draft, sent: draft, revision: 5,
    ...(!legacy ? { base: { ...local(1), generation: 2, revision: 5 } } : {}) }))
  f.remote = remote(5, 8, 3)
  await f.c.enter(f.handle)
  assert.equal(await f.c.retry(), false)
  assert.equal(f.writes.length, 0)
  assert.ok(f.storage.getItem(f.key))
})

test('a superseded coordinator refuses local callbacks and commands before any rebuild POST', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  const next = createStarCloudCoordinator({ ...f.options, rebuildState: () => assert.fail('must not rebuild') })
  await next.enter(f.handle)
  assert.equal(f.c.committed({ accountId: 'a', snapshot: local(2) }), false)
  await assert.rejects(f.c.rebuildOcr(local(2), 'point'), /未完成/)
  assert.equal(f.writes.length, 0)
})

test('ordinary PATCH cannot start behind an outstanding OCR rebuild from another page', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.storage.setItem('yuanhub.star-rebuild-pending:a', 'other-page-intent')
  await f.edit(2)
  assert.equal(f.writes.length, 0)
  assert.ok(f.storage.getItem(f.key))
  assert.equal(f.c.canReloadCloud(), false)
})

test('leaving during hydration retains pending and its backup for the original account', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const pending = f.storage.getItem(f.key), hydrate = gate()
  f.remote = remote(6, 8); f.apply = () => hydrate.promise
  const outcome = f.c.discardAndReload(); await tick()
  assert.equal(f.backups().length, 1)
  f.c.leave(); hydrate.resolve()
  assert.equal(await outcome, false)
  assert.equal(f.storage.getItem(f.key), pending)
})

test('local commit arriving during internal retry GET is queued in the saved base', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const read = gate(); f.read = () => read.promise; f.fail = null
  const outcome = f.c.retry(); await tick()
  await f.edit(3)
  assert.equal(JSON.parse(f.storage.getItem(f.key)).pending.bag.currentCount, 3)
  read.resolve(remote())
  assert.equal(await outcome, true)
  assert.equal(f.remote.bag.current_count, 3)
  assert.equal(f.c.state().writer.state().base.bag.currentCount, 3)
})

for (const phase of ['read', 'hydrate']) test(`concurrent local commit during recovery ${phase} is retained, never PATCHed or cleared`, async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const blocked = gate(); f.remote = remote(6, 8)
  if (phase === 'read') f.read = () => blocked.promise
  else f.apply = () => blocked.promise
  const outcome = f.c.discardAndReload(); await tick()
  await f.edit(3)
  const latestPending = f.storage.getItem(f.key)
  assert.equal(JSON.parse(latestPending).pending.bag.currentCount, 3)
  blocked.resolve(f.remote)
  assert.equal(await outcome, false)
  assert.equal(f.storage.getItem(f.key), latestPending)
  assert.equal(f.writes.length, 1)
  f.read = null; f.apply = null
  assert.equal(await f.c.discardAndReload(), true)
  assert.equal(f.handle.snapshot.bag.currentCount, 8)
  assert.equal(f.writes.length, 1)
})

for (const committed of [true, false]) test(`visible recovery after lost PATCH only adopts cloud and never resends (committed=${committed})`, async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async body => {
    if (committed) f.remote = remote(6, body.bag.current_count)
    throw Error('response lost')
  }
  await f.edit(2)
  f.c = createStarCloudCoordinator(f.options); await f.c.enter(f.handle)
  const expected = clone(f.remote), writes = f.writes.length
  assert.equal(await f.c.discardAndReload(), true)
  assert.equal(f.writes.length, writes)
  assert.equal(f.handle.snapshot.bag.currentCount, expected.bag.current_count)
  assert.equal(f.storage.getItem(f.key), null)
  f.fail = null; await f.edit(3)
  assert.equal(f.writes.at(-1).body.expected_revision, expected.revision)
})

test('read-only reload never initializes cloud from local state or clears ordinary pending', async () => {
  const f = fixture(); f.remote = remote(0, null, 0)
  const draft = { ...local(2), generation: 0, revision: 0 }
  const pending = JSON.stringify({ pending: draft, sent: null, revision: 0 })
  f.storage.setItem(f.key, pending)
  assert.equal(await f.c.enter(f.handle, { readOnly: true }), true)
  await tick()
  assert.equal(f.storage.getItem(f.key), pending)
  assert.equal(f.writes.length, 0)
})

test('duplicate recovery clicks cannot create another read or erase pending early', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const blocked = gate(), reads = f.reads.length
  f.read = () => blocked.promise
  const first = f.c.discardAndReload(); await tick()
  assert.equal(await f.c.discardAndReload(), false)
  assert.equal(f.reads.length, reads + 1)
  assert.ok(f.storage.getItem(f.key))
  blocked.resolve(remote(6, 8))
  assert.equal(await first, true)
  assert.equal(f.writes.length, 1)
})

test('identity guard becoming stale during recovery keeps the original record', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  f.fail = async () => { throw Error('offline') }; await f.edit(2)
  const pending = f.storage.getItem(f.key), blocked = gate()
  let valid = true
  f.read = () => blocked.promise
  const outcome = f.c.discardAndReload({ isCurrent: () => valid }); await tick()
  valid = false; blocked.resolve(remote(6, 8))
  assert.equal(await outcome, false)
  assert.equal(f.storage.getItem(f.key), pending)
  assert.equal(f.backups().length, 0)
})


test('read-only reload with no pending retains local data and reports reading rather than saving', async () => {
  const f = fixture(); f.remote = remote(0, null, 0)
  assert.equal(await f.c.enter(f.handle, { readOnly: true }), true)
  await tick()
  assert.equal(f.writes.length, 0)
  assert.equal(f.storage.getItem(f.key), null)
  assert.equal(f.handle.snapshot.bag.currentCount, 1)
  assert.equal(f.c.state().readOnlyReload, true)
})

test('stale identity during read-only command verification cannot hydrate or clear its marker', async () => {
  const f = fixture(), blocked = gate()
  const markerKey = 'yuanhub.star-rebuild-pending:a', marker = JSON.stringify({ ...local(9), generation: 3, revision: 6 })
  f.storage.setItem(markerKey, marker)
  f.read = () => blocked.promise
  let valid = true
  const outcome = f.c.enter(f.handle, { readOnly: true, isCurrent: () => valid })
  valid = false; blocked.resolve(remote(6, 9, 3))
  assert.equal(await outcome, false)
  assert.equal(f.storage.getItem(markerKey), marker)
  assert.equal(f.applications.length, 0)
  assert.equal(f.writes.length, 0)
})

test('an in-memory pending draft whose storage write failed is included in the recovery backup', async () => {
  const f = fixture(); await f.c.enter(f.handle)
  const setItem = f.storage.setItem
  f.storage.setItem = (key, value) => { if (key === f.key) throw Error('quota'); setItem(key, value) }
  await f.edit(2)
  assert.equal(f.storage.getItem(f.key), null)
  assert.equal(f.writes.length, 0)
  f.storage.setItem = setItem
  assert.equal(await f.c.discardAndReload(), true)
  const backup = JSON.parse(f.backups()[0][1])
  assert.equal(backup.pending.bag.currentCount, 2)
  assert.equal(backup.pendingRaw, null)
  assert.equal(f.handle.snapshot.bag.currentCount, 1)
})
