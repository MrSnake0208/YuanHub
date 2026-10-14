import { openExistingYuanStarDatabase } from './legacyHostAccountMigration.js'

const sorted = value => JSON.stringify([...value].sort())
const targets = value => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))

// shortcut: the embed has no rejected-write rollback port; replace this adapter when upstream exposes one.
export async function rollbackRejectedStarPlanIntent({ operation, accountId, snapshot, scope, recoveryPointId }, indexedDb = globalThis.indexedDB) {
  if (!accountId || !scope || !Number.isInteger(scope.generation) || !Number.isInteger(scope.revision)) return false
  const database = await openExistingYuanStarDatabase(indexedDb)
  if (!database) return false
  try {
    if (!database.objectStoreNames.contains('meta')) throw new Error('无法读取星石保存标记，请保留本机数据。')
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('meta', 'readwrite'), meta = transaction.objectStore('meta')
      const key = 'product.pendingPlanInheritance:' + accountId
      let changed = false
      transaction.oncomplete = () => resolve(changed)
      transaction.onabort = () => reject(transaction.error || new Error('无法回退星石保存标记，请保留本机数据。'))
      const request = meta.get(key)
      request.onsuccess = () => {
        const pending = request.result
        if (!pending || pending.accountId !== accountId) return
        if (operation === 'ocr') {
          if (!recoveryPointId || pending.phase !== 'prepared' || pending.confirmation || pending.sourceRestorePointId !== recoveryPointId ||
            pending.cloudGeneration !== scope.generation + 1 || !Array.isArray(pending.inventoryIds) ||
            sorted(pending.inventoryIds) !== sorted(snapshot.inventory.map(star => star.starInstanceId))) return
          meta.delete(key)
        } else if (operation === 'plan') {
          const confirmation = pending.confirmation
          const confirmationRevision = scope.revision + Number(Object.keys(snapshot.planTargets).length > 0)
          if (pending.phase !== 'pending' || !confirmation || !confirmation.planTargets ||
            (pending.cloudGeneration !== null && pending.cloudGeneration !== scope.generation) ||
            confirmation.cloudRevision !== confirmationRevision || targets(confirmation.planTargets) !== targets(snapshot.planTargets)) return
          const { confirmation: _confirmation, ...next } = pending
          meta.put(next, key)
        } else return
        changed = true
      }
    })
  } finally { database.close() }
}
