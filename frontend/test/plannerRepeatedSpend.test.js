import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFixedCustomSpendToSchedule, applyFixedStage624ToSchedule, createFixedSchedule, recalculateFixedScheduleFrom, pendingScheduleEdits, plannerDateAfter, updateFixedSchedulePlan } from '../src/data/fixedPlannerSchedule.js'
import { clonePlannerValue, createSpend, createGain, normalizePlannerSnapshot } from '../src/data/cultivationPlanner.js'
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

test('自定义每日安排按 ID 替换，保留同名项目、固定6-24和单次产出', () => {
  const input = context(), date = request.fromDate
  const spend = createSpend('custom', { name: '兰台扫荡', label: '兰台扫荡', costPer: 10, value: 1, yield: { __xp__: 1000 } })
  const sameName = createSpend('custom', { name: '兰台扫荡', label: '兰台扫荡', costPer: 0, value: 1, yield: { shuijing: 2 } })
  const fixedStage = { ...createSpend('stage624', { value: 3 }), fixed: true }
  const plans = { [date]: { gains: [createGain('natural'), createGain('meal')], spends: [spend, sameName, fixedStage] } }
  const schedule = createFixedSchedule(input, plans), before = JSON.stringify({ schedule, plans })
  const result = applyFixedCustomSpendToSchedule(schedule, plans, { ...request, count: 2 }, input.date, spend)
  assert.equal(JSON.stringify({ schedule, plans }), before)
  const first = result.manualPlans[date].spends
  assert.deepEqual(first.find(item => item.id === sameName.id), sameName)
  assert.deepEqual(first.find(item => item.id === 'stage624'), fixedStage)
  for (const day of result.schedule.result.timeline.filter(day => day.date >= request.fromDate && day.date <= request.toDate)) {
    const rows = day.planned.spends.filter(item => item.id === spend.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].fixed, true)
    assert.equal(rows[0].value, 2)
    assert.equal(rows[0].costPer, 10)
    assert.deepEqual(rows[0].yield, { __xp__: 1000 })
  }
  const again = applyFixedCustomSpendToSchedule(result.schedule, result.manualPlans, { ...request, count: 2 }, input.date, spend)
  assert.deepEqual(again.manualPlans, result.manualPlans)
  const wire = scheduleBody({ ...normalizePlannerSnapshot(null, 'a'), schedule: result.schedule, manualPlans: result.manualPlans })
  const remote = scheduleFromRemote({ ...wire, account_id: 'a', revision: 1 }, 'a')
  assert.equal(normalizePlannerSnapshot(remote, 'a').manualPlans[date].spends.find(item => item.id === spend.id).fixed, true)
  const recalculated = recalculateFixedScheduleFrom(remote.schedule, date, remote.manualPlans, input)
  assert.equal(recalculated.schedule.result.timeline.find(day => day.date === date).planned.spends.find(item => item.id === spend.id).value, 2)
  assert.deepEqual(clonePlannerValue(recalculated.manualPlans[request.toDate]), clonePlannerValue(remote.manualPlans[request.toDate]))
})

test('零体力产出可跨日安排，超支与无效输入整批拒绝', () => {
  const input = context(), date = '2026-10-24'
  const spend = createSpend('custom', { name: '据点产出', label: '据点产出', costPer: 0, value: 1, yield: { __xp__: 1000 } })
  const plans = { [date]: { gains: [createGain('custom', { value: 10 })], spends: [] } }
  const schedule = createFixedSchedule(input, plans), before = JSON.stringify({ schedule, plans })
  const result = applyFixedCustomSpendToSchedule(schedule, plans, request, input.date, spend)
  const day = result.schedule.result.timeline.find(item => item.date === date)
  assert.equal(day.yield.__xp__, 6000)
  assert.equal(day.planned.spends.find(item => item.id === spend.id).costPer, 0)
  const expensive = { ...spend, costPer: 20 }
  assert.throws(() => applyFixedCustomSpendToSchedule(schedule, plans, request, input.date, expensive), /2026-10-24/)
  assert.throws(() => applyFixedCustomSpendToSchedule(schedule, plans, { ...request, count: -1 }, input.date, spend))
  assert.throws(() => applyFixedCustomSpendToSchedule(schedule, plans, request, input.date, createSpend('stage624')))
  assert.equal(JSON.stringify({ schedule, plans }), before)
})

test('范围应用保留范围内其他编辑和范围外待重算基准', () => {
  const input = context(), first = request.fromDate, outside = plannerDateAfter(request.toDate, 1)
  const spend = createSpend('custom', { name: '据点', costPer: 0, value: 1, yield: { __xp__: 1000 } })
  const plan = { gains: [createGain('natural'), createGain('meal')], spends: [spend] }
  let plans = { [first]: clonePlannerValue(plan), [outside]: clonePlannerValue(plan) }
  let schedule = createFixedSchedule(input, plans)
  for (const date of [first, outside]) {
    const edited = clonePlannerValue(plans[date]); edited.gains[0].value -= 10
    schedule = updateFixedSchedulePlan(schedule, date, edited)
    plans = { ...plans, [date]: edited }
    assert.equal(pendingScheduleEdits(schedule, date), true)
  }
  const outsideBaseline = clonePlannerValue(schedule.context.planBaselines[outside])
  const result = applyFixedCustomSpendToSchedule(schedule, plans, { ...request, count: 2 }, input.date, spend)
  assert.equal(pendingScheduleEdits(result.schedule, first), true)
  assert.equal(pendingScheduleEdits(result.schedule, outside), true)
  assert.deepEqual(result.schedule.context.planBaselines[outside], outsideBaseline)
  assert.equal(result.schedule.context.planBaselines[first].spends.find(item => item.id === spend.id).value, 2)
})

test('材料备齐后仍保留90天每日安排，完成时间不推迟到最后一条记录', () => {
  const input = { ...context(), initialState: { a: { __xp__: 1000 } }, requiredState: { a: { __xp__: 1000 } } }
  const spend = createSpend('custom', { name: '据点', costPer: 0, value: 1, yield: { __xp__: 1000 } })
  const plans = { [input.date]: { gains: [createGain('natural')], spends: [spend] } }
  const schedule = createFixedSchedule(input, plans)
  const result = applyFixedCustomSpendToSchedule(schedule, plans, { fromDate: input.date, toDate: plannerDateAfter(input.date, 89), count: 1 }, input.date, spend)
  assert.equal(result.schedule.result.timeline.length, 90)
  assert.equal(result.schedule.result.etaDays, 1)
  const recalculated = recalculateFixedScheduleFrom(result.schedule, input.date, result.manualPlans, input)
  assert.equal(recalculated.schedule.result.timeline.length, 90)
  assert.equal(recalculated.schedule.result.etaDays, 1)
  const edited = updateFixedSchedulePlan(result.schedule, plannerDateAfter(input.date, 1), result.manualPlans[plannerDateAfter(input.date, 1)])
  assert.equal(edited.result.etaDays, 1)
})
