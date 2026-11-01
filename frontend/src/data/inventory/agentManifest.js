import { isMovieOperator } from '../../utils/operatorForms.js'
import { AGENT_CATALOG } from './catalog.js'
import { canonicalSubProf } from '../../utils/operatorFilters.js'

const PROF_ORDER = ['阳', '阴', '火', '风', '水', '地', '混沌']
const SUB_PROF_ORDER = ['神纪', '诡道', '破军', '岐黄', '龙盾']

// 兼容仅带 ID 的库存记录；集合由目录关系派生。
export const HIDDEN_AGENT_IDS = new Set(AGENT_CATALOG.filter(isMovieOperator).map(entry => entry.id))

export function isHiddenAgent(entry) {
  return isMovieOperator(entry) || HIDDEN_AGENT_IDS.has(entry?.id)
}

export function visibleAgentEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter(entry => !isHiddenAgent(entry))
}

export function normalizeOperatorCatalog(entries) {
  return (Array.isArray(entries) ? entries : []).map(function (entry) {
    const profs = Array.isArray(entry && entry.prof) ? entry.prof : [entry && entry.prof].filter(Boolean)
    const rawSubProfs = entry && (entry.sub_prof || entry.subProf)
    const subProfs = Array.isArray(rawSubProfs) ? rawSubProfs : [rawSubProfs].filter(Boolean)
    return {
      id: entry.id,
      name: entry.name,
      rarity: Number(entry.rarity),
      spOf: entry.spOf || entry.sp_of || null,
      prof: profs[0] || '',
      subProf: canonicalSubProf(subProfs[0]),
      games: Array.isArray(entry.games) ? entry.games.slice() : []
    }
  })
}

function favoriteSet(favoriteIds) {
  return favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds || [])
}

function selectedSet(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : [])
  return new Set(values.map(function (item) { return String(item) }))
}

export function agentReleaseOrder(id) {
  const match = /^char_(\d+)_/.exec(String(id || ''))
  return match ? Number(match[1]) : -1
}

export function compareAgentRelease(left, right) {
  const order = agentReleaseOrder(right && right.id) - agentReleaseOrder(left && left.id)
  if (order) return order
  return String(left && left.id || '').localeCompare(String(right && right.id || ''))
}

// 未声明 games 的旧目录项视为双版本通用，兼容库存本地兜底目录。
export function agentMatchesGame(entry, game) {
  if (!game || game === 'all') return true
  const games = entry && Array.isArray(entry.games) ? entry.games : []
  if (!games.length) return true
  return games.includes(game)
}

export function sortAgentEntries(entries, mode, favoriteIds, options) {
  const favorites = favoriteSet(favoriteIds)
  const settings = options || {}
  const direction = settings.direction === 'asc' ? 1 : (settings.direction === 'desc' ? -1 : (mode === 'name' ? 1 : -1))
  return (Array.isArray(entries) ? entries : []).slice().sort(function (left, right) {
    if (mode === 'backpack') {
      const rarityDiff = (Number(left.rarity) || 0) - (Number(right.rarity) || 0)
      if (rarityDiff) return rarityDiff * direction
    }
    if (settings.favoriteFirst || mode === 'favorite') {
      const favoriteDiff = Number(favorites.has(right.id)) - Number(favorites.has(left.id))
      if (favoriteDiff) return favoriteDiff
    }
    let primaryDiff = 0
    if (mode === 'count') {
      primaryDiff = (Number(left.count) || 0) - (Number(right.count) || 0)
    } else if (mode === 'rarity') {
      primaryDiff = (Number(left.rarity) || 0) - (Number(right.rarity) || 0)
    } else if (mode === 'name') {
      primaryDiff = String(left.name || left.id).localeCompare(String(right.name || right.id), 'zh-CN')
    } else {
      primaryDiff = agentReleaseOrder(left && left.id) - agentReleaseOrder(right && right.id)
    }
    if (primaryDiff) return primaryDiff * direction

    const rarityDiff = (Number(right.rarity) || 0) - (Number(left.rarity) || 0)
    if (rarityDiff) return rarityDiff
    return compareAgentRelease(left, right)
  })
}

export function filterAgentEntries(entries, filters, favoriteIds) {
  const options = filters || {}
  const favorites = favoriteSet(favoriteIds)
  const query = String(options.query || '').trim().toLowerCase()
  const statuses = selectedSet(options.statuses || options.status)
  const rarities = selectedSet(options.rarities || options.rarity)
  const profs = selectedSet(options.profs || options.prof)
  const subProfs = selectedSet(options.subProfs || options.subProf)
  return (Array.isArray(entries) ? entries : []).filter(function (entry) {
    const owned = (Number(entry.count) || 0) > 0
    if (!agentMatchesGame(entry, options.game)) return false
    if (statuses.size === 1 && statuses.has('owned') && !owned) return false
    if (statuses.size === 1 && statuses.has('missing') && owned) return false
    if ((options.favoriteOnly || options.favoriteMode === 'only') && !favorites.has(entry.id)) return false
    if (rarities.size && !rarities.has(String(entry.rarity))) return false
    if (profs.size && !profs.has(String(entry.prof))) return false
    if (subProfs.size && !subProfs.has(String(entry.subProf))) return false
    if (query) {
      const haystack = [entry.id, entry.name, entry.rarity, entry.prof, entry.subProf].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

function groupRank(groupBy, value) {
  if (groupBy === 'prof') {
    const index = PROF_ORDER.indexOf(value)
    return index === -1 ? PROF_ORDER.length : index
  }
  if (groupBy === 'subProf') {
    const index = SUB_PROF_ORDER.indexOf(value)
    return index === -1 ? SUB_PROF_ORDER.length : index
  }
  return 0
}

export function buildAgentGroups(entries, groupBy) {
  const list = Array.isArray(entries) ? entries : []
  if (!groupBy || groupBy === 'none') return [{ id: 'all', label: '', entries: list }]
  const groups = new Map()
  list.forEach(function (entry) {
    const value = String(entry[groupBy] || '未标注')
    if (!groups.has(value)) groups.set(value, [])
    groups.get(value).push(entry)
  })
  return Array.from(groups.entries()).map(function (pair) {
    return {
      id: groupBy + ':' + pair[0],
      label: pair[0],
      value: pair[0],
      entries: pair[1]
    }
  }).sort(function (left, right) {
    return groupRank(groupBy, left.value) - groupRank(groupBy, right.value) || left.value.localeCompare(right.value, 'zh-CN')
  })
}
