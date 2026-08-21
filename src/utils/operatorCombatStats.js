// 密探攻击力 / 生命力的前端适配层。
// 规则数据来自本地保存的代号鸢 WIKI 面板计算器页面；扫描值和手动覆盖值仍保持独立，
// 这样后续接入扫描 JSON 时不会把观测值误当成官方公式的输入。

import {
  OPERATOR_PANEL_ROLES,
  OPERATOR_PANEL_STONES,
  OPERATOR_PANEL_STONE_GROUPS
} from '../data/operatorPanelCalculator.js'

const MAX_CURIOS = 24
export const OPERATOR_ODDITY_KEYS = ['attack', 'hp', 'special']
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
    return [type, textOrEmpty(stone.name), Math.max(0, Math.trunc(Number(stone.level) || 0))]
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
    elite: Math.max(0, Math.trunc(Number(input.elite) || 0)),
    starLevel: Math.max(0, Math.trunc(Number(input.starLevel) || 0)),
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

const PANEL_LEVELS = [50, 60, 80, 90, 100]
const PANEL_ELITE_CAPS = [7, 9, 13, 15, 17]

function panelTierForLevel(level) {
  const index = PANEL_LEVELS.indexOf(Math.trunc(Number(level) || 0))
  return index === -1 ? 0 : index + 1
}

function finiteArrayValue(values, index) {
  if (!Array.isArray(values) || index < 0 || index >= values.length) return 0
  const value = Number(values[index])
  return Number.isFinite(value) ? value : 0
}

function stoneLevelIndex(level) {
  const value = Math.max(0, Math.min(60, Math.trunc(Number(level) || 0)))
  if (!value) return -1
  // Wiki select values reserve one slot after each 10/20/30/40/50 level.
  return value + Math.floor((value - 1) / 10)
}

function normalizePanelStones(stones) {
  const list = []
  Object.keys(stones || {}).forEach(function (type) {
    const stone = stones[type] || {}
    const name = textOrEmpty(stone.name)
    if (!name) return
    const rarity = Math.max(1, Math.min(3, Math.trunc(Number(stone.rarity != null ? stone.rarity : stone.levelType) || 1)))
    const level = Math.max(0, Math.min(60, Math.trunc(Number(stone.level) || 0)))
    if (!level) return
    const data = OPERATOR_PANEL_STONES.find(function (item) {
      return item.StoneName === name && item.Level === rarity
    })
    if (!data) return
    list.push({ type: type, name: name, rarity: rarity, level: level, data: data })
  })
  return list
}

function calculatePanelStoneValues(stones) {
  const entries = normalizePanelStones(stones)
  let hpFlat = 0
  let hpPercent = 0
  let attackFlat = 0
  let attackPercent = 0
  const names = []
  entries.forEach(function (entry) {
    const index = stoneLevelIndex(entry.level) - 1
    const data = entry.data
    hpFlat += finiteArrayValue(data.HP_Value, index)
    hpPercent += finiteArrayValue(data.HP_Percent, index)
    attackFlat += finiteArrayValue(data.ATK_Value, index)
    attackPercent += finiteArrayValue(data.ATK_Percent, index)
    if (names.indexOf(entry.name) === -1) names.push(entry.name)
  })
  if (entries.length) {
    const maxRarity = Math.max.apply(null, entries.map(function (entry) { return entry.rarity }))
    const groupIndex = Math.max(0, Math.min(4, 5 - maxRarity))
    OPERATOR_PANEL_STONE_GROUPS.Group.forEach(function (group) {
      if (!Array.isArray(group.StoneNames) || !group.StoneNames.every(function (name) { return names.indexOf(name) !== -1 })) return
      const value = finiteArrayValue(group.values, groupIndex)
      if (group.valueType === '生命值') hpFlat += value
      if (group.valueType === '生命率') hpPercent += value
      if (group.valueType === '攻击值') attackFlat += value
      if (group.valueType === '攻击率') attackPercent += value
    })
  }
  return { hpFlat: hpFlat, hpPercent: hpPercent, attackFlat: attackFlat, attackPercent: attackPercent, entries: entries }
}

function panelStarValues(starLevel) {
  const value = Math.max(0, Math.trunc(Number(starLevel) || 0))
  if (!value) return { pay: 0, multiplier: 0 }
  if (value >= 31) return { pay: 20, multiplier: 0.35 }
  const star = Math.floor((value - 1) / 6) + 1
  const node = (value - 1) % 6
  const multiplier = star >= 5 ? 0.25 : Math.max(0, (star - 1) * 0.05)
  return { pay: Math.min(20, (star - 1) * 5 + node), multiplier: multiplier }
}

function sumPromotion(values, pay, parity) {
  let total = 0
  const count = Math.min(20, Math.max(0, Math.trunc(Number(pay) || 0)))
  for (let step = 1; step <= count; step += 1) {
    if (step % 2 !== parity) continue
    const index = parity === 1 ? Math.floor(step / 2) : Math.floor(step / 2) - 1
    total += finiteArrayValue(values, index)
  }
  return total
}

function panelRoleForInput(input) {
  const name = textOrEmpty(input && (input.operatorName || input.name))
  return OPERATOR_PANEL_ROLES.find(function (role) { return role.roleName === name }) || null
}

// 代号鸢 WIKI 面板公式：
//   （等级基础值 + 化极固定值 + 星石固定值 + 奇闻）×（1 + 化极百分比 + 星石百分比 + 修为百分比）
// Wiki 数据只给出 50+7 / 60+9 / 80+13 / 90+15 / 100+17 五个完整节点；
// 中间等级不做插值，以免把阶段白值伪装成精确面板。
export function calculateWikiOperatorCombatStats(input) {
  input = input || {}
  const role = panelRoleForInput(input)
  if (!role) return { status: 'unsupported', source: 'rules', reason: '暂时无法计算该密探的面板数据' }
  const levelTier = panelTierForLevel(input.level)
  if (!levelTier || Math.trunc(Number(input.elite) || 0) !== PANEL_ELITE_CAPS[levelTier - 1]) {
    return { status: 'unsupported', source: 'rules', reason: '仅提供完整等级·修为节点，暂时无法计算当前组合' }
  }
  const tier = levelTier
  const baseIndex = tier - 1
  const baseHp = finiteArrayValue(role.Level_HP, baseIndex)
  const baseAttack = finiteArrayValue(role.Level_ATK, baseIndex)
  if (baseHp === 0 && baseAttack === 0) {
    return { status: 'unsupported', source: 'rules', reason: '该密探在当前养成节点尚无基础面板数据' }
  }
  const star = panelStarValues(input.starLevel)
  const promotionsHp = sumPromotion(role.Pay_HP, star.pay, 1)
  const promotionsAttack = sumPromotion(role.Pay_ATK, star.pay, 0)
  const stone = calculatePanelStoneValues(input.stones)
  const curios = Array.isArray(input.curios) ? input.curios : []
  const hasOddities = input.oddities && typeof input.oddities === 'object' && !Array.isArray(input.oddities)
  const oddities = hasOddities ? normalizeOperatorOddities(input.oddities, []) : null
  const curioHp = oddities
    ? (finiteOrNull(oddities.hp && oddities.hp.current) || 0)
    : curios.reduce(function (sum, curio) { return sum + (finiteOrNull(curio && curio.hp) || 0) }, 0)
  const curioAttack = oddities
    ? (finiteOrNull(oddities.attack && oddities.attack.current) || 0)
    : curios.reduce(function (sum, curio) { return sum + (finiteOrNull(curio && curio.attack) || 0) }, 0)
  const hpPercent = star.multiplier + stone.hpPercent + (tier >= 2 ? 0.05 : 0)
  const attackPercent = star.multiplier + stone.attackPercent + (tier >= 4 ? 0.05 : 0)
  const hp = (baseHp + promotionsHp + stone.hpFlat + curioHp) * (1 + hpPercent)
  const attack = (baseAttack + promotionsAttack + stone.attackFlat + curioAttack) * (1 + attackPercent)
  return {
    attack: Number(attack.toFixed(6)),
    hp: Number(hp.toFixed(6)),
    status: 'calculated',
    source: 'rules',
    tier: tier,
    attackPercent: attackPercent,
    hpPercent: hpPercent,
    breakdown: {
      baseAttack: baseAttack,
      baseHp: baseHp,
      promotionAttack: promotionsAttack,
      promotionHp: promotionsHp,
      stoneAttack: stone.attackFlat,
      stoneHp: stone.hpFlat,
      curiosAttack: curioAttack,
      curiosHp: curioHp,
      stoneEntries: stone.entries
    }
  }
}

export function calculateOperatorCombatStats({ stored, input, calculator } = {}) {
  const normalized = normalizeOperatorCombatStats(stored)
  const signature = combatInputSignature(input)
  const localReferenceSignature = normalized.frontendObservedSignature || (normalized.observedInputs && (normalized.observedInputs.signature || normalized.observedInputs.inputSignature))
  const backendReferenceSignature = normalized.combatInputSignature && !/^sha256:/i.test(normalized.combatInputSignature)
    ? normalized.combatInputSignature
    : ''
  const observedInputs = normalized.observedInputs || {}
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
  const changedSinceObservation = localReferenceSignature
    ? localReferenceSignature !== signature
    : (primitiveInputChanged || (normalized.observedStatus === 'stale' && !manualPersistedAtCurrentInput) || (!!backendReferenceSignature && backendReferenceSignature !== signature))
  const hasManualCorrection = normalized.manualAttack != null || normalized.manualHp != null

  const compute = calculator || calculateWikiOperatorCombatStats
  if (compute && typeof compute === 'function') {
    const result = calculator
      ? (compute({ stored: normalized, input: input || {}, signature: signature }) || {})
      : (compute(input || {}) || {})
    if (result.status === 'unsupported') {
      const useManual = hasManualCorrection
      return {
        attack: useManual && normalized.manualAttack != null ? normalized.manualAttack : normalized.attack,
        hp: useManual && normalized.manualHp != null ? normalized.manualHp : normalized.hp,
        attackLabel: valueLabel(useManual && normalized.manualAttack != null ? normalized.manualAttack : normalized.attack),
        hpLabel: valueLabel(useManual && normalized.manualHp != null ? normalized.manualHp : normalized.hp),
        automaticAttack: null,
        automaticHp: null,
        automaticAttackLabel: '—',
        automaticHpLabel: '—',
        status: useManual ? 'manual' : (normalized.attack != null || normalized.hp != null ? (changedSinceObservation ? 'stale' : 'observed') : 'missing'),
        source: useManual ? 'manual' : normalized.source,
        reason: result.reason,
        changedSinceObservation: changedSinceObservation,
        inputSignature: signature,
        manualFallbackAvailable: false,
        automaticResultAvailable: false,
        automaticAttackAvailable: false,
        automaticHpAvailable: false
      }
    }
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
      breakdown: result.breakdown,
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
    automaticAttack: null,
    automaticHp: null,
    automaticAttackLabel: '—',
    automaticHpLabel: '—',
    status: hasManualCorrection && !changedSinceObservation ? 'manual' : (hasObservedValue ? (changedSinceObservation ? 'stale' : 'observed') : 'missing'),
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
  if (status === 'stale') return '扫描值待重算'
  if (status === 'observed') return source === 'manual' ? '手动记录' : '扫描记录'
  return '暂无扫描属性'
}
