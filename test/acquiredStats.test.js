import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UNKNOWN_ACQUISITION_CHANNEL,
  acquisitionChannel,
  buildAcquiredStats,
  buildRewardInsights,
  dispatchHoursForStaminaCost,
  summarizeDispatchDuration,
  mapsHaveSameCounts
} from '../src/data/inventory/acquiredStats.js'

const records = [
  {
    record_id: 'r1',
    record_type: 'reward_delta',
    acquisition_channel: '派遣',
    effective_at: '2026-08-16T07:00:00+08:00',
    entries: [{ id: 'a', name: '绣球', count: 1 }]
  },
  {
    record_id: 'r2',
    record_type: 'reward_delta',
    acquisition_channel: '派遣',
    effective_at: '2026-08-16T09:00:00+08:00',
    entries: [{ id: 'a', name: '绣球', count: 2 }, { id: 'b', name: '刘豹', count: 1 }]
  },
  {
    record_id: 'r3',
    record_type: 'stock_snapshot',
    acquisition_channel: '背包',
    effective_at: '2026-08-17T09:00:00+08:00',
    entries: [{ id: 'a', name: '绣球', count: 99 }]
  }
]

test('聚合时只统计奖励流水', function () {
  const stats = buildAcquiredStats(records)
  assert.equal(stats.recordCount, 2)
  assert.equal(stats.activeDayCount, 1)
  assert.equal(stats.entityCount, 2)
  assert.deepEqual(stats.entities.map(function (item) { return [item.id, item.count, item.recordCount] }), [
    ['a', 3, 2],
    ['b', 1, 1]
  ])
  assert.deepEqual(stats.channels.map(function (item) { return [item.name, item.recordCount, item.entityCount] }), [
    ['派遣', 2, 2]
  ])
  assert.deepEqual(stats.days.map(function (item) { return [item.date, item.recordCount, item.entityCount] }), [
    ['2026-08-16', 2, 2]
  ])
  assert.deepEqual(stats.days[0].counts, { a: 3, b: 1 })
})

test('空来源使用稳定的展示名称', function () {
  assert.equal(acquisitionChannel('  '), UNKNOWN_ACQUISITION_CHANNEL)
  assert.equal(acquisitionChannel(' 寿春 '), '寿春')
})

test('可对照后端汇总与流水聚合结果', function () {
  assert.equal(mapsHaveSameCounts({ a: 3, b: 1 }, { b: 1, a: 3 }), true)
  assert.equal(mapsHaveSameCounts({ a: 3 }, { a: 2 }), false)
})

test('派遣体力优先按 10 体力每小时换算，否则按 9 体力每小时', function () {
  assert.equal(dispatchHoursForStaminaCost(20), 2)
  assert.equal(dispatchHoursForStaminaCost(18), 2)
  assert.equal(dispatchHoursForStaminaCost(90), 9)
  assert.equal(dispatchHoursForStaminaCost(0), 0)
  assert.equal(dispatchHoursForStaminaCost(17), undefined)
  assert.equal(dispatchHoursForStaminaCost('18'), undefined)
})

test('周期派遣总时长只累加可换算的派遣奖励', function () {
  const summary = summarizeDispatchDuration([
    { record_type: 'reward_delta', acquisition_channel: '派遣', staminaCost: 20 },
    { record_type: 'reward_delta', acquisition_channel: '派遣-洛阳', stamina_cost: 18 },
    { record_type: 'reward_delta', acquisition_channel: '派遣' },
    { record_type: 'reward_delta', acquisition_channel: '派遣', staminaCost: 17 },
    { record_type: 'reward_delta', acquisition_channel: '据点情报', staminaCost: 20 },
    { record_type: 'stock_snapshot', acquisition_channel: '派遣', staminaCost: 20 }
  ])

  assert.deepEqual(summary, {
    totalHours: 4,
    dispatchRecordCount: 4,
    convertedRecordCount: 2,
    unconvertedRecordCount: 2
  })
})

test('周期洞察会合并白金币和茱萸等价值并找出幸运日与连续收获', function () {
  const insights = buildRewardInsights({
    itemTotals: { baijinbi: 120, zhuyu: 3 },
    itemRecords: [
      { record_type: 'reward_delta', acquisition_channel: '派遣-洛阳', effective_at: '2026-08-15T08:00:00+08:00', entries: [{ id: 'baijinbi', count: 20 }] },
      { record_type: 'reward_delta', effective_at: '2026-08-16T08:00:00+08:00', entries: [{ id: 'zhuyu', count: 2 }] },
      { record_type: 'reward_delta', acquisition_channel: '派遣-洛阳', effective_at: '2026-08-17T08:00:00+08:00', entries: [{ id: 'baijinbi', count: 30 }] },
      { record_type: 'reward_delta', acquisition_channel: '鸢报', effective_at: '2026-08-17T09:00:00+08:00', entries: [{ id: 'baijinbi', count: 20 }] }
    ]
  })

  assert.deepEqual(insights.whiteCoin, {
    direct: 120,
    luoyang: 100,
    yuanbao: 20,
    zhuyu: 3,
    equivalent: 270,
    bestDay: { date: '2026-08-16', direct: 0, zhuyu: 2, count: 100, tieCount: 1 },
    longestStreak: 3
  })
  assert.equal(insights.rewardRecordCount, 4)
  assert.equal(insights.activeDayCount, 3)
})

test('没有鸢报流水时白金币公式不产生鸢报分项', function () {
  const insights = buildRewardInsights({
    itemTotals: { baijinbi: 80, zhuyu: 1 },
    itemRecords: [
      { record_type: 'reward_delta', acquisition_channel: '派遣-洛阳', effective_at: '2026-08-18T08:00:00+08:00', entries: [{ id: 'baijinbi', count: 80 }] }
    ]
  })

  assert.equal(insights.whiteCoin.luoyang, 80)
  assert.equal(insights.whiteCoin.yuanbao, 0)
  assert.equal(insights.whiteCoin.equivalent, 130)
})

test('关注排行、覆盖率、偏爱指数和幸运同框使用当前关注列表', function () {
  const insights = buildRewardInsights({
    agentTotals: { a: 12, b: 6, c: 20 },
    favoriteAgents: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'd', name: '丁' }],
    rangeEnd: '2026-08-18',
    agentRecords: [
      {
        record_id: 'agent-1',
        record_type: 'reward_delta',
        acquisition_channel: '派遣-洛阳',
        effective_at: '2026-08-16T08:00:00+08:00',
        entries: [{ id: 'a', name: '甲', count: 8 }, { id: 'b', name: '乙', count: 6 }, { id: 'c', name: '丙', count: 20 }]
      },
      {
        record_id: 'agent-2',
        record_type: 'reward_delta',
        acquisition_channel: '据点情报',
        effective_at: '2026-08-18T08:00:00+08:00',
        entries: [{ id: 'a', name: '甲', count: 4 }]
      }
    ]
  })

  assert.deepEqual(insights.agents.ranking.map(function (agent) { return [agent.id, agent.count] }), [['c', 20], ['a', 12], ['b', 6]])
  assert.deepEqual(insights.agents.favoriteRanking.map(function (agent) { return [agent.id, agent.count] }), [['a', 12], ['b', 6]])
  assert.equal(insights.agents.favoriteTotal, 18)
  assert.equal(insights.agents.favoriteAcquiredCount, 2)
  assert.equal(insights.agents.coverageRatio, 2 / 3)
  assert.deepEqual(insights.agents.missingFavorites, [{ id: 'd', name: '丁' }])
  assert.equal(insights.agents.stalestFavorite.id, 'b')
  assert.equal(insights.agents.stalestFavorite.daysSinceLast, 2)
  assert.equal(insights.agents.bias.leader.id, 'a')
  assert.equal(insights.agents.bias.percent, 67)
  assert.equal(insights.agents.bias.label, '有所偏爱')
  assert.equal(insights.agents.luckyDay.date, '2026-08-16')
  assert.equal(insights.agents.luckyDay.count, 14)
  assert.deepEqual(insights.agents.luckyDay.agents.map(function (agent) { return [agent.name, agent.count] }), [['甲', 8], ['乙', 6]])
  assert.equal(insights.agents.luckyCoframes.length, 1)
  assert.deepEqual(insights.agents.luckyCoframes[0].agents.map(function (agent) { return agent.id }), ['a', 'b'])
})

test('关注数据不足时不输出偏爱结论', function () {
  const insights = buildRewardInsights({
    agentTotals: { a: 1 },
    favoriteAgents: [{ id: 'a', name: '甲' }]
  })
  assert.equal(insights.agents.bias.percent, 100)
  assert.equal(insights.agents.bias.sampleSufficient, false)
  assert.equal(insights.agents.bias.label, '样本较少')
})
