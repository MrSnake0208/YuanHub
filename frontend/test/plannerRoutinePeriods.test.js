import test from 'node:test'
import assert from 'node:assert/strict'
import { routineForDate, withRoutineRange, normalizeRoutinePeriods } from '../src/data/plannerRoutinePeriods.js'
import { normalizePlannerPreferences, buildRecommendedPlan, createGain } from '../src/data/cultivationPlanner.js'
import { prepareExactPlanner } from '../src/data/exactPlanner.js'
import { createFixedSchedule, applyCustomSpendRulesToSchedule, applyDailySourcesToSchedule } from '../src/data/fixedPlannerSchedule.js'
import { replaceCustomSpendRule, customSpendRuleAt, mergeCustomSpendRules } from '../src/data/customPlannerSpends.js'
import { emptyStaminaSources, validateStaminaSources, resolveDailyStaminaGains, withFixedSourcePeriods } from '../src/data/dailyStaminaSources.js'
import { scheduleBody, scheduleFromRemote, workspaceBody } from '../src/data/operatorPlannerRemote.js'

const from = '2026-11-10', end = '2026-11-16'
const base = normalizePlannerPreferences({ luoyang: 2, shouchun: 1, purchaseCount: 0 })
const counts = { luoyang: 4, shouchun: 1, purchaseCount: 2 }
const context = preferences => ({ date: '2026-11-06', initialState: { a: { __xp__: 10000000 } }, requiredState: { a: { __xp__: 10000000 } }, stock: {}, goals: {}, levels: {}, strategy: 'overall', agentOrder: ['a'], preferences })

test('区间含首尾，结束恢复原值，并保留区间后的已有分段；重复应用幂等', () => {
  const existing = withRoutineRange(base, { ...counts, luoyang: 3 }, '2026-11-20')
  const next = withRoutineRange(existing, counts, from, end)
  assert.equal(routineForDate(next, '2026-11-09').luoyang, 2)
  assert.equal(routineForDate(next, from).luoyang, 4)
  assert.equal(routineForDate(next, end).luoyang, 4)
  assert.equal(routineForDate(next, '2026-11-17').luoyang, 2)
  assert.equal(routineForDate(next, '2026-11-20').luoyang, 3)
  assert.deepEqual(withRoutineRange(next, counts, from, end), next)
  assert.throws(() => withRoutineRange(base, counts, from, '2026-11-09'))
  assert.throws(() => withRoutineRange(base, counts, '2026-02-30'))
  assert.throws(() => normalizeRoutinePeriods([{ ...counts, fromDate: from, purchaseCount: 9 }]))
})

test('普通推荐与最优求解按同一日期取派遣和购买次数，保存往返保留规则', () => {
  const preferences = withRoutineRange(base, counts, from, end), ctx = context(preferences)
  const dates = ['2026-11-09', from, end, '2026-11-17']
  const exact = prepareExactPlanner({ ...ctx, dates, objective: 'overall' })
  dates.forEach((date, index) => {
    const plan = buildRecommendedPlan({ ...ctx, state: ctx.initialState, date })
    assert.equal(plan.spends.find(row => row.id === 'luoyang').value, [2, 4, 4, 2][index])
    assert.equal(exact.days[index].plan.spends.find(row => row.id === 'luoyang').value, [2, 4, 4, 2][index])
    assert.equal(exact.days[index].plan.gains.find(row => row.id === 'buy')?.value || 0, [0, 2, 2, 0][index])
  })
  const body = scheduleBody({ preferences, manualPlans: {}, schedule: null })
  assert.ok(body.client_features.includes('routine-periods-v1'))
  assert.deepEqual(scheduleFromRemote({ ...body, account_id: 'a' }, 'a').preferences, preferences)
  assert.ok(workspaceBody({ plans: [] }).client_features.includes('routine-periods-v1'))
})

test('应用派遣区间保留生效前快照与手工日期，自动日使用新规则', () => {
  const ctx = context(base), manual = { [from]: { gains: [createGain('natural'), createGain('meal')], spends: [] } }
  const schedule = createFixedSchedule(ctx, manual)
  const preferences = withRoutineRange(base, counts, from, end)
  const result = applyCustomSpendRulesToSchedule(schedule, manual, [], ctx.date, from, preferences)
  assert.deepEqual(result.manualPlans[from], manual[from])
  assert.deepEqual(result.schedule.result.timeline.filter(day => day.date < from), schedule.result.timeline.filter(day => day.date < from))
  assert.equal(result.schedule.result.timeline.find(day => day.date === '2026-11-11').planned.spends.find(row => row.id === 'luoyang').value, 4)
})

test('自定义每日项目到期恢复原版本，后续版本和当天例外保留', () => {
  const id = 'custom-spend-test', item = { label: '活动', costPer: 10, yield: {} }
  const rules = [{ id, versions: [{ fromDate: '2026-11-01', enabled: true, count: 2, item }, { fromDate: '2026-11-20', enabled: true, count: 3, item }] }]
  const next = replaceCustomSpendRule(rules, id, { fromDate: from, enabled: true, count: 4, item }, end)
  assert.equal(customSpendRuleAt(next[0], end).count, 4)
  assert.equal(customSpendRuleAt(next[0], '2026-11-17').count, 2)
  assert.equal(customSpendRuleAt(next[0], '2026-11-20').count, 3)
  const exception = { gains: [], spends: [], customSpendOverrides: [id] }
  assert.deepEqual(mergeCustomSpendRules(exception, next, from), exception)
  const fresh = replaceCustomSpendRule([], id, { fromDate: from, enabled: true, count: 4, item }, end)
  assert.equal(customSpendRuleAt(fresh[0], '2026-11-17').enabled, false)
})

test('固定来源仅在区间内替换默认来源，新来源到期消失；月卡同步可保留手工日', () => {
  const sources = emptyStaminaSources()
  sources.fixedSources = [{ id: 'meal', label: '进膳调整', value: 60, enabled: true, startDate: from, endDate: end }, { id: 'custom-gain-event', label: '活动', value: 30, enabled: true, startDate: from, endDate: end }]
  const preferences = { sourcePeriods: [{ fromDate: '2026-11-01', sources: validateStaminaSources(sources) }] }
  const amounts = date => resolveDailyStaminaGains([createGain('meal')], preferences, date).map(row => row.value)
  assert.deepEqual(amounts(from), [60, 30])
  assert.deepEqual(amounts(end), [60, 30])
  assert.deepEqual(amounts('2026-11-17'), [120])
  assert.throws(() => validateStaminaSources({ ...sources, fixedSources: [{ ...sources.fixedSources[0], endDate: '2026-11-09' }] }))
  const ctx = context(base), manual = { [ctx.date]: { gains: [createGain('natural')], spends: [] } }
  const schedule = createFixedSchedule(ctx, manual)
  sources.monthlyCard = { ...sources.monthlyCard, tier: 'yinghuo', dailyEnabled: true, dailyAmount: 30 }
  const result = applyDailySourcesToSchedule(schedule, manual, sources, ctx.date, ctx.date, false, { monthlyOnly: true })
  assert.deepEqual(result.manualPlans, JSON.parse(JSON.stringify(manual)))
})


test('固定来源的有限区间恢复已有来源，保留后续月卡配置，不影响其他来源', () => {
  const original = emptyStaminaSources()
  original.fixedSources = [{ id: 'event', label: '活动', value: 10, enabled: true }, { id: 'gift', label: '日常礼包', value: 5, enabled: true }]
  const later = JSON.parse(JSON.stringify(original)); later.fixedSources[0].value = 20
  later.monthlyCard = { ...later.monthlyCard, tier: 'yinghuo', dailyEnabled: true, dailyAmount: 30 }
  const preferences = { sourcePeriods: [{ fromDate: '2026-11-01', sources: original }, { fromDate: '2026-11-20', sources: later }] }
  const draft = JSON.parse(JSON.stringify(original))
  Object.assign(draft.fixedSources[0], { value: 60, startDate: from, endDate: end })
  const next = withFixedSourcePeriods(preferences, draft, '2026-11-06')
  const value = (date, id) => resolveDailyStaminaGains([], next, date).find(row => row.id === id)?.value
  assert.equal(value('2026-11-09', 'event'), 10)
  assert.equal(value(from, 'event'), 60)
  assert.equal(value(end, 'event'), 60)
  assert.equal(value('2026-11-17', 'event'), 10)
  assert.equal(value('2026-11-20', 'event'), 20)
  assert.equal(value('2026-11-20', 'monthly-card-daily'), 30)
  assert.equal(value(from, 'gift'), 5)
  assert.deepEqual(withFixedSourcePeriods(next, draft, '2026-11-06'), next)
})
