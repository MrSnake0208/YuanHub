import { TRAINING_GROUPS } from './operatorTraining.js'
import { aggregatePlannerState, buildRecommendedPlan, clonePlannerValue, createGain, createSpend,
  normalizePlannerPlan, normalizePlannerPreferences, plannerActions, plannerStateIsEmpty,
  PLANNER_RULES, PURCHASE_CUMULATIVE, planTotals, settlePlannerDay } from './cultivationPlanner.js'

export const EXACT_SOLVER_VERSION = 'highs-1.15.3'
const reserveGainId = index => 'planner-reserve-' + index
function reserveGain(source, index) {
  return { id: reserveGainId(index), label: source.name || '体力储备', name: source.name || '体力储备', colorKey: 'custom', kind: 'energy', custom: true, value: source.amount, rec: source.amount }
}

function defaultPlan(preferences, extra = 0) {
  const gains = [createGain('natural'), createGain('meal')]
  if (preferences.purchaseCount) gains.push(createGain('buy', { value: preferences.purchaseCount }))
  if (extra) gains.push(createGain('custom', { label: '额外体力', value: extra }))
  return normalizePlannerPlan({ gains, spends: ['luoyang', 'shouchun'].filter(id => preferences[id])
    .map(id => createSpend(id, { value: preferences[id] })) })
}

export function prepareExactPlanner(input) {
  const config = clonePlannerValue(input)
  config.strategy = config.objective === 'priority' ? 'priority' : 'overall'
  const horizon = Math.min(PLANNER_RULES.maxEtaDays, config.dates.length)
  if (!horizon) throw new Error('没有可计算的日期')
  const preferences = normalizePlannerPreferences(config.preferences)
  const reserves = (config.reserveSources || []).map(source => {
    const amount = Number(source.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999 || !/^\d{4}-\d{2}-\d{2}$/.test(source.date) || !['fixed', 'flexible'].includes(source.mode)) throw new Error('请填写有效的储备数量、日期与使用方式')
    return { ...source, amount }
  })
  const demand = aggregatePlannerState(config.initialState)
  const resources = Object.keys(demand).filter(id => demand[id] > 0)
  const order = [...new Set([...(config.agentOrder || []), ...Object.keys(config.initialState)])]
    .filter(id => config.initialState[id])
  const rawActions = plannerActions(TRAINING_GROUPS, config.levels || {})
    .filter(action => resources.some(id => action.yield[id] > 0))
  // Remove only actions dominated within the SAME daily reward quota. An
  // unlimited XP action cannot be removed in favour of a capped training action.
  const actions = rawActions.filter((action, index) => !rawActions.some((other, otherIndex) =>
    otherIndex !== index && other.groupId === action.groupId && other.costPer <= action.costPer &&
    resources.every(id => (other.yield[id] || 0) >= (action.yield[id] || 0)) &&
    (other.costPer < action.costPer || resources.some(id => (other.yield[id] || 0) > (action.yield[id] || 0)) || otherIndex < index)))
  const days = config.dates.slice(0, horizon).map((date, index) => {
    const manual = index !== 0 && Boolean(config.manualPlans?.[date])
    let plan = manual ? normalizePlannerPlan(config.manualPlans[date])
      : index === 0 && config.firstDay ? normalizePlannerPlan(config.firstDay)
        : defaultPlan(preferences, index === 0 ? config.initialExtra : 0)
    if (!manual) plan.spends = plan.spends.filter(spend => spend.custom || !['training', 'stage624'].includes(spend.kind))
    if (config.objective === 'coins' && !manual) plan.gains = plan.gains.filter(gain => gain.id !== 'buy')
    const checkPlan = config.objective === 'coins' && !manual
      ? { ...plan, gains: [...plan.gains, createGain('buy', { value: 8 })] } : plan
    const eligibleReserves = reserves.map((source, index) => ({ source, index })).filter(({ source }) => !manual && (source.mode === 'fixed' ? date === source.date : date >= source.date))
    const diagnosticAllowance = config.objective === 'extra' ? [{ id: 'diagnostic-budget', kind: 'energy', value: Math.max(0, -planTotals(checkPlan).balance) }] : []
    const checked = settlePlannerDay({}, { ...checkPlan, gains: [...checkPlan.gains, ...diagnosticAllowance, ...eligibleReserves.map(({ source, index }) => reserveGain(source, index))] }, config)
    if (checked.errors.length) throw new Error(date + '：' + checked.errors.join('；'))
    const fixed = settlePlannerDay({}, plan, config)
    const counts = {}
    for (const spend of plan.spends) if (spend.groupId) counts[spend.groupId] = (counts[spend.groupId] || 0) + spend.value
    return { date, manual, plan, counts, eligibleReserves, budget: planTotals(plan).balance, yield: fixed.plannedYield }
  })
  return { config, horizon, preferences, demand, resources, order, actions, days, reserves }
}

const terms = entries => entries.filter(([coefficient]) => coefficient !== 0)
  .map(([coefficient, name]) => `${coefficient < 0 ? '-' : '+'} ${Math.abs(coefficient)} ${name}`).join(' ') || '0 dummy'

// Each action variable is a daily INTEGER run count. Coverage constraints are
// per resource and per deadline; shared inventory was deducted exactly once in
// initialState. No stamina can move between dates in the current game model.
export function buildExactModel(problem, horizon, milestones = [], minimize = 'none', maxCoins = null, maxExtra = null, maxDispatchReduction = null) {
  const rows = [], bounds = ['dummy = 0'], integers = [], binaries = [], variables = []
  const costs = [], reserveVariables = [], extraVariables = [], dispatchVariables = []
  const extraCap = PLANNER_RULES.maxDailyExtraStamina
  for (let d = 0; d < horizon; d++) {
    const day = problem.days[d], energy = [], groups = {}
    if (!day.manual) problem.actions.forEach((action, a) => {
      const maxNeeded = Math.max(...problem.resources.map(id => action.yield[id] > 0 ? Math.ceil(problem.demand[id] / action.yield[id]) : 0))
      const quota = action.groupId ? PLANNER_RULES.trainingDailyLimit - (day.counts[action.groupId] || 0) : Infinity
      const maxEnergy = Math.max(0, day.budget + day.eligibleReserves.reduce((sum, { source }) => sum + source.amount, 0) + (problem.config.objective === 'coins' ? 480 : 0) + (problem.config.objective === 'extra' ? extraCap : 0) + (problem.config.reduceDispatch ? day.plan.spends.filter(s => ['luoyang', 'shouchun'].includes(s.id)).reduce((sum, s) => sum + s.value * s.costPer, 0) : 0))
      const upper = Math.min(maxNeeded, quota, Math.floor(maxEnergy / action.costPer))
      if (upper <= 0) return
      const name = `x${d}_${a}`
      variables.push({ name, day: d, action, upper })
      integers.push(name); bounds.push(`0 <= ${name} <= ${upper}`)
      energy.push([action.costPer, name]); costs.push([action.costPer, name])
      if (action.groupId) (groups[action.groupId] ||= []).push([1, name])
    })
    if (problem.config.objective === 'coins' && !day.manual) {
      const choices = []
      for (let k = 0; k <= PLANNER_RULES.maxPurchaseCount; k++) {
        const name = `p${d}_${k}`
        binaries.push(name); choices.push([1, name]); energy.push([-60 * k, name])
      }
      rows.push(`purchase${d}: ${terms(choices)} = 1`)
    }
    for (const { source, index } of day.eligibleReserves) {
      const name = `r${d}_${index}`
      binaries.push(name); reserveVariables.push({ name, day: d, index, source })
      energy.push([-source.amount, name])
    }
    if (problem.config.reduceDispatch && !day.manual) for (const spend of day.plan.spends.filter(s => ['luoyang', 'shouchun'].includes(s.id))) {
      const name = `dispatch${d}_${spend.id}`
      integers.push(name); bounds.push(`0 <= ${name} <= ${spend.value}`)
      dispatchVariables.push({ name, day: d, id: spend.id, upper: spend.value })
      energy.push([-spend.costPer, name])
    }
    if (problem.config.objective === 'extra' && !day.manual) {
      const existingExtra = day.plan.gains.filter(gain => gain.id === 'required-extra').reduce((sum, gain) => sum + gain.value, 0)
      const upper = Math.max(0, extraCap - existingExtra)
      const name = `e${d}`; integers.push(name); bounds.push(`0 <= ${name} <= ${upper}`); extraVariables.push({ name, day: d, upper }); energy.push([-1, name])
      if (minimize === 'extraPeak') rows.push(`peak${d}: ${name} - extraPeak <= ${-existingExtra}`)
    }
    rows.push(`energy${d}: ${terms(energy)} <= ${day.budget}`)
    for (const [group, entries] of Object.entries(groups)) rows.push(`cap${d}_${group}: ${terms(entries)} <= ${PLANNER_RULES.trainingDailyLimit - (day.counts[group] || 0)}`)
  }
  problem.reserves.forEach((source, index) => rows.push(`reserve${index}: ${terms(reserveVariables.filter(v => v.index === index).map(v => [1, v.name]))} ${source.mode === 'fixed' && reserveVariables.some(v => v.index === index) ? '=' : '<='} 1`))
  const deadlines = [{ day: horizon, demand: problem.demand }, ...milestones]
  deadlines.forEach((milestone, index) => {
    for (const [id, amount] of Object.entries(milestone.demand)) {
      const fixed = problem.days.slice(0, milestone.day).reduce((sum, day) => sum + (day.yield[id] || 0), 0)
      if (amount <= fixed) continue
      const entries = variables.filter(v => v.day < milestone.day && v.action.yield[id] > 0).map(v => [v.action.yield[id], v.name])
      rows.push(`need${index}_${problem.resources.indexOf(id)}: ${terms(entries)} >= ${amount - fixed}`)
    }
  })
  const purchaseCosts = binaries.filter(name => name.startsWith('p')).map(name => [PURCHASE_CUMULATIVE[Number(name.split('_')[1])], name])
  if (maxCoins != null) rows.push(`coinLimit: ${terms(purchaseCosts)} <= ${maxCoins - problem.days.filter(day => day.manual).reduce((sum, day) => sum + planTotals(day.plan).coinsSpent, 0)}`)
  if (maxExtra != null) {
    const existingExtra = problem.days.slice(0, horizon).reduce((sum, day) => sum + day.plan.gains.filter(gain => gain.id === 'required-extra').reduce((n, gain) => n + gain.value, 0), 0)
    rows.push(`extraLimit: ${terms(extraVariables.map(v => [1, v.name]))} <= ${maxExtra - existingExtra}`)
  }
  if (minimize === 'extraPeak') bounds.push(`0 <= extraPeak <= ${extraCap}`)
  const dispatchCosts = dispatchVariables.map(v => [1, v.name])
  if (maxDispatchReduction != null) rows.push(`dispatchLimit: ${terms(dispatchCosts)} <= ${maxDispatchReduction}`)
  // Exact lexicographic weighting: one extra stamina point costs more than ALL
  // possible dispatch reductions. At equal top-up totals, retain the most
  // dispatches, so owned reserves are used before cancelling dispatch runs.
  const extraWeight = dispatchVariables.reduce((sum, v) => sum + v.upper, 0) + 1
  const extraCosts = [...extraVariables.map(v => [extraWeight, v.name]), ...dispatchCosts]
  const objective = minimize === 'extraPeak' ? [[1, 'extraPeak']] : minimize === 'extra' ? extraCosts : minimize === 'coins' ? purchaseCosts : minimize === 'reserve' ? reserveVariables.map(v => [v.source.amount, v.name])
    : minimize === 'stamina' ? costs : []
  return { lp: ['Minimize', `obj: ${terms(objective)}`, 'Subject To', ...rows, 'Bounds', ...bounds,
    ...(integers.length ? ['Generals', integers.join(' ')] : []), ...(binaries.length ? ['Binaries', binaries.join(' ')] : []), 'End'].join('\n'), variables, reserveVariables, extraVariables, dispatchVariables, extraCap, horizon }
}

function readInteger(result, name, upper) {
  const value = result.Columns?.[name]?.Primal
  if (!Number.isFinite(value) || Math.abs(value - Math.round(value)) > 1e-6 || value < -1e-6 || value > upper + 1e-6) throw new Error('求解结果不满足整数次数约束')
  return Math.round(value)
}

export function exactPlansFromSolution(problem, model, result) {
  const plans = problem.days.map(day => clonePlannerValue(day.plan))
  for (const variable of model.variables) {
    const value = readInteger(result, variable.name, variable.upper)
    if (value) plans[variable.day].spends.push({ ...variable.action, value, rec: value })
  }
  for (const variable of model.dispatchVariables) {
    const spend = plans[variable.day].spends.find(s => s.id === variable.id)
    spend.value -= readInteger(result, variable.name, variable.upper)
  }
  for (const variable of model.extraVariables) {
    const value = readInteger(result, variable.name, variable.upper)
    if (value) plans[variable.day].gains.push({ id: 'required-extra', label: '需补充体力', kind: 'energy', colorKey: 'custom', custom: true, value })
  }
  for (const variable of model.reserveVariables) if (readInteger(result, variable.name, 1)) plans[variable.day].gains.push(reserveGain(variable.source, variable.index))
  if (problem.config.objective === 'coins') for (let d = 0; d < model.horizon; d++) {
    if (problem.days[d].manual) continue
    let chosen = 0
    for (let k = 0; k <= 8; k++) {
      const value = readInteger(result, `p${d}_${k}`, 1)
      chosen += value
      if (value && k) plans[d].gains.push(createGain('buy', { value: k }))
    }
    if (chosen !== 1) throw new Error('求解结果缺少有效购买档位')
  }
  return plans
}

export function evaluateExactPlans(problem, plans, milestones = []) {
  let state = clonePlannerValue(problem.config.initialState)
  let etaDays = plannerStateIsEmpty(state) ? 0 : null
  const agentDays = Object.fromEntries(problem.order.map(id => [id, plannerStateIsEmpty({ [id]: state[id] }) ? 0 : null]))
  const timeline = [], reserveUses = new Set()
  for (let d = 0; d < problem.horizon; d++) {
    const start = state, spec = problem.days[d]
    const planned = etaDays != null && d >= etaDays && !spec.manual && !(d === 0 && problem.config.firstDay)
      ? defaultPlan(normalizePlannerPreferences()) : plans[d] || spec.plan
    for (let index = 0; index < problem.reserves.length; index++) {
      const claims = planned.gains.filter(gain => gain.id === reserveGainId(index))
      if (claims.length && (claims.length > 1 || reserveUses.has(index) || !spec.eligibleReserves.some(item => item.index === index) || claims[0].value !== problem.reserves[index].amount)) return null
      if (claims.length) reserveUses.add(index)
    }
    const extraGains = planned.gains.filter(gain => gain.id === 'required-extra')
    if (extraGains.some(gain => !Number.isInteger(gain.value) || gain.value < 0) ||
      extraGains.reduce((sum, gain) => sum + gain.value, 0) > PLANNER_RULES.maxDailyExtraStamina) return null
    const settled = settlePlannerDay(start, planned, problem.config)
    if (settled.errors.length) return null
    state = settled.end
    timeline.push({ date: spec.date, index: d, start, manual: spec.manual || (d === 0 && Boolean(problem.config.firstDay)),
      recommended: settled.planned, ...settled })
    if (etaDays == null && plannerStateIsEmpty(state)) etaDays = d + 1
    for (const id of problem.order) if (agentDays[id] == null && plannerStateIsEmpty({ [id]: state[id] })) agentDays[id] = d + 1
  }
  if (etaDays == null) return null
  for (const milestone of milestones) {
    const produced = {}
    timeline.slice(0, milestone.day).forEach(day => Object.entries(day.yield).forEach(([id, n]) => { produced[id] = (produced[id] || 0) + n }))
    if (Object.entries(milestone.demand).some(([id, need]) => (produced[id] || 0) < need)) return null
  }
  const lastManual = problem.days.reduce((last, day, index) => day.manual ? index + 1 : last, 0)
  const length = Math.max(1, etaDays, lastManual)
  // Once materials are ready, preserve future manual dates but remove automatic
  // purchases/dispatch/farming that no longer serve this cultivation plan.
  for (let d = Math.max(1, etaDays); d < length; d++) if (!problem.days[d].manual) {
    const day = timeline[d], settled = settlePlannerDay(day.start, defaultPlan(normalizePlannerPreferences()), problem.config)
    Object.assign(day, settled, { recommended: settled.planned })
  }
  const result = { timeline: timeline.slice(0, length), status: 'complete', etaDays, remaining: state, blocked: [],
    lastProgressDay: etaDays, agentDays }
  result.reserveUsage = problem.reserves.map((source, index) => {
    const day = result.timeline.find(day => day.planned.gains.some(gain => gain.id === reserveGainId(index)))
    return { ...source, usedDate: day?.date || null }
  })
  result.totalReserveUsed = result.reserveUsage.reduce((sum, source) => sum + (source.usedDate ? source.amount : 0), 0)
  result.totalReserveUnused = result.reserveUsage.reduce((sum, source) => sum + (source.usedDate ? 0 : source.amount), 0)
  result.dispatchReductions = result.timeline.flatMap((day, index) => problem.days[index].plan.spends.filter(s => ['luoyang', 'shouchun'].includes(s.id)).flatMap(spend => {
    const count = spend.value - (day.planned.spends.find(s => s.id === spend.id)?.value || 0)
    return count > 0 && index < result.etaDays ? [{ date: day.date, label: spend.label, count, stamina: count * spend.costPer }] : []
  }))
  result.requiredExtra = result.timeline.reduce((sum, day) => sum + day.planned.gains.filter(g => g.id === 'required-extra').reduce((n, g) => n + g.value, 0), 0)
  result.totalCoins = result.timeline.reduce((sum, day) => sum + day.totals.coinsSpent, 0)
  return result
}

// Complete the execution ledger without changing purchases or fixed manual days.
// Surplus XP is useful inventory even when it is outside the current demand.
function fillRemainingStamina(problem, solution) {
  const plans = solution.timeline.map(day => clonePlannerValue(day.planned))
  let state = clonePlannerValue(problem.config.initialState)
  for (let d = 0; d < plans.length && !plannerStateIsEmpty(state); d++) {
    const plan = plans[d]
    if (!problem.days[d].manual) {
      const runs = Math.floor(planTotals(plan).balance / PLANNER_RULES.stage624Stamina)
      if (runs > 0) {
        const existing = plan.spends.find(spend => !spend.custom && spend.kind === 'stage624')
        if (existing) { existing.value += runs; existing.rec = existing.value }
        else plan.spends.push(createSpend('stage624', { value: runs, rec: runs }))
      }
    }
    state = settlePlannerDay(state, plan, problem.config).end
  }
  const checked = evaluateExactPlans(problem, plans)
  if (!checked) throw new Error('剩余体力安排未通过日程校验')
  return checked
}

function greedySeed(problem) {
  let state = clonePlannerValue(problem.config.initialState)
  const plans = problem.days.map(day => {
    const plan = day.manual ? day.plan : buildRecommendedPlan({ ...problem.config, state, gains: day.plan.gains, fixedSpends: day.plan.spends })
    state = settlePlannerDay(state, plan, problem.config).end
    return plan
  })
  return evaluateExactPlans(problem, plans)
}

export function estimateExactPlanner(input) {
  try { return greedySeed(prepareExactPlanner(input)) } catch (_) { return null }
}

// Feasibility bisection proves the minimum INTEGER completion day. Priority mode
// fixes each proven agent deadline before optimizing the next one (lexicographic
// optimization), instead of using arbitrary progress weights.
export function solveExactPlanner(input, solver, { onProgress = () => {}, now = () => performance.now(), timeLimitMs = 30000 } = {}) {
  const started = now(), problem = prepareExactPlanner(input)
  let best = problem.config.objective === 'coins' ? null : greedySeed(problem)
  let provenAgents = 0, lowerBound = plannerStateIsEmpty(problem.config.initialState) ? 0 : 1
  const finish = status => {
    // Keep the proved primary objective; avoid claiming unnecessary one-shot packs.
    if (best && status === 'optimal' && problem.reserves.length && ['coins', 'overall'].includes(problem.config.objective)) {
      const polished = attempt(best.etaDays || 1, [], 'reserve', problem.config.objective === 'coins' ? best.totalCoins : null)
      if (polished.candidate) best = polished.candidate
    }
    return { status, solution: best ? fillRemainingStamina(problem, best) : null, lowerBound, provenAgents, objective: problem.config.objective || 'overall',
      horizon: problem.horizon, solver: EXACT_SOLVER_VERSION, elapsedMs: Math.round(now() - started) }
  }
  const attempt = (horizon, milestones, objective = 'none', maxCoins = null, maxExtra = null, maxDispatchReduction = null) => {
    const remaining = timeLimitMs - (now() - started)
    if (remaining <= 0) return { status: 'unknown' }
    onProgress({ message: `正在验证 ${horizon} 天内的日程`, lowerBound, bestDays: best?.etaDays ?? null, provenAgents })
    const model = buildExactModel(problem, horizon, milestones, objective, maxCoins, maxExtra, maxDispatchReduction)
    const result = solver.solve(model.lp, { output_flag: false, time_limit: Math.max(.001, (timeLimitMs - (now() - started)) / 1000),
      mip_rel_gap: 0, mip_abs_gap: 0, mip_feasibility_tolerance: 1e-8, primal_feasibility_tolerance: 1e-8, random_seed: 0 })
    if (result.Status === 'Infeasible') return { status: 'infeasible' }
    try {
      const candidate = evaluateExactPlans(problem, exactPlansFromSolution(problem, model, result), milestones)
      if (candidate && candidate.etaDays <= horizon) return { status: 'feasible', candidate, optimal: result.Status === 'Optimal' }
    } catch (_) { /* Unfinished solves can have no incumbent. Never treat those values as a plan. */ }
    if (result.Status === 'Optimal') throw new Error('求解结果未通过日程校验，未应用结果')
    return { status: 'unknown' }
  }
  if (problem.config.feasibilityOnly) {
    // A zero objective permits arbitrary extra stamina while leaving reserves
    // unclaimed. Optimize the actual scarce resource, even for preview candidates.
    const result = attempt(problem.horizon, [], problem.config.objective === 'extra' ? 'extra' : 'coins')
    best = result.candidate || null
    if (best?.requiredExtra > 0 && result.optimal && problem.config.objective === 'extra') {
      // Balance top-ups without undoing the preference for retaining dispatches.
      const dispatchCount = best.dispatchReductions.reduce((sum, change) => sum + change.count, 0)
      const balanced = attempt(problem.horizon, [], 'extraPeak', null, best.requiredExtra, dispatchCount)
      if (balanced.candidate && balanced.candidate.requiredExtra <= best.requiredExtra) best = balanced.candidate
    }
    return finish(result.status === 'infeasible' ? 'infeasible' : best ? 'feasible' : 'unknown')
  }

  if (problem.config.objective === 'extra') {
    const result = attempt(problem.horizon, [], 'extra')
    best = result.candidate || null
    return finish(result.status === 'infeasible' ? 'infeasible' : best ? result.optimal ? 'optimal' : 'feasible' : 'unknown')
  }
  if (problem.config.objective === 'coins') {
    // If fixed dispatch exceeds free stamina, extending a completed plan would
    // itself force purchases. Compare completion horizons instead of incorrectly
    // charging mandatory dispatch until the requested deadline after completion.
    const horizons = problem.days.some(day => !day.manual && day.budget < 0)
      ? Array.from({ length: problem.horizon }, (_, i) => problem.horizon - i) : [problem.horizon]
    let proven = true
    for (const horizon of horizons) {
      const result = attempt(horizon, [], 'coins')
      if (result.candidate && (!best || result.candidate.totalCoins < best.totalCoins)) best = result.candidate
      if (best?.totalCoins === 0) return finish('optimal')
      if (result.status !== 'infeasible' && !result.optimal) proven = false
      if (now() - started >= timeLimitMs) { proven = false; break }
    }
    return finish(proven ? best ? 'optimal' : 'infeasible' : best ? 'feasible' : 'unknown')
  }
  if (!best) {
    const result = attempt(problem.horizon, [])
    if (result.status === 'infeasible') return finish('infeasible')
    if (!result.candidate) return finish('unknown')
    best = result.candidate
  }
  const priority = problem.config.objective === 'priority'
  const stages = priority ? problem.order : ['all']
  let prefix = {}, milestones = []
  for (const id of stages) {
    if (priority) for (const [resource, need] of Object.entries(problem.config.initialState[id])) prefix[resource] = (prefix[resource] || 0) + need
    else prefix = problem.demand
    // A later agent can finish BEFORE an earlier one using independent materials.
    // Reserve earlier agents' demand only for resources this agent actually needs.
    const target = priority ? Object.fromEntries(Object.entries(problem.config.initialState[id])
      .filter(([, need]) => need > 0).map(([resource]) => [resource, prefix[resource]])) : prefix
    let low = Object.values(target).some(n => n > 0) ? 1 : 0
    let high = priority ? best.agentDays[id] : best.etaDays
    while (low < high) {
      lowerBound = low
      const middle = Math.floor((low + high) / 2)
      const constraints = [...milestones, { day: middle, demand: { ...target } }]
      const result = attempt(priority ? problem.horizon : middle, constraints)
      if (result.status === 'infeasible') low = middle + 1
      else if (result.candidate) { best = result.candidate; high = middle }
      else return finish('feasible')
    }
    lowerBound = low
    milestones.push({ day: low, demand: { ...target } })
    if (priority) provenAgents++
  }
  // Tie-break only after the primary objective has been proved; a timeout here
  // does not revoke the proof of the minimum completion day(s).
  const polished = attempt(priority ? problem.horizon : best.etaDays || 1, milestones, 'stamina')
  if (polished.candidate) best = polished.candidate
  return finish('optimal')
}
