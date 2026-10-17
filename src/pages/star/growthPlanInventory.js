export const BREAKTHROUGH_IDS = ['jiezhuping', 'jiezheping', 'jieyangping']
export const unknownBreakthroughInventory = () => Object.fromEntries(BREAKTHROUGH_IDS.map(id => [id, null]))

// Only an explicit entry or a full snapshot proves zero; absent observations stay unknown.
export async function readGrowthPlanInventory(accountId, getCurrent, isCurrent) {
  if (!accountId || !isCurrent()) return unknownBreakthroughInventory()
  const data = await getCurrent({ accountId, entityType: 'item' })
  if (!isCurrent()) throw new Error('账号已切换，忽略旧库存响应')
  const list = Array.isArray(data) ? data : data ? [data] : []
  if (Array.isArray(data) && list.length === 0) return unknownBreakthroughInventory()
  if (list.length !== 1 || !list[0]?.entries || typeof list[0].entries !== 'object' || Array.isArray(list[0].entries)) throw new Error('突破瓶子库存响应无效')
  const doc = list[0]
  if ((doc.account_id && doc.account_id !== accountId) || (doc.entity_type && doc.entity_type !== 'item')) throw new Error('突破瓶子库存与当前账号不符')
  const hasFullBaseline = typeof doc.full_baseline_at === 'string' && Number.isFinite(Date.parse(doc.full_baseline_at))
  return Object.fromEntries(BREAKTHROUGH_IDS.map(id => {
    if (!Object.hasOwn(doc.entries, id)) return [id, hasFullBaseline ? 0 : null]
    const value = doc.entries[id]?.count
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
    const message = /账号已切换|正在保存或读取库存/.test(error.message) ? error.message : pending?.phase === 'unconfirmed'
      ? '库存写入结果尚未确认，请重试本次保存。确认前暂不能修改为新数量，也不能直接采用当前库存。'
      : pending?.phase === 'acknowledged'
        ? '库存写入已确认，但最新库存尚未读取成功。请重新读取核对，不要再次新增保存。'
        : error.message
    return Object.assign(new Error(message, { cause: error }),
      { status: error.status, code: error.code, inventoryPending: pending })
  }
  const conflict = p => new Error(`${bottleNames[p.id]}${p.notApplied ? '本次记录已保存，但未改变当前库存。' : '库存与本次填写数量不一致。'}本次填写：${p.count}，当前库存：${p.latest.inventory[p.id] ?? '未知'}。${p.latest.reliable ? '请重新读取核对，或使用当前库存（不会再次写入）。' : '库存尚未确认，请重新读取；仍无法确认时保留数据并联系维护者。'}`)

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
        if (!p.acknowledged) throw new Error('库存写入结果尚未确认，请重试本次保存。确认前不能直接采用当前库存。')
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
        if (!BREAKTHROUGH_IDS.includes(id) || !Number.isSafeInteger(count) || count < 0) throw new Error('瓶子数量请输入0或正整数。')
        if (state.pending && (state.pending.id !== id || state.pending.count !== count)) throw new Error('上次库存保存尚未确认，请重试本次保存或核对已读取的库存。')
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
          if (!result || !((result.accepted === 1 && !result.duplicates) || (result.duplicates === 1 && !result.accepted))) throw new Error('库存保存结果尚未确认，请重试本次保存。')
          p.acknowledged = true // Retain confirmation even if the account changed while POST was in flight.
          p.notApplied = !!(result.superseded || result.history_only)
        }
        current(accountId)
        return check(p)
      })
    }
  }
}
