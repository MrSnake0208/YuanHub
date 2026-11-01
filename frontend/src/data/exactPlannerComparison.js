import { addCalendarDays } from '../utils/businessDay.js'
import { clonePlannerValue, createGain, normalizePlannerPlan, normalizePlannerPreferences, PLANNER_RULES } from './cultivationPlanner.js'

// Compare purchase policies using one inventory/date baseline. Fixed future days
// remain identical, including their purchases; all other first-day gains survive.
export function exactComparisonScenarios(input) {
  if (!input) return []
  const preferences = normalizePlannerPreferences(input.preferences)
  const deadline = input.objective === 'coins'
  const counts = deadline ? [0, 2] : [...new Set([0, 2, preferences.purchaseCount])]
  const scenarios = counts.map(purchaseCount => {
    const variant = clonePlannerValue(input)
    variant.preferences = { ...preferences, purchaseCount }
    if (deadline) variant.objective = 'overall'
    if (variant.firstDay) {
      variant.firstDay = normalizePlannerPlan(variant.firstDay)
      variant.firstDay.gains = variant.firstDay.gains.filter(gain => gain.id !== 'buy')
      if (purchaseCount) variant.firstDay.gains.push(createGain('buy', { value: purchaseCount }))
    }
    return { id: 'purchase-' + purchaseCount, purchaseCount, title: purchaseCount === 0 ? '零额外投入' : purchaseCount === 2 ? '每日购买两次' : `当前设置 · 每日购买 ${purchaseCount} 次`, input: variant }
  })
  if (deadline) scenarios.push({ id: 'minimum-coins', title: '期限内最低白金币', input: clonePlannerValue(input) })
  return scenarios
}

// Independent of the target deadline: keep today's inventory and all current
// purchase/dispatch/level/reserve settings, prove the earliest completion in 90 days.
export function exactCurrentSettingsScenario(input) {
  if (!input?.dates?.length) return null
  const variant = clonePlannerValue(input)
  variant.objective = 'overall'
  variant.dates = Array.from({ length: PLANNER_RULES.maxEtaDays }, (_, index) => addCalendarDays(input.dates[0], index))
  return { id: 'current-shortest', title: '当前设置下的最短天数', input: variant }
}


export function exactDeadlineAlternatives(input) {
  if (input?.objective !== 'coins' || !input.dates?.length) return []
  const horizons = [...new Set(Array.from({ length: 8 }, (_, index) => index).map(delta => Math.min(PLANNER_RULES.maxEtaDays, input.dates.length + delta)))]
  return horizons.flatMap(days => ['extra', 'coins', ...(input.preferences?.luoyang || input.preferences?.shouchun ? ['dispatch'] : [])].map(kind => {
    const variant = clonePlannerValue(input)
    const objective = kind === 'dispatch' ? 'extra' : kind
    variant.objective = objective
    variant.feasibilityOnly = true
    variant.reduceDispatch = kind === 'dispatch'
    variant.dates = Array.from({ length: days }, (_, index) => addCalendarDays(input.dates[0], index))
    return { id: `deadline-${days}-${kind}`, title: `${days} 天 · ${kind === 'dispatch' ? '减少派遣并补体力' : objective === 'extra' ? '当前购买档位下补体力' : '仅调整白金币购买'}`, input: variant }
  }))
}
