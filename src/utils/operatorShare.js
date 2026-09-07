import { matchesProfSubFilter } from './operatorFilters.js'
import { calculateOperatorCombatStats, normalizeOperatorCombatStats } from './operatorCombatStats.js'

function text(value) {
  return value == null ? '' : String(value).trim()
}

export function parseOperatorShareToken(input) {
  const value = text(input)
  if (!value) return ''

  try {
    const url = new URL(value, 'https://yuanhub.invalid')
    const match = url.pathname.match(/\/operator\/share\/([^/]+)\/?$/)
    if (match) {
      const token = decodeURIComponent(match[1]).trim()
      return token && !/[\s/?#]/.test(token) ? token : ''
    }
  } catch (_) {
    return ''
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.includes('/') || /[\s?#]/.test(value)) return ''
  try {
    const token = decodeURIComponent(value).trim()
    return token && !/[\s/?#]/.test(token) ? token : ''
  } catch (_) {
    return ''
  }
}

function operatorId(operator) {
  return text(operator && (operator.operator_id || operator.operatorId || operator.id))
}

const SHARE_STATUS_ORDER = { active: 0, graduated: 1, skip: 2 }
const SHARE_PROF_ORDER = { 地: 0, 水: 1, 火: 2, 风: 3, 阳: 4, 阴: 5, 混沌: 6 }
const OPERATOR_LEVEL_MAX = 100
const OPERATOR_ELITE_MAX = 17

export function operatorShareGrowthState(entry) {
  const growth = entry && entry.growth && typeof entry.growth === 'object' ? entry.growth : {}
  const state = text(growth.growth_state || growth.growthState || entry && (entry.growth_state || entry.growthState))
  return Object.prototype.hasOwnProperty.call(SHARE_STATUS_ORDER, state) ? state : 'active'
}

function operatorReleaseOrder(id) {
  const match = text(id).match(/char_(\d+)/)
  return match ? Number(match[1]) : -1
}

function firstProf(entry) {
  const value = entry && entry.prof
  if (Array.isArray(value)) return text(value[0])
  return text(value).split('、')[0]
}

function growthNumber(entry, snakeKey, camelKey) {
  const growth = entry && entry.growth && typeof entry.growth === 'object' ? entry.growth : {}
  const value = growth[snakeKey] != null ? growth[snakeKey] : growth[camelKey]
  return Number(value) || 0
}

export function compareOperatorShareEntries(a, b) {
  let difference = (SHARE_STATUS_ORDER[operatorShareGrowthState(a)] ?? 99) - (SHARE_STATUS_ORDER[operatorShareGrowthState(b)] ?? 99)
  if (difference) return difference
  difference = (Number(b && b.rarity) || 0) - (Number(a && a.rarity) || 0)
  if (difference) return difference
  difference = growthNumber(b, 'level', 'level') - growthNumber(a, 'level', 'level')
  if (difference) return difference
  difference = growthNumber(b, 'star_level', 'starLevel') - growthNumber(a, 'star_level', 'starLevel')
  if (difference) return difference
  difference = (SHARE_PROF_ORDER[firstProf(a)] ?? 99) - (SHARE_PROF_ORDER[firstProf(b)] ?? 99)
  if (difference) return difference
  difference = operatorReleaseOrder(b && b.id) - operatorReleaseOrder(a && a.id)
  if (difference) return difference
  return text(a && (a.name || a.id)).localeCompare(text(b && (b.name || b.id)), 'zh-CN')
}

export function mergeOperatorShareEntries(share, catalog) {
  const operators = catalog && Array.isArray(catalog.operators) ? catalog.operators : []
  const byId = new Map(operators.map(function (operator, index) {
    return [operatorId(operator), { operator: operator, order: index }]
  }))
  const entries = share && share.entries && typeof share.entries === 'object' ? share.entries : {}

  return Object.entries(entries).map(function ([id, growth]) {
    const hit = byId.get(id)
    const operator = hit ? hit.operator : {}
    return {
      id: id,
      name: text(operator.name) || '未知密探',
      alias: text(operator.alias),
      avatar: text(operator.avatar),
      rarity: Number(operator.rarity) || 0,
      prof: Array.isArray(operator.prof) ? operator.prof : text(operator.prof) ? [operator.prof] : [],
      sub_prof: Array.isArray(operator.sub_prof) ? operator.sub_prof : text(operator.sub_prof) ? [operator.sub_prof] : [],
      discs: Array.isArray(operator.discs) ? operator.discs : [],
      sp_of: text(operator.sp_of || operator.spOf),
      oddity_schema: operator.oddity_schema || operator.odditySchema || {},
      growth: growth && typeof growth === 'object' ? growth : {},
      order: hit ? hit.order : Number.MAX_SAFE_INTEGER
    }
  }).sort(compareOperatorShareEntries)
}

export function filterOperatorShareEntries(entries, search, prof, subProf) {
  const query = text(search).toLowerCase()
  return (Array.isArray(entries) ? entries : []).filter(function (entry) {
    if (!matchesProfSubFilter(entry, prof, subProf)) return false
    if (!query) return true
    return [entry.name, entry.alias, entry.id].some(function (value) {
      return text(value).toLowerCase().includes(query)
    })
  })
}

export function operatorShareStarLabel(value, isSp) {
  const level = Math.max(0, Math.trunc(Number(value) || 0))
  if (!level) return '未招募'
  if (isSp) return level + ' 星'
  if (level === 31) return '觉醒'
  if (level <= 30) return Math.floor((level - 1) / 6) + 1 + ' 星 · ' + ((level - 1) % 6) + ' 节点'
  return String(level)
}

export function operatorShareLevelComplete(value) {
  const level = Math.max(0, Math.trunc(Number(value) || 0))
  return level >= OPERATOR_LEVEL_MAX
}

export function operatorShareEliteComplete(levelValue, eliteValue) {
  const level = Math.min(OPERATOR_LEVEL_MAX, Math.max(0, Math.trunc(Number(levelValue) || 0)))
  const elite = Math.max(0, Math.trunc(Number(eliteValue) || 0))
  const maxElite = Math.min(OPERATOR_ELITE_MAX, Math.max(0, Math.floor(level / 5) - 3))
  return maxElite > 0 && elite >= maxElite
}

export function operatorShareStarCompleteLabel(value, isSp) {
  const level = Math.max(0, Math.trunc(Number(value) || 0))
  return !isSp && level === 31 ? '已觉醒' : ''
}

function shareGrowth(entry) {
  return entry && entry.growth && typeof entry.growth === 'object' ? entry.growth : {}
}

function shareGrowthNumber(growth, snakeKey, camelKey) {
  const value = growth[snakeKey] != null ? growth[snakeKey] : growth[camelKey]
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function shareStoneMap(growth) {
  const source = Array.isArray(growth.star_stones)
    ? growth.star_stones
    : Array.isArray(growth.starStones)
      ? growth.starStones
      : []
  return source.reduce(function (result, stone, index) {
    if (!stone || typeof stone !== 'object') return result
    const type = text(stone.type) || 'stone' + (index + 1)
    result[type] = {
      name: text(stone.name),
      level: Math.max(0, Math.trunc(Number(stone.level) || 0)),
      rarity: stone.rarity
    }
    return result
  }, {})
}

export function operatorShareCombatInput(entry) {
  const growth = shareGrowth(entry)
  const stored = growth.combat_stats || growth.combatStats || {}
  const normalized = normalizeOperatorCombatStats(stored, entry && (entry.oddity_schema || entry.odditySchema))
  return {
    operatorName: text(entry && entry.name),
    level: shareGrowthNumber(growth, 'level', 'level'),
    elite: shareGrowthNumber(growth, 'elite', 'elite'),
    starLevel: shareGrowthNumber(growth, 'star_level', 'starLevel'),
    stones: shareStoneMap(growth),
    oddities: normalized.oddities
  }
}

export function operatorShareCombatResult(entry) {
  const growth = shareGrowth(entry)
  return calculateOperatorCombatStats({
    stored: growth.combat_stats || growth.combatStats || {},
    input: operatorShareCombatInput(entry)
  })
}

export function operatorShareCombatValue(entry, key) {
  const result = operatorShareCombatResult(entry)
  return key === 'hp' ? result.hpLabel : result.attackLabel
}

export function operatorShareCombatSource(entry, key) {
  const result = operatorShareCombatResult(entry)
  const automaticAvailable = key === 'hp' ? result.automaticHpAvailable : result.automaticAttackAvailable
  if (result.status === 'manual') return '手动校正'
  if (automaticAvailable && result.status === 'calculated') return '自动计算'
  if (result.status === 'observed') return '观测记录'
  if (result.status === 'stale') return '观测记录（待更新）'
  return result.reason || '暂无可用面板数据'
}
