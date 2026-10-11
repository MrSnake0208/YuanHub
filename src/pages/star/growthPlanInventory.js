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

const bottleNames = { jiezhuping: '解注瓶', jiezheping: '解谪瓶', jieyangping: '解殃瓶' }
// Retain only inventory operations across route unmount/remount in this app session.
// The site user and game account are both part of the key; this is not plan state.
const sessions = new Map()
export function growthPlanInventorySession(userId, accountId) {
  const key = JSON.stringify([userId, accountId])
  if (!sessions.has(key)) sessions.set(key, { pending: null, busy: false })
  return sessions.get(key)
}

export function createGrowthPlanInventoryWriter({ getCurrent, importInventory, isCurrent,
  createId = () => crypto.randomUUID(), now = () => Date.now(), state = { pending: null, busy: false } }) {
  const current = accountId => {
    if (!isCurrent(accountId)) throw new Error('账号已切换，忽略旧库存响应')
  }
  const describe = () => {
    const p = state.pending
    if (!p) return null
    return Object.freeze({ accountId: p.accountId, id: p.id, count: p.count,
      phase: !p.acknowledged ? 'unconfirmed' : p.latest ? 'conflict' : 'acknowledged',
      currentCount: p.latest?.inventory[p.id] ?? null, canAccept: !!p.latest?.reliable })
  }
  const failure = error => {
    const pending = describe()
    const message = pending?.phase === 'unconfirmed'
      ? `库存写入结果尚未确认：${error.message}。请重试原记录，暂不能编辑新数量。`
      : pending?.phase === 'acknowledged'
        ? `库存写入已确认，读回尚未完成：${error.message}。请重新读取核对。`
        : error.message
    return Object.assign(new Error(message, { cause: error }),
      { status: error.status, code: error.code, inventoryPending: pending })
  }
  const conflict = p => new Error(`${bottleNames[p.id]}${p.notApplied ? '保存记录已确认存档，但未改变当前库存。' : '库存与保存目标不一致。'}尝试保存：${p.count}，当前读取：${p.latest.inventory[p.id]}。请核对当前库存后继续。${p.latest.reliable ? '' : '当前读取尚未证实本次盘点基线，请重新读取；持续无法确认时需服务端核查原记录。'}`)

  async function readBack(p) {
    p.latest = null // A failed/obsolete read cannot leave an older acceptance offer enabled.
    current(p.accountId)
    const data = await getCurrent({ accountId: p.accountId, entityType: 'item' })
    current(p.accountId)
    const inventory = await readGrowthPlanInventory(p.accountId, async () => data, () => isCurrent(p.accountId))
    current(p.accountId)
    const doc = Array.isArray(data) ? data[0] : data
    const effective = Date.parse(p.document.records[0].effective_at)
    const baselines = [Date.parse(doc?.full_baseline_at), Date.parse(doc?.entries?.[p.id]?.listed_baseline_at)].filter(Number.isFinite)
    p.latest = { inventory, reliable: baselines.length > 0 && Math.max(...baselines) >= effective }
    return inventory
  }
  async function check(p) {
    const inventory = await readBack(p)
    if (inventory[p.id] !== p.count || p.notApplied) throw conflict(p)
    state.pending = null
    return inventory
  }
  async function run(accountId, operation) {
    if (state.busy) throw failure(new Error('当前账号正在保存或读取库存，请稍候'))
    current(accountId)
    if (state.pending && state.pending.accountId !== accountId) throw new Error('请回到原账号处理未完成的库存保存')
    state.busy = true
    try { return await operation() }
    catch (error) { throw failure(error) }
    finally { state.busy = false }
  }
  return {
    hasPending: () => state.pending != null || state.busy,
    getPending: describe,
    async read(accountId) {
      return run(accountId, async () => {
        const p = state.pending
        if (!p) return readGrowthPlanInventory(accountId, getCurrent, () => isCurrent(accountId))
        if (!p.acknowledged) throw new Error('库存写入结果尚未确认，请重试原记录；不能使用当前库存解除保护。')
        return check(p)
      })
    },
    async acceptCurrent(accountId, id, count) {
      return run(accountId, async () => {
        const p = state.pending
        if (!p?.acknowledged || !p.latest?.reliable || p.id !== id || p.count !== count) throw new Error('库存保存尚未可靠确认，不能使用当前库存')
        const inventory = await readBack(p) // Revalidate at the user's explicit acceptance; GET only.
        if (!p.latest.reliable) throw conflict(p)
        state.pending = null
        return inventory
      })
    },
    async save(accountId, id, count) {
      return run(accountId, async () => {
        if (!BREAKTHROUGH_IDS.includes(id) || !Number.isSafeInteger(count) || count < 0) throw new Error('瓶子数量必须为非负整数')
        if (state.pending && (state.pending.id !== id || state.pending.count !== count)) throw new Error('上次库存保存尚未解决，请原样重试或核对已确认的库存冲突')
        if (!state.pending) {
          const data = await getCurrent({ accountId, entityType: 'item' })
          current(accountId)
          await readGrowthPlanInventory(accountId, async () => data, () => isCurrent(accountId))
          current(accountId)
          const doc = Array.isArray(data) ? data[0] : data
          const effectiveAt = nextManualSnapshotTime(doc?.full_baseline_at, [doc?.entries?.[id]?.listed_baseline_at], now())
          const document = buildManualStockSnapshot({ accountId, catalogVersion: CATALOG_VERSION, effectiveAt, recordId: 'yuanhub:manual:' + createId(), entries: [] })
          document.records[0].snapshot_scope = 'listed'
          document.records[0].entries = [{ id, count, name: bottleNames[id] }]
          state.pending = { accountId, id, count, document, acknowledged: false, attempts: 0, latest: null }
        }
        const p = state.pending
        current(accountId)
        if (!p.acknowledged) {
          p.attempts++
          let result
          try { result = await importInventory(p.document) }
          catch (error) {
            // Only an explicit rejection of the first attempt proves there was no prior uncertain write.
            if (p.attempts === 1 && [400,401,403,404,409,422].includes(error?.status) && error?.code !== 'request_identity_changed') state.pending = null
            throw error
          }
          if (!result || !((result.accepted === 1 && !result.duplicates) || (result.duplicates === 1 && !result.accepted))) throw new Error('库存保存结果未确认，请原样重试')
          p.acknowledged = true // Retain confirmation even if the account changed while POST was in flight.
          p.notApplied = !!(result.superseded || result.history_only)
        }
        current(accountId)
        return check(p)
      })
    }
  }
}
