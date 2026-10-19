import { matchesOperatorSearch } from '../../utils/operatorFilters.js'

export const ACTIONS = Object.freeze({ arson: '纵火', rumor: '传谣', poison: '下毒', undercover: '卧底', gather: '搜集', extinguish: '灭火', purify: '净水', rescue: '营救' })
export const WEATHERS = Object.freeze({ sunny: '晴天', rain: '雨天', fog: '大雾', wind: '狂风', light_snow: '小雪', heavy_snow: '大雪', hurricane: '飓风', thunder: '雷鸣' })
export const STATUS = Object.freeze({ active: '当前', retired: '历史下架', invalid: '误录，不计数' })
export const MAX_BYTES = 8 * 1024 * 1024

export function filterBonds(entries, records, operators, filters, owned) {
  const triggered = new Set(records.filter(r => r.triggered).map(r => r.bond_id))
  const byId = new Map(operators.map(op => [op.id, op]))
  const queries = filters.query.trim().toLocaleLowerCase().split(/[\s、，,+＋&]+/).filter(Boolean)
  return entries.filter(e => (!filters.status || e.status === filters.status) &&
    (!filters.action || e.action === filters.action) && (!filters.weather || e.weather === filters.weather) &&
    (!filters.effect || e.effect === filters.effect) && (!filters.hideRecorded || !triggered.has(e.bond_id)) &&
    (!filters.recorded || (filters.recorded === 'collected') === triggered.has(e.bond_id)) &&
    (!filters.onlyOwned || !owned || e.members.every(id => owned.get(id) === true)) &&
    queries.every(query => e.members.some(id => matchesOperatorSearch(byId.get(id) || { id }, query) || String(byId.get(id)?.alias || '').toLocaleLowerCase().includes(query))))
}

export function groupBondsByOperator(entries, catalog, records) {
  const triggered = new Set(records.filter(r => r.triggered).map(r => r.bond_id))
  const totals = new Map(), groups = new Map()
  // 分组可重复展示同一条目；进度始终取完整当前目录的唯一 bond_id。
  for (const entry of catalog) {
    if (entry.status !== 'active') continue
    for (const id of entry.members) {
      if (!totals.has(id)) totals.set(id, new Set())
      totals.get(id).add(entry.bond_id)
    }
  }
  for (const entry of entries) {
    for (const id of entry.members) {
      if (!groups.has(id)) {
        const ids = [...(totals.get(id) || [])]
        groups.set(id, { id, total: ids.length, collected: ids.filter(key => triggered.has(key)).length, pairs: new Map() })
      }
      const pairs = groups.get(id).pairs
      const key = [...entry.members].sort().join('|') + ':' + entry.effect
      if (!pairs.has(key)) pairs.set(key, { key, members: entry.members.filter(member => member !== id), effect: entry.effect, entries: [] })
      pairs.get(key).entries.push(entry)
    }
  }
  return [...groups.values()].map(group => ({ ...group, pairs: [...group.pairs.values()] }))
}

export function groupBonds(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const key = [...entry.members].sort().join('|') + ':' + entry.action
    if (!groups.has(key)) groups.set(key, { key, members: entry.members, action: entry.action, entries: [] })
    groups.get(key).entries.push(entry)
  }
  return [...groups.values()]
}

export function readBondBackup(text) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('文件最多8MiB。')
  let document
  try { document = JSON.parse(text) } catch { throw new Error('JSON 损坏，请选择完整备份。') }
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('备份必须是 JSON 对象。')
  if ('format' in document) {
    if (document.format !== 'yuanhub-bonds' || document.schema_version !== 1) throw new Error('请选择 YuanHub 羁绊原生备份 v1 或旧助手备份。')
    if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw new Error('原生备份最多2MiB。')
    if (!Array.isArray(document.records) || document.records.length > 5000) throw new Error('原生备份最多5000条记录。')
  }
  return document
}

export function legacySources(document) {
  if (!document || document.format) return []
  return Object.entries(document).filter(([key, value]) => !key.startsWith('__') && !['yuan_server_overrides', 'serverOverrides'].includes(key) && value && typeof value === 'object' && !Array.isArray(value))
    .map(([key, value]) => {
      const hints = [key.startsWith('ry::') || /^如鸢\s*-/.test(key) ? '如鸢' : key.startsWith('dyy::') || /^代号鸢\s*-/.test(key) ? '代号鸢' : '', value.__server__ === 'ry' ? '如鸢' : value.__server__ === 'dyy' ? '代号鸢' : ''].filter(Boolean)
      return { key, game: hints.length && new Set(hints).size === 1 ? hints[0] : '', conflict: new Set(hints).size > 1, count: Object.entries(value).filter(([k, v]) => !k.startsWith('__') && v === true).length }
    })
}

export function downloadBondFile(document, label = '羁绊档案') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json;charset=utf-8' }))
  const anchor = window.document.createElement('a')
  anchor.href = url; anchor.download = 'YuanHub-' + label + '-' + document.game + '-' + new Date().toISOString().slice(0, 10) + '.json'
  window.document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
