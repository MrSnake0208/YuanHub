import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_SCENARIO,
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
