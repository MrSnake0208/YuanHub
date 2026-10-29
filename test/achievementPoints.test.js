import test from 'node:test'
import assert from 'node:assert/strict'
import { achievementPoints, pointRewardTrack } from '../src/pages/achievement/pointRewards.js'

const entry = (id, rewards) => ({ achievement_id: id, rewards })
const reward = quantity => ({ item_key: 'wugouxue', quantity })
const done = id => ({ achievement_id: id, status: 'completed' })

test('20 档配置按游戏隔离，绣衣天下奖励采用绣衣主人名称', () => {
  const names = ['金兰之义', '恋念缠绵', '绣衣天下', '日理万机', '刀光剑影']
  const seconds = [['符传', 1], ['锦灰', 500], ['白金币', 200], ['符传', 1], ['白金币', 200]]
  names.forEach((name, index) => {
    const track = pointRewardTrack('代号鸢', name)
    assert.deepEqual(track.tiers.map(t => t.at), [500, 1000, 1500, 2000])
    assert.equal(track.tiers[0].name, '白金币')
    assert.equal(track.tiers[0].quantity, 100)
    assert.deepEqual([track.tiers[1].name, track.tiers[1].quantity], seconds[index])
    assert.equal(pointRewardTrack('如鸢', name), null)
  })
  assert.equal(pointRewardTrack('代号鸢', '绣衣天下').tiers[2].name, '称号【绣衣主人】')
  assert.equal(pointRewardTrack('代号鸢', '未知分类'), null)
  assert.equal(pointRewardTrack('代号鸢', '__proto__'), null)
})

test('仅汇总已完成记录的指定物品，无积分奖励贡献零，不计移出目录的记录', () => {
  const entries = [entry('a', [reward(5), { item_key: 'baijinbi', quantity: 100 }]), entry('b', [reward(15)]), entry('c', []), entry('d', [{ item_key: 'baijinbi', quantity: 50 }])]
  const records = [done('a'), { achievement_id: 'b', status: 'pending' }, done('c'), done('d'), done('removed')]
  assert.equal(achievementPoints(entries, records, 'wugouxue'), 5)
  assert.equal(achievementPoints(entries, [...records, done('b')], 'wugouxue'), 20)
  assert.equal(achievementPoints(entries, [], 'wugouxue'), 0)
})

test('奖励未知不视为零；未完成的未知奖励不阻断；超过2000不截断', () => {
  const entries = [entry('a', [reward(2605)]), entry('b', null)]
  assert.equal(achievementPoints(entries, [done('a')], 'wugouxue'), 2605)
  assert.equal(achievementPoints(entries, [done('a'), done('b')], 'wugouxue'), null)
})

test('异常数量与跨成就安全整数溢出不能产生可信积分', () => {
  for (const amount of [-1, 0, 1.5, '5', Infinity]) {
    assert.equal(achievementPoints([entry('a', [reward(amount)])], [done('a')], 'wugouxue'), null)
  }
  assert.equal(achievementPoints([entry('a', [reward(Number.MAX_SAFE_INTEGER)]), entry('b', [reward(1)])], [done('a'), done('b')], 'wugouxue'), null)
})
