import { isStarStoneAllowedForOperator } from '../data/starStones.js'
import { sortYuanStarInventoryEntries } from '../data/starInventoryOrder.js'

export const STAR_LOADOUT_SLOTS = Object.freeze([
  'main1', 'main2', 'main3', 'support1', 'support2', 'support3',
])

const SLOT_SET = new Set(STAR_LOADOUT_SLOTS)

export function slotKind(slot) {
  if (typeof slot !== 'string') return null
  if (slot.indexOf('main') === 0 && SLOT_SET.has(slot)) return 'main'
  if (slot.indexOf('support') === 0 && SLOT_SET.has(slot)) return 'support'
  return null
}

function instanceId(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function operatorIdOf(operator) {
  if (operator == null) return ''
  if (typeof operator === 'string') return operator
  return String(operator.id || operator.operatorId || operator.operator_id || '').trim()
}

export function emptyLoadout() {
  return {
    main1: null, main2: null, main3: null,
    support1: null, support2: null, support3: null,
  }
}

export function normalizeLoadout(loadout) {
  const source = loadout && typeof loadout === 'object' ? loadout : {}
  const normalized = emptyLoadout()
  STAR_LOADOUT_SLOTS.forEach(function (slot) { normalized[slot] = instanceId(source[slot]) })
  return normalized
}

export function cloneLoadout(loadout) {
  return normalizeLoadout(loadout)
}

function normalizeLoadouts(loadouts) {
  const source = loadouts && typeof loadouts === 'object' ? loadouts : {}
  const normalized = {}
  Object.keys(source).forEach(function (operatorId) {
    normalized[operatorId] = normalizeLoadout(source[operatorId])
  })
  return normalized
}

function occupancyIndex(loadouts) {
  const index = new Map()
  Object.keys(loadouts || {}).forEach(function (operatorId) {
    const loadout = normalizeLoadout(loadouts[operatorId])
    STAR_LOADOUT_SLOTS.forEach(function (slot) {
      const id = loadout[slot]
      if (id && !index.has(id)) index.set(id, { operatorId, slot })
    })
  })
  return index
}

export function normalizeStarInventoryEntry(entry) {
  const source = entry && typeof entry === 'object' ? entry : {}
  const rawKind = String(source.kind || source.type || '').trim()
  const kind = rawKind === 'main' || rawKind === '主星' ? 'main'
    : rawKind === 'support' || rawKind === 'assist' || rawKind === '辅星' ? 'support'
      : null
  return {
    instanceId: instanceId(source.instance_id || source.instanceId || source.id),
    kind,
    name: typeof source.name === 'string' ? source.name.trim() : '',
    quality: source.quality == null ? null : source.quality,
    level: source.level == null ? null : source.level,
  }
}

function operatorName(operatorId, map, resolver) {
  const mapped = map instanceof Map ? map.get(operatorId) : map && map[operatorId]
  if (mapped) return mapped
  if (typeof resolver === 'function') return resolver(operatorId) || '其他密探'
  return '其他密探'
}

function targetOperatorFrom(args) {
  return args.targetOperator || args.operator || { id: args.targetOperatorId }
}

export function groupSlots(kind) {
  return kind === 'main' ? ['main1', 'main2', 'main3'] : kind === 'support' ? ['support1', 'support2', 'support3'] : []
}

export function nextGroupSlot({ loadout, kind, replacementSlot = null }) {
  if (replacementSlot && slotKind(replacementSlot) === kind) return replacementSlot
  const normalized = normalizeLoadout(loadout)
  return groupSlots(kind).find(function (slot) { return !normalized[slot] }) || null
}

function inventoryNameByInstance(inventoryEntries, id) {
  const entry = (inventoryEntries || []).find(function (item) {
    return normalizeStarInventoryEntry(item).instanceId === id
  })
  return entry ? normalizeStarInventoryEntry(entry).name : ''
}

export function groupContainsStarName({ loadouts, targetOperatorId, targetSlot, name, inventoryEntries }) {
  const kind = slotKind(targetSlot)
  if (!kind || !name) return false
  const loadout = normalizeLoadout((loadouts || {})[String(targetOperatorId || '').trim()])
  return groupSlots(kind).some(function (slot) {
    return slot !== targetSlot && inventoryNameByInstance(inventoryEntries, loadout[slot]) === name
  })
}

export function canAssignStarInstance({ loadouts, targetOperatorId, targetSlot, instanceId: nextInstanceId, inventoryEntries }) {
  const id = instanceId(nextInstanceId)
  if (!id || !slotKind(targetSlot)) return { allowed: false, reason: '请选择有效星石槽位' }
  const name = inventoryNameByInstance(inventoryEntries, id)
  if (!name) return { allowed: true, reason: '' }
  if (groupContainsStarName({ loadouts, targetOperatorId, targetSlot, name, inventoryEntries })) {
    return { allowed: false, reason: '当前' + (slotKind(targetSlot) === 'main' ? '主星' : '辅星') + '已选择「' + name + '」' }
  }
  return { allowed: true, reason: '' }
}

export function buildStarLoadoutCandidates(args = {}) {
  const selectedKind = slotKind(args.selectedSlot)
  if (!selectedKind) return []
  const targetOperator = targetOperatorFrom(args)
  const targetOperatorId = operatorIdOf(targetOperator) || String(args.targetOperatorId || '')
  const occupied = occupancyIndex(args.loadouts)
  const inventory = sortYuanStarInventoryEntries(args.inventoryEntries)

  return inventory.reduce(function (candidates, entry) {
    const candidate = normalizeStarInventoryEntry(entry)
    if (!candidate.instanceId || candidate.kind !== selectedKind) return candidates
    if (!isStarStoneAllowedForOperator(candidate.name, targetOperator)) return candidates
    const owner = occupied.get(candidate.instanceId) || null
    if (args.hideEquipped && owner && owner.operatorId !== targetOperatorId) return candidates
    candidates.push(Object.assign(candidate, {
      occupiedBy: owner && {
        operatorId: owner.operatorId,
        operatorName: operatorName(owner.operatorId, args.operatorDisplayNameMap, args.resolveOperatorName),
        slot: owner.slot,
      },
    }))
    return candidates
  }, [])
}

function dedupeLoadouts(loadouts, preferred) {
  const seen = new Set()
  const preferredId = preferred && preferred.instanceId
  if (preferredId && loadouts[preferred.operatorId]) {
    loadouts[preferred.operatorId][preferred.slot] = preferredId
    seen.add(preferredId)
  }
  Object.keys(loadouts).forEach(function (operatorId) {
    STAR_LOADOUT_SLOTS.forEach(function (slot) {
      if (preferredId && operatorId === preferred.operatorId && slot === preferred.slot) return
      const id = loadouts[operatorId][slot]
      if (!id) return
      if (seen.has(id)) loadouts[operatorId][slot] = null
      else seen.add(id)
    })
  })
  return loadouts
}

export function assignInstanceToDraft({ loadouts, targetOperatorId, targetSlot, instanceId: nextInstanceId, inventoryEntries }) {
  const targetId = String(targetOperatorId || '').trim()
  const id = instanceId(nextInstanceId)
  if (!targetId) throw new TypeError('targetOperatorId is required')
  if (!slotKind(targetSlot)) throw new TypeError('targetSlot must be one of the six star loadout slots')
  const draft = normalizeLoadouts(loadouts)
  if (!draft[targetId]) draft[targetId] = emptyLoadout()
  const allowed = canAssignStarInstance({ loadouts: draft, targetOperatorId: targetId, targetSlot, instanceId: id, inventoryEntries })
  if (id && !allowed.allowed) return dedupeLoadouts(draft)
  if (id) {
    Object.keys(draft).forEach(function (operatorId) {
      STAR_LOADOUT_SLOTS.forEach(function (slot) {
        if (draft[operatorId][slot] === id) draft[operatorId][slot] = null
      })
    })
  }
  draft[targetId][targetSlot] = id
  return dedupeLoadouts(draft, id ? { operatorId: targetId, slot: targetSlot, instanceId: id } : null)
}

export function clearDraftSlot({ loadouts, targetOperatorId, targetSlot }) {
  const targetId = String(targetOperatorId || '').trim()
  if (!targetId) throw new TypeError('targetOperatorId is required')
  if (!slotKind(targetSlot)) throw new TypeError('targetSlot must be one of the six star loadout slots')
  const draft = normalizeLoadouts(loadouts)
  if (!draft[targetId]) draft[targetId] = emptyLoadout()
  draft[targetId][targetSlot] = null
  return dedupeLoadouts(draft)
}

export function chooseBestMatchingInstance(args = {}) {
  const requiredKind = args.requiredKind === 'assist' ? 'support' : args.requiredKind
  if ((requiredKind !== 'main' && requiredKind !== 'support') || !args.requiredName) return null
  const targetOperator = targetOperatorFrom(args)
  const targetOperatorId = operatorIdOf(targetOperator) || String(args.targetOperatorId || '')
  const protectedIds = new Set(args.protectedOperatorIds || [])
  const occupied = occupancyIndex(args.loadouts)
  const matches = sortYuanStarInventoryEntries(args.inventoryEntries).filter(function (entry) {
    const candidate = normalizeStarInventoryEntry(entry)
    return candidate.instanceId && candidate.kind === requiredKind && candidate.name === args.requiredName
      && isStarStoneAllowedForOperator(candidate.name, targetOperator)
  })
  const tiers = [
    function (owner) { return owner && owner.operatorId === targetOperatorId },
    function (owner) { return !owner },
    function (owner) { return !args.hideEquipped && owner && owner.operatorId !== targetOperatorId && !protectedIds.has(owner.operatorId) },
  ]
  for (const belongsToTier of tiers) {
    const entry = matches.find(function (current) { return belongsToTier(occupied.get(normalizeStarInventoryEntry(current).instanceId) || null) })
    if (entry) return normalizeStarInventoryEntry(entry)
  }
  return null
}
