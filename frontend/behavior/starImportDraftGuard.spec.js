import { IDBFactory } from 'fake-indexeddb'
import { expect, it } from 'vitest'
import { assertNoStarImportDraft } from '../src/pages/star/starImportDraftGuard.js'

async function databaseWithDraft(accountId) {
  const indexedDb = new IDBFactory()
  const db = await new Promise(resolve => {
    const request = indexedDb.open('yuanstar-static', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('importDrafts')
    request.onsuccess = () => resolve(request.result)
  })
  await new Promise(resolve => {
    const tx = db.transaction('importDrafts', 'readwrite')
    tx.objectStore('importDrafts').put({ accountId, imageOrder: ['manual-image'] }, accountId)
    tx.oncomplete = resolve
  })
  db.close()
  return indexedDb
}
it('pending manual screenshot UI blocks import before any database access', async () => {
  const root = document.createElement('div')
  root.innerHTML = '<div data-import-image="manual-image"></div>'
  await expect(assertNoStarImportDraft('a', root, null)).rejects.toThrow('待识别截图')
})
it('a persisted same-account draft blocks import and is left intact', async () => {
  const db = await databaseWithDraft('a')
  await expect(assertNoStarImportDraft('a', null, db)).rejects.toThrow('本机截图草稿')
  await expect(assertNoStarImportDraft('a', null, db)).rejects.toThrow('本机截图草稿')
})
it('another account draft is preserved without blocking the selected account', async () => {
  const db = await databaseWithDraft('b')
  await expect(assertNoStarImportDraft('a', null, db)).resolves.toBeUndefined()
  await expect(assertNoStarImportDraft('b', null, db)).rejects.toThrow('本机截图草稿')
})
it('an absent local database does not create a writable workspace', async () => {
  const db = new IDBFactory()
  await expect(assertNoStarImportDraft('a', null, db)).resolves.toBeUndefined()
  expect(await db.databases()).toEqual([])
})
