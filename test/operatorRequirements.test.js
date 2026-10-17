import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateLevelRequirements,
  calculateStarRequirements,
  calculateAwakeningRequirements,
  calculateXiuweiRequirements,
  mergeRequirements,
  netRequirement,
  starStageFromLevel
} from '../src/data/operatorRequirements.js'

test('等级计算跨越突破门槛并按从属给出专属材料', function () {
  const result = calculateLevelRequirements(69, 71, '破军')
  assert.equal(result.experience, 29500 + 30700)
  assert.equal(result.items.jianjia, 120)
  assert.equal(result.items.tietaigong, 30)
  assert.equal(result.items.jincuodao, 80)
  assert.equal(result.money, 300000)
})

test('已突破只免除起始节点，后续突破材料与铜钱保留', function () {
  const result = calculateLevelRequirements(70, 81, '破军', false, 7)
  const later = calculateLevelRequirements(71, 81, '破军')
  assert.deepEqual(result.items, later.items)
  assert.equal(result.money, later.money)
  assert.ok(result.money > 0)
  assert.equal(result.experience, calculateLevelRequirements(70, 81, '破军').experience)
  assert.deepEqual(calculateLevelRequirements(69, 71, '破军', true), calculateLevelRequirements(69, 71, '破军'))
  assert.deepEqual(calculateLevelRequirements(70, 71, '破军', true, 6), calculateLevelRequirements(70, 71, '破军', false, 6))
  assert.deepEqual(calculateLevelRequirements(70, 71, '破军', true).items, {})
  assert.equal(calculateLevelRequirements(70, 71, '破军', true).money, 0)
})

test('普通24到25只计最后一步且五星不再计费', function () {
  const result = calculateStarRequirements(24, 25)
  assert.equal(result.heart, 80)
  assert.equal(result.money, 160000)
  assert.deepEqual(result.items, {})
  for (let raw = 25; raw <= 30; raw++) assert.equal(calculateStarRequirements(25, raw).heart, 0)
})

test('修为计算按属性组选择材料并汇总五铢钱', function () {
  const result = calculateXiuweiRequirements(1, 4, 'fh')
  assert.deepEqual(result.items, { juanshan: 120, cuishan: 50 })
  assert.equal(result.money, 160000)
})

test('净缺口只扣除已有稳定物品库存', function () {
  const requirement = mergeRequirements(
    { items: { jianjia: 20 }, money: 1000 },
    { items: { juanshan: 40 }, heart: 10 }
  )
  const result = netRequirement(requirement, { jianjia: 8, juanshan: 50 })
  assert.deepEqual(result.items, { jianjia: 12, juanshan: 0 })
  assert.equal(result.gaps.length, 1)
  assert.equal(result.money, 1000)
  assert.equal(result.heart, 10)
})

test('现有星级协议映射到 Wiki 化极阶段', function () {
  assert.equal(starStageFromLevel(1), 0)
  assert.equal(starStageFromLevel(7), 6)
  assert.equal(starStageFromLevel(30), 24)
  assert.equal(starStageFromLevel(31), null)
})

test('旧觉醒编码不再作为可购买的化极阶段', function () {
  const result = calculateStarRequirements(30, 31)
  assert.equal(result.heart, 0)
  assert.equal(result.money, 0)
  assert.deepEqual(result.items, {})
  assert.equal(result.unsupported, true)
})


test('觉醒独立计算100心纸和1装金玻璃，返回材料对象互不污染', () => {
  assert.deepEqual(calculateAwakeningRequirements(), { heart: 100, money: 300000, items: { zhuangjinboli: 1 } })
  const first = calculateAwakeningRequirements()
  first.items.zhuangjinboli = 99
  assert.equal(calculateAwakeningRequirements().items.zhuangjinboli, 1)
  assert.equal(calculateStarRequirements(25, 31).unsupported, true)
})
