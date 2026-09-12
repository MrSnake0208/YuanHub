import { BOOK_VALUES, TRAINING_GROUPS, normalizeTrainingLevels } from './operatorTraining.js'

// 这些规则是 v13 demo 的可替换假设。真实游戏规则确认后，只需替换这里，
// 规划器的状态传播和界面不需要跟着重写。
export const PLANNER_RULES = Object.freeze({
  version: 13,
  baseDailyStamina: 408,
  purchaseStamina: 60,
  trialStamina: 20,
  stage624Stamina: 10,
  stage624Experience: 38 * BOOK_VALUES.bingshucanjuan,
  maxPurchaseCount: 8,
  maxDispatchCount: 4,
  trainingDailyLimit: 6,
  maxEtaDays: 90
})

export const PURCHASE_CUMULATIVE = Object.freeze([0, 50, 100, 200, 300, 450, 600, 850, 1100])

export const GAIN_CHANNELS = Object.freeze([
  { id: 'natural', label: '自然恢复', colorKey: 'natural', kind: 'energy', defaultValue: 288 },
  { id: 'meal', label: '每日进膳', colorKey: 'meal', kind: 'energy', defaultValue: 120 },
  { id: 'mail', label: '邮箱储备', colorKey: 'mail', kind: 'energy', defaultValue: 60 },
  { id: 'event', label: '活动奖励', colorKey: 'event', kind: 'energy', defaultValue: 60 },
  { id: 'gift', label: '礼包体力', colorKey: 'gift', kind: 'energy', defaultValue: 60 },
  { id: 'buy', label: '购买体力', colorKey: 'buy', kind: 'count', defaultValue: 1 },
  { id: 'custom', label: '自定义来源', colorKey: 'custom', kind: 'energy', defaultValue: 60 }
])

export const SPEND_CHANNELS = Object.freeze([
  { id: 'luoyang', label: '洛阳派遣', colorKey: 'luoyang', kind: 'count', costPer: 72 },
  { id: 'shouchun', label: '寿春派遣', colorKey: 'shouchun', kind: 'count', costPer: 80 },
  { id: 'feng', label: '风火历练', colorKey: 'feng', kind: 'training' },
  { id: 'dishui', label: '地水历练', colorKey: 'dishui', kind: 'training' },
  { id: 'yinyang', label: '阴阳历练', colorKey: 'yinyang', kind: 'training' },
  { id: 'experience', label: '经验历练', colorKey: 'exp', kind: 'training' },
  { id: 'stage624', label: '6-24', colorKey: 'stage624', kind: 'stage624', costPer: 10 },
  { id: 'custom', label: '自定义支出', colorKey: 'custom', kind: 'custom', costPer: 10 }
])

export const PLANNER_RESOURCE_LABELS = Object.freeze({
  __xp__: '经验',
  __heart__: '心纸'
})

const TRAINING_GROUP_BY_SPEND = Object.freeze({ feng: 'fh', dishui: 'ds', yinyang: 'yy', experience: 'experience' })

function integer(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Math.trunc(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function decimal(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export function clonePlannerValue(value) {
  return JSON.parse(JSON.stringify(value))
}

export function plannerStorageKey(accountId) {
  return 'yuanhub:cultivation-stamina-planner:v1:' + accountId
}

export function normalizePlannerPreferences(value = {}) {
  return {
    luoyang: integer(value.luoyang, 0, 0, PLANNER_RULES.maxDispatchCount),
    shouchun: integer(value.shouchun, 0, 0, PLANNER_RULES.maxDispatchCount),
    purchaseCount: integer(value.purchaseCount == null ? value.buy : value.purchaseCount, 0, 0, PLANNER_RULES.maxPurchaseCount)
  }
}

export function normalizePlannerSnapshot(raw, accountId) {
  const preferences = normalizePlannerPreferences(raw?.preferences)
  const manualPlans = {}
  const rawPlans = raw?.manualPlans && typeof raw.manualPlans === 'object' ? raw.manualPlans : {}
  Object.entries(rawPlans).forEach(([date, plan]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !plan || typeof plan !== 'object') return
    manualPlans[date] = normalizePlannerPlan(plan)
  })
  return {
    version: 1,
    accountId,
    strategy: raw?.strategy === 'priority' ? 'priority' : 'overall',
    agentOrder: Array.isArray(raw?.agentOrder) ? [...new Set(raw.agentOrder.filter(Boolean))] : [],
    preferences,
    manualPlans,
    schedule: raw?.schedule?.version === 1 && raw.schedule.context?.initialState && raw.schedule.context?.requiredState
      && raw.schedule.context?.stock && /^\d{4}-\d{2}-\d{2}$/.test(raw.schedule.baselineDate)
      && Array.isArray(raw.schedule.history) && Array.isArray(raw.schedule.result?.timeline)
      && [...raw.schedule.history, ...raw.schedule.result.timeline].every(day => day?.date && day.start && day.end && day.planned)
      ? clonePlannerValue(raw.schedule) : null
  }
}

export function readPlannerSnapshot(storage, accountId) {
  const fallback = normalizePlannerSnapshot(null, accountId)
  if (!storage || !accountId) return fallback
  try {
    const parsed = JSON.parse(storage.getItem(plannerStorageKey(accountId)) || 'null')
    return parsed?.version === 1 && parsed.accountId === accountId
      ? normalizePlannerSnapshot(parsed, accountId)
      : fallback
  } catch (_) {
    return fallback
  }
}

export function writePlannerSnapshot(storage, snapshot) {
  if (!storage || !snapshot?.accountId) return
  storage.setItem(plannerStorageKey(snapshot.accountId), JSON.stringify({
    version: 1,
    accountId: snapshot.accountId,
    strategy: snapshot.strategy,
    agentOrder: snapshot.agentOrder,
    preferences: normalizePlannerPreferences(snapshot.preferences),
    manualPlans: snapshot.manualPlans || {},
    schedule: snapshot.schedule || null
  }))
}

function customId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
}

export function createGain(channelId, overrides = {}) {
  const channel = GAIN_CHANNELS.find(item => item.id === channelId) || GAIN_CHANNELS.find(item => item.id === 'custom')
  const isCustom = channel.id === 'custom'
  return {
    id: isCustom ? customId('custom-gain') : channel.id,
    label: overrides.label || channel.label,
    colorKey: channel.colorKey,
    kind: channel.kind,
    value: decimal(overrides.value, channel.defaultValue),
    rec: decimal(overrides.rec, 0),
    custom: isCustom,
    name: isCustom ? String(overrides.name || channel.label).slice(0, 32) : undefined
  }
}

export function createSpend(channelId, overrides = {}) {
  const channel = SPEND_CHANNELS.find(item => item.id === channelId) || SPEND_CHANNELS.find(item => item.id === 'custom')
  const isCustom = channel.id === 'custom'
  return normalizePlannerSpend({
    id: isCustom ? customId('custom-spend') : channel.id,
    label: overrides.label || channel.label,
    colorKey: channel.colorKey,
    kind: overrides.kind || channel.kind,
    value: integer(overrides.value, 1),
    rec: integer(overrides.rec, 0),
    costPer: decimal(overrides.costPer, channel.costPer || PLANNER_RULES.trialStamina),
    custom: isCustom,
    name: isCustom ? String(overrides.name || channel.label).slice(0, 32) : undefined,
    yield: overrides.yield ? clonePlannerValue(overrides.yield) : undefined,
    groupId: overrides.groupId,
    stageLevel: overrides.stageLevel
  })
}

// Known channels always derive rewards from the rule table, including restored plans.
// Saved labels/yields are presentation data, not an independent source of game rules.
export function normalizePlannerSpend(spend, groups = TRAINING_GROUPS) {
  const next = { ...spend, yield: canonicalPlannerYield(spend?.yield) }
  // 派遣仅是体力支出，即使旧日程存有奖励，也不能计作培养素材产出。
  if (['luoyang', 'shouchun'].includes(spend?.id)) return { ...next, kind: 'count', custom: false,
    label: spend.id === 'luoyang' ? '洛阳派遣' : '寿春派遣', costPer: spend.id === 'luoyang' ? 72 : 80,
    yield: {}, groupId: undefined, stageLevel: undefined }
  const groupId = spend?.groupId || TRAINING_GROUP_BY_SPEND[spend?.id] ||
    (spend?.id === 'experience' ? 'experience' : /^training-(fh|ds|yy|experience)-/.exec(spend?.id || '')?.[1])
  if (groupId) {
    const group = groups.find(item => item.id === groupId)
    const level = Number(spend.stageLevel ?? /-(\d+)$/.exec(spend.id || '')?.[1] ?? group?.stages.at(-1)?.level)
    const stage = group?.stages.find(item => item.level === level)
    Object.assign(next, { groupId, stageLevel: level, kind: 'training', costPer: PLANNER_RULES.trialStamina,
      yield: stage ? trainingStageYield(group, stage) : {},
      label: stage ? spendLabel(group, stage) : (spend.label || '未知历练层数') })
  } else if (spend?.id === 'stage624' || spend?.kind === 'stage624') {
    Object.assign(next, { kind: 'stage624', costPer: PLANNER_RULES.stage624Stamina,
      yield: { __xp__: PLANNER_RULES.stage624Experience }, label: '6-24' })
  }
  return next
}

export function canonicalPlannerYield(resources = {}) {
  const result = {}
  for (const [id, value] of Object.entries(resources || {})) {
    const amount = decimal(value)
    if (!Number.isFinite(Number(value)) || Number(value) < 0) continue
    const key = BOOK_VALUES[id] ? '__xp__' : id
    result[key] = (result[key] || 0) + amount * (BOOK_VALUES[id] || 1)
  }
  return result
}

export function normalizePlannerPlan(plan) {
  const normalizeGain = gain => ({
    id: String(gain?.id || customId('custom-gain')),
    label: String(gain?.label || gain?.name || '自定义来源').slice(0, 32),
    colorKey: String(gain?.colorKey || (gain?.id === 'buy' ? 'buy' : 'custom')),
    kind: gain?.kind === 'count' ? 'count' : 'energy',
    value: decimal(gain?.value, 0),
    rec: decimal(gain?.rec, 0),
    custom: Boolean(gain?.custom || String(gain?.id || '').startsWith('custom-gain')),
    name: gain?.name == null ? undefined : String(gain.name).slice(0, 32)
  })
  const normalizeSpend = spend => normalizePlannerSpend({
    id: String(spend?.id || customId('custom-spend')),
    label: String(spend?.label || spend?.name || '自定义支出').slice(0, 32),
    colorKey: String(spend?.colorKey || 'custom'),
    kind: ['count', 'training', 'stage624', 'custom'].includes(spend?.kind) ? spend.kind : 'custom',
    value: decimal(spend?.value, 0),
    rec: integer(spend?.rec, 0),
    costPer: decimal(spend?.costPer, 10),
    custom: Boolean(spend?.custom || String(spend?.id || '').startsWith('custom-spend')),
    name: spend?.name == null ? undefined : String(spend.name).slice(0, 32),
    yield: spend?.yield ? clonePlannerValue(spend.yield) : undefined,
    groupId: spend?.groupId,
    stageLevel: spend?.stageLevel
  })
  return { gains: Array.isArray(plan?.gains) ? plan.gains.map(normalizeGain) : [], spends: Array.isArray(plan?.spends) ? plan.spends.map(normalizeSpend) : [] }
}

export function energyFromGain(gain) {
  if (!gain) return 0
  if (gain.id === 'buy') return decimal(gain.value) * PLANNER_RULES.purchaseStamina
  return gain.kind === 'energy' ? decimal(gain.value) : 0
}

export function planTotals(plan) {
  const gains = (plan?.gains || []).reduce((sum, gain) => sum + energyFromGain(gain), 0)
  const spends = (plan?.spends || []).reduce((sum, spend) => sum + decimal(spend.value) * decimal(spend.costPer), 0)
  return { gains, spends, balance: gains - spends }
}

export function createInitialPlannerState(rows = []) {
  return Object.fromEntries(rows.filter(row => row?.id).map(row => [row.id, Object.fromEntries(
    Object.entries(row.resources || {}).map(([id, value]) => [id, Math.max(0, decimal(value))]).filter(([, value]) => value > 0)
  )]))
}

// 等级突破道具不是体力模拟目标。只取升级经验、修为材料和化极道具，
// 不修改密探详情使用的完整养成需求。
export function plannerResourcesFromCalculation(calculation = {}) {
  const resources = {}
  for (const requirement of [calculation.xiuwei, calculation.star]) {
    for (const [id, value] of Object.entries(requirement?.items || {})) {
      resources[id] = (resources[id] || 0) + decimal(value)
    }
  }
  if (calculation.level?.experience > 0) resources.__xp__ = Number(calculation.level.experience)
  return resources
}

// 账号库存是共享的，不能在每个密探的 shortage 上重复抵扣。
// 调用方可以先把“经验等价值”放在 stock.__xp__，再与普通材料一起分配。
export function allocateSharedPlannerStock(state, stock = {}, agentOrder = [], strategy = 'overall') {
  const next = clonePlannerState(state)
  const order = plannerAgentOrder(next, agentOrder, strategy)
  const resourceIds = new Set(Object.values(next).flatMap(resources => Object.keys(resources || {})))
  resourceIds.forEach(resourceId => {
    if (resourceId === '__heart__') return
    let available = Math.max(0, decimal(stock[resourceId]))
    order.forEach(agentId => {
      if (available <= 0) return
      const need = Math.max(0, decimal(next[agentId][resourceId]))
      const used = Math.min(need, available)
      next[agentId][resourceId] = need - used
      available -= used
    })
  })
  return next
}

export function clonePlannerState(state = {}) {
  return Object.fromEntries(Object.entries(state).map(([agentId, resources]) => [agentId, { ...resources }]))
}

export function aggregatePlannerState(state = {}) {
  const result = {}
  Object.values(state).forEach(resources => Object.entries(resources || {}).forEach(([id, value]) => {
    result[id] = (result[id] || 0) + Math.max(0, decimal(value))
  }))
  return result
}

export function plannerStateRemaining(state = {}) {
  return Object.values(aggregatePlannerState(state)).reduce((sum, value) => sum + value, 0)
}

export function plannerStateIsEmpty(state = {}) {
  return plannerStateRemaining(state) <= 0
}

export function applyPlannerYield(state, yieldObject, agentOrder = Object.keys(state), strategy = 'overall') {
  const next = clonePlannerState(state)
  const order = plannerAgentOrder(next, agentOrder, strategy)
  Object.entries(yieldObject || {}).forEach(([resourceId, amountValue]) => {
    let amount = Math.max(0, decimal(amountValue))
    for (const agentId of order) {
      if (amount <= 0) break
      if (!next[agentId]) next[agentId] = {}
      const need = Math.max(0, decimal(next[agentId][resourceId]))
      const used = Math.min(need, amount)
      next[agentId][resourceId] = need - used
      amount -= used
    }
  })
  return next
}

function plannerAgentOrder(state, order, strategy) {
  return [...new Set([...(strategy === 'priority' ? order : []), ...Object.keys(state)])].filter(id => state[id])
}

function experienceYield(stage) {
  return Object.entries(stage?.rewards || {}).reduce((sum, [id, amount]) => sum + (BOOK_VALUES[id] || 0) * amount, 0)
}

export function trainingStageYield(group, stage) {
  if (!group || !stage) return {}
  if (group.id === 'experience') return { __xp__: experienceYield(stage) }
  return Object.fromEntries(Object.entries(stage.rewards || {}))
}

function scoreYield(state, yieldObject, agentOrder, strategy) {
  const aggregate = aggregatePlannerState(state)
  if (strategy === 'priority') {
    const first = plannerAgentOrder(state, agentOrder, strategy).find(agentId => plannerStateRemaining({ [agentId]: state[agentId] || {} }) > 0)
    const personal = Object.entries(yieldObject).reduce((sum, [id, amount]) => {
      const need = Math.max(0, decimal(state[first]?.[id]))
      return sum + Math.min(amount, need) / Math.max(1, need)
    }, 0)
    const shared = Object.entries(yieldObject).reduce((sum, [id, amount]) => {
      const need = Math.max(0, decimal(aggregate[id]))
      return sum + 0.12 * Math.min(amount, need) / Math.max(1, need)
    }, 0)
    return personal * 10 + shared
  }
  return Object.entries(yieldObject).reduce((sum, [id, amount]) => {
    const need = Math.max(0, decimal(aggregate[id]))
    return sum + Math.min(amount, need) / Math.max(1, need)
  }, 0)
}

function spendLabel(group, stage) {
  return group.id === 'experience' ? stage.name : group.name + '·' + stage.name
}

function spendColor(group) {
  return { fh: 'feng', ds: 'dishui', yy: 'yinyang', experience: 'exp' }[group.id] || 'custom'
}


export function buildRecommendedPlan({ state, groups = TRAINING_GROUPS, levels = {}, strategy = 'overall', agentOrder = [], preferences = {}, initialExtra = 0 }) {
  const prefs = normalizePlannerPreferences(preferences)
  const plan = { gains: [
    { id: 'natural', label: '自然恢复', colorKey: 'natural', kind: 'energy', value: 288, rec: 288 },
    { id: 'meal', label: '每日进膳', colorKey: 'meal', kind: 'energy', value: 120, rec: 120 }
  ], spends: [] }
  const candidates = plannerActions(groups, levels)
  if (!candidates.some(action => scoreYield(state, action.yield, agentOrder, strategy) > 0)) return plan
  if (prefs.purchaseCount) plan.gains.push({ id: 'buy', label: '购买体力', colorKey: 'buy', kind: 'count', value: prefs.purchaseCount, rec: prefs.purchaseCount })
  if (initialExtra > 0) plan.gains.push({ id: 'reserve', label: '体力储备', colorKey: 'custom', kind: 'energy', value: decimal(initialExtra), rec: decimal(initialExtra), custom: true })
  for (const id of ['luoyang', 'shouchun']) {
    if (prefs[id]) plan.spends.push(createSpend(id, { value: prefs[id], rec: prefs[id] }))
  }
  let energy = planTotals(plan).balance
  let working = clonePlannerState(state)
  const runs = {}
  // Compare every available category by useful gain per stamina, not fixed category order.
  // This remains a rolling greedy recommendation, not a proof of global optimality.
  while (energy >= PLANNER_RULES.stage624Stamina) {
    const choices = candidates.filter(action => action.costPer <= energy &&
      (!action.groupId || (runs[action.groupId] || 0) < PLANNER_RULES.trainingDailyLimit))
      .map(action => ({ action, score: scoreYield(working, action.yield, agentOrder, strategy) / action.costPer }))
      .filter(choice => choice.score > 0)
      .sort((a, b) => b.score - a.score || b.action.stageLevel - a.action.stageLevel || a.action.id.localeCompare(b.action.id))
    if (!choices.length) break
    const action = choices[0].action
    const existing = plan.spends.find(spend => spend.id === action.id)
    if (existing) { existing.value += 1; existing.rec += 1 }
    else plan.spends.push({ ...action, value: 1, rec: 1 })
    working = applyPlannerYield(working, action.yield, agentOrder, strategy)
    energy -= action.costPer
    if (action.groupId) runs[action.groupId] = (runs[action.groupId] || 0) + 1
  }
  return plan
}

function plannerActions(groups, levels) {
  const limits = normalizeTrainingLevels(levels)
  return groups.flatMap(group => group.stages.filter(stage => stage.level <= (limits[group.id] || 0)).map(stage => ({
    id: 'training-' + group.id + '-' + stage.level, label: spendLabel(group, stage),
    kind: 'training', groupId: group.id, stageLevel: stage.level, colorKey: spendColor(group),
    costPer: PLANNER_RULES.trialStamina, yield: trainingStageYield(group, stage)
  }))).concat({ id: 'stage624', label: '6-24', kind: 'stage624', colorKey: 'stage624',
    costPer: PLANNER_RULES.stage624Stamina, yield: { __xp__: PLANNER_RULES.stage624Experience } })
}

export function plannerBlockedResources(state, groups = TRAINING_GROUPS, levels = {}) {
  const available = new Set(plannerActions(groups, levels).flatMap(action => Object.keys(action.yield)))
  const known = new Set(groups.flatMap(group => group.stages.flatMap(stage => Object.keys(trainingStageYield(group, stage)))))
  return Object.entries(aggregatePlannerState(state)).filter(([id, value]) => value > 0 && !available.has(id))
    .map(([id, gap]) => ({ id, gap, reason: known.has(id) ? '所需历练层数未开放' : '未配置获取途径' }))
}

export function validatePlannerPlan(plan, levels = {}, groups = TRAINING_GROUPS) {
  const errors = []
  const limits = normalizeTrainingLevels(levels)
  const counts = {}
  for (const gain of plan.gains || []) {
    if (!Number.isFinite(Number(gain.value)) || Number(gain.value) < 0) errors.push(gain.label + '数量须为非负数')
    if (gain.id === 'buy' && !Number.isInteger(Number(gain.value))) errors.push('购买次数须为整数')
  }
  const purchases = (plan.gains || []).filter(gain => gain.id === 'buy').reduce((sum, gain) => sum + Number(gain.value), 0)
  if (!Number.isInteger(purchases) || purchases < 0 || purchases > PLANNER_RULES.maxPurchaseCount) errors.push('每日购买体力须为 0–8 次整数')
  for (const raw of plan.spends || []) {
    const spend = normalizePlannerSpend(raw, groups)
    if (!Number.isFinite(Number(spend.costPer)) || Number(spend.costPer) < 0) errors.push(spend.label + '单次体力须为非负数')
    if (!Number.isInteger(Number(spend.value)) || Number(spend.value) < 0) errors.push(spend.label + '次数须为非负整数')
    if (!(Number(spend.value) > 0) || spend.kind !== 'training') continue
    const group = groups.find(item => item.id === spend.groupId)
    if (!group?.stages.some(stage => stage.level === spend.stageLevel) || spend.stageLevel > limits[spend.groupId]) {
      errors.push(spend.label + '超出已开放层数')
    }
    counts[spend.groupId] = (counts[spend.groupId] || 0) + Number(spend.value)
  }
  for (const [id, count] of Object.entries(counts)) {
    if (count > PLANNER_RULES.trainingDailyLimit) errors.push((groups.find(group => group.id === id)?.name || id) + '历练合计超过每日 6 次')
  }
  const totals = planTotals({ ...plan, spends: (plan.spends || []).map(spend => normalizePlannerSpend(spend, groups)) })
  if (totals.balance < 0) errors.push('体力不足 ' + Math.abs(totals.balance))
  return [...new Set(errors)]
}

export function applyPlannerPlan(state, plan, agentOrder = [], strategy = 'overall') {
  let next = clonePlannerState(state)
  for (const raw of plan?.spends || []) {
    const spend = normalizePlannerSpend(raw)
    const rewards = Object.fromEntries(Object.entries(spend.yield).map(([id, value]) => [id, value * integer(spend.value)]))
    next = applyPlannerYield(next, rewards, agentOrder, strategy)
  }
  return next
}

// Both read and edit views consume this one settlement; gross rewards never disappear at the deficit cap.
export function settlePlannerDay(state, plan, { agentOrder = [], strategy = 'overall', levels = {}, groups = TRAINING_GROUPS } = {}) {
  const planned = { ...plan, spends: (plan.spends || []).map(spend => normalizePlannerSpend(spend, groups)) }
  const errors = validatePlannerPlan(planned, levels, groups)
  const gross = {}
  const sources = []
  const warnings = []
  let end = clonePlannerState(state)
  for (const spend of planned.spends) {
    const rewards = Object.fromEntries(Object.entries(spend.yield).map(([id, amount]) => [id, amount * integer(spend.value)]).filter(([, amount]) => amount > 0))
    for (const [id, amount] of Object.entries(rewards)) gross[id] = (gross[id] || 0) + amount
    const before = plannerStateRemaining(end)
    const next = applyPlannerYield(end, rewards, agentOrder, strategy)
    if (['luoyang', 'shouchun'].includes(spend.id)) { /* 纯体力支出是正常日程，不提示素材配置警告。 */ }
    else if (spend.value > 0 && !Object.keys(rewards).length) warnings.push(spend.label + '仅预留体力，尚未设置材料产出')
    else if (spend.value > 0 && before === plannerStateRemaining(next)) warnings.push(spend.label + '不再减少培养缺口，产出全部计为富余')
    sources.push({ id: spend.id, label: spend.label, runs: spend.value, rewards })
    end = next
  }
  if (errors.length) end = clonePlannerState(state)
  const before = aggregatePlannerState(state)
  const after = aggregatePlannerState(end)
  const used = Object.fromEntries(Object.keys(before).map(id => [id, Math.max(0, before[id] - (after[id] || 0))]))
  const surplus = Object.fromEntries(Object.entries(gross).map(([id, amount]) => [id, Math.max(0, amount - (used[id] || 0))]))
  return { planned, end, errors, warnings, sources, yield: errors.length ? {} : gross, plannedYield: gross, used,
    surplus: errors.length ? {} : surplus, totals: planTotals(planned) }
}

export function simulatePlanner({ initialState, dates = [], groups = TRAINING_GROUPS, levels = {}, strategy = 'overall',
  agentOrder = [], preferences = {}, manualPlans = {}, initialExtra = 0, maxDays = PLANNER_RULES.maxEtaDays }) {
  let state = clonePlannerState(initialState)
  const timeline = []
  const options = { groups, levels, strategy, agentOrder }
  let lastProgressDay = 0
  for (let index = 0; index < maxDays; index += 1) {
    const date = dates[index] || String(index + 1)
    const start = clonePlannerState(state)
    const recommended = buildRecommendedPlan({ ...options, state: start, preferences, initialExtra: index === 0 ? initialExtra : 0 })
    const manual = Boolean(manualPlans[date])
    const planned = manual ? normalizePlannerPlan(manualPlans[date]) : recommended
    const settled = settlePlannerDay(start, planned, options)
    const day = { date, index, start, recommended, manual, ...settled }
    const changed = plannerStateRemaining(day.end) < plannerStateRemaining(start)
    if (changed) lastProgressDay = index + 1
    const futureManual = dates.slice(index + 1, maxDays).some(nextDate => manualPlans[nextDate])
    if (day.errors.length) {
      timeline.push(day)
      return { timeline, status: 'invalid', etaDays: null, lastProgressDay, remaining: start, blocked: plannerBlockedResources(start, groups, levels) }
    }
    state = day.end
    if (plannerStateIsEmpty(state) && !futureManual) {
      timeline.push(day)
      return { timeline, status: 'complete', etaDays: plannerStateIsEmpty(initialState) ? 0 : index + 1, lastProgressDay, remaining: state, blocked: [] }
    }
    if (!changed && !manual && !futureManual) {
      if (!timeline.length) timeline.push(day)
      return { timeline, status: 'blocked', etaDays: null, lastProgressDay, remaining: state, blocked: plannerBlockedResources(state, groups, levels) }
    }
    timeline.push(day)
  }
  return { timeline, status: 'horizon', etaDays: null, lastProgressDay, remaining: state, blocked: plannerBlockedResources(state, groups, levels) }
}

export function buildPlannerTimeline(config) {
  return simulatePlanner({ ...config, maxDays: config.dates?.length || PLANNER_RULES.maxEtaDays }).timeline
}

export function estimatePlannerDays(config) {
  return simulatePlanner(config).etaDays
}

// Material coverage is per-resource, never a sum of XP and material counts.
export function plannerProgressRows(requiredState, initialState, day, stock = {}) {
  const required = aggregatePlannerState(requiredState)
  const initial = aggregatePlannerState(initialState)
  const start = aggregatePlannerState(day.start || initialState)
  const end = aggregatePlannerState(day.end || initialState)
  const ids = [...new Set([...Object.keys(required), ...Object.keys(day.yield || {})])]
  return ids.map(id => {
    const need = required[id] || 0
    const remaining = end[id] || 0
    const owned = Math.max(0, need - (initial[id] || 0))
    const prior = Math.max(0, (initial[id] || 0) - (start[id] || 0))
    const used = Math.max(0, (start[id] || 0) - remaining)
    const produced = day.yield?.[id] || 0
    const beforePercent = need > 0 ? Math.min(100, (owned + prior) / need * 100) : 0
    const percent = need > 0 ? (remaining <= 0 ? 100 : Math.min(99, Math.floor((need - remaining) / need * 100))) : null
    return { id, required: need, remaining, startRemaining: start[id] || 0, owned, prior, used, produced, surplus: Math.max(0, produced - used),
      stock: decimal(stock[id]), done: need - remaining, percent, beforePercent,
      todayPercent: need > 0 ? Math.min(100 - beforePercent, used / need * 100) : 0 }
  }).filter(row => row.required > 0 || row.produced > 0)
}

export function trainingGroupForSpend(spendId) {
  return TRAINING_GROUP_BY_SPEND[spendId] || null
}
