import { onScopeDispose, reactive, watch } from 'vue'
import { listRecruitmentEvents } from '../../api/recruitment.js'

// 预览只存服务端记录，不与编辑窗口的分页或草稿共用可变状态。
export function useRecruitmentPreviews({ state, capture, matches, available }) {
  const previews = reactive({ pools: {} })
  let epoch = 0, active = 0, queue = [], disposed = false
  const invalidate = () => { epoch++; queue = []; previews.pools = {} }
  watch(() => [state.contextVersion, state.archive?.archive_revision, state.requestVersion], invalidate, { flush: 'sync' })
  onScopeDispose(() => { disposed = true; invalidate() })

  function load(poolId, more = false) {
    if (disposed || !available.value || state.loading || state.busy || !state.archive?.pools.some(pool => pool.pool_id === poolId)) return
    let entry = previews.pools[poolId]
    if (entry?.loading || more && (!entry?.cursor || !entry.loaded) || !more && entry?.loaded && !entry.error) return
    if (!more) previews.pools[poolId] = { items: [], cursor: null, loaded: false, loading: false, error: '', revision: null, cursors: [] }
    entry = previews.pools[poolId]
    entry.loading = true; entry.error = ''
    queue.push({ poolId, entry, cursor: more ? entry.cursor : null, epoch, token: capture(), revision: state.archive.archive_revision })
    drain()
  }

  function drain() {
    while (!disposed && active < 2 && queue.length) {
      const job = queue.shift()
      if (job.epoch !== epoch || !matches(job.token)) continue
      active++
      read(job).finally(() => { active--; drain() })
    }
  }

  async function read(job) {
    const { poolId, entry, cursor, token } = job
    const current = () => !disposed && job.epoch === epoch && matches(token) && previews.pools[poolId] === entry
    try {
      const page = await listRecruitmentEvents({ accountId: token.accountId, poolId, cursor, order: 'asc', limit: 100 })
      if (!current()) return
      const loadedIds = new Set(entry.items.map(event => event.event_id))
      if (!Array.isArray(page.items) || page.items.some(event => !event.event_id || !event.agent_snapshot || event.pool_id !== poolId || event.deleted_at) || new Set(page.items.map(event => event.event_id)).size !== page.items.length || page.items.some(event => loadedIds.has(event.event_id))) throw new Error('记录分页不完整或不属于本池，请重新读取')
      if (!Number.isInteger(page.archive_revision) || page.archive_revision !== job.revision || cursor && page.archive_revision !== entry.revision) throw new Error('档案已变化，请刷新档案后重试')
      if (page.next_cursor != null && (typeof page.next_cursor !== 'string' || !page.next_cursor || page.next_cursor === cursor || entry.cursors.includes(page.next_cursor) || !page.items.length)) throw new Error('分页游标无效，请重新读取')
      const items = entry.items.concat(page.items)
      const expected = state.archive.pool_summaries?.[poolId]?.event_count
      if (Number.isInteger(expected) && (items.length > expected || !page.next_cursor && items.length !== expected)) throw new Error('记录与摘要数量不一致，请刷新档案后重试')
      entry.items = items; entry.cursor = page.next_cursor ?? null; entry.loaded = true; entry.revision = page.archive_revision
      if (cursor) entry.cursors.push(cursor)
    } catch (error) {
      if (current()) entry.error = error.message || '读取明细失败，请重试'
    } finally { if (current()) entry.loading = false }
  }
  return { previews, load }
}
