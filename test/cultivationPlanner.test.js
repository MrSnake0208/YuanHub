import test from 'node:test'
import assert from 'node:assert/strict'
import { BOOK_VALUES, TRAINING_GROUPS, bookExperience } from '../src/data/operatorTraining.js'
import { calculateLevelRequirements, calculateXiuweiRequirements, calculateStarRequirements } from '../src/data/operatorRequirements.js'
import {
  PLANNER_RULES,
  PURCHASE_CUMULATIVE,
  aggregatePlannerState,
  allocateSharedPlannerStock,
  buildPlannerTimeline,
  createInitialPlannerState,
  createSpend,
  estimatePlannerDays,
  normalizePlannerPlan,
  normalizePlannerPreferences,
  planTotals,
  trainingStageYield
} from '../src/data/cultivationPlanner.js'
import { simulatePlanner, settlePlannerDay, plannerProgressRows, plannerResourcesFromCalculation, buildRecommendedPlan, applyPlannerYield, plannerStateRemaining } from '../src/data/cultivationPlanner.js'

const levels = { fh: 12, ds: 12, yy: 12, experience: 8 }

test('默认从零额外投入开始，并保留每日购买两次的 100 白金币对照', () => {
  assert.equal(normalizePlannerPreferences().purchaseCount, 0)
  assert.equal(normalizePlannerPreferences().luoyang, 0)
  assert.equal(normalizePlannerPreferences().shouchun, 0)
  assert.equal(PURCHASE_CUMULATIVE[2], 100)
})

const dates = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 8, 12 + i)).toISOString().slice(0, 10))
const withEnergy = spends => ({ gains: [{ id: 'natural', kind: 'energy', value: 408 }], spends })
const stateFor = resources => createInitialPlannerState([{ id: 'a', resources }])

test('等级突破道具不进入体力规划，也不阻碍已备齐的经验和修为完成', () => {
  const calculation = { level: calculateLevelRequirements(1, 100, '破军'), xiuwei: calculateXiuweiRequirements(1, 17, 'yy'), star: calculateStarRequirements(7, 7) }
  const resources = plannerResourcesFromCalculation(calculation)
  assert.ok(calculation.level.items.jianjia > 0)
  for (const id of Object.keys(calculation.level.items)) assert.equal(resources[id], undefined)
  assert.equal(resources.__xp__, calculation.level.experience)
  const initialState = stateFor(resources)
  const result = simulatePlanner({ initialState, dates, levels })
  assert.equal(result.status, 'complete')
  assert.ok(result.etaDays < 90)
  assert.equal(result.timeline.length, result.etaDays)
  assert.equal(plannerStateRemaining(result.timeline.at(-1).end), 0)
  const covered = allocateSharedPlannerStock(initialState, resources)
  const done = simulatePlanner({ initialState: covered, dates, levels, preferences: { purchaseCount: 2 } })
  assert.equal(done.etaDays, 0)
  assert.deepEqual(done.timeline[0].planned.spends, [])
  assert.ok(!done.timeline[0].planned.gains.some(gain => gain.id === 'buy'))
})

test('有未配置获取途径的缺口时明确阻塞，不追加几十天空日程', () => {
  const result = simulatePlanner({ initialState: stateFor({ shuijing: 60, zhuangjinboli: 1 }), levels, dates })
  assert.equal(result.status, 'blocked')
  assert.equal(result.etaDays, null)
  assert.equal(result.timeline.length, 1)
  assert.equal(result.lastProgressDay, 1)
  assert.deepEqual(result.blocked, [{ id: 'zhuangjinboli', gap: 1, reason: '未配置获取途径' }])
  const locked = simulatePlanner({ initialState: stateFor({ xinghanjing: 10 }), levels: { yy: 1 }, dates })
  assert.equal(locked.status, 'blocked')
  assert.equal(locked.blocked[0].reason, '所需历练层数未开放')
})

test('手动添加和旧日程的 6-24 均恢复标准经验奖励，忽略过期奖励和体力配置', () => {
  const legacy = normalizePlannerPlan(withEnergy([{ id: 'stage624', kind: 'count', value: 2, costPer: 20 }]))
  const manual = createSpend('stage624', { value: 2, yield: { __xp__: 1 } })
  for (const spend of [legacy.spends[0], manual]) {
    const day = settlePlannerDay(stateFor({ __xp__: 10000 }), withEnergy([spend]))
    assert.equal(day.yield.__xp__, 7600)
    assert.equal(day.end.a.__xp__, 2400)
    assert.equal(day.totals.spends, 20)
  }
})

test('风火、地水、阴阳的每种掉落均对账，补缺与富余守恒且不截断为前六项', () => {
  const required = stateFor({ juanshan: 1, cuishan: 1, jinsishan: 1, yushan: 1, xianmenshan: 1, beihuifengshan: 1, mulanzhuilu: 10, xinghanjing: 20 })
  const plan = withEnergy(['feng', 'dishui', 'yinyang'].map(id => createSpend(id, { value: 1, stageLevel: 12 })))
  const day = { start: required, ...settlePlannerDay(required, plan, { levels }) }
  assert.deepEqual(day.yield, { xianmenshan: 60, beihuifengshan: 45, bawanglei: 60, mulanzhuilu: 45, shuijing: 60, xinghanjing: 45 })
  const rows = plannerProgressRows(required, required, day)
  assert.ok(rows.length > 6)
  assert.equal(rows.find(row => row.id === 'xinghanjing').used, 20)
  assert.equal(rows.find(row => row.id === 'xinghanjing').surplus, 25)
  assert.equal(rows.find(row => row.id === 'shuijing').percent, null)
  for (const row of rows) {
    assert.equal(row.produced, row.used + row.surplus)
    assert.equal(row.remaining, Math.max(0, (required.a[row.id] || 0) - row.used))
  }
  const almostDone = plannerProgressRows(stateFor({ __xp__: 10000 }), stateFor({ __xp__: 1 }), { start: stateFor({ __xp__: 1 }), end: stateFor({ __xp__: 1 }), yield: {} })
  assert.equal(almostDone[0].percent, 99)
})

test('每笔自动推荐都减少真实剩余缺口，不为用完体力刷无缺口渠道', () => {
  for (const resources of [{ xinghanjing: 90 }, { __xp__: 1000000, mulanzhuilu: 200, beihuifengshan: 100 }]) {
    const initialState = stateFor(resources)
    const frozen = structuredClone(initialState)
    const result = simulatePlanner({ initialState, dates, levels, preferences: { purchaseCount: 2 } })
    for (const day of result.timeline) {
      let working = day.start
      assert.deepEqual(day.errors, [])
      assert.ok(day.totals.balance >= 0)
      const counts = {}
      for (const spend of day.planned.spends) {
        if (spend.groupId) counts[spend.groupId] = (counts[spend.groupId] || 0) + spend.value
        for (let i = 0; i < spend.value; i++) {
          const next = applyPlannerYield(working, spend.yield)
          assert.ok(plannerStateRemaining(next) < plannerStateRemaining(working))
          working = next
        }
      }
      assert.ok(Object.values(counts).every(count => count <= 6))
    }
    assert.deepEqual(initialState, frozen)
    assert.deepEqual(simulatePlanner({ initialState, dates, levels, preferences: { purchaseCount: 2 } }), result)
  }
})

test('自动推荐跨类别选择，低层经验历练低效时会使用 6-24', () => {
  const plan = buildRecommendedPlan({ state: stateFor({ __xp__: 20000 }), levels: { experience: 1 } })
  assert.deepEqual(plan.spends.map(spend => spend.id), ['stage624'])
})

test('新增、移除、改层数后当日和下一日即时重算，后续固定日不被覆盖', () => {
  const initialState = stateFor({ shuijing: 1000, xinghanjing: 1000 })
  const saved = withEnergy([createSpend('yinyang', { stageLevel: 12 })])
  const manualPlans = { [dates[0]]: saved, [dates[2]]: withEnergy([createSpend('custom', { yield: { shuijing: 7 } })]) }
  const config = { initialState, dates, levels, manualPlans }
  const original = structuredClone(manualPlans)
  const first = simulatePlanner(config)
  const removed = simulatePlanner({ ...config, manualPlans: { ...manualPlans, [dates[0]]: withEnergy([]) } })
  assert.equal(first.timeline[0].yield.xinghanjing, 45)
  assert.equal(removed.timeline[0].yield.xinghanjing, undefined)
  assert.equal(removed.timeline[1].start.a.xinghanjing - first.timeline[1].start.a.xinghanjing, 45)
  const switched = simulatePlanner({ ...config, manualPlans: { ...manualPlans, [dates[0]]: withEnergy([{ ...saved.spends[0], stageLevel: 10 }]) } })
  assert.equal(switched.timeline[0].yield.xinghanjing, undefined)
  assert.equal(switched.timeline[0].yield.baoshijing, 50)
  assert.equal(removed.timeline[2].manual, true)
  assert.equal(removed.timeline[2].yield.shuijing, 7)
  assert.deepEqual(manualPlans, original)
})

test('超支、同类别跨层超限、未开放层数、购买超限和非整数次数均不虚增进度', () => {
  const invalidPlans = [
    withEnergy([createSpend('stage624', { value: 50 })]),
    withEnergy([createSpend('yinyang', { value: 4, stageLevel: 10 }), createSpend('yinyang', { value: 3, stageLevel: 12 })]),
    withEnergy([createSpend('yinyang', { value: 1, stageLevel: 99 })]),
    { gains: [{ id: 'buy', kind: 'count', value: 9 }], spends: [createSpend('stage624')] },
    withEnergy([createSpend('stage624', { value: 1.5 })])
  ]
  for (const plan of invalidPlans) {
    // createSpend is a convenience constructor; editing must retain invalid decimals for validation.
    if (plan === invalidPlans.at(-1)) plan.spends[0].value = 1.5
    const initialState = stateFor({ __xp__: 100000, shuijing: 1000 })
    const result = simulatePlanner({ initialState, dates, levels, manualPlans: { [dates[0]]: plan } })
    assert.equal(result.status, 'invalid')
    assert.equal(result.timeline.length, 1)
    assert.ok(result.timeline[0].errors.length)
    assert.deepEqual(result.timeline[0].yield, {})
    assert.deepEqual(result.timeline[0].end, initialState)
  }
})

test('两种派遣只消耗体力，旧奖励配置不能产生素材；自定义渠道仍可配置产出', () => {
  const initialState = stateFor({ __xp__: 100, zhuangjinboli: 1 })
  for (const id of ['luoyang', 'shouchun']) {
    const spend = createSpend(id)
    const legacy = { ...spend, yield: { __xp__: 9999, zhuangjinboli: 1 } }
    const noop = settlePlannerDay(initialState, withEnergy([legacy]))
    assert.deepEqual(noop.end, initialState)
    assert.deepEqual(noop.yield, {})
    assert.deepEqual(noop.warnings, [])
    assert.equal(noop.totals.spends, id === 'luoyang' ? 72 : 80)
  }
  const manual = withEnergy([createSpend('custom', { yield: { bingshucanjuan: 2, zhuangjinboli: 1 } })])
  const done = simulatePlanner({ initialState, dates, levels, manualPlans: { [dates[0]]: manual } })
  assert.equal(done.etaDays, 1)
  assert.deepEqual(done.timeline[0].yield, { __xp__: 200, zhuangjinboli: 1 })
  assert.equal(done.timeline[0].surplus.__xp__, 100)
})

test('优先顺序不完整或有重复时仍抵扣所有密探，库存不重复使用', () => {
  const required = createInitialPlannerState([{ id: 'a', resources: { shuijing: 100 } }, { id: 'b', resources: { shuijing: 100 } }])
  const remaining = allocateSharedPlannerStock(required, { shuijing: 150 }, ['a', 'a'], 'priority')
  assert.equal(remaining.b.shuijing, 50)
  assert.equal(plannerStateRemaining(remaining), 50)
  assert.equal(plannerStateRemaining(applyPlannerYield(remaining, { shuijing: 50 }, ['a'], 'priority')), 0)
})

test('模拟器不受真实流水参数影响', () => {
  const config = {
    initialState: createInitialPlannerState([{ id: 'a', resources: { shuijing: 120 } }]),
    groups: TRAINING_GROUPS,
    levels,
    strategy: 'overall',
    agentOrder: ['a'],
    preferences: { luoyang: 0, shouchun: 0, purchaseCount: 0 },
    dates: ['2026-09-12'],
    maxDays: 3
  }
  assert.equal(
    estimatePlannerDays(config),
    estimatePlannerDays({ ...config, globalFlow: { shuijing: 9999 }, agentFlow: { a: { __heart__: 9999 } } })
  )
})

test('体力账本按 v13 基础来源、购买和支出对称计算', () => {
  const totals = planTotals({
    gains: [
      { id: 'natural', kind: 'energy', value: 288 },
      { id: 'meal', kind: 'energy', value: 120 },
      { id: 'buy', kind: 'count', value: 2 }
    ],
    spends: [{ id: 'luoyang', value: 1, costPer: 72 }, { id: 'training-yy-12', value: 3, costPer: 20 }]
  })
  assert.equal(totals.gains, PLANNER_RULES.baseDailyStamina + 2 * PLANNER_RULES.purchaseStamina)
  assert.equal(totals.spends, 132)
  assert.equal(totals.balance, 396)
})

test('共享库存只抵扣一次，剩余缺口仍能按优先顺序分配', () => {
  const state = createInitialPlannerState([
    { id: 'a', resources: { shuijing: 100 } },
    { id: 'b', resources: { shuijing: 100 } }
  ])
  const allocated = allocateSharedPlannerStock(state, { shuijing: 150 }, ['a', 'b'], 'priority')
  assert.deepEqual(aggregatePlannerState(allocated), { shuijing: 50 })
  assert.equal(allocated.a.shuijing, 0)
  assert.equal(allocated.b.shuijing, 50)
})

test('手工日期保留，后续未固定日期继续使用新的推荐状态', () => {
  const yy = TRAINING_GROUPS.find(group => group.id === 'yy')
  const manual = normalizePlannerPlan({
    gains: [{ id: 'natural', label: '自然恢复', kind: 'energy', value: 408 }],
    spends: [{
      id: 'manual-noop', label: '手工支出', kind: 'custom', value: 1, costPer: 10,
      yield: { shuijing: 60 }
    }]
  })
  const timeline = buildPlannerTimeline({
    initialState: createInitialPlannerState([{ id: 'a', resources: { shuijing: 120 } }]),
    dates: ['2026-09-12', '2026-09-13', '2026-09-14'],
    groups: TRAINING_GROUPS,
    levels,
    strategy: 'overall',
    agentOrder: ['a'],
    preferences: { luoyang: 0, shouchun: 0, purchaseCount: 0 },
    manualPlans: { '2026-09-12': manual }
  })
  assert.equal(timeline[0].manual, true)
  assert.equal(timeline[0].end.a.shuijing, 60)
  assert.equal(timeline[1].manual, false)
  assert.ok(timeline[1].recommended.spends.some(spend => spend.groupId === 'yy'))
  assert.ok(yy)
})

test('目标天数规划的额外体力只在第一天参与计算', () => {
  const initialState = createInitialPlannerState([{ id: 'a', resources: { __xp__: 224200 } }])
  const config = {
    initialState,
    groups: TRAINING_GROUPS,
    levels,
    strategy: 'overall',
    agentOrder: ['a'],
    preferences: { luoyang: 0, shouchun: 0, purchaseCount: 0 },
    maxDays: 2
  }
  assert.equal(estimatePlannerDays({ ...config, maxDays: 1 }), null)
  assert.equal(estimatePlannerDays({ ...config, initialExtra: 10, maxDays: 1 }), 1)
})

test('自定义支出保留用户名称、单次体力和可执行产出', () => {
  const spend = createSpend('custom', { name: '活动副本', label: '活动副本', costPer: 35, yield: { shuijing: 20 } })
  const normalized = normalizePlannerPlan({ gains: [], spends: [spend] }).spends[0]
  assert.equal(normalized.name, '活动副本')
  assert.equal(normalized.label, '活动副本')
  assert.equal(normalized.costPer, 35)
  assert.deepEqual(normalized.yield, { shuijing: 20 })
  assert.deepEqual(trainingStageYield(TRAINING_GROUPS.find(group => group.id === 'yy'), TRAINING_GROUPS.find(group => group.id === 'yy').stages[11]), { shuijing: 60, xinghanjing: 45 })
})

test('经验库存与 6-24 使用当前养成的统一换算口径', () => {
  assert.equal(bookExperience({ bingshucanjuan: 3, bingshuquanjuan: 2, liutaobingshu: 1 }), 12300)
  assert.equal(PLANNER_RULES.stage624Experience, 38 * BOOK_VALUES.bingshucanjuan)
  assert.deepEqual(trainingStageYield(TRAINING_GROUPS.find(group => group.id === 'experience'), TRAINING_GROUPS.find(group => group.id === 'experience').stages[7]), { __xp__: 19000 })
})
