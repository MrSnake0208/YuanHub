import { isMovieOperator } from './operatorForms.js'

export function operatorHuajiMax(entry) {
  return !isMovieOperator(entry) && Number(entry?.rarity) === 3 ? 19 : 25
}

export function operatorHuaji(entry = {}) {
  if (entry.huaji && typeof entry.huaji.owned === 'boolean') {
    const value = { ...entry.huaji }
    if (value.stage > operatorHuajiMax(entry)) value.stage = null
    return value
  }
  const raw = entry.starLevel ?? entry.star_level
  if (raw == null) return { owned: false, stage: null, awakened: null }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) return { owned: false, stage: null, awakened: null }
  if (!value) return { owned: false, stage: 0, awakened: null }
  if (isMovieOperator(entry)) return { owned: true, stage: value <= 5 ? 6 * (value - 1) + 1 : null, awakened: null }
  if (Number(entry.rarity) === 3 && value > 19) return { owned: true, stage: null, awakened: null }
  if (value === 31) return { owned: true, stage: null, awakened: true }
  return { owned: true, stage: value <= 30 ? Math.min(value, 25) : null, awakened: null }
}

export function operatorHuajiDraft(entry, starLevel) {
  const current = operatorHuaji(entry)
  const scalar = current.stage == null ? Number(entry?.starLevel ?? entry?.star_level) || 0
    : isMovieOperator(entry) && current.stage > 0 ? (current.stage - 1) / 6 + 1 : current.stage
  if (Number(starLevel) === scalar) return current
  const changed = operatorHuaji({ ...entry, huaji: null, starLevel: Number(starLevel) })
  return { ...changed, awakened: changed.owned ? current.awakened : null }
}

export function operatorHuajiLabel(entry) {
  const value = operatorHuaji(entry)
  if (!value.owned) return '未拥有'
  const stage = value.stage
  const label = stage == null ? '化极待确认' : stage === operatorHuajiMax(entry) ? (Math.floor((stage - 1) / 6) + 1) + ' 星' : isMovieOperator(entry)
    ? Math.floor((stage - 1) / 6) + 1 + ' 星'
    : Math.floor((stage - 1) / 6) + 1 + ' 星 · ' + ((stage - 1) % 6) + ' 节点'
  if (stage == null && value.awakened === true) return label + ' · 已觉醒（历史确认）'
  return label + (value.awakened === true ? ' · 已觉醒' : stage == null || (stage === 25 && !isMovieOperator(entry) && Number(entry?.rarity) !== 3)
    ? value.awakened === false ? ' · 未觉醒' : ' · 觉醒待确认' : '')
}

export function operatorAwakeningSupported(entry) {
  const capabilities = entry?.huajiCapabilities || entry?.huaji_capabilities
  const knownSp = ['char_084_chendengsp', 'char_085_shizimiaosp'].includes(entry?.id ?? entry?.operatorId ?? entry?.operator_id)
  return [4, 5].includes(Number(entry?.rarity)) &&
    (capabilities?.awakening_supported ?? capabilities?.awakeningSupported ?? (!isMovieOperator(entry) || knownSp)) === true
}

export function operatorAwakeningUpgradeSupported(entry) {
  const capabilities = entry?.huajiCapabilities || entry?.huaji_capabilities
  return !isMovieOperator(entry) && operatorAwakeningSupported(entry) &&
    (capabilities?.awakening_upgrade_supported ?? capabilities?.awakeningUpgradeSupported) === true
}

export function operatorHuajiAction(entry) {
  const value = operatorHuaji(entry)
  if (isMovieOperator(entry)) return { kind: 'unsupported', label: 'SP 材料规则待确认', disabled: true }
  if (!value.owned) return { kind: 'unowned', label: '未拥有', disabled: true }
  if (value.stage == null) return { kind: 'unknown', label: value.awakened === true ? '已觉醒 · 化极待确认' : '化极待确认', disabled: true }
  if (value.stage < 1 || value.stage > operatorHuajiMax(entry)) return { kind: 'unknown', label: '化极待复核', disabled: true }
  if (value.stage < operatorHuajiMax(entry)) return { kind: 'upgrade', label: '提升至下一节点', disabled: false }
  if (operatorAwakeningSupported(entry) && value.awakened !== true) return { kind: 'awakening', label: value.awakened == null ? '确认觉醒状态' : '记录已觉醒', disabled: false }
  return { kind: 'complete', label: operatorAwakeningSupported(entry) ? '养成已完成' : '化极已满阶', disabled: true }
}

export function operatorHuajiComplete(entry) {
  return operatorHuajiAction(entry).kind === 'complete'
}
