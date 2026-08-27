export const DISC_LOADOUT_LIMIT = 2
export const DISC_SELECTION_LIMIT = 3

export function discNameOf(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  return String(value.ot_name || value.otName || '').trim()
}

export function normalizeDiscNames(values) {
  const seen = new Set()
  return (Array.isArray(values) ? values : [])
    .map(discNameOf)
    .filter(function (name) {
      if (!name || seen.has(name)) return false
      seen.add(name)
      return true
    })
    .slice(0, DISC_SELECTION_LIMIT)
}

export function automaticDiscLoadoutName(values) {
  const names = normalizeDiscNames(values)
  return names.length ? names.join(' · ') : '未配置命盘'
}

export function createDiscLoadout(index, source) {
  source = source || {}
  const discNames = normalizeDiscNames(source.discNames || source.discs)
  const automaticName = automaticDiscLoadoutName(discNames)
  const suppliedName = String(source.name || '').trim()
  const nameMode = source.nameMode === 'manual' || (suppliedName && suppliedName !== automaticName)
    ? 'manual'
    : 'auto'
  return {
    id: String(source.id || 'disc_' + (index + 1)),
    name: nameMode === 'manual' ? suppliedName : automaticName,
    nameMode: nameMode,
    discNames: discNames
  }
}

export function createDiscLoadoutState(loadouts, legacyDiscs, activeIndex) {
  const source = Array.isArray(loadouts) ? loadouts.slice(0, DISC_LOADOUT_LIMIT) : []
  if (!source.length) source.push({ discs: legacyDiscs || [] })
  while (source.length < DISC_LOADOUT_LIMIT) source.push({})
  const normalizedActiveIndex = Number(activeIndex) === 1 ? 1 : 0
  return {
    loadouts: source.map(function (loadout, index) { return createDiscLoadout(index, loadout) }),
    activeIndex: normalizedActiveIndex
  }
}

export function discSelectionSignature(values) {
  return normalizeDiscNames(values).slice().sort().join('\u0000')
}
