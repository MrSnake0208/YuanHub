import { request } from './request.js'

const path = accountId => '/v1/inventory/mailbox-reserve?' + new URLSearchParams({ account_id: accountId })
export const getMailboxReserve = (accountId, userId) => request('/v1/inventory/mailbox-reserve/sync?' + new URLSearchParams({ account_id: accountId }), { method: 'POST', auth: true, expectedUserId: userId })
export const getMailboxDailyStatus = (accountId, userId, day) => request('/v1/inventory/mailbox-reserve/daily-status?' + new URLSearchParams({ account_id: accountId, day }), { auth: true, expectedUserId: userId })
export const saveMailboxReserve = (accountId, userId, body) => request(path(accountId), { method: 'PUT', auth: true, expectedUserId: userId, body })

export const claimMailboxReserve = (accountId, userId, body) => request('/v1/inventory/mailbox-reserve/claim?' + new URLSearchParams({ account_id: accountId }), { method: 'POST', auth: true, expectedUserId: userId, body })

// Fence both histories so a concurrent claim cannot mix its old reserve and new stock.
export async function loadMailboxResourceReport(accountId, userId, from, to) {
  const { listRecords } = await import('./inventory.js')
  const marker = data => {
    if (data?.account_id !== accountId || ![data.version, data.inventory_revision, data.inventory_record_count].every(Number.isSafeInteger)) throw new Error('邮件历史服务尚未就绪，请稍后重试')
    return `${data.version}:${data.inventory_revision}:${data.inventory_record_count}`
  }
  await getMailboxReserve(accountId, userId)
  const readMarker = () => request(path(accountId), { auth: true, expectedUserId: userId })
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = marker(await readMarker())
    const history = [], records = [], seenMail = new Set(), seenRecords = new Set()
    let cursor = null, changed = false
    do {
      const query = new URLSearchParams({ account_id: accountId, from, to, limit: '100' })
      if (cursor) query.set('cursor', cursor)
      const page = await request('/v1/inventory/mailbox-reserve/history?' + query, { auth: true, expectedUserId: userId })
      if (marker(page) !== before) { changed = true; break }
      if (!Array.isArray(page.entries)) throw new Error('邮件历史响应不完整，请重试')
      history.push(...page.entries)
      cursor = page.next_cursor
      if (cursor && (seenMail.has(cursor) || history.length >= 5000)) throw new Error('邮件历史未完整加载，请缩小日期范围后重试')
      if (cursor) seenMail.add(cursor)
    } while (cursor)
    if (changed) continue
    cursor = null
    do {
      const page = await listRecords({ accountId, entityType: 'item', from, to, cursor, limit: 100 }, { expectedUserId: userId, fresh: true })
      if (!Array.isArray(page.items)) throw new Error('库存流水响应不完整，请重试')
      records.push(...page.items)
      cursor = page.next_cursor
      if (cursor && (seenRecords.has(cursor) || records.length >= 5000)) throw new Error('库存流水未完整加载，请缩小日期范围后重试')
      if (cursor) seenRecords.add(cursor)
    } while (cursor)
    if (marker(await readMarker()) === before) return { records, history }
  }
  throw new Error('资源正在更新，请稍后重试，避免混用领取前后的数据')
}
