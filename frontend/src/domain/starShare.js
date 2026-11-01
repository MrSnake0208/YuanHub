import { MAIN_STAR_OPTIONS, ASSIST_STAR_OPTIONS } from '../data/starCatalog.js'
import { STAR_QUALITIES } from '../data/starDiscs.js'

export const STAR_SHARE_SORTS = Object.freeze([
  { value: 'catalog', label: '默认综合' },
  { value: 'name', label: '名称排序' },
  { value: 'level', label: '当前等级' }
])
const names = new Map([...MAIN_STAR_OPTIONS, ...ASSIST_STAR_OPTIONS].map((name, index) => [name, index]))
const quality = entry => { const rank = STAR_QUALITIES.indexOf(entry.quality); return rank < 0 ? STAR_QUALITIES.length : rank }
// Public-field equivalent of YuanStar product.ts compareReviewStars(), bag detail view.
// starInventoryOrder.js instead models snapshot normalization, not the visible bag sort.
// Private instance IDs are absent: complete ties retain response order (including unknown names).
export function compareSharedStars(a, b, sort = 'catalog') {
  const catalog = (names.get(a.name) ?? names.size) - (names.get(b.name) ?? names.size)
  const level = b.level - a.level, q = quality(a) - quality(b)
  if (sort === 'level') return level || q || catalog
  const kind = (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1)
  return kind || (sort === 'name' ? catalog || level : level || catalog) || q
}
// Local occurrence keys preserve row identity across level refreshes without exposing private IDs.
export function sharedStarRows(inventory) {
  const occurrences = new Map()
  return (Array.isArray(inventory) ? inventory : []).map(entry => {
    const identity = JSON.stringify([entry.kind, entry.name, entry.quality])
    const occurrence = occurrences.get(identity) || 0
    occurrences.set(identity, occurrence + 1)
    return { key: identity + ':' + occurrence, kind: entry.kind, name: String(entry.name || ''), quality: entry.quality, level: entry.level }
  })
}
export function filterSharedStars(rows, { quality: selectedQuality = 'all', search = '', sort = 'catalog' } = {}) {
  const query = search.trim().toLocaleLowerCase('zh-CN')
  return rows.filter(entry => (selectedQuality === 'all' || entry.quality === selectedQuality) && (!query || entry.name.toLocaleLowerCase('zh-CN').includes(query))).sort((a, b) => compareSharedStars(a, b, sort))
}
