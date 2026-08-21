import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agentBackpackOrder,
  agentMatchesGame,
  agentReleaseOrder,
  buildAgentGroups,
  filterAgentEntries,
  sortAgentEntries,
  visibleAgentEntries
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

test('暂不展示指定的限定变体', function () {
  assert.deepEqual(visibleAgentEntries([
    { id: 'char_084_chendengsp', name: '陈登·黍王' },
    { id: 'char_085_shizimiaosp', name: '史子眇·赴烛' },
    { id: 'char_013_chendeng', name: '陈登' }
  ]).map(function (entry) { return entry.name }), ['陈登'])
})

test('最新排序按编号降序且非法 id 排末尾', function () {
  assert.deepEqual(sortAgentEntries(agents, 'latest').map(function (entry) { return entry.id }), [
    'char_102_new', 'char_038_mid', 'char_009_old', 'custom_agent'
  ])
})

test('背包顺序按已知名单排列，未录入者统一置后', function () {
  const entries = [
    { id: 'char_001_unknown', name: '未收录', rarity: 5 },
    { id: 'char_099_ganti', name: '甘缇', rarity: 3 },
    { id: 'char_125_zhaoyun', name: '赵云', rarity: 5 },
    { id: 'char_105_simahui', name: '司马徽', rarity: 5 }
  ]
  assert.equal(agentBackpackOrder('司马徽'), 0)
  assert.deepEqual(sortAgentEntries(entries, 'backpack').map(function (entry) { return entry.name }), [
    '司马徽', '赵云', '甘缇', '未收录'
  ])
})

test('关注、状态与目录属性筛选可以组合', function () {
  const filtered = filterAgentEntries(agents, {
    statuses: ['owned'],
    favoriteMode: 'only',
    rarities: ['5'],
    profs: ['火'],
    query: '中'
  }, new Set(['char_038_mid', 'char_009_old']))
  assert.deepEqual(filtered.map(function (entry) { return entry.id }), ['char_038_mid'])
})

test('同一筛选维度取并集且不同维度取交集', function () {
  const filtered = filterAgentEntries(agents, {
    rarities: ['4', '5'],
    profs: ['阴', '火'],
    subProfs: ['破军', '龙盾']
  })
  assert.deepEqual(filtered.map(function (entry) { return entry.id }), ['char_009_old', 'char_038_mid'])
})

test('游戏版本筛选支持双版本、单版本与旧目录通用项', function () {
  const versioned = [
    { id: 'both', games: ['如鸢', '代号鸢'] },
    { id: 'daihao', games: ['代号鸢'] },
    { id: 'legacy' }
  ]
  assert.equal(agentMatchesGame(versioned[0], '如鸢'), true)
  assert.equal(agentMatchesGame(versioned[1], '如鸢'), false)
  assert.deepEqual(filterAgentEntries(versioned, { game: '如鸢' }).map(function (entry) { return entry.id }), ['both', 'legacy'])
  assert.deepEqual(filterAgentEntries(versioned, { game: '代号鸢' }).map(function (entry) { return entry.id }), ['both', 'daihao', 'legacy'])
})

test('关注优先作为独立优先级并保留主排序', function () {
  assert.deepEqual(sortAgentEntries(agents, 'latest', new Set(['char_009_old', 'char_038_mid']), {
    favoriteFirst: true,
    direction: 'desc'
  }).map(function (entry) { return entry.id }), [
    'char_038_mid', 'char_009_old', 'char_102_new', 'custom_agent'
  ])
})

test('主排序可以独立反序', function () {
  assert.deepEqual(sortAgentEntries(agents, 'latest', null, { direction: 'asc' }).map(function (entry) { return entry.id }), [
    'custom_agent', 'char_009_old', 'char_038_mid', 'char_102_new'
  ])
  assert.deepEqual(sortAgentEntries(agents, 'count', null, { direction: 'asc' }).map(function (entry) { return entry.id }), [
    'char_009_old', 'custom_agent', 'char_102_new', 'char_038_mid'
  ])
})

test('按属性分组遵循固定属性顺序', function () {
  const groups = buildAgentGroups(sortAgentEntries(agents, 'latest'), 'prof')
  assert.deepEqual(groups.map(function (group) { return group.label }), ['阳', '阴', '火', '地'])
})
