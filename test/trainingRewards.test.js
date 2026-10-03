import test from 'node:test'
import assert from 'node:assert/strict'
import { ITEM_CATALOG } from '../src/data/inventory/catalog.js'
import { TRAINING_REWARD_LEVELS, DEFAULT_TRAINING_REWARD_LEVELS, calculateTrainingRewards, calculateTrainingRewardBatch, trainingRewardUnavailableReason } from '../src/data/inventory/trainingRewards.js'

const entities = ITEM_CATALOG.map(item => ({ ...item, entity_type: 'item' }))
const calculate = (options = {}) => calculateTrainingRewards({ game: '代号鸢', groupId: 'fh', level: 4, runs: '1', entities, ...options })
const groupIds = {
  fh: ['juanshan', 'cuishan', 'jinsishan', 'yushan', 'xianmenshan', 'beihuifengshan'],
  ds: ['zhuojiu', 'qingjiu', 'baimozhijiu', 'lingshanquan', 'bawanglei', 'mulanzhuilu'],
  yy: ['tongjing', 'liubojing', 'liujinjing', 'baoshijing', 'shuijing', 'xinghanjing'],
}
// 用户给出的十二关×六阶表；与生产共享表独立，检查阶数与数量。
const stageTiers = [[15,0,0,0,0,0], [25,0,0,0,0,0], [25,15,0,0,0,0], [30,20,0,0,0,0], [0,35,25,0,0,0], [0,40,30,0,0,0], [0,0,40,30,0,0], [0,0,45,35,0,0], [0,0,0,45,35,0], [0,0,0,50,40,0], [0,0,0,0,55,40], [0,0,0,0,60,45]]

test('开放全部十二关，默认常用关卡仅是展示偏好', () => {
  assert.deepEqual(TRAINING_REWARD_LEVELS, [1,2,3,4,5,6,7,8,9,10,11,12])
  assert.deepEqual(DEFAULT_TRAINING_REWARD_LEVELS, [4,6,8,10,12])
})

for (const game of ['代号鸢', '如鸢']) test(`${game}三类十二关：稳定ID、单次数量与1/5/7次换算`, () => {
  for (const [groupId, ids] of Object.entries(groupIds)) {
    stageTiers.forEach((counts, index) => {
      for (const runs of [1, '5', '7']) {
        const result = calculate({ game, groupId, level: index + 1, runs })
        const expected = counts.flatMap((count, tier) => count ? [[ids[tier], count, count * Number(runs)]] : [])
        assert.deepEqual(result.entries.map(entry => [entry.id, entry.perRunCount, entry.count]), expected)
      }
    })
  }
})

test('不钳制非法类型/层数，不借用经验历练或默认十二层', () => {
  for (const groupId of ['', 'experience', 'unknown', null]) assert.throws(() => calculate({ groupId }), /请选择风火/)
  for (const level of ['', '4', 0, -1, 13, 4.5, NaN, null]) assert.throws(() => calculate({ level }), /请选择第 1 至 12 关/)
})

test('次数拒绝空值、零、负数、小数、科学计数及非数字类型', () => {
  for (const runs of ['', ' ', '0', 0, -1, '-5', '1.5', 1.5, '1e2', 'Infinity', NaN, Infinity, null, undefined, true, [], {}]) {
    assert.throws(() => calculate({ runs }), error => error.field === 'runs' && /正整数/.test(error.message))
  }
})

test('每层数量上限允许边界次数，拒绝多一次且不截断', () => {
  for (const [index, counts] of stageTiers.entries()) {
    const level = index + 1, perRun = Math.max(...counts)
    const max = Math.floor(2147483647 / perRun)
    assert.equal(calculate({ level, runs: String(max) }).entries[0].count, max * perRun)
    assert.throws(() => calculate({ level, runs: String(max + 1) }), /最多为/)
  }
})

test('两版本支持预设，未知游戏不能静默套用', () => {
  assert.equal(trainingRewardUnavailableReason('代号鸢'), '')
  assert.equal(trainingRewardUnavailableReason('如鸢'), '')
  for (const game of ['', 'all', 'unknown']) {
    assert.ok(trainingRewardUnavailableReason(game))
    assert.throws(() => calculate({ game }), error => error.field === 'game')
  }
})

test('整笔验证当前道具目录，名称取目录，不靠同名心纸或材料匹配', () => {
  const current = [{ entity_type: 'item', id: 'juanshan', name: '当前绢扇' }, { entity_type: 'item', id: 'cuishan', name: '当前翠扇' }]
  assert.deepEqual(calculate({ entities: current }).entries.map(entry => entry.name), ['当前绢扇', '当前翠扇'])
  for (const entries of [current.slice(1), current.slice(0, 1), [{ ...current[1], entity_type: 'agent' }, current[0]], [{ ...current[1], id: 'wrong-id' }, current[0]], [], undefined]) {
    assert.throws(() => calculate({ entities: entries }), error => error.field === 'catalog')
  }
})

test('重算不累计且不修改输入目录或上一次结果', () => {
  const before = structuredClone(entities)
  const first = calculate({ runs: 5 })
  const second = calculate({ level: 8, runs: 7 })
  assert.deepEqual(first.entries.map(entry => entry.count), [150, 100])
  assert.deepEqual(second.entries.map(entry => entry.count), [315, 245])
  assert.deepEqual(entities, before)
})

const selections = [
  { groupId: 'fh', level: 8, runs: '5' },
  { groupId: 'ds', level: 12, runs: '7' },
  { groupId: 'yy', level: 4, runs: '1' },
]
const batch = (options = {}) => calculateTrainingRewardBatch({ game: '代号鸢', selections, entities, ...options })

for (const game of ['代号鸢', '如鸢']) test(`${game}可合并1–3种历练，各自使用独立层数和次数，不修改输入`, () => {
  const before = structuredClone(selections)
  const expected = [['jinsishan', 225], ['yushan', 175], ['bawanglei', 420], ['mulanzhuilu', 315], ['tongjing', 30], ['liubojing', 20]]
  for (const length of [1, 2, 3]) assert.deepEqual(batch({ game, selections: selections.slice(0, length) }).entries.map(entry => [entry.id, entry.count]), expected.slice(0, length * 2))
  assert.deepEqual(selections, before)
})

test('组合长度与重复类型+关卡严格校验，允许同类型不同关卡', () => {
  for (const input of [null, undefined, {}, [], Array.from({ length: 37 }, () => selections[0])]) assert.throws(() => batch({ selections: input }), /1 至 36/)
  assert.throws(() => batch({ selections: [selections[0], { ...selections[0], runs: '2' }] }), error => error.selectionIndex === 1 && error.field === 'level' && /同一关卡/.test(error.message))
  assert.equal(batch({ selections: [selections[0], { ...selections[0], level: 12 }] }).groups.length, 2)
})

test('任意一组无效或目录缺项整笔失败，指出相应组和字段', () => {
  for (const [selection, field] of [[null, 'group'], [{ ...selections[1], groupId: '' }, 'group'], [{ ...selections[1], level: 13 }, 'level'], [{ ...selections[1], runs: '0' }, 'runs'], [{ ...selections[1], runs: '35791395' }, 'runs']]) {
    assert.throws(() => batch({ selections: [selections[0], selection, selections[2]] }), error => error.selectionIndex === 1 && error.field === field)
  }
  assert.throws(() => batch({ entities: entities.filter(entity => entity.id !== 'tongjing') }), error => error.selectionIndex === 2 && error.field === 'catalog')
  assert.throws(() => batch({ game: 'unknown' }), error => error.field === 'game')
})

test('修改或移除一组只改变相应材料，新结果不会累加到旧结果', () => {
  const first = batch()
  const second = batch({ selections: [selections[0], { ...selections[1], runs: '5' }] })
  assert.deepEqual(first.entries.map(entry => entry.count), [225, 175, 420, 315, 30, 20])
  assert.deepEqual(second.entries.map(entry => entry.count), [225, 175, 300, 225])
})

test('低关卡只要求实际奖励目录项，可合并单材料与双材料关卡', () => {
  assert.deepEqual(calculate({ level: 1, entities: entities.filter(item => item.id === 'juanshan') }).entries.map(item => [item.id, item.count]), [['juanshan', 15]])
  assert.deepEqual(batch({ selections: [{ groupId: 'fh', level: 1, runs: '5' }, { groupId: 'ds', level: 2, runs: '7' }, { groupId: 'yy', level: 3, runs: '1' }] }).entries.map(item => [item.id, item.count]), [['juanshan', 75], ['zhuojiu', 175], ['tongjing', 25], ['liubojing', 15]])
})

for (const game of ['代号鸢', '如鸢']) test(`${game}同类7/8/9关各2次合并相同材料，组公式独立且不修改输入`, () => {
  const selected = [7,8,9].map(level => ({ groupId: 'fh', level, runs: '2' }))
  const before = structuredClone(selected)
  const result = batch({ game, selections: selected })
  assert.deepEqual(result.entries, [
    { id: 'jinsishan', name: '金丝扇', count: 170 }, { id: 'yushan', name: '羽扇', count: 220 }, { id: 'xianmenshan', name: '仙门扇', count: 70 },
  ])
  assert.deepEqual(result.groups.map(group => group.entries.map(entry => entry.count)), [[80,60],[90,70],[90,70]])
  assert.deepEqual(selected, before)
  assert.deepEqual(batch({ selections: selected.filter(item => item.level !== 8) }).entries.map(entry => [entry.id,entry.count]), [['jinsishan',80],['yushan',150],['xianmenshan',70]])
})

test('支持全部36个不同类型+关卡组合，材料只出现一次且数量正确', () => {
  const selected = Object.keys(groupIds).flatMap(groupId => Array.from({ length:12 }, (_, i) => ({ groupId, level:i + 1, runs:'1' })))
  const result = batch({ selections:selected })
  assert.equal(result.groups.length, 36)
  assert.equal(result.entries.length, 18)
  const expected = Object.values(groupIds).flatMap(ids => ids.map((id, index) => [id,[95,110,140,160,190,85][index]]))
  assert.deepEqual(result.entries.map(entry => [entry.id,entry.count]), expected)
})

test('单组各自合法但同材料合计溢出时阻止整笔，边界以内可提交', () => {
  const selected = [{ groupId:'fh', level:1, runs:'1' }, { groupId:'fh', level:2, runs:'85899345' }]
  assert.equal(batch({ selections:selected }).entries[0].count, 2147483640)
  assert.throws(() => batch({ selections:[{ ...selected[0], runs:'2' },selected[1]] }), error => error.field === 'runs' && error.selectionIndex === 1 && /合计数量/.test(error.message))
})
