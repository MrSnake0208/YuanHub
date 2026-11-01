import { IDBFactory } from 'fake-indexeddb'

export const STAR_DB = 'yuanstar-static'
export const CURRENT_ACCOUNT = 'product.currentAccountId'
// Mirrors the stores/keyPaths in public/yuanstar-embed/yuanstar-embed.js (DB v1).
export const STAR_STORES = {
  meta: null,
  accounts: 'accountId',
  workspaces: 'accountId',
  images: ['accountId', 'imageId'],
  restorePoints: ['accountId', 'restorePointId'],
  restorePointImages: ['accountId', 'restorePointId', 'imageId']
}
export const hostAccount = { accountId: 'canonical-host', displayName: '殿下', gameVersion: '如鸢' }
export const legacyId = 'legacy-local'
const stamp = '2026-09-19T10:00:00.000Z'

export function starSnapshot(accountId = legacyId) {
  return {
    schemaVersion: 1, accountId, gameVersion: '如鸢', revision: 12,
    bag: { currentCount: 2, capacity: 200 }, experience: { orange: 4, purple: 5, white: 6 },
    inventory: [{ instanceId: 'stone-1', level: 40, imageId: 'image-1', locked: true, stats: { attack: 23 } }],
    planTargets: { 'stone-1': 60 }, loadouts: { 'operator-1': { main1: 'stone-1' } }
  }
}

export function starRecords() {
  const account = { ...hostAccount, accountId: legacyId, createdAt: stamp, updatedAt: stamp, settings: { compact: true } }
  return {
    meta: [[CURRENT_ACCOUNT, legacyId], ['unrelated-setting', { theme: 'paper' }]],
    accounts: [account, { ...account, accountId: 'other-account', displayName: '别的殿下' }],
    workspaces: [legacyId, 'other-account'].map(accountId => ({ accountId, snapshot: starSnapshot(accountId), updatedAt: stamp, pending: ['sync-1'] })),
    images: [legacyId, 'other-account'].map(accountId => ({ accountId, imageId: 'image-1', blob: new Blob([new Uint8Array([0, 23, 255, 9])], { type: 'image/png' }), width: 32, height: 64, createdAt: stamp })),
    restorePoints: [legacyId, 'other-account'].map(accountId => ({ accountId, restorePointId: 'restore-1', snapshot: starSnapshot(accountId), reason: 'before-import', createdAt: stamp })),
    restorePointImages: [legacyId, 'other-account'].map(accountId => ({ accountId, restorePointId: 'restore-1', imageId: 'image-1', blob: new Blob(['restore bytes'], { type: 'image/png' }), createdAt: stamp }))
  }
}

export function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
}
export function idbDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true })
    transaction.addEventListener('abort', () => reject(transaction.error || new Error('transaction aborted')), { once: true })
  })
}
export async function seedStarDatabase(records = starRecords(), stores = STAR_STORES) {
  const indexedDb = new IDBFactory()
  const request = indexedDb.open(STAR_DB, 1)
  request.onupgradeneeded = () => {
    for (const [name, keyPath] of Object.entries(stores)) {
      request.result.createObjectStore(name, keyPath ? { keyPath } : undefined)
    }
  }
  const db = await idbRequest(request)
  try {
    const tx = db.transaction(Object.keys(stores), 'readwrite')
    const done = idbDone(tx)
    for (const name of Object.keys(stores)) {
      for (const record of records[name] || []) {
        if (name === 'meta') tx.objectStore(name).put(record[1], record[0])
        else tx.objectStore(name).put(record)
      }
    }
    await done
  } finally { db.close() }
  return indexedDb
}

async function comparable(value) {
  if (value instanceof Blob) return { $blob: [...new Uint8Array(await value.arrayBuffer())], type: value.type }
  if (Array.isArray(value)) return Promise.all(value.map(comparable))
  if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await comparable(item)])))
  return value
}

export async function dumpStarDatabase(indexedDb) {
  const db = await idbRequest(indexedDb.open(STAR_DB))
  try {
    const names = [...db.objectStoreNames]
    const tx = db.transaction(names, 'readonly')
    const done = idbDone(tx)
    const values = await Promise.all(names.map(async name => {
      const store = tx.objectStore(name)
      const [keys, rows] = await Promise.all([idbRequest(store.getAllKeys()), idbRequest(store.getAll())])
      return [name, name === 'meta' ? keys.map((key, i) => [key, rows[i]]) : rows]
    }))
    await done
    return comparable(Object.fromEntries(values))
  } finally { db.close() }
}
