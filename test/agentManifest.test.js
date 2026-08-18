import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agentReleaseOrder,
  buildAgentGroups,
  filterAgentEntries,
  sortAgentEntries
} from '../src/data/inventory/agentManifest.js'

const agents = [
  { id: 'char_009_old', name: '旧九', rarity: 4, prof: '阴', subProf: '龙盾', count: 0 },
  { id: 'char_102_new', name: '新一零二', rarity: 5, prof: '阳', subProf: '神纪', count: 3 },
  { id: 'char_038_mid', name: '中三八', rarity: 5, prof: '火', subProf: '破军', count: 8 },
  { id: 'custom_agent', name: '未编号', rarity: 3, prof: '地', subProf: '岐黄', count: 1 }
]

test('密探发布序号从 id 数字段解析', function () {
  assert.equal(agentReleaseOrder('char_102_jianyong'), 102)
  assert.equal(agentReleaseOrder('custom_agent'), -1)
})

test('最新排序按编号降序且非法 id 排末尾', function () {
  assert.deepEqual(sortAgentEntries(agents, 'latest').map(function (entry) { return entry.id }), [
    'char_102_new', 'char_038_mid', 'char_009_old', 'custom_agent'
  ])
})

test('关注、状态与目录属性筛选可以组合', function () {
  const filtered = filterAgentEntries(agents, {
    status: 'owned',
    favoriteOnly: true,
    rarity: '5',
    prof: '火',
    query: '中'
  }, new Set(['char_038_mid', 'char_009_old']))
  assert.deepEqual(filtered.map(function (entry) { return entry.id }), ['char_038_mid'])
})

test('关注优先后仍按发布时间稳定排序', function () {
  assert.deepEqual(sortAgentEntries(agents, 'favorite', new Set(['char_009_old', 'char_038_mid'])).map(function (entry) { return entry.id }), [
    'char_038_mid', 'char_009_old', 'char_102_new', 'custom_agent'
  ])
})

test('按属性分组遵循固定属性顺序', function () {
  const groups = buildAgentGroups(sortAgentEntries(agents, 'latest'), 'prof')
  assert.deepEqual(groups.map(function (group) { return group.label }), ['阳', '阴', '火', '地'])
})
