export const trainingItem = (level, count, completed = 0) => ({ id: `ds-${level}`, group_id: 'ds', stage_level: level, count, cost_per: 20, completed_count: completed })
export function dailyTrainingResponse({ account = 'a', plan = 'p', date = '2026-10-16', ...overrides } = {}) {
  return { account_id: account, plan_id: plan, date, version: 0, needs_update: false,
    source: { status: 'ready', revision: 3, items: [trainingItem(10, 1), trainingItem(12, 4)] }, tasks: [], ...overrides }
}
