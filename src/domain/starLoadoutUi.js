import { MAIN_STAR_OPTIONS, ASSIST_STAR_OPTIONS } from '../data/starCatalog.js'
import { starUsageTags } from '../data/starUsageTags.js'
import { assignInstanceToDraft, chooseBestMatchingInstance, slotKind } from './starLoadout.js'

const catalogFor = { main: MAIN_STAR_OPTIONS, support: ASSIST_STAR_OPTIONS }

export function splitStarTokens(value) {
  return String(value || '').split(/[\s,，]+/).map(function (token) { return token.trim() }).filter(Boolean).slice(0, 3)
}

export function canonicalPresetNames(value, kind) {
  const catalog = catalogFor[kind] || []
  const invalid = []
  const tokens = String(value || '').split(/[\s,，]+/).map(function (token) { return token.trim() }).filter(Boolean)
  if (tokens.length > 3) invalid.push('每套最多 3 颗星石')
  const names = tokens.map(function (token) {
    if (catalog.includes(token)) return token
    invalid.push(token)
    return null
  }).filter(Boolean)
  if (new Set(names).size !== names.length) invalid.push('重复星石名称')
  return { names, invalid, valid: names.length >= 1 && names.length <= 3 && !invalid.length }
}

export function filterStarCandidates(candidates, { usage = '', query = '' } = {}) {
  const tokens = splitStarTokens(query)
  return (candidates || []).filter(function (candidate) {
    return (!usage || starUsageTags(candidate.name).includes(usage))
      && (!tokens.length || tokens.some(function (token) { return candidate.name.includes(token) }))
  })
}

export function applySessionPreset({ names, kind, draftLoadouts, targetOperator, inventoryEntries, hideEquipped }) {
  const slots = (kind === 'main' ? ['main1', 'main2', 'main3'] : ['support1', 'support2', 'support3'])
  const selected = names.slice(0, 3)
  if (new Set(selected).size !== selected.length) return { loadouts: draftLoadouts, message: '预设包含重复星石名称' }
  const replaceAll = selected.length === 3
  let loadouts = draftLoadouts
  const messages = []
  let nameIndex = 0
  slots.forEach(function (slot, index) {
    if (!replaceAll && loadouts[targetOperator.id] && loadouts[targetOperator.id][slot]) return
    const name = selected[replaceAll ? index : nameIndex]
    if (!name) return
    nameIndex += 1
    const found = chooseBestMatchingInstance({ inventoryEntries, loadouts, targetOperator, targetOperatorId: targetOperator.id, requiredKind: kind, requiredName: name, hideEquipped })
    if (!found) messages.push(name + '：无可用实例或当前密探不可佩戴')
    else {
      loadouts = assignInstanceToDraft({ loadouts, targetOperatorId: targetOperator.id, targetSlot: slot, instanceId: found.instanceId, inventoryEntries })
    }
  })
  return { loadouts, message: messages.length ? messages.join('；') : '' }
}

export function presetIsCustom(preset, kind, loadout, instanceMap) {
  if (!preset) return false
  const slots = kind === 'main' ? ['main1', 'main2', 'main3'] : ['support1', 'support2', 'support3']
  return preset.names.join('|') !== slots.map(function (slot) { const item = instanceMap[loadout && loadout[slot]]; return item && item.name || '' }).filter(Boolean).join('|')
}
