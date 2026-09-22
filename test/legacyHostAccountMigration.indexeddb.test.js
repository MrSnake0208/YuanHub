import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { migrateLegacyYuanStarHostAccount } from '../src/pages/star/legacyHostAccountMigration.js'
import { CURRENT_ACCOUNT, STAR_STORES, hostAccount, legacyId, starRecords, seedStarDatabase, dumpStarDatabase } from '../test-support/starIndexedDb.js'

// The bypass exists only in this test harness: it demonstrates the original
// missing-migration regression without changing production/worktree files.
const migrate = process.env.YUANHUB_TEST_BYPASS_MIGRATION === '1'
  ? async () => false : migrateLegacyYuanStarHostAccount
const byId = rows => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

function expectedMigration(before) {
  const result = structuredClone(before)
  for (const [store, rows] of Object.entries(result)) {
    if (store === 'meta') {
      for (const row of rows) if (row[0] === CURRENT_ACCOUNT && row[1] === legacyId) row[1] = hostAccount.accountId
      continue
    }
    for (const row of rows) {
      if (row.accountId !== legacyId) continue
      row.accountId = hostAccount.accountId
      if (row.snapshot?.accountId === legacyId) row.snapshot.accountId = hostAccount.accountId
      if (store === 'accounts' || store === 'workspaces') delete row.updatedAt
    }
  }
  return result
}
function comparableAfter(after) {
  const result = structuredClone(after)
  for (const name of ['accounts', 'workspaces']) {
    for (const row of result[name]) {
      if (row.accountId !== hostAccount.accountId) continue
      assert.ok(Number.isFinite(Date.parse(row.updatedAt)), 'migrated rows have an ISO update time')
      delete row.updatedAt
    }
  }
  return result
}
async function assertNoChange(records, host = hostAccount) {
  const db = await seedStarDatabase(records)
  const before = await dumpStarDatabase(db)
  assert.equal(await migrate(host, db), false)
  assert.deepEqual(await dumpStarDatabase(db), before)
}

test('IndexedDB regression: migration preserves every business field and binary asset under canonical identity', async () => {
  const db = await seedStarDatabase()
  const before = await dumpStarDatabase(db)
  // Same condition used by YuanStar account uniqueness validation: this is the
  // real persisted legacy record that conflicted with setHostAccount, not a CSS/source match.
  assert.ok(before.accounts.some(a => a.accountId !== hostAccount.accountId && a.displayName === hostAccount.displayName && a.gameVersion === hostAccount.gameVersion))
  assert.equal(await migrate(hostAccount, db), true)
  const after = await dumpStarDatabase(db)
  const expected = expectedMigration(before)
  const actual = comparableAfter(after)
  for (const store of Object.keys(STAR_STORES)) assert.deepEqual(byId(actual[store]), byId(expected[store]), store)
  assert.ok(!after.accounts.some(a => a.accountId === legacyId))
  assert.equal(after.accounts.filter(a => a.displayName === hostAccount.displayName && a.gameVersion === hostAccount.gameVersion).length, 1)
  for (const store of ['workspaces', 'images', 'restorePoints', 'restorePointImages']) {
    assert.ok(!after[store].some(row => row.accountId === legacyId), `${store}: legacy compound keys removed`)
    assert.equal(after[store].filter(row => row.accountId === hostAccount.accountId).length, 1)
  }
})

test('IndexedDB migration is idempotent including timestamps and image bytes', async () => {
  const db = await seedStarDatabase()
  assert.equal(await migrate(hostAccount, db), true)
  const once = await dumpStarDatabase(db)
  assert.equal(await migrate(hostAccount, db), false)
  assert.deepEqual(await dumpStarDatabase(db), once)
})

test('concurrent migration calls have one winner and never reapply a stale workspace', async () => {
  const db = await seedStarDatabase()
  const outcomes = await Promise.all([migrate(hostAccount, db), migrate(hostAccount, db)])
  assert.deepEqual(outcomes.sort(), [false, true])
  const final = await dumpStarDatabase(db)
  assert.equal(final.accounts.filter(a => a.accountId === hostAccount.accountId).length, 1)
  assert.equal(final.workspaces.find(a => a.accountId === hostAccount.accountId).snapshot.revision, 12)
})

test('existing canonical account and workspace are never overwritten or merged', async () => {
  const records = starRecords()
  records.accounts.push({ ...hostAccount, updatedAt: '2026-09-20T00:00:00Z', protected: true })
  records.workspaces.push({ accountId: hostAccount.accountId, snapshot: { accountId: hostAccount.accountId, revision: 987, inventory: ['canonical business data'] } })
  records.images.push({ accountId: hostAccount.accountId, imageId: 'image-1', blob: new Blob(['canonical bytes']) })
  await assertNoChange(records)
})

test('canonical account without a workspace still prevents an unsafe guessed merge', async () => {
  const records = starRecords()
  records.accounts.push({ ...hostAccount })
  await assertNoChange(records)
})

test('orphan target workspace prevents overwrite even without a canonical account', async () => {
  const records = starRecords()
  records.workspaces.push({ accountId: hostAccount.accountId, snapshot: { accountId: hostAccount.accountId, revision: 99 } })
  await assertNoChange(records)
})

test('ambiguous legacy matches leave all stores untouched', async () => {
  const records = starRecords()
  records.accounts.push({ ...records.accounts[0], accountId: 'legacy-second' })
  await assertNoChange(records)
})

test('same name in another game is not the legacy account', async () => {
  const records = starRecords()
  records.accounts[0].gameVersion = '代号鸢'
  await assertNoChange(records)
})

test('missing legacy workspace does not delete accounts or assets', async () => {
  const records = starRecords()
  records.workspaces = records.workspaces.filter(row => row.accountId !== legacyId)
  await assertNoChange(records)
})

test('currentAccountId belonging to a different account is preserved', async () => {
  const records = starRecords()
  records.meta[0][1] = 'other-account'
  const db = await seedStarDatabase(records)
  assert.equal(await migrate(hostAccount, db), true)
  assert.equal((await dumpStarDatabase(db)).meta.find(row => row[0] === CURRENT_ACCOUNT)[1], 'other-account')
})

test('no old database means no database is opened or created', async t => {
  const db = new IDBFactory()
  const open = t.mock.method(db, 'open')
  assert.equal(await migrate(hostAccount, db), false)
  assert.equal(open.mock.callCount(), 0)
  assert.deepEqual(await db.databases(), [])
})

test('probing browsers without databases() does not create an empty database', async () => {
  const db = new IDBFactory()
  assert.equal(await migrate(hostAccount, { open: db.open.bind(db) }), false)
  assert.deepEqual(await db.databases(), [])
})

test('unsupported database schema is not upgraded or modified', async () => {
  const db = await seedStarDatabase({ meta: [['sentinel', 'keep']] }, { meta: null })
  const before = await dumpStarDatabase(db)
  assert.equal(await migrate(hostAccount, db), false)
  assert.deepEqual(await dumpStarDatabase(db), before)
})

test('invalid host identity is rejected before touching IndexedDB', async t => {
  const db = new IDBFactory()
  const open = t.mock.method(db, 'open')
  for (const host of [null, {}, { ...hostAccount, accountId: '' }, { ...hostAccount, displayName: '  ' }, { ...hostAccount, gameVersion: '' }]) {
    assert.equal(await migrate(host, db), false)
  }
  assert.equal(open.mock.callCount(), 0)
})

test('a storage transaction abort rolls back all six stores together', async t => {
  const db = await seedStarDatabase()
  const before = await dumpStarDatabase(db)
  const put = IDBObjectStore.prototype.put
  const spy = t.mock.method(IDBObjectStore.prototype, 'put', function (...args) {
    const request = put.apply(this, args)
    if (this.name === 'workspaces') request.addEventListener('success', () => this.transaction.abort(), { once: true })
    return request
  })
  await assert.rejects(migrate(hostAccount, db))
  spy.mock.restore()
  assert.deepEqual(await dumpStarDatabase(db), before)
})

test('unavailable IndexedDB is a side-effect-free no-op', async () => {
  assert.equal(await migrate(hostAccount, null), false)
})

for (const store of ['images', 'restorePoints', 'restorePointImages']) {
  test(`orphan target assets in ${store} cannot be overwritten by legacy data`, async () => {
    const records = starRecords()
    const protectedRow = { ...records[store][0], accountId: hostAccount.accountId, protectedPayload: 'canonical archive must survive' }
    if (protectedRow.blob) protectedRow.blob = new Blob(['irreplaceable canonical bytes'], { type: 'image/png' })
    if (protectedRow.snapshot) protectedRow.snapshot = { ...protectedRow.snapshot, accountId: hostAccount.accountId, revision: 987 }
    records[store].push(protectedRow)
    await assertNoChange(records)
  })
}
