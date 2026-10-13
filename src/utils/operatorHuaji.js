import { isMovieOperator } from './operatorForms.js'

export function operatorHuajiMax(entry) {
  return !isMovieOperator(entry) && Number(entry?.rarity) === 3 ? 24 : 25
}

export function operatorHuaji(entry = {}) {
  if (entry.huaji && typeof entry.huaji.owned === 'boolean') return { ...entry.huaji }
  const raw = entry.starLevel ?? entry.star_level
  if (raw == null) return { owned: false, stage: null, awakened: null }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) return { owned: false, stage: null, awakened: null }
  if (!value) return { owned: false, stage: 0, awakened: null }
  if (isMovieOperator(entry)) return { owned: true, stage: value <= 5 ? 6 * (value - 1) + 1 : null, awakened: null }
  if (Number(entry.rarity) === 3 && value > 24) return { owned: true, stage: null, awakened: null }
  if (value === 31) return { owned: true, stage: null, awakened: true }
  return { owned: true, stage: value <= 30 ? Math.min(value, 25) : null, awakened: null }
}

export function operatorHuajiLabel(entry) {
  const value = operatorHuaji(entry)
  if (!value.owned) return '未拥有'
  const stage = value.stage
  const label = stage == null ? '化极待确认' : stage === 25 ? '5 星' : isMovieOperator(entry)
    ? Math.floor((stage - 1) / 6) + 1 + ' 星'
    : Math.floor((stage - 1) / 6) + 1 + ' 星 · ' + ((stage - 1) % 6) + ' 节点'
  return label + (value.awakened === true ? ' · 已觉醒' : value.awakened === false ? ' · 未觉醒' : ' · 觉醒待确认')
}

export function operatorHuajiComplete(entry) {
  const value = operatorHuaji(entry)
  return value.owned && value.stage != null && value.stage >= operatorHuajiMax(entry)
}
