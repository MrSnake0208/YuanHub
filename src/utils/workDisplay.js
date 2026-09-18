const STATUS = Object.freeze({
  exact: { label: '完整兼容', description: '核心语义可以完整表达。' },
  partial: { label: '部分兼容', description: '存在明确降级，不建议直接执行。' },
  unsupported: { label: '不兼容', description: '关键语义无法安全表示。' }
})

const ACTION_LABELS = Object.freeze({
  attack: 'A 普攻',
  ultimate: '↑ 大招',
  defense: '↓ 防御',
  sp: '圈 SP',
  pause: '暂停',
  interaction: '关卡内互动',
  restart: '立即重开'
})

const CONDITION_LABELS = Object.freeze({
  party_survives: '全员存活',
  operator_alive: '存活',
  operator_present: '仍在场',
  operator_copied: '鹦鹉复制',
  dragon_qi: '龙气',
  star_count: '星数量',
  crit: '暴击'
})

const FAIL_LABELS = Object.freeze({ restart: '重开', stop: '停止', pause: '暂停' })
const STAR_LABELS = Object.freeze({ orange: '橙星', purple: '紫星', blue: '蓝星' })

export function statusInfo(status) {
  return STATUS[status] || { label: '状态未知', description: '接口返回了未知兼容状态。' }
}

export function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch (_) {
    return '[无法序列化]'
  }
}

export function formatDate(value) {
  if (!value) return '未提供'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false })
}

export function formatMetric(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '未提供'
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return Number.isInteger(number) ? String(number) : number.toFixed(digits).replace(/\.0+$/, '')
}

export function normalizeOperators(value) {
  const operators = Array.isArray(value) ? value.slice(0, 5) : []
  while (operators.length < 5) operators.push(null)
  return operators
}

export function actionSlot(action) {
  if (!action || !['attack', 'ultimate', 'defense', 'sp', 'operator_action'].includes(action.type)) return null
  return Number.isInteger(action.slot) && action.slot >= 1 && action.slot <= 5 ? action.slot : null
}

export function describeCondition(condition) {
  if (!condition || typeof condition !== 'object') return '未知条件 ' + safeJson(condition)
  const slot = Number.isInteger(condition.slot) ? condition.slot + '号位' : ''
  switch (condition.type) {
    case 'party_survives': return CONDITION_LABELS.party_survives
    case 'operator_alive': return slot + CONDITION_LABELS.operator_alive
    case 'operator_present': return slot + CONDITION_LABELS.operator_present
    case 'operator_copied': return slot + CONDITION_LABELS.operator_copied
    case 'dragon_qi': return (slot ? slot + ' ' : '') + CONDITION_LABELS.dragon_qi + ' ' + condition.operator + ' ' + condition.value
    case 'star_count': return (STAR_LABELS[condition.color] || String(condition.color || '未知颜色星')) + ' ' + condition.operator + ' ' + condition.value
    case 'crit': return CONDITION_LABELS.crit
    default: return '未知条件 ' + safeJson(condition)
  }
}

export function describeAction(action) {
  if (!action || typeof action !== 'object') return '未知动作 ' + safeJson(action)
  if (ACTION_LABELS[action.type]) return ACTION_LABELS[action.type]
  switch (action.type) {
    case 'wait': return '等待 ' + action.duration_ms + 'ms'
    case 'switch_target': return '向' + (action.direction === 'left' ? '左' : action.direction === 'right' ? '右' : '未知方向') + '切目标' + (action.count > 1 ? ' × ' + action.count : '')
    case 'auto_battle': return (action.enabled ? '开启' : '关闭') + '自动战斗'
    case 'operator_action': return action.action === 'switch_form' ? action.slot + '号位切换形态' : '未知动作 ' + safeJson(action)
    case 'check': return '检查：' + describeCondition(action.condition) + '；失败时' + (FAIL_LABELS[action.on_fail] || String(action.on_fail || '未知处理'))
    default: return '未知动作 ' + safeJson(action)
  }
}

export function buildRoundRows(rounds) {
  return (Array.isArray(rounds) ? rounds : []).map(function (round) {
    const slots = [[], [], [], [], []]
    const process = []
    const actions = Array.isArray(round && round.actions) ? round.actions : []
    actions.forEach(function (action, index) {
      const entry = { index: index + 1, text: describeAction(action) }
      const slot = actionSlot(action)
      if (slot) slots[slot - 1].push(entry)
      else process.push(entry)
    })
    return {
      round: round && round.round,
      remark: round && round.remark,
      slots,
      process
    }
  })
}
