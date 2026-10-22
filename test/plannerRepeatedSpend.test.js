import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFixedStage624ToSchedule, createFixedSchedule, recalculateFixedScheduleFrom, pendingScheduleEdits, plannerDateAfter } from '../src/data/fixedPlannerSchedule.js'
import { createSpend, createGain, normalizePlannerSnapshot } from '../src/data/cultivationPlanner.js'
import { scheduleBody, scheduleFromRemote } from '../src/data/operatorPlannerRemote.js'
const context = () => ({ date: '2026-10-22', initialState: { a: { shuijing: 2000, __xp__: 500000 } }, requiredState: { a: { shuijing: 2000, __xp__: 500000 } }, stock: {}, goals: { a: [100, 17, 7] }, levels: { yy: 12 }, strategy: 'overall', agentOrder: ['a'], preferences: { purchaseCount: 0 } })
const request = { fromDate: '2026-10-23', toDate: '2026-10-25', count: 6 }
const stage624 = day => day.planned.spends.filter(s => s.kind === 'stage624')
test('范围应用先扣固定6次，自动日不追加，历史保留且重复应用不叠加', () => {
  const input = context(), original = createFixedSchedule(input), before = JSON.stringify(original)
  const result = applyFixedStage624ToSchedule(original, {}, request, input.date)
  assert.equal(result.affectedDates, 3)
  assert.equal(JSON.stringify(original), before)
  assert.deepEqual(result.schedule.result.timeline[0], original.result.timeline[0])
  for (const day of result.schedule.result.timeline.filter(d => d.date >= request.fromDate && d.date <= request.toDate)) {
    assert.equal(pendingScheduleEdits(result.schedule, day.date), false)
    assert.equal(stage624(day).length, 1)
    assert.equal(stage624(day)[0].value, 6)
    assert.equal(stage624(day)[0].fixed, true)
    assert.ok(day.totals.balance >= 0)
  }
  const again = applyFixedStage624ToSchedule(result.schedule, result.manualPlans, request, input.date)
  assert.deepEqual(JSON.parse(JSON.stringify(again.manualPlans)), JSON.parse(JSON.stringify(result.manualPlans)))
})
test('手工日期保留其他获取支出，超支整批拒绝且输入不变', () => {
  const input = context(), date = '2026-10-24'
  const plan = { gains: [createGain('custom', { value: 70 })], spends: [createSpend('custom', { costPer: 20, value: 1 })] }
  const manualPlans = { [date]: plan }, schedule = createFixedSchedule(input, manualPlans)
  const before = JSON.stringify({ schedule, manualPlans })
  assert.throws(() => applyFixedStage624ToSchedule(schedule, manualPlans, request, input.date), /2026-10-24/)
  assert.equal(JSON.stringify({ schedule, manualPlans }), before)
  const result = applyFixedStage624ToSchedule(schedule, manualPlans, { ...request, count: 4 }, input.date)
  assert.deepEqual(result.manualPlans[date].gains, plan.gains)
  assert.deepEqual(result.manualPlans[date].spends[0], plan.spends[0])
})
test('日期边界及整数次数校验，结束日期之外不新增固定约束', () => {
  const input = context(), schedule = createFixedSchedule(input)
  for (const change of [{ fromDate: '2026-10-21' }, { toDate: '2026-10-22' }, { toDate: '2027-02-01' }, { fromDate: '2026-02-30' }, { count: -1 }, { count: 1.5 }, { count: 10000 }]) assert.throws(() => applyFixedStage624ToSchedule(schedule, {}, { ...request, ...change }, input.date))
  const result = applyFixedStage624ToSchedule(schedule, {}, { ...request, count: 0 }, input.date)
  assert.equal(stage624(result.schedule.result.timeline.find(d => d.date === request.fromDate))[0].value, 0)
  assert.equal(result.manualPlans[plannerDateAfter(request.toDate, 1)], undefined)
})
test('云端往返和重新计算仍保留精确次数与原日期基准', () => {
  const input = context(), result = applyFixedStage624ToSchedule(createFixedSchedule(input), {}, request, input.date)
  const wire = scheduleBody({ ...normalizePlannerSnapshot(null, 'a'), schedule: result.schedule, manualPlans: result.manualPlans })
  const remote = scheduleFromRemote({ ...wire, account_id: 'a', revision: 1 }, 'a')
  assert.equal(remote.manualPlans[request.fromDate].spends.find(s => s.kind === 'stage624').fixed, true)
  const recalculated = recalculateFixedScheduleFrom(remote.schedule, request.fromDate, remote.manualPlans, input)
  assert.equal(recalculated.schedule.baselineDate, input.date)
  assert.equal(stage624(recalculated.schedule.result.timeline.find(d => d.date === request.fromDate))[0].value, 6)
  assert.deepEqual(JSON.parse(JSON.stringify(recalculated.manualPlans[request.toDate])), JSON.parse(JSON.stringify(remote.manualPlans[request.toDate])))
})
test('培养已完成仍可安排范围内日常，不越过90天上限', () => {
  const input = { ...context(), initialState: {}, requiredState: {} }, schedule = createFixedSchedule(input)
  const lastDate = plannerDateAfter(input.date, 89)
  const result = applyFixedStage624ToSchedule(schedule, {}, { fromDate: lastDate, toDate: lastDate, count: 6 }, input.date)
  assert.equal(result.affectedDates, 1)
  assert.equal(stage624(result.schedule.result.timeline.at(-1))[0].value, 6)
})
