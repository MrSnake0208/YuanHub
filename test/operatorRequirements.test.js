import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateLevelRequirements,
  calculateStarRequirements,
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

test('化极计算保留觉醒装金玻璃', function () {
  const result = calculateStarRequirements(30, 31)
  assert.equal(result.heart, 100)
  assert.equal(result.money, 300000)
  assert.equal(result.items.zhuangjinboli, 1)
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
  assert.equal(starStageFromLevel(31), 25)
})
