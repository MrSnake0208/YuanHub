import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { rollbackRejectedStarPlanIntent } from '../src/pages/star/starPlanIntentRecovery.js'
import { seedStarDatabase, starRecords, dumpStarDatabase, legacyId } from '../test-support/starIndexedDb.js'

const key = 'product.pendingPlanInheritance:' + legacyId
const snapshot = { inventory: [{ starInstanceId: 'new' }], planTargets: { new: 60 } }
const scope = { generation: 2, revision: 5 }
const marker = operation => ({ accountId: legacyId, taskId: 'review-task', sourceRestorePointId: 'restore-1',
  phase: operation === 'ocr' ? 'prepared' : 'pending', rebuildRevision: 12,
  cloudGeneration: operation === 'ocr' ? 3 : 2, inventoryIds: ['new'],
  ...(operation === 'plan' ? { confirmation: { planTargets: { new: 60 }, growthRouteOrder: ['new'], cloudRevision: 6 } } : {}) })
async function fixture(pending) {
  const records = starRecords()
  records.meta.push([key, pending], ['product.pendingPlanInheritance:other-account', { ...pending, accountId: 'other-account' }])
  return seedStarDatabase(records)
}
const rollback = (operation, indexedDb) => rollbackRejectedStarPlanIntent({ operation, accountId: legacyId,
  recoveryPointId: 'restore-1', snapshot, scope }, indexedDb)

for (const operation of ['ocr', 'plan']) {
  test(`${operation}: rollback changes only the matched marker, preserving every other store and account`, async () => {
    const indexedDb = await fixture(marker(operation)), expected = await dumpStarDatabase(indexedDb)
    if (operation === 'ocr') expected.meta = expected.meta.filter(([name]) => name !== key)
    else delete expected.meta.find(([name]) => name === key)[1].confirmation
    assert.equal(await rollback(operation, indexedDb), true)
    assert.deepEqual(await dumpStarDatabase(indexedDb), expected)
    assert.equal(await rollback(operation, indexedDb), false, 'repeated recovery is inert')
  })

  test(`${operation}: mismatched or newer command markers stay intact`, async () => {
    const changes = [{ accountId: 'other-account' }, { phase: 'different' }, { cloudGeneration: 99 },
      ...(operation === 'ocr'
        ? [{ sourceRestorePointId: 'newer-source' }, { inventoryIds: ['different'] }, { confirmation: { cloudRevision: 6 } }]
        : [{ confirmation: { planTargets: { new: 50 }, cloudRevision: 6 } }, { confirmation: { planTargets: { new: 60 }, cloudRevision: 7 } }])]
    for (const change of changes) {
      const indexedDb = await fixture({ ...marker(operation), ...change }), before = await dumpStarDatabase(indexedDb)
      assert.equal(await rollback(operation, indexedDb), false)
      assert.deepEqual(await dumpStarDatabase(indexedDb), before)
    }
  })

  test(`${operation}: concurrent recovery releases a matching marker only once`, async () => {
    const indexedDb = await fixture(marker(operation))
    assert.deepEqual((await Promise.all([rollback(operation, indexedDb), rollback(operation, indexedDb)])).sort(), [false, true])
  })
}

test('probing an absent database does not create one', async () => {
  const indexedDb = new IDBFactory()
  assert.equal(await rollback('ocr', indexedDb), false)
  assert.deepEqual(await indexedDb.databases(), [])
})

test('an aborted rollback preserves the complete database', async () => {
  const indexedDb = await fixture(marker('plan')), before = await dumpStarDatabase(indexedDb)
  const open = indexedDb.open.bind(indexedDb)
  indexedDb.open = (...args) => {
    const request = open(...args)
    request.addEventListener('success', () => {
      const database = request.result, transact = database.transaction.bind(database)
      database.transaction = (...args) => { const tx = transact(...args); queueMicrotask(() => tx.abort()); return tx }
    }, {once:true})
    return request
  }
  await assert.rejects(rollback('plan', indexedDb), /无法回退/)
  indexedDb.open = open
  assert.deepEqual(await dumpStarDatabase(indexedDb), before)
})
