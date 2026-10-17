import test from 'node:test'
import assert from 'node:assert/strict'
import { monthlyCardTiers } from '../src/data/monthlyCard.js'
import { emptyStaminaSources, resolveDailyStaminaGains, validateStaminaSources, withSourcePeriod } from '../src/data/dailyStaminaSources.js'
import { buildRecommendedPlan, clonePlannerValue, createGain, createSpend, normalizePlannerPreferences, normalizePlannerSnapshot, planTotals, simulatePlanner } from '../src/data/cultivationPlanner.js'
import { prepareExactPlanner } from '../src/data/exactPlanner.js'
import { applyDailySourcesToSchedule, createFixedSchedule, fixedScheduleTimeline, recalculateFixedScheduleFrom, reviseFixedSchedule } from '../src/data/fixedPlannerSchedule.js'
import { emptyTrainingWorkspace } from '../src/data/operatorTrainingPlans.js'
import { scheduleBody, scheduleFromRemote, workspaceBody, workspaceFromRemote } from '../src/data/operatorPlannerRemote.js'

const today = '2026-10-17'
const dates = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']
const context = () => ({ date: today, initialState: { a: { shuijing: 99999 } }, requiredState: { a: { shuijing: 99999 } }, stock: {}, goals: { a: [100, 17, 0] }, levels: { yy: 12 }, strategy: 'overall', agentOrder: ['a'], preferences: normalizePlannerPreferences() })
const cardSources = () => ({ ...emptyStaminaSources(), monthlyCard: { tier: 'zhaoyang', dailyEnabled: true, shopEnabled: true, dailyAmount: 60, shopAmount: 20, startDate: today, endDate: '2026-10-18' } })
const free = () => [createGain('natural'), createGain('meal')]

test('两个游戏分别持有可编辑预设，无月卡默认不增体力，四档每日奖励与商店分开', () => {
  assert.notEqual(monthlyCardTiers('如鸢'), monthlyCardTiers('代号鸢'))
  for (const game of ['如鸢', '代号鸢']) for (const tier of monthlyCardTiers(game).filter(tier => !['none', 'custom'].includes(tier.id))) {
    const sources = cardSources(); Object.assign(sources.monthlyCard, { tier: tier.id, dailyAmount: tier.stamina })
    const prefs = withSourcePeriod({}, sources, today)
    const gains = resolveDailyStaminaGains(free(), prefs, today)
    assert.equal(planTotals({ gains }).gains, 408 + tier.stamina + 20)
    assert.equal(gains.filter(gain => gain.id === 'monthly-card-daily').length, 1)
    assert.equal(gains.filter(gain => gain.id === 'monthly-card-shop').length, 1)
  }
  assert.equal(planTotals({ gains: resolveDailyStaminaGains(free(), withSourcePeriod({}, emptyStaminaSources(), today), today) }).gains, 408)
})

test('只启用商店20、有效范围含首尾，到期停用，自定义不影响其他来源', () => {
  const sources = cardSources(); sources.monthlyCard.dailyEnabled = false
  let prefs = withSourcePeriod({}, sources, today)
  assert.equal(planTotals({ gains: resolveDailyStaminaGains(free(), prefs, today) }).gains, 428)
  assert.equal(planTotals({ gains: resolveDailyStaminaGains(free(), prefs, '2026-10-18') }).gains, 428)
  assert.equal(planTotals({ gains: resolveDailyStaminaGains(free(), prefs, '2026-10-19') }).gains, 408)
  Object.assign(sources.monthlyCard, { tier: 'custom', dailyEnabled: true, dailyAmount: 37, shopAmount: 11 })
  prefs = withSourcePeriod({}, sources, today)
  assert.equal(planTotals({ gains: resolveDailyStaminaGains([...free(), createGain('event', { value: 9 })], prefs, today) }).gains, 465)
  sources.monthlyCard.tier = 'none'
  assert.equal(planTotals({ gains: resolveDailyStaminaGains(free(), withSourcePeriod({}, sources, today), today) }).gains, 408)
})

test('同ID固定来源替换推荐，关闭会抑制默认来源；重复套用规则不叠加', () => {
  const sources = cardSources(); sources.fixedSources = [{ id: 'natural', label: '自然恢复', value: 200, enabled: true }, { id: 'meal', label: '不领进膳', value: 120, enabled: false }, { id: 'event', label: '每日活动', value: 15, enabled: true }]
  const prefs = withSourcePeriod({}, sources, today)
  const gains = resolveDailyStaminaGains(free(), prefs, today)
  assert.equal(planTotals({ gains }).gains, 295)
  assert.deepEqual(resolveDailyStaminaGains(gains, prefs, today), gains)
  assert.deepEqual(withSourcePeriod(prefs, sources, today), prefs)
  assert.throws(() => validateStaminaSources({ ...sources, fixedSources: [...sources.fixedSources, sources.fixedSources[0]] }), /同一来源/)
  assert.throws(() => validateStaminaSources({ ...sources, monthlyCard: { ...sources.monthlyCard, endDate: '2026-02-30' } }), /日期/)
  for (const id of ['buy', 'reserve', 'required-extra', 'diagnostic-budget', 'planner-reserve-0']) {
    assert.throws(() => validateStaminaSources({ ...sources, fixedSources: [{ id, label: '储备', value: 60, enabled: true }] }), /原有设置/)
  }
})

test('普通推荐、模拟、精确求解按同一日期规则计算，购买白金币费用仍独立', () => {
  const prefs = withSourcePeriod({ purchaseCount: 1 }, cardSources(), today)
  const input = { ...context(), dates, preferences: prefs }
  assert.equal(buildRecommendedPlan({ ...input, date: today, state: input.initialState }).gains.reduce((n, gain) => n + (gain.id === 'buy' ? gain.value * 60 : gain.value), 0), 548)
  const regular = simulatePlanner({ ...input, maxDays: dates.length })
  const exact = prepareExactPlanner(input)
  assert.deepEqual(regular.timeline.map(day => day.totals.gains), [548, 548, 468, 468])
  assert.deepEqual(exact.days.map(day => planTotals(day.plan).gains), [548, 548, 468, 468])
  assert.equal(regular.timeline[0].totals.coinsSpent, 50)
})

test('暂时无体力时仍等待未来生效月卡，不误判整个计划不可推进', () => {
  const sources = cardSources()
  sources.monthlyCard.startDate = '2026-10-18'
  sources.fixedSources = ['natural', 'meal'].map(id => ({ id, label: id, value: 0, enabled: false }))
  const input = { ...context(), initialState: { a: { shuijing: 1 } }, dates, preferences: withSourcePeriod({}, sources, today), maxDays: dates.length }
  const result = simulatePlanner(input)
  assert.equal(result.timeline[0].totals.gains, 0)
  assert.equal(result.timeline[1].totals.gains, 80)
  assert.equal(result.status, 'complete')
  assert.equal(result.etaDays, 2)
})

test('未来应用不修改过去或开始日前记录，默认保留手工日期，允许单日覆写，重算不丢来源', () => {
  // 已保存手工日为 JSON，不包含构造器返回的 undefined 可选字段。
  const input = context(), manual = clonePlannerValue({ gains: [...free(), createGain('gift', { value: 7 })], spends: [createSpend('luoyang', { value: 1 })] })
  const plans = { '2026-10-19': manual }
  const previous = createFixedSchedule({ ...input, date: '2026-10-16' }, plans)
  const frozen = JSON.stringify(previous)
  const next = applyDailySourcesToSchedule(previous, plans, cardSources(), '2026-10-18', today)
  assert.deepEqual(next.schedule.history, previous.result.timeline.filter(day => day.date < today))
  assert.deepEqual(next.schedule.result.timeline[0], previous.result.timeline.find(day => day.date === today))
  assert.deepEqual(next.manualPlans['2026-10-19'], manual)
  assert.equal(next.preservedManualDates, 1)
  assert.equal(next.schedule.result.timeline.find(day => day.date === '2026-10-18').totals.gains, 488)
  assert.equal(next.schedule.result.timeline.find(day => day.date === '2026-10-19').totals.gains, 415)
  const again = applyDailySourcesToSchedule(next.schedule, next.manualPlans, cardSources(), '2026-10-18', today)
  assert.deepEqual(again.schedule, next.schedule)
  assert.equal(JSON.stringify(previous), frozen)
  assert.throws(() => applyDailySourcesToSchedule(previous, plans, cardSources(), '2026-10-16', today), /今天或未来/)
  const revised = reviseFixedSchedule(next.schedule, { ...input, preferences: next.preferences }, next.manualPlans)
  assert.equal(revised.result.timeline.find(day => day.date === '2026-10-18').totals.gains, 488)
  const recalculated = recalculateFixedScheduleFrom(next.schedule, '2026-10-18', next.manualPlans, { ...input, preferences: next.preferences })
  assert.equal(recalculated.schedule.result.timeline.find(day => day.date === '2026-10-18').totals.gains, 488)
  assert.deepEqual(recalculated.manualPlans['2026-10-19'], manual)
})

test('明确选择替换手工来源时保留一次性获取和支出，月卡与固定来源只算一次', () => {
  const sources = cardSources(); sources.fixedSources.push({ id: 'event', label: '每日活动', value: 10, enabled: true })
  const manual = clonePlannerValue({ gains: [...free(), createGain('event', { value: 99 }), createGain('gift', { value: 7 })], spends: [createSpend('luoyang', { value: 1 })] })
  const previous = createFixedSchedule(context(), { [today]: manual })
  const next = applyDailySourcesToSchedule(previous, { [today]: manual }, sources, today, today, true)
  assert.equal(planTotals(next.manualPlans[today]).gains, 505)
  assert.deepEqual(next.manualPlans[today].spends, manual.spends)
  assert.equal(next.manualPlans[today].gains.filter(gain => gain.id === 'event').length, 1)
  assert.deepEqual(applyDailySourcesToSchedule(next.schedule, next.manualPlans, sources, today, today, true).manualPlans, next.manualPlans)
  const distant = { ...next.manualPlans, '2027-05-01': manual }
  assert.deepEqual(applyDailySourcesToSchedule(next.schedule, distant, sources, today, today, true).manualPlans['2027-05-01'], manual)
})

test('workspace云端往返按账号共享；旧数据不产生月卡，日程规则和历史逐字往返', () => {
  const workspace = { ...emptyTrainingWorkspace('a'), staminaSources: cardSources() }
  const wire = workspaceBody(workspace)
  const restored = workspaceFromRemote({ ...wire, account_id: 'a', revision: 2 }, 'a')
  assert.deepEqual(restored.staminaSources, workspace.staminaSources)
  assert.throws(() => workspaceFromRemote({ ...wire, account_id: 'a' }, 'b'), /子账号/)
  assert.equal(emptyTrainingWorkspace('b').staminaSources, undefined)
  const original = createFixedSchedule(context())
  const next = applyDailySourcesToSchedule(original, {}, restored.staminaSources, today, today)
  const body = scheduleBody({ ...normalizePlannerSnapshot(null, 'a'), preferences: next.preferences, schedule: next.schedule, manualPlans: next.manualPlans })
  const remote = scheduleFromRemote({ ...body, account_id: 'a', revision: 1 }, 'a')
  assert.deepEqual(remote.preferences, next.preferences)
  assert.deepEqual(fixedScheduleTimeline(remote.schedule), fixedScheduleTimeline(next.schedule))
})
