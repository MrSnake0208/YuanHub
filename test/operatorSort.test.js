import test from 'node:test'
import assert from 'node:assert/strict'
import { compareOperatorEntries } from '../src/utils/operatorSort.js'

function sampleEntries() {
  return [
    { id: 'a', rarity: 5, level: 47, elite: 6, huaji: { owned: true, stage: 13, awakened: false } },
    { id: 'b', rarity: 5, level: 100, elite: 17, huaji: { owned: true, stage: 19, awakened: false } },
    { id: 'c', rarity: 5, level: 100, elite: 17, huaji: { owned: true, stage: 19, awakened: false } },
    { id: 'd', rarity: 5, level: null, elite: null, huaji: { owned: true, stage: null, awakened: false } },
  ]
}

function sortedIds(entries, mode, direction) {
  return [...entries].sort((a, b) => compareOperatorEntries(a, b, mode, direction)).map(entry => entry.id)
}

function entryWithValue(id, mode, value) {
  return mode === 'star'
    ? { id, rarity: 5, huaji: { owned: true, stage: value, awakened: false } }
    : { id, [mode]: value }
}

for (const mode of ['rarity', 'level', 'elite', 'star']) {
  for (const direction of ['asc', 'desc']) {
    test(`${mode} ${direction}：交接样例与稳定并列顺序`, () => {
      const expected = mode === 'rarity' || direction === 'asc' ? ['a', 'b', 'c', 'd'] : ['b', 'c', 'a', 'd']
      assert.deepEqual(sortedIds(sampleEntries().reverse(), mode, direction), expected)
    })

    test(`${mode} ${direction}：未知值始终置后，未知之间也按 ID 排列`, () => {
      const unknowns = [undefined, null, '', '  ', NaN, Infinity, -Infinity, 'unknown', false, [], {}]
        .map((value, index) => entryWithValue(`unknown_${String(index).padStart(2, '0')}`, mode, value))
      const known = [entryWithValue('z_low', mode, 1), entryWithValue('z_high', mode, 5)]
      const expectedKnown = direction === 'asc' ? ['z_low', 'z_high'] : ['z_high', 'z_low']
      assert.deepEqual(sortedIds([...unknowns, ...known].reverse(), mode, direction), [
        ...expectedKnown, ...unknowns.map(entry => entry.id),
      ])
    })

    test(`${mode} ${direction}：按数值比较而非字符串，零不是未知`, () => {
      const entries = [
        entryWithValue('zero', mode, 0), entryWithValue('two', mode, '2'),
        entryWithValue('ten', mode, '10'), entryWithValue('unknown', mode, null),
      ]
      const expected = direction === 'asc' ? ['zero', 'two', 'ten', 'unknown'] : ['ten', 'two', 'zero', 'unknown']
      assert.deepEqual(sortedIds(entries, mode, direction), expected)
    })
  }
}

test('品质使用 rarity；同品质不再比较等级、阶级、星级或组织偏好', () => {
  const entries = sampleEntries()
  entries.push({ id: 'low', rarity: 3, level: 200, elite: 20 }, { id: 'mid', rarity: 4, level: 1, elite: 1 })
  assert.deepEqual(sortedIds(entries, 'rarity', 'asc'), ['low', 'mid', 'a', 'b', 'c', 'd'])
  assert.deepEqual(sortedIds(entries, 'rarity', 'desc'), ['a', 'b', 'c', 'd', 'mid', 'low'])
})

test('平局使用 ASCII 字典序，翻转方向不会反转 ID，也不依赖输入顺序', () => {
  const ids = ['a_2', 'a_10', 'a', '_', 'Z', 'A', '9']
  const entries = ids.map(id => ({ id, level: 10 }))
  for (const direction of ['asc', 'desc']) {
    assert.deepEqual(sortedIds(entries, 'level', direction), ['9', 'A', 'Z', '_', 'a', 'a_10', 'a_2'])
    assert.deepEqual(sortedIds([...entries].reverse(), 'level', direction), ['9', 'A', 'Z', '_', 'a', 'a_10', 'a_2'])
  }
  assert.equal(compareOperatorEntries(entries[0], entries[0], 'level', 'desc'), 0)
})

test('旧普通化极 31/30 与新 stage25 平局，觉醒不额外加星', () => {
  const entries = [
    { id: 'a', rarity: 5, star_level: 31 },
    { id: 'b', rarity: 5, huaji: { owned: true, stage: 25, awakened: false } },
    { id: 'c', rarity: 4, starLevel: 30 },
    { id: 'd', rarity: 5, huaji: { owned: true, stage: 25, awakened: true } },
    { id: 'z', rarity: 5, star_level: 24 },
  ]
  assert.deepEqual(sortedIds(entries, 'star', 'asc'), ['z', 'a', 'b', 'c', 'd'])
  assert.deepEqual(sortedIds(entries, 'star', 'desc'), ['a', 'b', 'c', 'd', 'z'])
})

test('星级包含节点进度，并优先使用新化极记录', () => {
  const entries = [
    { id: 'a', rarity: 5, star_level: 31, huaji: { owned: true, stage: 13, awakened: false } },
    { id: 'b', rarity: 5, starLevel: 14 },
    { id: 'c', rarity: 5, starLevel: 31, huaji: { owned: true, stage: null, awakened: false } },
  ]
  assert.deepEqual(sortedIds(entries, 'star', 'asc'), ['a', 'b', 'c'])
  assert.deepEqual(sortedIds(entries, 'star', 'desc'), ['b', 'a', 'c'])
})

test('隐密保持 19 上限；SP 旧值使用稀疏映射，异常 31 不套用普通规则', () => {
  const entries = [
    { id: 'low', rarity: 3, star_level: 19 },
    { id: 'sp', rarity: 5, sp_of: 'base', star_level: 4 },
    { id: 'sp_max', rarity: 5, spOf: 'base', starLevel: 5 },
    { id: 'unknown_low', rarity: 3, star_level: 31 },
    { id: 'unknown_sp', rarity: 5, spOf: 'base', star_level: 31 },
  ]
  assert.deepEqual(sortedIds(entries, 'star', 'asc'), ['low', 'sp', 'sp_max', 'unknown_low', 'unknown_sp'])
  assert.deepEqual(sortedIds(entries, 'star', 'desc'), ['sp_max', 'low', 'sp', 'unknown_low', 'unknown_sp'])
})

test('比较不会修改 entry 或嵌套化极记录；省略方向时降序', () => {
  const entries = sampleEntries()
  const before = structuredClone(entries)
  for (const entry of entries) {
    Object.freeze(entry.huaji)
    Object.freeze(entry)
  }
  Object.freeze(entries)
  for (const mode of ['rarity', 'level', 'elite', 'star']) {
    sortedIds(entries, mode, 'asc')
    sortedIds(entries, mode, 'desc')
  }
  assert.deepEqual(entries, before)
  assert.deepEqual(sortedIds(entries, 'level'), ['b', 'c', 'a', 'd'])
})

test('默认模式由页面原比较器处理；意外字段或方向快速报错', () => {
  const [a, b] = sampleEntries()
  for (const mode of ['default', 'name', undefined]) {
    assert.throws(() => compareOperatorEntries(a, b, mode), RangeError)
  }
  assert.throws(() => compareOperatorEntries(a, b, 'level', 'up'), RangeError)
})
