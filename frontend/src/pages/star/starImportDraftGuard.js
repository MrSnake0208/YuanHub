import { openExistingYuanStarDatabase } from './legacyHostAccountMigration.js'

// A cloud refresh must not retire an unfinished browser screenshot/OCR draft.
// This is a read-only probe of the existing embed store, never a second writer.
export async function assertNoStarImportDraft(accountId, root, indexedDb = globalThis.indexedDB) {
  if (root?.querySelector('[data-import-image], [data-retry-import-draft]')) {
    throw new Error('网页中仍有待识别截图，请先完成识别或在截图导入中清空待识别图片，再补传 JSON。')
  }
  const db = await openExistingYuanStarDatabase(indexedDb)
  if (!db) return
  try {
    if (!db.objectStoreNames.contains('importDrafts')) return
    const draft = await new Promise((resolve, reject) => {
      const tx = db.transaction('importDrafts', 'readonly')
      const request = tx.objectStore('importDrafts').get(accountId)
      let result
      request.onsuccess = () => { result = request.result }
      tx.oncomplete = () => resolve(result)
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('无法核对本机截图草稿，请保留数据并重试。'))
    })
    if (draft) throw new Error('当前账号仍有本机截图草稿，请先完成识别或清空待识别图片，再补传 JSON。')
  } finally { db.close() }
}
