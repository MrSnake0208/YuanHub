import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agentMatchesGame,
  agentReleaseOrder,
  buildAgentGroups,
  filterAgentEntries,
  normalizeOperatorCatalog,
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

test('服务端公共目录可直接生成包含新增密探的心纸清单', function () {
  const catalog = normalizeOperatorCatalog([
    {
      id: 'char_126_new',
      name: '新密探',
      rarity: 5,
      prof: ['阳'],
      sub_prof: ['shenji'],
      games: ['如鸢']
    }
  ])

  assert.deepEqual(catalog, [{
    id: 'char_126_new',
    name: '新密探',
    rarity: 5,
    spOf: null,
    prof: '阳',
    subProf: '神纪',
    games: ['如鸢']
  }])
  assert.deepEqual(filterAgentEntries(catalog, { rarities: ['5'], subProfs: ['神纪'] }).map(function (entry) { return entry.id }), ['char_126_new'])
  assert.deepEqual(filterAgentEntries(catalog, { rarities: ['4'] }), [])
  assert.equal(normalizeOperatorCatalog([{ id: 'legacy', sub_prof: ['神纪'] }])[0].subProf, '神纪')
})

test('最新排序按编号降序且非法 id 排末尾', function () {
  assert.deepEqual(sortAgentEntries(agents, 'latest').map(function (entry) { return entry.id }), [
    'char_102_new', 'char_038_mid', 'char_009_old', 'custom_agent'
  ])
})

test('背包顺序先按阶级降序，同阶级按编号从新到旧，新增密探无需名单', function () {
  const entries = [
    { id: 'char_017_ganti', name: '甘缇', rarity: 3 },
    { id: 'char_043_xiaoqiao', name: '小乔', rarity: 4 },
    { id: 'char_092_chengpu', name: '程普', rarity: 5 },
    { id: 'char_037_fengshi', name: '蜂使', rarity: 3 },
    { id: 'char_054_wangyi', name: '王异', rarity: 4 },
    { id: 'char_112_pangde', name: '庞德', rarity: 5 },
    { id: 'char_049_luji', name: '陆绩', rarity: 4 },
    { id: 'char_133_new', name: '新增密探', rarity: 5 },
    { id: 'custom_agent', name: '未编号', rarity: 3 }
  ]
  const expected = ['新增密探', '庞德', '程普', '王异', '陆绩', '小乔', '蜂使', '甘缇', '未编号']
  assert.deepEqual(sortAgentEntries(entries, 'backpack').map(entry => entry.name), expected)
  assert.deepEqual(sortAgentEntries(entries, 'backpack', null, { direction: 'desc' }).map(entry => entry.name), expected)
  assert.deepEqual(sortAgentEntries(entries, 'backpack', null, { direction: 'asc' }).map(entry => entry.name), expected.slice().reverse())
})

test('背包顺序的关注优先只在同阶级内生效，蓝卡不会穿插到金卡前', function () {
  assert.deepEqual(sortAgentEntries(agents, 'backpack', new Set(['char_038_mid', 'custom_agent']), {
    favoriteFirst: true
  }).map(entry => entry.id), ['char_038_mid', 'char_102_new', 'char_009_old', 'custom_agent'])
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
