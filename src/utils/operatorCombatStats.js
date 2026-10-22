// 密探攻击力 / 生命力的前端适配层。
// 自动面板只消费后端结果；扫描值和手动覆盖值保持独立。

import { OPERATOR_LEVEL_MAX, OPERATOR_ELITE_MAX, operatorLevelBreakthroughStage } from './operatorGrowthRules.js'

const MAX_CURIOS = 24
export const OPERATOR_ODDITY_KEYS = ['attack', 'hp', 'special']

export function operatorOddityCurrentError(key, raw, max) {
  const value = Number(raw)
  if (raw === '' || raw == null || !Number.isFinite(value)) return '请填写有效数值'
  if (value < 0) return '需为非负数'
  if (key === 'special' ? value !== Number(value.toFixed(1)) : !Number.isInteger(value)) {
    return key === 'special' ? '最多一位小数' : '必须填写整数'
  }
  if (max !== '' && max != null && value > Number(max)) return '不能超过公共图鉴上限 ' + max
  return ''
}

export function formatOperatorOddityCurrent(key, raw) {
  if (raw === '' || raw == null || !Number.isFinite(Number(raw))) return '—'
  const value = Number(raw)
  return (key === 'special' ? value : Math.round(value)).toLocaleString('zh-CN', { maximumFractionDigits: key === 'special' ? 1 : 0 })
}

export function fillOperatorDraftToMax(draft, odditySchema) {
  draft.levelBreakthroughStage = 9
  draft.level = OPERATOR_LEVEL_MAX
  draft.elite = OPERATOR_ELITE_MAX
  return fillOperatorOdditiesToMax(draft, odditySchema)
}

export function fillOperatorOdditiesToMax(draft, odditySchema) {
  const schema = normalizeOperatorOdditySchema(odditySchema)
  return OPERATOR_ODDITY_KEYS.filter(function (key) {
    const max = schema[key].max
    if (max == null || max < 0) return true
    draft.combatStats.oddities[key].current = max
    return false
  })
}

const ODDITY_FALLBACK_NAMES = {
  attack: '攻击力',
  hp: '生命值',
  special: '第三属性（图鉴待维护）'
}

function finiteOrNull(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function textOrEmpty(value) {
  return value == null ? '' : String(value).trim()
}

function firstObject(...values) {
  return values.find(function (value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }) || {}
}

function normalizeDisplayMode(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    attack: source.attack === 'auto' || source.attack === 'manual' ? source.attack : null,
    hp: source.hp === 'auto' || source.hp === 'manual' ? source.hp : null
  }
}

function normalizeCurio(value, index) {
  const source = typeof value === 'object' && value ? value : {}
  return {
    id: textOrEmpty(source.id) || 'curio_' + (index + 1),
    name: textOrEmpty(source.name || source.label),
    attack: finiteOrNull(source.attack != null ? source.attack : source.attackFlat),
    hp: finiteOrNull(source.hp != null ? source.hp : (source.health != null ? source.health : source.hpFlat))
  }
}

function normalizeCurios(value) {
  if (Array.isArray(value)) {
    return value.slice(0, MAX_CURIOS).map(normalizeCurio)
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).slice(0, MAX_CURIOS).map(function (key, index) {
      return normalizeCurio(Object.assign({ name: key }, value[key]), index)
    })
  }
  return []
}

function canonicalOddityKey(value) {
  const key = textOrEmpty(value)
  if (OPERATOR_ODDITY_KEYS.indexOf(key) !== -1) return key
  if (['攻击', '攻击值', '攻击力', 'ATK', 'atk'].indexOf(key) !== -1) return 'attack'
  if (['生命', '生命值', '生命力', 'HP', 'hp'].indexOf(key) !== -1) return 'hp'
  return ''
}

function normalizeOddityEntry(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : { current: value }
  const current = finiteOrNull(source.current != null ? source.current : (source.value != null ? source.value : source.now))
  const max = finiteOrNull(source.max != null ? source.max : (source.limit != null ? source.limit : source.cap))
  return {
    current: current == null ? 0 : current,
    max: max
  }
}

export function normalizeOperatorOdditySchema(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const result = {}
  OPERATOR_ODDITY_KEYS.forEach(function (key) {
    const entry = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : {}
    result[key] = {
      name: textOrEmpty(entry.name || entry.label) || ODDITY_FALLBACK_NAMES[key],
      max: finiteOrNull(entry.max != null ? entry.max : (entry.limit != null ? entry.limit : entry.cap))
    }
  })
  return result
}

// 完成状态只接受明确记录的稳定键与当前公共上限，不使用归一化补零或旧 max。
export function operatorOddityCompletion(oddities, schema) {
  const validNumber = function (value) {
    return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
      Number.isFinite(Number(value)) && Number(value) >= 0
  }
  let full = true
  for (const key of OPERATOR_ODDITY_KEYS) {
    const label = key === 'special' ? '第三项' : (key === 'attack' ? '攻击奇闻' : '生命奇闻')
    const entry = oddities && oddities[key]
    if (!entry || !Object.prototype.hasOwnProperty.call(entry, 'current')) {
      return { status: 'unknown', reason: label + '尚未记录' }
    }
    if (!validNumber(entry.current)) {
      return { status: 'unknown', reason: label + '当前值无效' }
    }
    const max = schema && schema[key] && schema[key].max
    if (!validNumber(max)) {
      return { status: 'unknown', reason: label + '图鉴上限缺失或无效' }
    }
    if (Number(entry.current) > Number(max)) {
      return { status: 'unknown', reason: label + '当前值超过图鉴上限' }
    }
    if (Number(entry.current) < Number(max)) full = false
  }
  return { status: full ? 'full' : 'incomplete', reason: '' }
}

export function normalizeOperatorOddities(value, legacyCurios, odditySchema) {
  const parsed = {}
  const assign = function (rawName, rawValue) {
    const key = canonicalOddityKey(rawName) || (parsed.special ? '' : 'special')
    if (!key) return
    parsed[key] = normalizeOddityEntry(rawValue)
  }
  if (Array.isArray(value)) {
    value.slice(0, OPERATOR_ODDITY_KEYS.length).forEach(function (entry) {
      const source = entry && typeof entry === 'object' ? entry : {}
      assign(source.key || source.id || source.name || source.label, source)
    })
  } else if (value && typeof value === 'object') {
    Object.keys(value).forEach(function (name) { assign(name, value[name]) })
  }

  const legacy = Array.isArray(legacyCurios) ? legacyCurios : []
  const legacyAttack = legacy.reduce(function (sum, curio) { return sum + (finiteOrNull(curio && curio.attack) || 0) }, 0)
  const legacyHp = legacy.reduce(function (sum, curio) { return sum + (finiteOrNull(curio && curio.hp) || 0) }, 0)
  const schema = normalizeOperatorOdditySchema(odditySchema)
  const result = {}
  OPERATOR_ODDITY_KEYS.forEach(function (key) {
    const fallbackCurrent = key === 'attack' ? legacyAttack : (key === 'hp' ? legacyHp : 0)
    result[key] = {
      current: parsed[key] ? parsed[key].current : fallbackCurrent,
      // 有公共图鉴 schema 时，上限必须以服务端为准；无 schema 的旧数据只保留原值。
      max: schema[key].max == null ? (parsed[key] ? parsed[key].max : null) : schema[key].max
    }
  })
  return result
}

export function normalizeOperatorCombatStats(raw, odditySchema) {
  raw = raw || {}
  const source = firstObject(
    raw.combatStats,
    raw.combat_stats,
    raw.extensions && (raw.extensions.stats || raw.extensions.combatStats),
    raw.stats,
    raw
  )
  const observedInputs = firstObject(source.observedInputs, source.observed_inputs, source.reference)
  const curios = normalizeCurios(source.curios || source.qiwen || source.anecdotes || source.anecdote)
  const oddities = normalizeOperatorOddities(source.oddities || source.oddity || raw.oddities, curios, odditySchema)
  const observedAttack = finiteOrNull(source.observedAttack != null ? source.observedAttack : source.observed_attack)
  const observedHp = finiteOrNull(source.observedHp != null ? source.observedHp : source.observed_hp)
  const result = {
    attack: finiteOrNull(source.attack) != null ? finiteOrNull(source.attack) : observedAttack,
    hp: finiteOrNull(source.hp != null ? source.hp : (source.health != null ? source.health : source.life)) != null
      ? finiteOrNull(source.hp != null ? source.hp : (source.health != null ? source.health : source.life))
      : observedHp,
    manualAttack: finiteOrNull(source.manualAttack != null ? source.manualAttack : (source.manual_attack != null ? source.manual_attack : source.overrideAttack)),
    manualHp: finiteOrNull(source.manualHp != null ? source.manualHp : (source.manual_hp != null ? source.manual_hp : source.overrideHp)),
    curios: curios,
    oddities: oddities,
    source: textOrEmpty(source.source) || (source.attack != null || source.hp != null ? 'scan' : 'unknown'),
    observedInputs: Object.keys(observedInputs).length ? observedInputs : null,
    observedAt: textOrEmpty(source.observedAt || source.observed_at),
    rulesVersion: textOrEmpty(source.rulesVersion || source.rules_version),
    version: Number(source.version) || 2
  }
  if (Object.prototype.hasOwnProperty.call(source, 'displayMode') || Object.prototype.hasOwnProperty.call(source, 'display_mode')) {
    result.displayModePresent = true
    result.displayMode = normalizeDisplayMode(source.displayMode != null ? source.displayMode : source.display_mode)
  }
  // 只有后端/采集端明确提供时才暴露观测元数据，保持旧本地快照对象的结构兼容。
  if (source.observedStatus != null || source.observed_status != null) {
    result.observedStatus = textOrEmpty(source.observedStatus || source.observed_status) || (observedAttack != null || observedHp != null ? 'valid' : 'unavailable')
  }
  if (source.combatInputSignature != null || source.combat_input_signature != null) {
    result.combatInputSignature = textOrEmpty(source.combatInputSignature || source.combat_input_signature)
  }
  if (source.frontendObservedSignature != null || source.frontend_observed_signature != null) {
    result.frontendObservedSignature = textOrEmpty(source.frontendObservedSignature || source.frontend_observed_signature)
  }
  return result
}

export function createOperatorCombatStats(raw) {
  return normalizeOperatorCombatStats(raw)
}

function normalizeStoneInputs(stones) {
  return Object.keys(stones || {}).sort().map(function (type) {
    const stone = stones[type] || {}
    return [type, textOrEmpty(stone.name), Math.max(0, Math.trunc(Number(stone.level) || 0)),
      ...(stone.quality !== undefined || stone.breakthroughStage !== undefined
        ? [stone.quality ?? null, stone.breakthroughStage ?? null] : [])]
  })
}

export function combatInputSignature(input) {
  input = input || {}
  const curios = Array.isArray(input.curios) ? input.curios : []
  const hasOddities = input.oddities && typeof input.oddities === 'object' && !Array.isArray(input.oddities)
  const oddities = hasOddities ? normalizeOperatorOddities(input.oddities, []) : null
  return JSON.stringify({
    operatorName: textOrEmpty(input.operatorName || input.name),
    level: Math.max(0, Math.trunc(Number(input.level) || 0)),
    levelBreakthroughStage: operatorLevelBreakthroughStage(input),
    elite: Math.max(0, Math.trunc(Number(input.elite) || 0)),
    starLevel: Math.max(0, Math.trunc(Number(input.starLevel) || 0)),
    huaji: input.huaji || null,
    stones: normalizeStoneInputs(input.stones),
    oddities: oddities ? OPERATOR_ODDITY_KEYS.map(function (key) {
      return [key, finiteOrNull(oddities[key].current)]
    }) : [],
    curios: curios.map(function (curio, index) {
      return [
        textOrEmpty(curio && (curio.id || curio.name)) || 'curio_' + index,
        finiteOrNull(curio && curio.attack),
        finiteOrNull(curio && curio.hp)
      ]
    })
  })
}

function valueLabel(value) {
  return value == null ? '—' : Math.max(0, Math.round(value)).toLocaleString('zh-CN')
}

export function calculateOperatorCombatStats({ stored, input, serverResult, allowAutomatic = true } = {}) {
  const normalized = normalizeOperatorCombatStats(stored)
  const signature = combatInputSignature(input)
  const localReferenceSignature = normalized.frontendObservedSignature || (normalized.observedInputs && (normalized.observedInputs.signature || normalized.observedInputs.inputSignature))
  const backendReferenceSignature = normalized.combatInputSignature && !/^sha256:/i.test(normalized.combatInputSignature)
    ? normalized.combatInputSignature
    : ''
  const rawInputs = normalized.observedInputs || {}
  const observedInputs = { ...rawInputs, starLevel: rawInputs.starLevel ?? rawInputs.star_level }
  const primitiveInputChanged = [
    ['level', input && input.level],
    ['elite', input && input.elite],
    ['starLevel', input && input.starLevel]
  ].some(function ([key, value]) {
    return observedInputs[key] != null && Number(observedInputs[key]) !== Number(value)
  })
  const manualPersistedAtCurrentInput = normalized.source === 'manual' &&
    observedInputs.level != null && Number(observedInputs.level) === Number(input && input.level) &&
    observedInputs.elite != null && Number(observedInputs.elite) === Number(input && input.elite) &&
    observedInputs.starLevel != null && Number(observedInputs.starLevel) === Number(input && input.starLevel)
  const independentHuajiChanged = !localReferenceSignature && (Object.keys(rawInputs).length > 0 || Boolean(backendReferenceSignature)) && Boolean(input?.huaji) && JSON.stringify(observedInputs.huaji || null) !== JSON.stringify(input.huaji)
  const capturedStage = operatorLevelBreakthroughStage(observedInputs)
  const currentStage = operatorLevelBreakthroughStage(input)
  const breakthroughUnverified = currentStage == null || (capturedStage == null && !(localReferenceSignature === signature && currentStage != null)) || normalized.observedStatus === 'unverified'
  const breakthroughChanged = capturedStage != null && currentStage !== capturedStage
  const changedSinceObservation = breakthroughChanged || independentHuajiChanged || (localReferenceSignature
    ? localReferenceSignature !== signature
    : (primitiveInputChanged || (normalized.observedStatus === 'stale' && !manualPersistedAtCurrentInput) || (!!backendReferenceSignature && backendReferenceSignature !== signature)))
  const hasManualCorrection = normalized.manualAttack != null || normalized.manualHp != null

  if (allowAutomatic && serverResult?.status === 'calculated' &&
      Number.isSafeInteger(serverResult.attack) && serverResult.attack >= 0 &&
      Number.isSafeInteger(serverResult.hp) && serverResult.hp >= 0) {
    const result = serverResult
    const useManual = hasManualCorrection && !changedSinceObservation
    return {
      attack: useManual && normalized.manualAttack != null ? normalized.manualAttack : finiteOrNull(result.attack),
      hp: useManual && normalized.manualHp != null ? normalized.manualHp : finiteOrNull(result.hp),
      attackLabel: valueLabel(useManual && normalized.manualAttack != null ? normalized.manualAttack : result.attack),
      hpLabel: valueLabel(useManual && normalized.manualHp != null ? normalized.manualHp : result.hp),
      automaticAttack: finiteOrNull(result.attack),
      automaticHp: finiteOrNull(result.hp),
      automaticAttackLabel: valueLabel(result.attack),
      automaticHpLabel: valueLabel(result.hp),
      status: useManual ? 'manual' : (result.status || 'calculated'),
      source: useManual ? 'manual' : (result.source || 'calculated'),
      reason: result.reason,
      changedSinceObservation: changedSinceObservation,
      inputSignature: signature,
      manualFallbackAvailable: hasManualCorrection && changedSinceObservation,
      automaticResultAvailable: finiteOrNull(result.attack) != null || finiteOrNull(result.hp) != null,
      automaticAttackAvailable: finiteOrNull(result.attack) != null,
      automaticHpAvailable: finiteOrNull(result.hp) != null
    }
  }

  const hasObservedValue = normalized.manualAttack != null || normalized.manualHp != null || normalized.attack != null || normalized.hp != null
  return {
    attack: normalized.manualAttack != null && !changedSinceObservation ? normalized.manualAttack : normalized.attack,
    hp: normalized.manualHp != null && !changedSinceObservation ? normalized.manualHp : normalized.hp,
    attackLabel: valueLabel(normalized.manualAttack != null && !changedSinceObservation ? normalized.manualAttack : normalized.attack),
    hpLabel: valueLabel(normalized.manualHp != null && !changedSinceObservation ? normalized.manualHp : normalized.hp),
    panelStatus: serverResult?.status || 'idle',
    missingFields: serverResult?.missing_fields || [],
    reason: serverResult?.reason,
    automaticAttack: null,
    automaticHp: null,
    automaticAttackLabel: '—',
    automaticHpLabel: '—',
    status: hasObservedValue && !changedSinceObservation && breakthroughUnverified ? 'unverified' : hasManualCorrection && !changedSinceObservation ? 'manual' : (hasObservedValue ? (changedSinceObservation ? 'stale' : 'observed') : 'missing'),
    source: hasManualCorrection && !changedSinceObservation ? 'manual' : normalized.source,
    changedSinceObservation: changedSinceObservation,
    inputSignature: signature,
    manualFallbackAvailable: hasManualCorrection && changedSinceObservation,
    automaticResultAvailable: false,
    automaticAttackAvailable: false,
    automaticHpAvailable: false
  }
}

export function combatStatsSourceLabel(source, status) {
  if (status === 'calculated') return '自动计算'
  if (status === 'manual') return '手动修正'
  if (status === 'unverified') return '突破待核对'
  if (status === 'stale') return '扫描值待重算'
  if (status === 'observed') return source === 'manual' ? '手动记录' : '扫描记录'
  return '暂无扫描属性'
}
