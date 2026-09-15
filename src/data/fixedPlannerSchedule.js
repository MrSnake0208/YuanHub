import { aggregatePlannerState, buildRecommendedPlan, clonePlannerValue, normalizePlannerPlan, PLANNER_RULES, plannerBlockedResources, plannerProgressRows, plannerStateIsEmpty, plannerStateRemaining, settlePlannerDay, simulatePlanner } from './cultivationPlanner.js'
import { evaluateExactPlans, prepareExactPlanner } from './exactPlanner.js'
import { exactComparisonScenarios, exactDeadlineAlternatives } from './exactPlannerComparison.js'

export function plannerDateAfter(date, days) {
  const value = new Date(date + 'T12:00:00')
  value.setDate(value.getDate() + days)
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-')
}

export function fixedScheduleTimeline(schedule) {
  return schedule ? [...schedule.history, ...schedule.result.timeline] : []
}

function dayOffset(start, date) {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000)
}

// ETA belongs to the calculation baseline, not the first archived record.
export function plannerTiming(result, baseline, today) {
  if (result.status !== 'complete' || result.awaitingRecalculation || result.etaDays == null) return { remainingDays: null, completionDate: null }
  const completionDate = result.etaDays > 0 ? plannerDateAfter(baseline, result.etaDays - 1) : null
  return { completionDate, remainingDays: result.etaDays === 0 ? 0 : Math.max(0, dayOffset(today, completionDate) + 1) }
}

// Save both inputs and settled days. Inventory, the clock and later rule changes cannot
// silently rewrite an existing schedule. Deliberate edits regenerate only future days.
export function createFixedSchedule(context, manualPlans = {}, previous = null, maxDays = PLANNER_RULES.maxEtaDays) {
  const baselineDate = context.date
  const history = fixedScheduleTimeline(previous).filter(day => day.date < baselineDate)
  // Older saves contain only manual days, without a historical inventory baseline.
  // Preserve their actual arrangements without inventing historical material progress.
  if (!previous) for (const date of Object.keys(manualPlans).filter(date => date < baselineDate).sort()) {
    const settled = settlePlannerDay({}, manualPlans[date], context)
    history.push({ ...settled, date, start: {}, manual: true, recommended: settled.planned, progressRows: [], legacy: true })
  }
  const dates = Array.from({ length: maxDays }, (_, index) => plannerDateAfter(baselineDate, index))
  const result = simulatePlanner({ ...context, dates, manualPlans, maxDays })
  if (result.status === 'invalid') {
    const last = result.timeline.at(-1)
    const savedFuture = fixedScheduleTimeline(previous).filter(day => day.date > last.date)
    for (const day of savedFuture) {
      const planned = manualPlans[day.date] || day.planned
      result.timeline.push({ ...day, planned, start: last.end, end: last.end, yield: {}, used: {}, surplus: {},
        errors: [], warnings: [], paused: true })
    }
  }
  result.timeline = result.timeline.map(day => ({ ...day,
    progressRows: plannerProgressRows(context.requiredState, context.initialState, day, context.stock) }))
  return clonePlannerValue({ version: 1, startDate: history[0]?.date || baselineDate, baselineDate,
    context: { ...context, displayStartDate: context.displayStartDate || previous?.context.displayStartDate, planBaselines: Object.fromEntries(Object.entries(previous?.context.planBaselines || {})
      .filter(([date]) => date >= baselineDate && manualPlans[date])) }, history, result })
}

// Reset the active stage while retaining immutable cloud history out of view.
export function resetFixedSchedule(context, manualPlans = {}, previous = null) {
  const pastPlans = Object.fromEntries(Object.entries(manualPlans).filter(([date]) => date < context.date))
  const schedule = createFixedSchedule({ ...context, displayStartDate: context.date }, pastPlans, previous)
  return { schedule, manualPlans: clonePlannerValue(pastPlans) }
}

export function visibleFixedScheduleTimeline(schedule) {
  return fixedScheduleTimeline(schedule).filter(day => !schedule.context.displayStartDate || day.date >= schedule.context.displayStartDate)
}

export function pendingScheduleEdits(schedule, date) {
  const baseline = schedule?.context.planBaselines?.[date]
  const day = schedule?.result.timeline.find(day => day.date === date)
  return Boolean(baseline && day && JSON.stringify(normalizePlannerPlan(day.planned)) !== JSON.stringify(normalizePlannerPlan(baseline)))
}

// Save ledger edits. Replay saved actions for accurate validation/progress, but
// never invoke the recommender or change any day's spends until the user asks.
export function updateFixedSchedulePlan(schedule, date, plan, fallbackDay = null) {
  const existing = schedule.result.timeline.find(day => day.date === date)
  const day = existing || fallbackDay
  if (!day || day.date !== date || date < schedule.baselineDate) throw new Error('该日期尚无可编辑日程')
  const next = clonePlannerValue(schedule)
  if (!existing) {
    next.result.timeline.push(clonePlannerValue(day))
    next.result.timeline.sort((a, b) => a.date.localeCompare(b.date))
  }
  next.context.planBaselines ||= {}
  next.context.planBaselines[date] ??= clonePlannerValue(day.planned)
  let state = next.context.initialState
  let invalid = false
  let lastProgressDay = 0
  next.result.timeline = next.result.timeline.map(saved => {
    if (saved.date < date) {
      state = saved.end
      invalid ||= Boolean(saved.errors?.length || saved.paused)
      if (plannerStateRemaining(saved.end) < plannerStateRemaining(saved.start)) lastProgressDay = dayOffset(next.baselineDate, saved.date) + 1
      return saved
    }
    const start = state
    const settled = settlePlannerDay(start, saved.date === date ? plan : saved.planned, next.context)
    const paused = invalid
    invalid ||= settled.errors.length > 0
    if (paused) Object.assign(settled, { end: start, yield: {}, used: {}, surplus: {} })
    state = settled.end
    if (plannerStateRemaining(state) < plannerStateRemaining(start)) lastProgressDay = dayOffset(next.baselineDate, saved.date) + 1
    const updated = { ...saved, ...settled, start, index: dayOffset(next.baselineDate, saved.date), manual: saved.date === date || saved.manual,
      progressRows: plannerProgressRows(next.context.requiredState, next.context.initialState, { start, ...settled }, next.context.stock) }
    delete updated.paused
    if (paused) updated.paused = true
    return updated
  })
  const elapsedDays = dayOffset(next.baselineDate, next.result.timeline.at(-1).date) + 1
  const complete = !invalid && plannerStateIsEmpty(state) && elapsedDays <= PLANNER_RULES.maxEtaDays
  Object.assign(next.result, { remaining: state, lastProgressDay,
    status: invalid ? 'invalid' : complete ? 'complete' : 'horizon',
    awaitingRecalculation: !invalid && !complete,
    blocked: plannerBlockedResources(state, next.context.groups, next.context.levels),
    etaDays: complete ? plannerStateIsEmpty(next.context.initialState) ? 0 : elapsedDays : null })
  delete next.result.optimization
  delete next.result.planSource
  return next
}

export function applyDeadlineAlternative(previous, outcome, input) {
  if (!input || outcome.comparisonInputKey !== JSON.stringify(input)) throw new Error('计算条件已变化，请重新计算')
  const scenario = exactDeadlineAlternatives(input).find(item => item.id === outcome.comparisonId)
  if (!scenario || !outcome.solution || outcome.inputKey !== JSON.stringify(scenario.input)) throw new Error('没有可采用的补足方案')
  const checked = evaluateExactPlans(prepareExactPlanner(scenario.input), outcome.solution.timeline.map(day => day.planned))
  if (!checked || checked.etaDays > scenario.input.dates.length) throw new Error('补足方案未通过校验')
  const date = input.dates[0]
  const schedule = createFixedSchedule({ ...input, date, displayStartDate: date }, {}, previous)
  // Exact daily purchases, reserve claims and dispatch changes must stay fixed.
  const manualPlans = Object.fromEntries(checked.timeline.map(day => [day.date, day.planned]))
  schedule.result = { ...checked, planSource: 'deadline-alternative', timeline: checked.timeline.map(day => ({ ...day, progressRows: plannerProgressRows(input.requiredState, input.initialState, day, input.stock) })) }
  schedule.context.planBaselines = {}
  return { schedule, manualPlans }
}

export function applyExactComparisonResult(schedule, date, outcome, input, manualPlans) {
  if (!input || input.objective === 'coins' || outcome.comparisonInputKey !== JSON.stringify(input)) throw new Error('计算条件已变化，请重新计算')
  const scenario = exactComparisonScenarios(input).find(item => item.id === outcome.comparisonId)
  if (!scenario) throw new Error('找不到所选购买方案')
  const next = applyExactPlannerResult(schedule, date, outcome, scenario.input, manualPlans)
  next.schedule.context.preferences = clonePlannerValue(scenario.input.preferences)
  return { ...next, preferences: clonePlannerValue(scenario.input.preferences) }
}

export function applyExactPlannerResult(schedule, date, outcome, input, manualPlans) {
  if (!['optimal', 'feasible'].includes(outcome.status) || !outcome.solution || input.objective === 'coins') throw new Error('没有可采用的日程方案')
  if (outcome.inputKey && outcome.inputKey !== JSON.stringify(input)) throw new Error('计算条件已变化，请重新计算')
  const problem = prepareExactPlanner(input)
  const solution = outcome.solution
  const normalized = value => JSON.stringify(normalizePlannerPlan(value))
  for (const [index, day] of solution.timeline.entries()) {
    if (day.date !== input.dates[index]) throw new Error('计算日期已变化，请重新计算')
    if (index > 0 && manualPlans[day.date] && normalized(day.planned) !== normalized(manualPlans[day.date])) throw new Error('计算结果改变了未来手工安排')
  }
  const checked = evaluateExactPlans(problem, solution.timeline.map(day => day.planned))
  if (!checked || checked.etaDays !== solution.etaDays) throw new Error('计算结果未通过日程校验')
  const next = clonePlannerValue(schedule)
  const offset = dayOffset(next.baselineDate, date)
  if (offset < 0 || offset + checked.etaDays > PLANNER_RULES.maxEtaDays) throw new Error('计算日期超出当前规划范围')
  const prefix = next.result.timeline.filter(day => day.date < date)
  next.result = { ...checked, etaDays: offset + checked.etaDays, lastProgressDay: offset + checked.lastProgressDay,
    timeline: prefix.concat(checked.timeline.map(day => ({ ...day, index: offset + day.index,
      progressRows: plannerProgressRows(next.context.requiredState, next.context.initialState, day, next.context.stock) }))),
    optimization: { status: outcome.status, objective: outcome.objective, fromDate: date,
      completionDays: checked.etaDays, horizon: outcome.horizon, solver: outcome.solver } }
  delete next.context.planBaselines?.[date]
  const nextPlans = { ...clonePlannerValue(manualPlans), [date]: checked.timeline[0].planned }
  return { schedule: next, manualPlans: nextPlans }
}

export function recalculateFixedScheduleFrom(schedule, date, manualPlans, options) {
  const day = schedule.result.timeline.find(day => day.date === date)
  if (!day || day.paused) throw new Error('请先修正此前的无效日程')
  const planned = buildRecommendedPlan({ ...options, state: day.start, gains: day.planned.gains,
    fixedSpends: day.planned.spends.filter(spend => spend.custom || !['training', 'stage624'].includes(spend.kind)) })
  const checked = settlePlannerDay(day.start, planned, options)
  if (checked.errors.length) throw new Error(checked.errors.join('；'))
  const nextPlans = { ...clonePlannerValue(manualPlans), [date]: planned }
  const offset = dayOffset(schedule.baselineDate, date)
  if (offset >= PLANNER_RULES.maxEtaDays) throw new Error('该日期已超出当前 90 天规划范围，请先按当前库存更新日程')
  const suffix = reviseFixedSchedule(schedule, { ...options, date, maxDays: PLANNER_RULES.maxEtaDays - offset }, nextPlans)
  // This day retains its exact gains on later preference edits, while the user can
  // still see which spends were recommended by the explicit recalculation.
  suffix.result.timeline[0].recommended = clonePlannerValue(planned)
  // Keep the original baseline: recalculating a future date must not turn the
  // preceding, still-editable dates into immutable history.
  const next = clonePlannerValue(schedule)
  const prefix = next.result.timeline.filter(day => day.date < date)
  next.result = { ...suffix.result, timeline: prefix.concat(suffix.result.timeline.map((day, index) => ({ ...day,
    index: offset + index,
    progressRows: plannerProgressRows(next.context.requiredState, next.context.initialState, day, next.context.stock) }))) }
  if (next.result.etaDays != null) next.result.etaDays = plannerStateIsEmpty(next.context.initialState) ? 0 : dayOffset(next.baselineDate, next.result.timeline.at(-1).date) + 1
  next.result.lastProgressDay = suffix.result.lastProgressDay ? offset + suffix.result.lastProgressDay
    : prefix.reduce((last, day) => plannerStateRemaining(day.end) < plannerStateRemaining(day.start) ? dayOffset(next.baselineDate, day.date) + 1 : last, 0)
  delete next.context.planBaselines?.[date]
  return { schedule: next, manualPlans: nextPlans }
}

export function projectedPlannerStock(schedule, date, requiredState = schedule.context.requiredState) {
  const stock = { ...schedule.context.stock }
  for (const day of schedule.result.timeline) {
    if (day.date >= date) break
    for (const [id, amount] of Object.entries(day.yield || {})) stock[id] = (stock[id] || 0) + amount
  }
  // Cultivating operators consumes materials. Infer that consumption from the same
  // goals' reduced requirements, so a normal upgrade does not look like missing stock.
  const before = aggregatePlannerState(schedule.context.requiredState)
  const after = aggregatePlannerState(requiredState)
  for (const [id, amount] of Object.entries(before)) stock[id] = Math.max(0, (stock[id] || 0) - Math.max(0, amount - (after[id] || 0)))
  return stock
}

export function fixedScheduleDifferences(schedule, current) {
  if (!schedule || current.date < schedule.baselineDate) return { goalsChanged: false, resources: [] }
  const stableGoals = goals => JSON.stringify(Object.entries(goals || {}).sort(([a], [b]) => a.localeCompare(b)))
  const goalsChanged = stableGoals(current.goals) !== stableGoals(schedule.context.goals)
  const expected = projectedPlannerStock(schedule, current.date, goalsChanged ? schedule.context.requiredState : current.requiredState)
  const ids = new Set([...Object.keys(aggregatePlannerState(schedule.context.requiredState)),
    ...schedule.result.timeline.flatMap(day => Object.keys(day.yield || {}))])
  const resources = [...ids].flatMap(id => {
    const planned = Number(expected[id]) || 0
    const actual = Number(current.stock[id]) || 0
    return Math.abs(planned - actual) > .001 ? [{ id, planned, actual }] : []
  })
  return { goalsChanged, resources }
}

export function reviseFixedSchedule(schedule, { date, preferences, strategy, agentOrder, levels, maxDays = PLANNER_RULES.maxEtaDays }, manualPlans) {
  const baselineDate = date < schedule.baselineDate ? schedule.baselineDate : date
  const timeline = schedule.result.timeline
  const initialState = timeline.find(day => day.date === baselineDate)?.start
    || timeline.filter(day => day.date < baselineDate).at(-1)?.end || schedule.context.initialState
  return createFixedSchedule({ ...schedule.context, date: baselineDate, initialState,
    stock: projectedPlannerStock(schedule, baselineDate), preferences, strategy, agentOrder, levels }, manualPlans, schedule, maxDays)
}
