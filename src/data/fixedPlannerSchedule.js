import { aggregatePlannerState, clonePlannerValue, PLANNER_RULES, plannerProgressRows, settlePlannerDay, simulatePlanner } from './cultivationPlanner.js'

export function plannerDateAfter(date, days) {
  const value = new Date(date + 'T12:00:00')
  value.setDate(value.getDate() + days)
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-')
}

export function fixedScheduleTimeline(schedule) {
  return schedule ? [...schedule.history, ...schedule.result.timeline] : []
}

// Save both inputs and settled days. Inventory, the clock and later rule changes cannot
// silently rewrite an existing schedule. Deliberate edits regenerate only future days.
export function createFixedSchedule(context, manualPlans = {}, previous = null) {
  const baselineDate = context.date
  const history = fixedScheduleTimeline(previous).filter(day => day.date < baselineDate)
  // Older saves contain only manual days, without a historical inventory baseline.
  // Preserve their actual arrangements without inventing historical material progress.
  if (!previous) for (const date of Object.keys(manualPlans).filter(date => date < baselineDate).sort()) {
    const settled = settlePlannerDay({}, manualPlans[date], context)
    history.push({ ...settled, date, start: {}, manual: true, recommended: settled.planned, progressRows: [], legacy: true })
  }
  const dates = Array.from({ length: PLANNER_RULES.maxEtaDays }, (_, index) => plannerDateAfter(baselineDate, index))
  const result = simulatePlanner({ ...context, dates, manualPlans })
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
    context, history, result })
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

export function reviseFixedSchedule(schedule, { date, preferences, strategy, agentOrder, levels }, manualPlans) {
  const baselineDate = date < schedule.baselineDate ? schedule.baselineDate : date
  const timeline = schedule.result.timeline
  const initialState = timeline.find(day => day.date === baselineDate)?.start
    || timeline.filter(day => day.date < baselineDate).at(-1)?.end || schedule.context.initialState
  return createFixedSchedule({ ...schedule.context, date: baselineDate, initialState,
    stock: projectedPlannerStock(schedule, baselineDate), preferences, strategy, agentOrder, levels }, manualPlans, schedule)
}
