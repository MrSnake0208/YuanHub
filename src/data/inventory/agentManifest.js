const PROF_ORDER = ['阳', '阴', '火', '风', '水', '地', '混沌']
const SUB_PROF_ORDER = ['神纪', '诡道', '破军', '岐黄', '龙盾']

function favoriteSet(favoriteIds) {
  return favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds || [])
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

export function sortAgentEntries(entries, mode, favoriteIds) {
  const favorites = favoriteSet(favoriteIds)
  return (Array.isArray(entries) ? entries : []).slice().sort(function (left, right) {
    if (mode === 'favorite') {
      const favoriteDiff = Number(favorites.has(right.id)) - Number(favorites.has(left.id))
      if (favoriteDiff) return favoriteDiff
    }
    if (mode === 'count') {
      const countDiff = (Number(right.count) || 0) - (Number(left.count) || 0)
      if (countDiff) return countDiff
    }
    if (mode === 'rarity') {
      const rarityDiff = (Number(right.rarity) || 0) - (Number(left.rarity) || 0)
      if (rarityDiff) return rarityDiff
    }
    if (mode === 'name') {
      const nameDiff = String(left.name || left.id).localeCompare(String(right.name || right.id), 'zh-CN')
      if (nameDiff) return nameDiff
    }
    return compareAgentRelease(left, right)
  })
}

export function filterAgentEntries(entries, filters, favoriteIds) {
  const options = filters || {}
  const favorites = favoriteSet(favoriteIds)
  const query = String(options.query || '').trim().toLowerCase()
  return (Array.isArray(entries) ? entries : []).filter(function (entry) {
    const owned = (Number(entry.count) || 0) > 0
    if (options.status === 'owned' && !owned) return false
    if (options.status === 'missing' && owned) return false
    if (options.favoriteOnly && !favorites.has(entry.id)) return false
    if (options.rarity && String(entry.rarity) !== String(options.rarity)) return false
    if (options.prof && entry.prof !== options.prof) return false
    if (options.subProf && entry.subProf !== options.subProf) return false
    if (query) {
      const haystack = [entry.id, entry.name, entry.rarity, entry.prof, entry.subProf].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

function groupRank(groupBy, value) {
  if (groupBy === 'rarity') return -Number(value)
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
    const value = groupBy === 'rarity' ? String(entry.rarity || '未标注') : String(entry[groupBy] || '未标注')
    if (!groups.has(value)) groups.set(value, [])
    groups.get(value).push(entry)
  })
  return Array.from(groups.entries()).map(function (pair) {
    return {
      id: groupBy + ':' + pair[0],
      label: groupBy === 'rarity' && /^\d+$/.test(pair[0]) ? pair[0] + ' 星' : pair[0],
      value: pair[0],
      entries: pair[1]
    }
  }).sort(function (left, right) {
    return groupRank(groupBy, left.value) - groupRank(groupBy, right.value) || left.value.localeCompare(right.value, 'zh-CN')
  })
}
