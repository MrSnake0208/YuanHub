import { openExistingYuanStarDatabase } from './legacyHostAccountMigration.js'

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法读取待识别图片的持久化状态。'))
  })
}

// Compatibility for the vendored embed's undefined verdict. This is a read-only
// receipt for its schema-v1 Draft, not a second Draft writer or OCR implementation.
export async function isStarCaptureDraftPersisted(accountId, batch, indexedDb = globalThis.indexedDB) {
  const images = ['main', 'support', 'experience']
    .flatMap(section => batch.sections?.[section]?.images || [])
    .sort((left, right) => left.sourceOrder - right.sourceOrder)
  if (!accountId || !batch.captureId || (batch.sections && !images.length)) return false
  const database = await openExistingYuanStarDatabase(indexedDb)
  if (!database) return false
  try {
    const stores = ['importDrafts', 'importDraftImages']
    if (stores.some(name => !database.objectStoreNames.contains(name))) return false
    const transaction = database.transaction(stores, 'readonly')
    const done = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('核对待识别图片的事务失败。'))
    })
    done.catch(() => {})
    const draft = await requestValue(transaction.objectStore('importDrafts').get(accountId))
    if (draft?.schemaVersion !== 1 || draft.accountId !== accountId
      || draft.transport?.source !== 'maayuan' || draft.transport.captureId !== batch.captureId
      || !Array.isArray(draft.imageOrder) || !draft.imageOrder.length || !Array.isArray(draft.images)
      || draft.images.length !== draft.imageOrder.length || new Set(draft.imageOrder).size !== draft.imageOrder.length
      || (batch.sections && draft.imageOrder.length !== images.length)) {
      await done
      return false
    }
    const blobs = await Promise.all(draft.imageOrder.map(id => requestValue(transaction.objectStore('importDraftImages').get([accountId, id]))))
    await done
    return draft.imageOrder.every((id, index) => {
      const metadata = draft.images[index]
      const stored = blobs[index]
      const image = images[index]
      return id && metadata?.sourceImageId === id
        && stored?.accountId === accountId && stored.sourceImageId === id
        && stored.filename === metadata.filename && Boolean(stored.filename)
        && Number.isFinite(stored.lastModified) && stored.lastModified >= 0
        && stored.blob instanceof Blob && stored.blob.size === metadata.size && stored.blob.type === stored.mimeType
        && (!batch.sections || (id === image.sourceImageId && metadata.filename === image.file.name
          && metadata.size === image.file.size && stored.mimeType === image.file.type && stored.lastModified === image.file.lastModified))
    })
  } finally {
    database.close()
  }
}
