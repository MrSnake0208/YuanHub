import test from 'node:test'
import assert from 'node:assert/strict'
import { customSpendTemplate, customSpendFromTemplate, normalizeCustomSpendRules, mergeCustomSpendRules, markCustomSpendOverride, replaceCustomSpendRule } from '../src/data/customPlannerSpends.js'
import { buildRecommendedPlan, normalizePlannerPreferences, normalizePlannerPlan, simulatePlanner, createGain, clonePlannerValue, planTotals } from '../src/data/cultivationPlanner.js'
import { createFixedSchedule, applyCustomSpendRulesToSchedule, resetFixedSchedule, plannerDateAfter, applyFixedCustomSpendToSchedule, recalculateFixedScheduleFrom, restoreFixedScheduleDay, updateFixedSchedulePlan } from '../src/data/fixedPlannerSchedule.js'
import { prepareExactPlanner, evaluateExactPlans, buildExactModel } from '../src/data/exactPlanner.js'
import { scheduleBody, scheduleFromRemote } from '../src/data/operatorPlannerRemote.js'
const today = '2026-10-27', id = 'custom-spend-lantai'
const item = { id, label: '兰台扫荡', costPer: 10, yield: { __xp__: 1000 } }
const version = (fromDate = today, count = 10) => ({ fromDate, enabled: true, count, item: { label: item.label, costPer: item.costPer, yield: item.yield } })
const rules = () => [{ id, versions: [version()] }]
const context = (preferences = {}) => ({ date: today, initialState: { a: { __xp__: 1000000 } }, requiredState: { a: { __xp__: 1000000 } }, stock: {}, goals: {}, levels: {}, strategy: 'overall', agentOrder: ['a'], preferences: normalizePlannerPreferences(preferences) })
const dates = Array.from({ length: 90 }, (_, i) => plannerDateAfter(today, i))
const emptyPlan = () => ({ gains: [createGain('natural'), createGain('meal')], spends: [] })

test('长期规则先占100体力，快速推荐分配剩余预算，零体力产出也计入', () => {
  const ctx = context({ customSpendRules: rules() })
  const plan = buildRecommendedPlan({ ...ctx, state: ctx.initialState, date: today })
  assert.equal(plan.spends.find(row => row.id === id).value, 10)
  assert.ok(planTotals(plan).spends <= 408)
  assert.equal(plan.spends.filter(row => row.id !== id).reduce((n, row) => n + row.value * row.costPer, 0), 300)
  const zero = replaceCustomSpendRule([], id, { ...version(), item: { ...version().item, costPer: 0 } })
  const sim = simulatePlanner({ ...ctx, initialState: { a: { __xp__: 1000 } }, dates, preferences: { customSpendRules: zero } })
  assert.equal(sim.etaDays, 1)
  assert.equal(sim.timeline.length, 1)
  assert.ok(sim.timeline[0].plannedYield.__xp__ >= 10000)
})

test('只从生效日期接管相同ID，幂等且同名项目保留', () => {
  const plan = emptyPlan(); plan.spends.push(customSpendFromTemplate(item, 2), customSpendFromTemplate({ ...item, id: 'custom-spend-other' }, 1))
  const future = [{ id, versions: [version(dates[1])] }]
  assert.equal(mergeCustomSpendRules(plan, future, today).spends[0].value, 2)
  const merged = mergeCustomSpendRules(plan, future, dates[1])
  assert.deepEqual(mergeCustomSpendRules(merged, future, dates[1]), merged)
  assert.equal(merged.spends.find(row => row.id === id).value, 10)
  assert.equal(merged.spends.length, 2)
})

test('单日修改、跳过及恢复独立于规则改次和停用，输入不变', () => {
  const changed = markCustomSpendOverride({ ...emptyPlan(), spends: [customSpendFromTemplate(item, 5)] }, rules(), id)
  const skipped = { ...emptyPlan(), customSpendOverrides: [id] }
  const next = replaceCustomSpendRule(rules(), id, version(today, 8))
  assert.equal(mergeCustomSpendRules(changed, next, today).spends[0].value, 5)
  assert.equal(mergeCustomSpendRules(skipped, next, today).spends.length, 0)
  assert.equal(mergeCustomSpendRules({ ...skipped, customSpendOverrides: [] }, next, today).spends[0].value, 8)
  const disabled = replaceCustomSpendRule(next, id, { fromDate: today, enabled: false })
  assert.equal(mergeCustomSpendRules(changed, disabled, today).spends[0].value, 5)
  assert.equal(mergeCustomSpendRules(emptyPlan(), disabled, today).spends.length, 0)
  assert.equal(changed.spends[0].value, 5)
})

test('版本变更只替换本项目以后的版本，拒绝非法日期次数与重复ID', () => {
  const original = [{ id, versions: [version(today), version(dates[5], 9)] }, { id: 'custom-spend-other', versions: [version(dates[8])] }]
  const next = replaceCustomSpendRule(original, id, version(dates[3], 8))
  assert.deepEqual(next[0].versions.map(v => v.count), [10, 8])
  assert.deepEqual(next[1], original[1])
  for (const bad of [{ ...version(), count: 1.5 }, { ...version(), count: 10000 }, { ...version(), fromDate: '2026-02-30' }]) assert.throws(() => replaceCustomSpendRule([], id, bad))
  assert.throws(() => normalizeCustomSpendRules([original[0], original[0]]))
  assert.throws(() => customSpendTemplate({ ...item, costPer: Infinity }))
})

test('90天后更新和重设仍有规则，不生成90份手工记录，也不延迟ETA', () => {
  const ctx = { ...context(), initialState: { a: { __xp__: 1000 } } }
  const applied = applyCustomSpendRulesToSchedule(createFixedSchedule(ctx), {}, rules(), today)
  assert.deepEqual(applied.manualPlans, {})
  assert.equal(applied.schedule.result.etaDays, 1)
  assert.equal(applied.schedule.result.timeline.length, 1)
  const nextDate = plannerDateAfter(today, 95)
  const reset = resetFixedSchedule({ ...ctx, date: nextDate, preferences: applied.preferences }, {}, applied.schedule)
  assert.equal(reset.schedule.result.timeline[0].planned.spends.find(row => row.id === id).value, 10)
  assert.deepEqual(reset.manualPlans, {})
})

test('规则激活校验备齐后的手工日期和来源结束，超支整批拒绝', () => {
  const ctx = { ...context(), initialState: {} }
  const later = { gains: [createGain('natural', { value: 50 })], spends: [] }
  const plans = { [dates[50]]: later }, schedule = createFixedSchedule(ctx, plans), before = clonePlannerValue(schedule)
  assert.throws(() => applyCustomSpendRulesToSchedule(schedule, plans, rules(), today), new RegExp(dates[50]))
  assert.deepEqual(schedule, before)
  assert.deepEqual(plans[dates[50]], later)
})

test('停用可清除已生成的规则行，保留例外和历史', () => {
  const ctx = context({ customSpendRules: rules() }), plan = mergeCustomSpendRules(emptyPlan(), rules(), today)
  const manual = { [today]: plan, [dates[1]]: { ...plan, customSpendOverrides: [id] } }
  const original = createFixedSchedule(ctx, manual)
  const disabled = replaceCustomSpendRule(rules(), id, { fromDate: today, enabled: false })
  const next = applyCustomSpendRulesToSchedule(original, manual, disabled, today)
  assert.equal(next.manualPlans[today].spends.length, 0)
  assert.equal(next.manualPlans[dates[1]].spends[0].value, 10)
  const later = applyCustomSpendRulesToSchedule(original, manual, replaceCustomSpendRule(rules(), id, version(dates[2], 8)), dates[2])
  assert.deepEqual(later.schedule.history.slice(0, 2), original.result.timeline.slice(0, 2))
})

test('原日期范围操作创建单日覆盖，重算、恢复与云端往返保留元数据', () => {
  const ctx = context({ customSpendRules: rules() }), original = createFixedSchedule(ctx)
  const ranged = applyFixedCustomSpendToSchedule(original, {}, { fromDate: today, toDate: dates[1], count: 5 }, today, customSpendFromTemplate(item))
  assert.deepEqual(ranged.manualPlans[today].customSpendOverrides, [id])
  const recalculated = recalculateFixedScheduleFrom(ranged.schedule, today, ranged.manualPlans, ctx)
  assert.equal(recalculated.manualPlans[today].spends.find(row => row.id === id).value, 5)
  assert.deepEqual(recalculated.manualPlans[today].customSpendOverrides, [id])
  const wire = scheduleBody({ ...ctx, ...recalculated })
  const restored = scheduleFromRemote({ ...wire, account_id: 'a', revision: 1 }, 'a')
  assert.equal(restored.preferences.customSpendRules[0].versions[0].count, 10)
  assert.deepEqual(normalizePlannerPlan(restored.manualPlans[today]).customSpendOverrides, [id])
  assert.ok(wire.client_features.includes('custom-daily-spends-v1'))
})

test('精确与目标天数输入均扣除规则成本并锁住次数/单次产出，不累计备齐后预览费用', () => {
  const ctx = { ...context({ customSpendRules: rules(), purchaseCount: 1 }), initialState: { a: { __xp__: 1000 } } }
  for (const objective of ['overall', 'coins']) {
    const problem = prepareExactPlanner({ ...ctx, dates, manualPlans: {}, objective })
    assert.equal(problem.days[0].plan.spends.find(row => row.id === id).value, 10)
    assert.equal(problem.days[0].yield.__xp__, 10000)
    assert.equal(problem.days[0].budget, objective === 'coins' ? 308 : 368)
    const plans = problem.days.map(day => clonePlannerValue(day.plan))
    const result = evaluateExactPlans(problem, plans)
    assert.equal(result.etaDays, 1)
    assert.equal(result.timeline.length, 1)
    assert.equal(result.totalCoins, objective === 'coins' ? 0 : 50)
    plans[0].spends[0].value = 9
    assert.equal(evaluateExactPlans(problem, plans), null)
    assert.equal(buildExactModel(problem, 1).variables.some(variable => variable.action.id === id), false)
  }
})

test('未来生效的零体力资源规则可以解决当前没有刷取途径的缺口', () => {
  const rule = replaceCustomSpendRule([], id, { ...version(dates[2], 1), item: { label: '据点', costPer: 0, yield: { other: 1 } } })
  const result = simulatePlanner({ ...context(), initialState: { a: { other: 1 } }, dates, preferences: { customSpendRules: rule } })
  assert.equal(result.etaDays, 3)
})

test('未来生效只更新生效日及后续，保留先前保存的非贪心安排', () => {
  const ctx = context()
  const savedPlan = { ...emptyPlan(), spends: [{ id: 'custom-spend-one-off', label: '单次', custom: true, kind: 'custom', value: 1, costPer: 1, yield: {} }] }
  const original = createFixedSchedule(ctx, { [today]: savedPlan })
  original.result.timeline[0].manual = false
  const futureRules = [{ id, versions: [version(dates[2])] }]
  const changed = applyCustomSpendRulesToSchedule(original, {}, futureRules, today, dates[2])
  assert.deepEqual(changed.schedule.result.timeline.slice(0, 2).map(day => day.planned), original.result.timeline.slice(0, 2).map(day => day.planned))
  assert.equal(changed.schedule.result.timeline[2].planned.spends.find(row => row.id === id).value, 10)
  assert.deepEqual(changed.manualPlans, {})
})

test('已知月卡过期导致窗口后段固定消耗超支时拒绝启用', async () => {
  const { emptyStaminaSources, withSourcePeriod } = await import('../src/data/dailyStaminaSources.js')
  const sources = emptyStaminaSources()
  sources.monthlyCard = { tier: 'custom', dailyEnabled: true, shopEnabled: false, dailyAmount: 100, shopAmount: 0, startDate: today, endDate: dates[1] }
  const ctx = context(withSourcePeriod({}, sources, today))
  const heavy = replaceCustomSpendRule([], id, { ...version(), item: { ...version().item, costPer: 45 } })
  assert.throws(() => applyCustomSpendRulesToSchedule(createFixedSchedule(ctx), {}, heavy, today), new RegExp(dates[2]))
})

test('模板和规则中的经验书与既有规则一致折算经验，避免重复计算渠道', () => {
  const book = { ...item, yield: { bingshuquanjuan: 1, __xp__: 100 } }
  assert.deepEqual(customSpendTemplate(book).yield, { __xp__: 1100 })
  const bookRule = replaceCustomSpendRule([], id, { ...version(), item: { label: book.label, costPer: 10, yield: book.yield } })
  const ctx = context({ customSpendRules: bookRule })
  const problem = prepareExactPlanner({ ...ctx, initialState: { a: { __xp__: 1 } }, dates, objective: 'overall' })
  assert.equal(problem.days[0].yield.__xp__, 11000)
  assert.ok(evaluateExactPlans(problem, problem.days.map(day => day.plan)))
})

test('取消尚未开始的规则仍保留项目副本，删除模板后可再次启用', () => {
  const future = [{ id, versions: [version(dates[5], 8)] }]
  const stopped = replaceCustomSpendRule(future, id, { fromDate: today, enabled: false })
  assert.equal(stopped[0].versions.length, 1)
  assert.equal(stopped[0].versions[0].enabled, false)
  assert.equal(stopped[0].versions[0].item.label, item.label)
  assert.equal(stopped[0].versions[0].count, 8)
  assert.deepEqual(mergeCustomSpendRules(emptyPlan(), stopped, dates[6]).spends, [])
  const snapshot = stopped[0].versions[0]
  const restored = replaceCustomSpendRule(stopped, id, { ...snapshot, fromDate: dates[6], enabled: true })
  assert.equal(mergeCustomSpendRules(emptyPlan(), restored, dates[6]).spends[0].value, 8)
})


test('恢复当天采用当前有效每日版本，不回退编辑前的旧每日次数', () => {
  const ctx = context({ customSpendRules: rules() }), original = createFixedSchedule(ctx)
  const plan = clonePlannerValue(original.result.timeline[0].planned)
  plan.spends.find(row => row.id === id).value = 5
  markCustomSpendOverride(plan, rules(), id)
  const edited = updateFixedSchedulePlan(original, today, plan)
  const next = applyCustomSpendRulesToSchedule(edited, { [today]: plan }, replaceCustomSpendRule(rules(), id, version(today, 8)), today)
  assert.equal(next.manualPlans[today].spends.find(row => row.id === id).value, 5)
  const restored = restoreFixedScheduleDay(next.schedule, today, next.manualPlans)
  assert.equal(restored.manualPlans[today].spends.find(row => row.id === id).value, 8)
  assert.deepEqual(restored.manualPlans[today].customSpendOverrides || [], [])
})
