import { calculateLevelRequirements, calculateXiuweiRequirements, mergeRequirements } from './operatorRequirements.js'
import { allocateSharedPlannerStock } from './cultivationPlanner.js'
import { BOOK_VALUES, bookExperience } from './operatorTraining.js'
import { getMaxEliteForLevel, isLevelBreakthroughBoundary, validLevelBreakthroughStage } from '../utils/operatorGrowthRules.js'

const ATTRIBUTES = ['风', '火', '地', '水', '阴', '阳', '混沌']
const PROFESSIONS = ['破军', '龙盾', '岐黄', '神纪', '诡道']
const ATTRIBUTE_GROUPS = { 风: 'fh', 火: 'fh', 地: 'ds', 水: 'ds', 阴: 'yy', 阳: 'yy' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
const reason = (demandId, field, code, message) => ({ demandId, field, code, message })
const unknownCost = unsupportedReasons => ({ items: null, experience: null, money: null, unsupportedReasons })

/** Returns {valid, errors: {[demandId]: {[fieldPath]: message}}}; never normalizes input. */
export function validateReserveDemand(demand) {
  const demandId = typeof demand?.id === 'string' ? demand.id : '$demand'
  const fields = Object.create(null)
  function shape(value, allowed, prefix = '') {
    if (!isObject(value)) {
      fields[prefix || '$demand'] = '需求必须为对象'
      return false
    }
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) fields[prefix ? `${prefix}.${key}` : key] = '不支持的字段'
    }
    return true
  }
  if (shape(demand, ['id', 'count', 'attribute', 'profession', 'current', 'target'])) {
    if (typeof demand.id !== 'string' || !UUID.test(demand.id)) fields.id = '需求 ID 必须为 UUID'
    if (!integerIn(demand.count, 1, 999)) fields.count = '人数须为 1–999 的整数'
    if (!ATTRIBUTES.includes(demand.attribute)) fields.attribute = '请选择有效属性'
    if (!PROFESSIONS.includes(demand.profession)) fields.profession = '请选择有效职业'
    for (const key of ['current', 'target']) {
      const state = demand[key]
      if (!shape(state, key === 'current' ? ['level', 'elite', 'breakthrough_stage'] : ['level', 'elite'], key)) continue
      if (!integerIn(state.level, 0, 100)) fields[`${key}.level`] = '等级须为 0–100 的整数'
      if (!integerIn(state.elite, 0, 17)) fields[`${key}.elite`] = '修为须为 0–17 的整数'
      else if (!fields[`${key}.level`] && state.elite > getMaxEliteForLevel(state.level)) fields[`${key}.elite`] = '修为超过该等级上限'
    }
    if (isObject(demand.current)) {
      const { level, breakthrough_stage: stage } = demand.current
      if (stage !== undefined && stage !== null && !validLevelBreakthroughStage(level, stage)) fields['current.breakthrough_stage'] = '突破阶段与当前等级不匹配'
    }
    if (isObject(demand.current) && isObject(demand.target)) {
      for (const key of ['level', 'elite']) {
        if (!fields[`current.${key}`] && !fields[`target.${key}`] && demand.target[key] < demand.current[key]) fields[`target.${key}`] = '目标不得低于当前值'
      }
    }
  }
  const valid = Object.keys(fields).length === 0
  return { valid, errors: valid ? {} : { [demandId]: { ...fields } } }
}

/** Gross cost for the entire demand group; unsupported/invalid costs are null, not zero. */
export function reserveDemandCost(demand) {
  const validation = validateReserveDemand(demand)
  if (!validation.valid) return unknownCost(Object.entries(validation.errors).flatMap(([id, fields]) =>
    Object.entries(fields).map(([field, message]) => reason(id, field, 'invalid_demand', message))))

  const { id, count, attribute, profession, current, target } = demand
  const unsupportedReasons = []
  if (attribute === '混沌') unsupportedReasons.push(reason(id, 'attribute', 'unsupported_attribute', '混沌暂无规则'))
  if (isLevelBreakthroughBoundary(current.level) && current.breakthrough_stage == null && target.level > current.level) {
    unsupportedReasons.push(reason(id, 'current.breakthrough_stage', 'unconfirmed_breakthrough', '需确认突破'))
  }
  if (unsupportedReasons.length) return unknownCost(unsupportedReasons)

  const level = calculateLevelRequirements(current.level, target.level, profession, false, current.breakthrough_stage)
  const single = mergeRequirements(level, calculateXiuweiRequirements(current.elite, target.elite, ATTRIBUTE_GROUPS[attribute]))
  return {
    items: Object.fromEntries(Object.entries(single.items).map(([key, value]) => [key, value * count])),
    experience: level.experience * count,
    money: single.money * count,
    unsupportedReasons: []
  }
}

/**
 * One independent plan: gross totals plus shortage {items, experience} (money stays gross).
 * stock must be a loaded item map; null/omitted means unavailable, {} means known empty.
 * Plan metadata/workspace persistence validation belongs to the reserve API.
 */
export function reservePlanRequirements(plan, stock = null) {
  if (!isObject(plan) || !Array.isArray(plan.demands) || plan.demands.length > 50) {
    return { ...unknownCost([reason(null, 'demands', 'invalid_plan', '方案须包含至多 50 组需求')]), shortage: null }
  }
  const seen = new Set()
  const costs = Array.from(plan.demands, demand => {
    const cost = reserveDemandCost(demand)
    if (seen.has(demand?.id)) cost.unsupportedReasons.push(reason(demand?.id ?? null, 'id', 'duplicate_demand', '同一方案的需求 ID 不可重复'))
    seen.add(demand?.id)
    return cost
  })
  const unsupportedReasons = costs.flatMap(cost => cost.unsupportedReasons)
  if (unsupportedReasons.length) return { ...unknownCost(unsupportedReasons), shortage: null }

  const { items, money } = mergeRequirements(...costs)
  const experience = costs.reduce((sum, cost) => sum + cost.experience, 0)
  const total = { items, experience, money, unsupportedReasons: [] }
  const stockIds = new Set([...Object.keys(items), ...Object.keys(BOOK_VALUES)])
  const validStock = isObject(stock) && [...stockIds].every(id =>
    !Object.hasOwn(stock, id) || (Number.isSafeInteger(stock[id]) && stock[id] >= 0))
  const ownedExperience = validStock ? bookExperience(stock) : null
  if (!validStock || !Number.isSafeInteger(ownedExperience)) {
    return { ...total, unsupportedReasons: [reason(null, 'stock', 'inventory_unavailable', '库存暂不可用')], shortage: null }
  }
  // 先汇总全部需求，再抵扣一次；经验只使用三种兵书合成的同一余额。
  const remaining = allocateSharedPlannerStock({ total: { ...items, __xp__: experience } }, { ...stock, __xp__: ownedExperience }).total
  const { __xp__, ...remainingItems } = remaining
  return { ...total, shortage: { items: remainingItems, experience: __xp__ } }
}
