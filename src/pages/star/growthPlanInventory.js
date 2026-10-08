export const BREAKTHROUGH_IDS = ['jiezhuping', 'jiezheping', 'jieyangping']
export const unknownBreakthroughInventory = () => Object.fromEntries(BREAKTHROUGH_IDS.map(id => [id, null]))

// Read-only account-scoped adapter. Missing entries in a valid item snapshot mean zero;
// an unavailable snapshot is unknown, never an invented empty inventory.
export async function readGrowthPlanInventory(accountId, getCurrent, isCurrent) {
  if (!accountId || !isCurrent()) return unknownBreakthroughInventory()
  const data = await getCurrent({ accountId, entityType: 'item' })
  if (!isCurrent()) throw new Error('账号已切换，忽略旧库存响应')
  const list = Array.isArray(data) ? data : data ? [data] : []
  // /current returns [] when this account has no item snapshot yet, as on the inventory page.
  if (Array.isArray(data) && list.length === 0) return Object.fromEntries(BREAKTHROUGH_IDS.map(id => [id, 0]))
  if (list.length !== 1 || !list[0]?.entries || typeof list[0].entries !== 'object' || Array.isArray(list[0].entries)) throw new Error('突破瓶子库存响应无效')
  const doc = list[0]
  if ((doc.account_id && doc.account_id !== accountId) || (doc.entity_type && doc.entity_type !== 'item')) throw new Error('突破瓶子库存与当前账号不符')
  return Object.fromEntries(BREAKTHROUGH_IDS.map(id => {
    const value = Object.hasOwn(doc.entries, id) ? doc.entries[id]?.count : 0
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('突破瓶子库存数量无效')
    return [id, value]
  }))
}
import { buildManualStockSnapshot, nextManualSnapshotTime } from '../../data/inventory/manualStock.js'
import { CATALOG_VERSION } from '../../data/inventory/catalog.js'

// A listed snapshot updates exactly the edited item, including an explicit zero.
// Keep an unconfirmed document for byte-identical retry and prevent a new edit overtaking it.
export function createGrowthPlanInventoryWriter({ getCurrent, importInventory, isCurrent, createId = () => crypto.randomUUID(), now = () => Date.now() }) {
  let pending = null
  let busy = false
  return {
    hasPending: () => pending != null,
    async save(accountId, id, count) {
      if (busy || !isCurrent(accountId)) throw new Error('当前账号正在切换或保存库存')
      if (!BREAKTHROUGH_IDS.includes(id) || !Number.isSafeInteger(count) || count < 0) throw new Error('瓶子数量必须为非负整数')
      if (pending && (pending.accountId !== accountId || pending.id !== id || pending.count !== count)) throw new Error('上次库存保存结果未确认，请原样重试')
      busy = true
      try {
        if (!pending) {
          const data = await getCurrent({ accountId, entityType: 'item' })
          // Reuse all account/type/quantity validation before producing a write document.
          await readGrowthPlanInventory(accountId, async () => data, () => isCurrent(accountId))
          if (!isCurrent(accountId)) throw new Error('账号已切换')
          const doc = Array.isArray(data) ? data[0] : data
          const effectiveAt = nextManualSnapshotTime(doc?.full_baseline_at, [doc?.entries?.[id]?.listed_baseline_at], now())
          const document = buildManualStockSnapshot({ accountId, catalogVersion: CATALOG_VERSION, effectiveAt, recordId: 'yuanhub:manual:' + createId(), entries: [] })
          document.records[0].snapshot_scope = 'listed'
          document.records[0].entries = [{ id, count, name: {jiezhuping:'解注瓶',jiezheping:'解谪瓶',jieyangping:'解殃瓶'}[id] }]
          pending = { accountId, id, count, document, acknowledged: false }
        }
        if (!isCurrent(accountId)) throw new Error('账号已切换')
        if (!pending.acknowledged) {
          const result = await importInventory(pending.document)
          if (result?.superseded) { pending = null; throw new Error('库存盘点时间已被新记录替代，请重新读取后修改') }
          if (!result || !(result.accepted > 0 || result.duplicates > 0)) throw new Error('库存保存结果未确认，请原样重试')
          pending.acknowledged = true
        }
        const saved = await readGrowthPlanInventory(accountId, getCurrent, () => isCurrent(accountId))
        if (saved[pending.id] !== pending.count) {
          const name = {jiezhuping:'解注瓶',jiezheping:'解谪瓶',jieyangping:'解殃瓶'}[pending.id]
          throw new Error(`${name}库存可能已发生变化：保存目标 ${pending.count}，当前读取 ${saved[pending.id]}，结果不一致。请重试核对库存。`)
        }
        pending = null
        return saved
      } catch (error) {
        if ([400,401,403,404,409,422].includes(error?.status)) pending = null
        throw error
      } finally { busy = false }
    }
  }
}
