import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_SCENARIO,
  calculateDemoPriorityEstimate,
  calculateDemoSummary,
  calculateEtaDays,
  calculateMaterialPlan,
  calculateMaterialPlans,
  calculateOperatorProgress,
  createDemoState,
  normalizeDemoView,
  updateDemoTarget
} from '../src/data/demoScenario.js'

test('演示视图只接受四个公开视图', function () {
  assert.equal(normalizeDemoView('materials'), 'materials')
  assert.equal(normalizeDemoView('unknown'), 'overview')
  assert.equal(normalizeDemoView(undefined), 'overview')
})

test('材料缺口和 ETA 使用 30 日流水推算，备齐或无流水不伪造 ETA', function () {
  assert.equal(calculateEtaDays(48, 152), 10)
  assert.equal(calculateEtaDays(0, 152), null)
  assert.equal(calculateEtaDays(6, 0), null)
  assert.equal(calculateEtaDays(6, -1), null)
  assert.deepEqual(calculateMaterialPlan({ id: 'x', name: '测试', owned: 8, required: 10, acquired7d: 7, acquired30d: 30 }).gap, 2)
})

test('目标要求会按等级、化极、星级和心纸缺口派生', function () {
  const operator = DEMO_SCENARIO.operators[0]
  const plan = calculateOperatorProgress(operator)
  assert.equal(plan.percent, 81)
  assert.deepEqual(plan.requirements.items, {
    baimozhijiu: 40,
    jincuodao: 10,
    yangmingjinsuo: 6,
    gongguoge: 3,
    jiezheping: 4,
    'heart-paper': 6
  })
})

test('总账和目标更新是纯函数，更新后材料需求即时重算且不污染初始 fixture', function () {
  const state = createDemoState()
  const originalTarget = state.operators[0].targetLevel
  const updated = updateDemoTarget(state, state.operators[0].id, 'level', 95)
  assert.equal(state.operators[0].targetLevel, originalTarget)
  assert.equal(updated.operators[0].targetLevel, 95)
  assert.equal(calculateMaterialPlans(updated)[0].required, 180)
  assert.equal(calculateDemoSummary(updated).totalGap > calculateDemoSummary(state).totalGap, true)
})

test('心纸从共享材料总账中排除并按密探缺口单独汇总', function () {
  const plans = calculateMaterialPlans(DEMO_SCENARIO)
  assert.equal(plans.some(item => item.id === 'heart-paper'), false)
  assert.equal(calculateDemoSummary(DEMO_SCENARIO).totalGap, 89)
  assert.equal(DEMO_SCENARIO.operators.reduce((total, operator) => total + operator.heartRequired - operator.heartOwned, 0), 23)
})

test('优先密探预计耗时先抵扣库存，并纳入自己的心纸收集速度', () => {
  const state = createDemoState()
  const estimate = calculateDemoPriorityEstimate(state, state.operators[0])
  assert.deepEqual(estimate, { missingCount: 1, unknownMaterials: [], etaDays: 15 })
  // 心纸已备齐时不再等待，其他目标的材料缺口不能拖慢优先密探。
  state.operators[0].heartOwned = state.operators[0].heartRequired
  assert.deepEqual(calculateDemoPriorityEstimate(state, state.operators[0]), { missingCount: 0, unknownMaterials: [], etaDays: 0 })
})

test('任一缺口没有收集速度时，不能忽略它给出完整 ETA', () => {
  const state = createDemoState()
  state.materials.find(item => item.id === 'gongguoge').owned = 0
  const estimate = calculateDemoPriorityEstimate(state, state.operators[0])
  assert.deepEqual(estimate, { missingCount: 2, unknownMaterials: ['功过格'], etaDays: null })
  state.materials.find(item => item.id === 'gongguoge').acquired30d = 30
  assert.equal(calculateDemoPriorityEstimate(state, state.operators[0]).etaDays, 15)
})

test('未知材料与缺失心纸速度均需补记录，其他密探心纸与总速度不能抵扣', () => {
  const state = createDemoState()
  const operator = state.operators[0]
  operator.growthCosts.level.future = 1
  delete operator.heartAcquired30d
  state.operators[1].heartOwned = 999
  state.summary.acquiredHeartPaper = 999
  assert.deepEqual(calculateDemoPriorityEstimate(state, operator), {
    missingCount: 2, unknownMaterials: ['future', '心纸'], etaDays: null
  })
})
