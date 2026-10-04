import { test } from 'node:test'
import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { IDBFactory } from 'fake-indexeddb'
import { isStarCaptureDraftPersisted } from '../src/pages/star/captureDraftReceipt.js'
import { loadAndImportStarCapture } from '../src/pages/star/captureTransport.js'
import { createStarCaptureLifecycle, importAndMarkStarCapture } from '../src/pages/star/starCaptureLifecycle.js'
import { dumpStarDatabase, seedStarDatabase, STAR_STORES } from '../test-support/starIndexedDb.js'

const stores = { ...STAR_STORES, importDrafts: 'accountId', importDraftImages: ['accountId', 'sourceImageId'] }

function fixture() {
  const images = ['main', 'support', 'experience'].map((section, index) => ({
    sourceImageId: section + '-1', sourceOrder: index + 1,
    file: new File([section], section + '.png', { type: 'image/png', lastModified: 123 }),
  }))
  const batch = {
    captureId: 'capture-a', source: 'maayuan', gameVersion: '如鸢',
    sections: Object.fromEntries(['main', 'support', 'experience'].map((section, index) => [section, { images: [images[index]] }])),
  }
  const draft = {
    accountId: 'A', schemaVersion: 1, transport: { source: 'maayuan', captureId: 'capture-a' },
    imageOrder: images.map(image => image.sourceImageId),
    images: images.map(image => ({ sourceImageId: image.sourceImageId, filename: image.file.name, size: image.file.size })),
  }
  const records = {
    meta: [['product.currentAccountId', 'A']], importDrafts: [draft],
    importDraftImages: images.map(image => ({ accountId: 'A', sourceImageId: image.sourceImageId, blob: image.file,
      filename: image.file.name, mimeType: image.file.type, lastModified: image.file.lastModified })),
  }
  return { batch, records, draft }
}

test('receipt requires metadata and every persisted image in global order, without writing', async () => {
  const { batch, records } = fixture()
  const indexedDb = await seedStarDatabase(records, stores)
  const before = await dumpStarDatabase(indexedDb)
  assert.equal(await isStarCaptureDraftPersisted('A', batch, indexedDb), true)
  assert.equal(await isStarCaptureDraftPersisted('A', { captureId: batch.captureId }, indexedDb), true)
  assert.deepEqual(await dumpStarDatabase(indexedDb), before)
})

test('an absent database or pre-Draft schema is never created or upgraded by the receipt', async () => {
  const { batch } = fixture()
  const empty = new IDBFactory()
  assert.equal(await isStarCaptureDraftPersisted('A', batch, empty), false)
  assert.deepEqual(await empty.databases(), [])
  const old = await seedStarDatabase({ meta: [['product.currentAccountId', 'A']] })
  const before = await dumpStarDatabase(old)
  assert.equal(await isStarCaptureDraftPersisted('A', batch, old), false)
  assert.deepEqual(await dumpStarDatabase(old), before)
})

const invalidReceipts = [
  ['foreign account', ({ draft }) => { draft.accountId = 'B' }],
  ['replaced capture', ({ draft }) => { draft.transport.captureId = 'capture-b' }],
  ['manual Draft', ({ draft }) => { draft.transport = null }],
  ['unsupported schema', ({ draft }) => { draft.schemaVersion = 2 }],
  ['reordered images', ({ draft }) => { draft.imageOrder.reverse() }],
  ['missing Blob', ({ records }) => { records.importDraftImages.pop() }],
  ['incorrect Blob bytes length', ({ records }) => { records.importDraftImages[0].blob = new Blob(['bad'], { type: 'image/png' }) }],
  ['incorrect filename', ({ records }) => { records.importDraftImages[0].filename = 'other.png' }],
  ['incorrect MIME', ({ records }) => { records.importDraftImages[0].mimeType = 'image/jpeg' }],
  ['incorrect file metadata', ({ records }) => { records.importDraftImages[0].lastModified += 1 }],
]
for (const [name, alter] of invalidReceipts) {
  test('receipt rejects ' + name, async () => {
    const data = fixture()
    alter(data)
    const indexedDb = await seedStarDatabase(data.records, stores)
    assert.equal(await isStarCaptureDraftPersisted('A', data.batch, indexedDb), false)
  })
}

test('another tab changing the default account cannot invalidate the current host account Draft', async () => {
  const { batch, records } = fixture()
  records.meta[0][1] = 'B'
  const indexedDb = await seedStarDatabase(records, stores)
  assert.equal(await isStarCaptureDraftPersisted('A', batch, indexedDb), true)
  assert.equal(await isStarCaptureDraftPersisted('B', batch, indexedDb), false)
})

test('storage open failures propagate instead of becoming an accepted receipt', async () => {
  const error = new Error('storage denied')
  const { batch } = fixture()
  await assert.rejects(isStarCaptureDraftPersisted('A', batch, { open() { throw error } }), result => result === error)
})

test('an unpersisted legacy import leaves lifecycle recoverable and never consumes', async () => {
  const { batch } = fixture()
  const indexedDb = new IDBFactory()
  const values = new Map()
  const lifecycle = createStarCaptureLifecycle({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) })
  const current = { accountId: 'A', captureId: batch.captureId, batch }
  let imports = 0
  let consumes = 0
  // loadAndImport uses the browser's IndexedDB boundary. Restore it even if the assertion fails.
  const previous = globalThis.indexedDB
  globalThis.indexedDB = indexedDb
  try {
    await assert.rejects(importAndMarkStarCapture({
      lifecycle, accountId: 'A', captureId: batch.captureId, isCurrent: () => true,
      importCapture: () => loadAndImportStarCapture({ consume() { consumes += 1 } }, current,
        { importCaptureBatch() { imports += 1 } }, () => {}, () => true),
    }), { code: 'star_capture_import_superseded' })
    assert.equal(imports, 1)
    assert.equal(consumes, 0)
    assert.equal(lifecycle.get('A'), null)
    assert.equal(lifecycle.captureAction('A', batch.captureId), 'import')
    assert.equal(current.batch, batch)
  } finally {
    if (previous === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = previous
  }
})
