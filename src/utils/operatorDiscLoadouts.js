export const DISC_LOADOUT_LIMIT = 2
export const DISC_SELECTION_LIMIT = 3
export const DISC_STATUSES = { unmarked: '未标记', reroll: '待洗', perfect: '完美盘' }

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
    discNames: discNames,
    status: Object.hasOwn(DISC_STATUSES, source.status) ? source.status : 'unmarked',
    targetDiscNames: normalizeDiscNames(source.targetDiscNames || source.targetDiscs || source.target_discs)
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

export function discLoadoutPayload(loadout, index) {
  const normalized = createDiscLoadout(index, loadout)
  return {
    id: normalized.id,
    name: normalized.name,
    discs: normalized.discNames.map(ot_name => ({ ot_name })),
    status: normalized.status,
    target_discs: normalized.targetDiscNames.map(ot_name => ({ ot_name }))
  }
}

export function discTargetDifference(current, target) {
  const actual = normalizeDiscNames(current)
  const desired = normalizeDiscNames(target)
  const removed = actual.filter(name => !desired.includes(name))
  const added = desired.filter(name => !actual.includes(name))
  const complete = desired.length === DISC_SELECTION_LIMIT
  return { removed, added, complete, count: complete ? added.length : null, targetCount: desired.length }
}

export function discTargetSummary(loadouts) {
  const normalized = createDiscLoadoutState(loadouts).loadouts
  if (normalized.every(item => item.status === 'perfect')) return '✓ 两套完美'
  return normalized.flatMap((item, index) => {
    if (item.status === 'unmarked') return []
    const prefix = index === 0 ? '①' : '②'
    if (item.status === 'perfect') return [prefix + ' ✓ 完美']
    const diff = discTargetDifference(item.discNames, item.targetDiscNames)
    let detail = '目标未设置'
    if (diff.targetCount && !diff.complete) detail = '目标 ' + diff.targetCount + '/3'
    if (diff.complete) {
      detail = !diff.count ? '目标已达成'
        : diff.removed.length >= diff.added.length ? '改' + diff.count + '处' : '差' + diff.count + '项'
    }
    return [prefix + ' 待洗·' + detail]
  }).join('　')
}

export function hasRerollDisc(loadouts) {
  return (Array.isArray(loadouts) ? loadouts : []).some(item => item.status === 'reroll')
}
