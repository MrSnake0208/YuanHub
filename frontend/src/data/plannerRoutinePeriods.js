export const ROUTINE_PERIODS_FEATURE = 'routine-periods-v1'
export const validPlannerDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
export function nextPlannerDate(date) {
  return new Date(Date.parse(date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)
}
export function normalizeRoutinePeriods(periods = []) {
  if (!Array.isArray(periods) || periods.length > 366) throw new Error('每日安排最多366个日期分段')
  let previous = ''
  return periods.map(period => {
    if (!validPlannerDate(period.fromDate) || period.fromDate <= previous) throw new Error('每日安排日期必须有效、有序且不重复')
    previous = period.fromDate
    const result = { fromDate: period.fromDate }
    for (const [key, max] of [['luoyang', 4], ['shouchun', 4], ['purchaseCount', 8]]) {
      if (!Number.isInteger(period[key]) || period[key] < 0 || period[key] > max) throw new Error('每日次数超出允许范围')
      result[key] = period[key]
    }
    return result
  })
}
export function routineForDate(preferences, date) {
  return { ...preferences, ...(preferences.routinePeriods || []).findLast(period => period.fromDate <= date) }
}
export function withRoutineRange(preferences, counts, fromDate, endDate = '') {
  if (!validPlannerDate(fromDate) || endDate && (!validPlannerDate(endDate) || endDate < fromDate)) throw new Error('请填写正确的每日安排日期范围')
  const periods = preferences.routinePeriods || []
  const after = endDate ? nextPlannerDate(endDate) : ''
  const restore = after ? routineForDate(preferences, after) : null
  const routinePeriods = [
    ...periods.filter(period => period.fromDate < fromDate),
    { ...counts, fromDate },
    ...(after ? [{ ...restore, fromDate: after }, ...periods.filter(period => period.fromDate > after)] : []),
  ]
  return { ...preferences, routinePeriods: normalizeRoutinePeriods(routinePeriods) }
}
