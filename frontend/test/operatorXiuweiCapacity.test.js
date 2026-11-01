import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateXiuweiCapacity } from '../src/data/operatorXiuweiCapacity.js'

test('阴阳 13→17 按最少可供人数计算剩余与下一人缺口，不修改库存', () => {
  const stock = Object.freeze({ baoshijing: 3000, shuijing: 8000, xinghanjing: 5000 })
  const result = calculateXiuweiCapacity(13, 17, stock)
  assert.equal(result.error, '')
  assert.deepEqual(result.groups.map(group => [group.id, group.count]), [['fh', 0], ['ds', 0], ['yy', 2]])
  assert.deepEqual(result.groups[2].materials, [
    { id: 'baoshijing', required: 940, owned: 3000, remaining: 1120, nextGap: 0 },
    { id: 'shuijing', required: 2760, owned: 8000, remaining: 2480, nextGap: 280 },
    { id: 'xinghanjing', required: 2100, owned: 5000, remaining: 800, nextGap: 1300 }
  ])
})

test('同组属性只返回一个共用人数；恰好够用、差一份和余料不受无关材料影响', () => {
  for (const [owned, count, remaining, nextGap] of [[39, 1, 19, 1], [40, 2, 0, 20], [41, 2, 1, 19]]) {
    const { groups } = calculateXiuweiCapacity(1, 2, { juanshan: owned, cuishan: 999999, liutaobingshu: -1 })
    assert.equal(groups.length, 3)
    assert.equal(groups[0].name, '风火')
    assert.equal(groups[0].count, count)
    assert.deepEqual(groups[0].materials, [{ id: 'juanshan', required: 20, owned, remaining, nextGap }])
  }
})

test('已读取的空库存为零人，培养第一人的缺口等于单人需求', () => {
  const { groups, error } = calculateXiuweiCapacity(13, 17, {})
  assert.equal(error, '')
  for (const group of groups) {
    assert.equal(group.count, 0)
    assert.ok(group.materials.length > 0)
    for (const item of group.materials) {
      assert.equal(item.remaining, 0)
      assert.equal(item.nextGap, item.required)
    }
  }
})

test('未读取或非法库存不输出看似确定的人数', () => {
  for (const stock of [undefined, null, [], '库存', { tongjing: null }, { tongjing: -1 }, { tongjing: 1.5 }, { tongjing: '20' }, { tongjing: Infinity }]) {
    const result = calculateXiuweiCapacity(1, 2, stock)
    assert.ok(result.error)
    assert.deepEqual(result.groups, [])
  }
})

test('拒绝相同、倒退、越界和非整数修为区间', () => {
  for (const [from, to] of [[0, 17], [1, 18], [13, 13], [17, 13], [1.5, 17], ['1', 17], [1, '17'], [NaN, 17], [1, Infinity]]) {
    const result = calculateXiuweiCapacity(from, to, {})
    assert.ok(result.error)
    assert.deepEqual(result.groups, [])
  }
})

test('高库存计算下一人缺口不依赖可能超出安全整数的下一人总需求', () => {
  const { groups } = calculateXiuweiCapacity(1, 2, { tongjing: Number.MAX_SAFE_INTEGER })
  assert.equal(groups[2].count, 450359962737049)
  assert.equal(groups[2].materials[0].remaining, 11)
  assert.equal(groups[2].materials[0].nextGap, 9)
})
