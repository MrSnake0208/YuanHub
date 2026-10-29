import { localDayKey } from './acquiredStats.js'

export const DRAW_RESOURCES = [
  { id: 'baijinbi', name: '白金币', color: 'var(--theme-info-text, #719eaf)' },
  { id: 'fuchuan', name: '符传', color: 'var(--theme-danger-text, #785454)' },
  { id: 'tianjifuchuan', name: '天机符传', color: 'var(--theme-accent-text, #d5a064)' }
]

// Reconstruct only after an observed snapshot. Reward totals alone are not stock.
export function buildResourceBalance(records, from, to, basis = 'actual', mailboxHistory = []) {
  const includeZhuyu = ['zhuyu', 'all'].includes(basis)
  const includeMailbox = ['mailbox', 'all'].includes(basis)
  const ordered = [...records].filter(r => r.entity_type === 'item' && localDayKey(r.effective_at))
    .sort((a, b) => Date.parse(a.effective_at) - Date.parse(b.effective_at)
      || Number(a.record_type === 'stock_snapshot') - Number(b.record_type === 'stock_snapshot')
      || Number(a.resource_revision || 0) - Number(b.resource_revision || 0)
      || String(a.received_at || '').localeCompare(String(b.received_at || ''))
      || String(a.record_id || '').localeCompare(String(b.record_id || '')))
  const resources = includeZhuyu ? [...DRAW_RESOURCES, { id: 'zhuyu' }] : DRAW_RESOURCES
  const balances = resources.map(resource => {
    let stock = null
    const days = new Map()
    const seen = new Set()
    for (const record of ordered) {
      const day = localDayKey(record.effective_at)
      if (day < from || day > to || (record.record_id && seen.has(record.record_id))) continue
      if (record.record_id) seen.add(record.record_id)
      const entry = (record.entries || []).find(e => e.id === resource.id)
      let state
      if (record.record_type === 'stock_snapshot' && (entry || record.snapshot_scope === 'full')) {
        stock = entry ? Number(entry.count) : 0
        state = '实际盘点'
      } else if (['reward_delta', 'resource_delta'].includes(record.record_type) && entry && stock !== null) {
        stock += Number(entry.count)
        state = '盘点后推算'
      } else continue
      if (!Number.isFinite(stock) || stock < 0) { stock = null; continue }
      days.set(day, { day, stock, state })
    }
    const points = [...days.values()].map((point, index, all) => ({
      ...point,
      delta: index ? point.stock - all[index - 1].stock : null,
      previousDay: index ? all[index - 1].day : null
    }))
    return { ...resource, points, latest: points.at(-1) || null,
      net: points.length > 1 ? points.at(-1).stock - points[0].stock : null }
  })
  const zhuyu = includeZhuyu ? balances.pop() : null
  if (!includeZhuyu && !includeMailbox) return balances
  const mailDays = new Map()
  for (const entry of [...mailboxHistory].sort((a, b) => Date.parse(a.effective_at) - Date.parse(b.effective_at) || a.version - b.version)) {
    const day = localDayKey(entry.effective_at)
    if (!day || day < from || day > to) continue
    const previous = mailDays.get(day)
    mailDays.set(day, { day,
      coins: entry.white_coin_mails.reduce((sum, row) => sum + row.count * row.coins_per_mail, 0),
      tickets: entry.fu_chuan_mail_count * 3,
      notes: [...(previous?.notes || []), entry.claim_deleted ? '关联领取记录已删除，邮件储备未退回' : entry.kind === 'adjustment' ? '储备调整（不代表当天获得或消耗）' : entry.kind === 'claim' ? '邮件领取转入背包' : '邮箱储备基准']
    })
  }
  const mailPoints = [...mailDays.values()]
  for (let index = 0; index < (includeMailbox ? 2 : 1); index++) {
    const resource = balances[index]
    const withZhuyu = index === 0 && includeZhuyu
    const days = [...new Set([...resource.points, ...(withZhuyu ? zhuyu.points : []), ...(includeMailbox ? mailPoints : [])].map(p => p.day))].sort()
    let missingDays = 0
    const points = days.flatMap(day => {
      const stock = resourceCalendarValue(resource.points, day).stock
      const z = withZhuyu ? resourceCalendarValue(zhuyu.points, day).stock : 0
      const mail = includeMailbox ? mailPoints.findLast(p => p.day <= day) : null
      if (stock === null || z === null || includeMailbox && !mail) { missingDays++; return [] }
      const reserved = includeMailbox ? (index === 0 ? mail.coins : mail.tickets) : 0
      const components = index === 0 ? { baijinbi: stock, ...(withZhuyu ? { zhuyu: z } : {}) } : { fuchuan: stock }
      if (includeMailbox) components.mailbox = reserved
      return [{ day, stock: stock + z * 50 + reserved, state: '基于最近记录折算', components,
        notes: mail?.day === day ? [...new Set(mail.notes)] : [] }]
    }).map((point, i, all) => ({ ...point, delta: i ? point.stock - all[i - 1].stock : null, previousDay: i ? all[i - 1].day : null }))
    const additions = [withZhuyu && '茱萸', includeMailbox && '邮箱'].filter(Boolean).join('与')
    balances[index] = { ...resource, name: `${resource.name}${withZhuyu ? '等价值' : ''}（含${additions}）`, points, missingDays,
      latest: points.at(-1) || null, net: points.length > 1 ? points.at(-1).stock - points[0].stock : null }
  }
  return balances

}

// UTC date-only arithmetic keeps calendar spacing stable across DST and month/year boundaries.
export function resourceDayNumber(day) {
  return Date.parse(day + 'T00:00:00Z') / 86400000
}

export function resourceRangeDates(from, to) {
  const start = resourceDayNumber(from)
  const end = resourceDayNumber(to)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return []
  return Array.from({ length: end - start + 1 }, (_, i) => new Date((start + i) * 86400000).toISOString().slice(0, 10))
}

export function resourceCalendarValue(points, day) {
  const point = points.findLast(p => p.day <= day)
  if (!point) return { stock: null, delta: null, recordedDay: null }
  return { stock: point.stock, delta: point.day === day ? point.delta : null, recordedDay: point.day }
}
