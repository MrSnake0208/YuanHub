import test from 'node:test'
import assert from 'node:assert/strict'
import { createFixedSchedule, fixedScheduleTimeline, fixedScheduleDifferences, projectedPlannerStock, reviseFixedSchedule } from '../src/data/fixedPlannerSchedule.js'
import { createSpend, normalizePlannerSnapshot, readPlannerSnapshot, writePlannerSnapshot } from '../src/data/cultivationPlanner.js'

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
