import { localDayKey } from './acquiredStats.js'

export const DRAW_RESOURCES = [
  { id: 'baijinbi', name: '白金币', color: '#719eaf' },
  { id: 'fuchuan', name: '符传', color: '#785454' },
  { id: 'tianjifuchuan', name: '天机符传', color: '#d5a064' }
]

// Reconstruct only after an observed snapshot. Reward totals alone are not stock.
export function buildResourceBalance(records, from, to) {
  const ordered = [...records].filter(r => r.entity_type === 'item' && localDayKey(r.effective_at))
    .sort((a, b) => Date.parse(a.effective_at) - Date.parse(b.effective_at)
      || Number(a.record_type === 'stock_snapshot') - Number(b.record_type === 'stock_snapshot')
      || String(a.received_at || '').localeCompare(String(b.received_at || ''))
      || String(a.record_id || '').localeCompare(String(b.record_id || '')))
  return DRAW_RESOURCES.map(resource => {
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
      } else if (record.record_type === 'reward_delta' && entry && stock !== null) {
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
