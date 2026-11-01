import test from 'node:test'
import assert from 'node:assert/strict'
import { ELEMENT_APPEARANCE, ELEMENT_LOCKS, elementAppearance } from '../src/data/inventory/elementColors.js'

test('六属性颜色与库存金锁使用同一份定义', function () {
  assert.equal(ELEMENT_LOCKS.huaiyinjinsuo.color, ELEMENT_APPEARANCE.阴.color)
  assert.equal(ELEMENT_LOCKS.yangmingjinsuo.color, ELEMENT_APPEARANCE.阳.color)
  assert.equal(ELEMENT_LOCKS.tianfengjinsuo.color, ELEMENT_APPEARANCE.风.color)
  assert.equal(ELEMENT_LOCKS.huoyuanjinsuo.color, ELEMENT_APPEARANCE.火.color)
  assert.equal(ELEMENT_LOCKS.shuixinjinsuo.color, ELEMENT_APPEARANCE.水.color)
  assert.equal(ELEMENT_LOCKS.zaidijinsuo.color, ELEMENT_APPEARANCE.地.color)
})

test('属性颜色查询兼容空白并为混沌提供中性色', function () {
  assert.equal(elementAppearance(' 水 ').color, '#5eb6e0')
  assert.equal(elementAppearance('混沌').color, '#7d7bab')
  assert.equal(elementAppearance('未知'), null)
})
