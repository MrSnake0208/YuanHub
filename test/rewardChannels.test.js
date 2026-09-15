import test from 'node:test'
import assert from 'node:assert/strict'
import { ITEM_CATALOG, AGENT_CATALOG } from '../src/data/inventory/catalog.js'
import { REWARD_CHANNELS, rewardOptionsForChannel, validateManualRewardChannel, manualRewardTimestamp } from '../src/data/inventory/rewardChannels.js'

const entities = [
  ...ITEM_CATALOG.map(({ id, name }) => ({ entity_type: 'item', id, name })),
  ...AGENT_CATALOG.map(({ id, name }) => ({ entity_type: 'agent', id, name })),
]
test('洛阳只提供四种鸟食及白金币，不能通过类型选择带入心纸', () => {
  assert.deepEqual(rewardOptionsForChannel('派遣-洛阳', entities, 'agent').map(entry => entry.id), ['jizhi', 'mazi', 'sherou', 'zhuyu', 'baijinbi'])
})
test('寿春和据点情报仅提供心纸，并补齐品质以支持筛选', () => {
  for (const channel of ['派遣-寿春', '据点情报']) {
    const options = rewardOptionsForChannel(channel, entities, 'item')
    assert.equal(options.length, AGENT_CATALOG.length - 2)
    assert.ok(options.every(entry => entry.entity_type === 'agent' && entry.rarity))
    assert.equal(options.some(entry => /sp$/i.test(entry.id)), false)
  }
})
test('历练仅提供三种兵书与修为进阶材料', () => {
  const expected = ITEM_CATALOG.filter(entry => entry.category === '修为进阶材料' || ['liutaobingshu', 'bingshuquanjuan', 'bingshucanjuan'].includes(entry.id))
  assert.deepEqual(new Set(rewardOptionsForChannel('历练', entities).map(entry => entry.id)), new Set(expected.map(entry => entry.id)))
})
test('其他奖励仍可选择道具或心纸，渠道预设保持完整', () => {
  assert.equal(REWARD_CHANNELS.length, 5)
  assert.equal(rewardOptionsForChannel('手动补录', entities, 'item').length, ITEM_CATALOG.length)
  assert.equal(rewardOptionsForChannel('手动补录', entities, 'agent').length, AGENT_CATALOG.length - 2)
})
test('提交前再次阻止不属于对应渠道的条目，不影响历史报告导入协议', () => {
  assert.throws(() => validateManualRewardChannel({ acquisition_channel: '派遣-洛阳', entity_type: 'item', entries: [{ id: 'liutaobingshu' }] }, entities), /奖励范围/)
  assert.throws(() => validateManualRewardChannel({ acquisition_channel: '派遣-寿春', entity_type: 'item', entries: [{ id: 'jizhi' }] }, entities), /奖励范围/)
  assert.doesNotThrow(() => validateManualRewardChannel({ acquisition_channel: '历练', entity_type: 'item', entries: [{ id: 'liutaobingshu' }] }, entities))
  assert.throws(() => rewardOptionsForChannel('未知渠道', entities), /获取渠道/)
})
test('白金币手动补录必须是 10 的倍数', () => {
  assert.throws(() => validateManualRewardChannel({ acquisition_channel: '派遣-洛阳', entity_type: 'item', entries: [{ id: 'baijinbi', count: 1 }] }, entities), /10/) 
  assert.doesNotThrow(() => validateManualRewardChannel({ acquisition_channel: '派遣-洛阳', entity_type: 'item', entries: [{ id: 'baijinbi', count: 10 }] }, entities))
})
test('其他奖励允许自定义渠道，但仍按选择的来源类型校验奖励', () => {
  const base = { record_type: 'reward_delta', entity_type: 'item', entries: [{ id: 'jizhi', count: 1 }] }
  assert.doesNotThrow(() => validateManualRewardChannel({ ...base, acquisition_channel: '活动邮件' }, entities, '手动补录'))
  assert.throws(() => validateManualRewardChannel({ ...base, acquisition_channel: '' }, entities, '手动补录'), /自定义获取渠道/)
  assert.throws(() => validateManualRewardChannel({ ...base, acquisition_channel: '活动\n邮件' }, entities, '手动补录'), /换行/)
  assert.throws(() => validateManualRewardChannel({ ...base, acquisition_channel: '活动派遣' }, entities, '手动补录'), /体力/)
})
test('自定义日期时间严格校验格式、日期存在性和时刻边界，使用本机时区', () => {
  assert.equal(manualRewardTimestamp('2026-09-14', '15:42:56'), new Date(2026, 8, 14, 15, 42, 56).toISOString())
  assert.equal(manualRewardTimestamp('2026-09-14', '15:42'), new Date(2026, 8, 14, 15, 42, 0).toISOString())
  for (const [date, clock] of [['2026-02-30', '12:00'], ['2026-09-14', '24:00'], ['2026-09-14', '12:60'], ['2026-13-01', '12:00'], ['', '12:00'], ['2026-09-14', '']]) {
    assert.throws(() => manualRewardTimestamp(date, clock))
  }
})
