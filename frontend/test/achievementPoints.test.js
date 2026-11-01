import test from 'node:test'
import assert from 'node:assert/strict'
import { achievementPoints, pointRewardTrack, pointTrackFill } from '../src/pages/achievement/pointRewards.js'

const entry = (id, rewards) => ({ achievement_id: id, rewards })
const reward = quantity => ({ item_key: 'test_score', quantity })
const done = id => ({ achievement_id: id, status: 'completed' })

test('积分配置来自当前目录并按分类 ID 隔离，缺失时不猜测', () => {
  const track = { category_id: 'test', item_key: 'test_score', item_name: '测试分', tiers: [{ at: 7, name: '测试奖励', quantity: 2, icon: 'coins' }, { at: 19, name: '测试奖励乙', quantity: 3, icon: 'ticket' }] }
  const catalog = { point_tracks: [track] }
  assert.equal(pointRewardTrack(catalog, 'test').tiers[1].at, 19)
  assert.equal(pointRewardTrack(catalog, 'unknown'), null)
  assert.equal(pointRewardTrack({}, 'test'), null)
  assert.equal(pointRewardTrack(null, 'test'), null)
  assert.equal(pointTrackFill(7, track.tiers), 25)
  assert.equal(pointTrackFill(13, track.tiers), 50)
  assert.equal(pointTrackFill(100, track.tiers), 75)
  assert.equal(pointTrackFill(null, track.tiers), 0)
})

test('仅汇总已完成记录的指定物品，无积分奖励贡献零，不计移出目录的记录', () => {
  const entries = [entry('a', [reward(5), { item_key: 'test_coin', quantity: 100 }]), entry('b', [reward(15)]), entry('c', []), entry('d', [{ item_key: 'test_coin', quantity: 50 }])]
  const records = [done('a'), { achievement_id: 'b', status: 'pending' }, done('c'), done('d'), done('removed')]
  assert.equal(achievementPoints(entries, records, 'test_score'), 5)
  assert.equal(achievementPoints(entries, [...records, done('b')], 'test_score'), 20)
  assert.equal(achievementPoints(entries, [], 'test_score'), 0)
})

test('奖励未知不视为零；未完成的未知奖励不阻断；超过2000不截断', () => {
  const entries = [entry('a', [reward(2605)]), entry('b', null)]
  assert.equal(achievementPoints(entries, [done('a')], 'test_score'), 2605)
  assert.equal(achievementPoints(entries, [done('a'), done('b')], 'test_score'), null)
})

test('异常数量与跨成就安全整数溢出不能产生可信积分', () => {
  for (const amount of [-1, 0, 1.5, '5', Infinity]) {
    assert.equal(achievementPoints([entry('a', [reward(amount)])], [done('a')], 'test_score'), null)
  }
  assert.equal(achievementPoints([entry('a', [reward(Number.MAX_SAFE_INTEGER)]), entry('b', [reward(1)])], [done('a'), done('b')], 'test_score'), null)
})
