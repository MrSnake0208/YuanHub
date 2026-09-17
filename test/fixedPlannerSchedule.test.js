import test from 'node:test'
import assert from 'node:assert/strict'
import { createFixedSchedule, fixedScheduleTimeline, fixedScheduleDifferences, pendingScheduleEdits, plannerTiming, resetFixedSchedule, visibleFixedScheduleTimeline, plannerDateAfter, projectedPlannerStock, recalculateFixedScheduleFrom, reviseFixedSchedule, updateFixedSchedulePlan } from '../src/data/fixedPlannerSchedule.js'
import { clonePlannerValue, createGain, createSpend, normalizePlannerPlan, normalizePlannerSnapshot, readPlannerSnapshot, settlePlannerDay, writePlannerSnapshot } from '../src/data/cultivationPlanner.js'
import { scheduleBody, scheduleFromRemote } from '../src/data/operatorPlannerRemote.js'

const context = () => ({ date: '2026-09-12', initialState: { a: { shuijing: 2000 } },
  requiredState: { a: { shuijing: 2100 } }, stock: { shuijing: 100 }, goals: { a: [100, 17, 7] },
  levels: { yy: 12 }, strategy: 'overall', agentOrder: ['a'], preferences: { purchaseCount: 0 } })
const manual = () => ({ gains: [{ id: 'natural', kind: 'energy', value: 408 }],
  spends: [createSpend('yinyang', { stageLevel: 12, value: 1 })] })

test('首次自定义完整保存输入、推荐日、手工日和预测，重载不会受当前日期与库存影响', () => {
  const input = context()
  const plans = { '2026-09-13': manual() }
  const schedule = createFixedSchedule(input, plans)
  assert.ok(schedule.result.timeline.length > 2)
  assert.ok(schedule.result.timeline.every(day => day.progressRows && day.start && day.planned && day.end))
  const storage = new Map()
  const adapter = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  writePlannerSnapshot(adapter, { accountId: 'a', schedule, manualPlans: plans })
  input.stock.shuijing = 99999
  input.initialState.a.shuijing = 1
  plans['2026-09-13'].spends[0].value = 6
  const restored = readPlannerSnapshot(adapter, 'a')
  assert.deepEqual(restored.schedule, schedule)
  assert.equal(restored.schedule.context.stock.shuijing, 100)
  assert.equal(restored.schedule.result.timeline.find(day => day.date === '2026-09-13').planned.spends[0].value, 1)
  assert.equal(readPlannerSnapshot(adapter, 'b').schedule, null)
})

test('翌日库存符合计划产出时无差异，额外获得或少执行则提示，检测不改写原日程', () => {
  const input = context()
  const schedule = createFixedSchedule(input, { [input.date]: manual() })
  const serialized = JSON.stringify(schedule)
  const current = { ...input, date: '2026-09-13', stock: projectedPlannerStock(schedule, '2026-09-13') }
  assert.deepEqual(fixedScheduleDifferences(schedule, current), { goalsChanged: false, resources: [] })
  current.stock.shuijing -= 1
  assert.deepEqual(fixedScheduleDifferences(schedule, current).resources, [{ id: 'shuijing', planned: 160, actual: 159 }])
  current.stock.shuijing = 999
  assert.equal(fixedScheduleDifferences(schedule, current).resources[0].actual, 999)
  assert.equal(JSON.stringify(schedule), serialized)
})

test('正常培养消耗以需求减少抵扣，避免把升级花掉的材料误报为库存偏差', () => {
  const input = context()
  const schedule = createFixedSchedule(input, { [input.date]: manual() })
  const current = { ...input, date: '2026-09-13', requiredState: { a: { shuijing: 2000 } }, stock: { shuijing: 60, xinghanjing: 45 } }
  assert.deepEqual(fixedScheduleDifferences(schedule, current).resources, [])
  current.goals = { a: [100, 16, 7] }
  assert.equal(fixedScheduleDifferences(schedule, current).goalsChanged, true)
})

test('显式更新从今日库存重算，过去安排与进度逐字保留，未来自定义不丢失', () => {
  const plans = { '2026-09-12': manual(), '2026-09-15': manual() }
  const first = createFixedSchedule(context(), plans)
  const before = JSON.stringify(first)
  const next = createFixedSchedule({ ...context(), date: '2026-09-14', stock: { shuijing: 500 }, initialState: { a: { shuijing: 1600 } } }, plans, first)
  assert.equal(next.startDate, '2026-09-12')
  assert.equal(next.baselineDate, '2026-09-14')
  assert.deepEqual(next.history, first.result.timeline.slice(0, 2))
  assert.equal(next.result.timeline[0].start.a.shuijing, 1600)
  assert.deepEqual(next.result.timeline.find(day => day.date === '2026-09-15').planned, first.result.timeline.find(day => day.date === '2026-09-15').planned)
  assert.equal(new Set(fixedScheduleTimeline(next).map(day => day.date)).size, fixedScheduleTimeline(next).length)
  assert.equal(JSON.stringify(first), before)
  assert.deepEqual(fixedScheduleDifferences(next, next.context).resources, [])
})

test('修改偏好或今日日程使用已保存的预测起点，不能悄悄套用实时库存或改写过去', () => {
  const plans = { '2026-09-12': manual() }
  const first = createFixedSchedule(context(), plans)
  const options = { ...context(), date: '2026-09-13', preferences: { purchaseCount: 2 }, initialState: { a: { shuijing: 1 } }, stock: { shuijing: 99999 } }
  const next = reviseFixedSchedule(first, options, plans)
  assert.deepEqual(next.history, [first.result.timeline[0]])
  assert.equal(next.result.timeline[0].start.a.shuijing, 1940)
  assert.equal(next.context.stock.shuijing, 160)
  assert.equal(next.context.preferences.purchaseCount, 2)
})

test('清除全部自定义不会解除固定，重复更新仍保留多次更新前的历史', () => {
  const first = createFixedSchedule(context(), { '2026-09-12': manual() })
  const second = reviseFixedSchedule(first, { ...context(), date: '2026-09-13' }, {})
  const third = createFixedSchedule({ ...context(), date: '2026-09-14' }, {}, second)
  assert.deepEqual(third.history[0], first.result.timeline[0])
  assert.deepEqual(third.history[1], second.result.timeline[0])
  assert.equal(third.startDate, first.startDate)
})

test('编辑暂时超支时保留原先后续日期，暂停产出；修正后恢复连续传播', () => {
  const input = context()
  const first = createFixedSchedule(input)
  const invalid = manual()
  invalid.gains[0].value = 0
  const paused = reviseFixedSchedule(first, input, { [input.date]: invalid })
  assert.equal(paused.result.status, 'invalid')
  assert.equal(paused.result.timeline.length, first.result.timeline.length)
  assert.ok(paused.result.timeline.slice(1).every(day => day.paused && Object.keys(day.yield).length === 0))
  const restored = reviseFixedSchedule(paused, input, { [input.date]: manual() })
  assert.equal(restored.result.status, 'complete')
  assert.ok(restored.result.timeline.every(day => !day.paused))
})

test('材料提前备齐也保留后面的自定义日，旧版过去日程不虚构历史库存', () => {
  const input = { ...context(), initialState: { a: { shuijing: 1 } } }
  const schedule = createFixedSchedule(input, { '2026-09-15': manual(), '2026-09-10': manual() })
  assert.ok(schedule.result.timeline.some(day => day.date === '2026-09-15' && day.manual))
  assert.equal(schedule.startDate, '2026-09-10')
  assert.equal(schedule.history[0].legacy, true)
  assert.deepEqual(schedule.history[0].progressRows, [])
  assert.equal(schedule.history[0].planned.spends[0].value, 1)
})

test('兼容旧版只存手工日的格式，损坏完整快照不能覆盖有效手工日', () => {
  const raw = { version: 1, accountId: 'a', manualPlans: { '2026-09-12': manual() } }
  const old = normalizePlannerSnapshot(raw, 'a')
  assert.equal(old.schedule, null)
  assert.equal(old.manualPlans['2026-09-12'].spends.length, 1)
  assert.equal(normalizePlannerSnapshot({ ...raw, schedule: { version: 1, context: {}, result: { timeline: [null] } } }, 'a').schedule, null)
})

// Ledger edits are saved immediately; recommendations change only on explicit request.
test('获取和支出的增加、减少、添加、删除均标记待重算，其他日期安排不变', () => {
  const first = createFixedSchedule(context())
  const date = first.result.timeline[1].date
  const original = structuredClone(first)
  const changes = [
    plan => { plan.gains[0].value += 120 },
    plan => { plan.gains[0].value -= 10 },
    plan => { plan.gains.push(createGain('event')) },
    plan => { plan.gains.pop() },
    plan => { plan.spends[0].value += 1 },
    plan => { plan.spends[0].value -= 1 },
    plan => { plan.spends.push(createSpend('stage624')) },
    plan => { plan.spends.pop() }
  ]
  for (const change of changes) {
    const plan = structuredClone(first.result.timeline[1].planned)
    change(plan)
    const edited = updateFixedSchedulePlan(first, date, plan)
    assert.equal(pendingScheduleEdits(edited, date), true)
    assert.deepEqual(edited.result.timeline[0], first.result.timeline[0])
    assert.deepEqual(edited.result.timeline.map(day => day.recommended), first.result.timeline.map(day => day.recommended))
    assert.deepEqual(edited.result.timeline.slice(2).map(day => day.planned), first.result.timeline.slice(2).map(day => day.planned))
    assert.equal(edited.result.timeline.length, first.result.timeline.length)
    assert.deepEqual(first, original)
  }
})

test('连续编辑与恢复原值使用首次编辑基准；待重算提示经云端和本机重载保留', () => {
  const first = createFixedSchedule(context())
  const date = first.baselineDate
  const plan = structuredClone(first.result.timeline[0].planned)
  plan.gains[0].value += 120
  const edited = updateFixedSchedulePlan(first, date, plan)
  plan.gains[0].value -= 30
  const second = updateFixedSchedulePlan(edited, date, plan)
  assert.deepEqual(second.context.planBaselines[date], first.result.timeline[0].planned)
  const snapshot = { ...normalizePlannerSnapshot(null, 'a'), schedule: second, manualPlans: { [date]: plan } }
  const wire = scheduleBody(snapshot)
  assert.ok(wire.schedule.context.plan_baselines[date])
  assert.deepEqual(Object.keys(wire.schedule).sort(), ['baseline_date', 'context', 'history', 'result', 'start_date', 'version'])
  const restored = scheduleFromRemote({ ...wire, account_id: 'a', revision: 1 }, 'a')
  assert.equal(pendingScheduleEdits(restored.schedule, date), true)
  assert.deepEqual(restored.schedule, second)
  assert.equal(pendingScheduleEdits(normalizePlannerSnapshot(snapshot, 'a').schedule, date), true)
  assert.equal(pendingScheduleEdits(updateFixedSchedulePlan(second, date, first.result.timeline[0].planned), date), false)
  assert.equal(pendingScheduleEdits(first, date), false)
  assert.equal(pendingScheduleEdits(null, date), false)
})

test('点击后使用当天实际获取重新推荐全部历练与6-24，保留其他支出和未来手工日', () => {
  const input = { ...context(), initialState: { a: { __xp__: 2000000 } }, requiredState: { a: { __xp__: 2000000 } }, stock: {}, levels: {} }
  const future = '2026-09-16'
  const plans = clonePlannerValue({ [future]: manual() })
  const first = createFixedSchedule(input, plans)
  const date = '2026-09-13'
  const plan = structuredClone(first.result.timeline[1].planned)
  plan.gains.push(createGain('event', { value: 120 }), createGain('buy', { value: 1 }))
  plan.spends = [createSpend('luoyang'), createSpend('custom', { costPer: 10, yield: { __xp__: 1000 } }), createSpend('stage624', { value: 1 })]
  Object.assign(plan, clonePlannerValue(normalizePlannerPlan(plan)))
  const edited = updateFixedSchedulePlan(first, date, plan)
  plans[date] = plan
  const next = recalculateFixedScheduleFrom(edited, date, plans, input)
  assert.deepEqual(next.schedule.result.timeline[0], first.result.timeline[0])
  assert.equal(next.schedule.baselineDate, first.baselineDate)
  const day = next.schedule.result.timeline[1]
  assert.deepEqual(day.planned.gains, plan.gains)
  assert.deepEqual(day.planned.spends.slice(0, 2), plan.spends.slice(0, 2))
  assert.ok(day.planned.spends.find(spend => spend.id === 'stage624').value > 1)
  assert.equal(day.totals.gains, 588)
  assert.equal(day.totals.coinsSpent, 50)
  assert.ok(day.totals.balance >= 0)
  assert.deepEqual(day.errors, [])
  assert.equal(pendingScheduleEdits(next.schedule, date), false)
  assert.deepEqual(next.manualPlans[future], plans[future])
  assert.deepEqual(next.schedule.result.timeline.find(day => day.date === future).planned, first.result.timeline.find(day => day.date === future).planned)
  assert.ok(next.schedule.result.timeline[2].start.a.__xp__ < edited.result.timeline[2].start.a.__xp__)
  assert.ok(next.schedule.result.timeline.every(day => !day.errors.length))
  // A later edit of today remains possible after recalculating tomorrow.
  const earlier = structuredClone(next.schedule.result.timeline[0].planned)
  earlier.gains[0].value += 1
  assert.equal(pendingScheduleEdits(updateFixedSchedulePlan(next.schedule, input.date, earlier), input.date), true)
})

test('多个日期的提示独立保留，单日重算不清除其他待重算编辑', () => {
  const input = context()
  let schedule = createFixedSchedule(input)
  const plans = {}
  for (const index of [0, 2]) {
    const day = schedule.result.timeline[index]
    const plan = structuredClone(day.planned)
    plan.gains[0].value += 60
    plans[day.date] = plan
    schedule = updateFixedSchedulePlan(schedule, day.date, plan)
  }
  const future = schedule.result.timeline[2].date
  const next = recalculateFixedScheduleFrom(schedule, input.date, plans, input)
  assert.equal(pendingScheduleEdits(next.schedule, input.date), false)
  assert.equal(pendingScheduleEdits(next.schedule, future), true)
  assert.deepEqual(next.manualPlans[future], plans[future])
})

test('支出编辑致超支时暂停预测；点击重算可以修正历练次数且保留体力获取', () => {
  const input = context(), first = createFixedSchedule(input)
  const plan = structuredClone(first.result.timeline[0].planned)
  plan.gains = [createGain('natural', { value: 50 })]
  const edited = updateFixedSchedulePlan(first, input.date, plan)
  assert.equal(edited.result.status, 'invalid')
  assert.ok(edited.result.timeline.slice(1).every(day => day.paused))
  const next = recalculateFixedScheduleFrom(edited, input.date, { [input.date]: plan }, input)
  assert.equal(next.schedule.result.status, 'complete')
  assert.equal(next.schedule.result.timeline[0].planned.spends[0].value, 2)
  assert.ok(next.schedule.result.timeline.every(day => !day.errors.length && !day.paused))
  assert.throws(() => recalculateFixedScheduleFrom(edited, edited.result.timeline[1].date, {}, input), /此前的无效/)
})

test('固定支出本身超支时重算失败，原编辑与提示保留；缩减产出不会伪报完成', () => {
  const input = context(), first = createFixedSchedule(input)
  const plan = { gains: [createGain('natural', { value: 50 })], spends: [createSpend('luoyang')] }
  const edited = updateFixedSchedulePlan(first, input.date, plan)
  const original = structuredClone(edited)
  assert.throws(() => recalculateFixedScheduleFrom(edited, input.date, { [input.date]: plan }, input), /体力不足/)
  assert.deepEqual(edited, original)
  assert.equal(pendingScheduleEdits(edited, input.date), true)
  const last = first.result.timeline.at(-1)
  const reduced = updateFixedSchedulePlan(first, last.date, { ...last.planned, spends: [] })
  assert.equal(reduced.result.status, 'horizon')
  assert.equal(reduced.result.awaitingRecalculation, true)
  assert.equal(reduced.result.etaDays, null)
})

test('周期外手工日期编辑也只更新账本，不重新推荐已有日期；天数按日期计算', () => {
  const input = { ...context(), initialState: { a: { shuijing: 60 } } }
  const first = createFixedSchedule(input)
  const date = '2026-09-15'
  const originalPlan = normalizePlannerPlan({ gains: [createGain('natural')], spends: [] })
  const fallback = { date, start: first.result.remaining, recommended: originalPlan, manual: true,
    ...settlePlannerDay(first.result.remaining, originalPlan, input) }
  const plan = clonePlannerValue(originalPlan)
  plan.gains.push(createGain('event'))
  const edited = updateFixedSchedulePlan(first, date, plan, fallback)
  assert.deepEqual(edited.result.timeline[0], first.result.timeline[0])
  assert.equal(edited.result.timeline.length, 2)
  assert.equal(edited.result.etaDays, 4)
  assert.equal(pendingScheduleEdits(edited, date), true)
  const next = recalculateFixedScheduleFrom(edited, date, { [date]: plan }, input)
  assert.deepEqual(next.schedule.result.timeline[0], first.result.timeline[0])
  assert.equal(next.schedule.result.etaDays, 4)
})

test('未来日期重算仍遵守90天期限，不能把前缀和90天后缀拼成超期完成结果', () => {
  const input = { ...context(), initialState: { a: { shuijing: 100000 } } }
  const first = createFixedSchedule(input)
  const date = plannerDateAfter(input.date, 89)
  const plan = clonePlannerValue(first.result.timeline.at(-1).planned)
  plan.gains.push(createGain('event'))
  const edited = updateFixedSchedulePlan(first, date, plan)
  const next = recalculateFixedScheduleFrom(edited, date, { [date]: plan }, input)
  assert.equal(next.schedule.result.timeline.length, 90)
  assert.equal(next.schedule.result.status, 'horizon')
  assert.equal(next.schedule.result.etaDays, null)
  assert.deepEqual(next.schedule.result.timeline.slice(0, 89), first.result.timeline.slice(0, 89))
})


test('剩余天数从今天计算且含今天，不计历史记录或完成后的手工日', () => {
  const result = { status: 'complete', etaDays: 5, timeline: [{ date: '2026-10-20' }] }
  assert.deepEqual(plannerTiming(result, '2026-09-28', '2026-09-30'), { remainingDays: 3, completionDate: '2026-10-02' })
  assert.equal(plannerTiming(result, '2026-09-28', '2026-10-02').remainingDays, 1)
  assert.equal(plannerTiming(result, '2026-09-28', '2026-10-03').remainingDays, 0)
  assert.deepEqual(plannerTiming({ status: 'complete', etaDays: 0 }, '2026-09-28', '2026-09-30'), { remainingDays: 0, completionDate: null })
  for (const status of ['invalid', 'blocked', 'horizon']) assert.equal(plannerTiming({ ...result, status }, '2026-09-28', '2026-09-30').remainingDays, null)
  assert.equal(plannerTiming({ ...result, awaitingRecalculation: true }, '2026-09-28', '2026-09-30').remainingDays, null)
})


test('重设从当前库存和新清单开始，旧阶段隐藏并跨云端恢复、更新保持', () => {
  const oldContext = context()
  const oldPlans = { '2026-09-12': manual(), '2026-09-14': manual(), '2026-09-16': manual() }
  const old = createFixedSchedule(oldContext, oldPlans)
  old.result.optimization = { status: 'optimal' }
  const current = { ...oldContext, date: '2026-09-14', initialState: { b: { shuijing: 60 } },
    requiredState: { b: { shuijing: 160 } }, goals: { b: [80, 13, 7] }, agentOrder: ['b'] }
  assert.equal(fixedScheduleDifferences(old, current).goalsChanged, true)
  const reset = resetFixedSchedule(current, oldPlans, old)
  assert.deepEqual(reset.schedule.context.initialState, current.initialState)
  assert.deepEqual(reset.schedule.context.goals, current.goals)
  assert.equal(reset.schedule.baselineDate, current.date)
  assert.equal(reset.schedule.context.displayStartDate, current.date)
  assert.deepEqual(reset.manualPlans, clonePlannerValue({ '2026-09-12': oldPlans['2026-09-12'] }))
  assert.deepEqual(reset.schedule.history, fixedScheduleTimeline(old).filter(day => day.date < current.date))
  assert.equal(reset.schedule.result.optimization, undefined)
  assert.equal(fixedScheduleDifferences(reset.schedule, current).goalsChanged, false)
  assert.ok(visibleFixedScheduleTimeline(reset.schedule).every(day => day.date >= current.date))
  const wire = scheduleBody({ ...reset, strategy: 'overall', agentOrder: ['b'], preferences: {} })
  assert.equal(wire.schedule.context.display_start_date, current.date)
  const restored = scheduleFromRemote({ ...wire, account_id: 'a', revision: 1 }, 'a')
  assert.deepEqual(visibleFixedScheduleTimeline(restored.schedule), visibleFixedScheduleTimeline(reset.schedule))
  const updated = createFixedSchedule({ ...current, date: '2026-09-15' }, reset.manualPlans, restored.schedule)
  assert.equal(updated.context.displayStartDate, '2026-09-14')
  assert.ok(visibleFixedScheduleTimeline(updated).every(day => day.date >= '2026-09-14'))
  const again = resetFixedSchedule({ ...current, date: '2026-09-15' }, reset.manualPlans, updated)
  assert.ok(visibleFixedScheduleTimeline(again.schedule).every(day => day.date >= '2026-09-15'))
})
