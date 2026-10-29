import test from 'node:test'
import assert from 'node:assert/strict'
import { achievementSettings, settingsExport } from '../src/pages/achievement/settingsImport.js'
const input = () => ({ format: 'yuanhub-achievement-settings', schema_version: 1, game: '如鸢', reward_items: [], point_tracks: [{ category_name: '测试分类', item_key: 'test_points', tiers: [] }], reward_filter_keys: [] })
test('本地配置明确映射目标分类且不修改原输入，导出保留目标 ID', () => {
  const source = input()
  const settings = achievementSettings(source, '如鸢', [{ category_id: 'cat_target', name: '测试分类' }])
  assert.equal(settings.point_tracks[0].category_id, 'cat_target')
  assert.equal(settings.point_tracks[0].category_name, undefined)
  assert.equal(source.point_tracks[0].category_name, '测试分类')
  assert.deepEqual(achievementSettings(settingsExport('如鸢', settings), '如鸢', [{ category_id: 'cat_target', name: '测试分类' }]), settings)
})
test('跨游戏、未知字段、重复或缺失分类均拒绝，避免错误套用配置', () => {
  const categories = [{ category_id: 'a', name: '测试分类' }]
  assert.throws(() => achievementSettings(input(), '代号鸢', categories))
  assert.throws(() => achievementSettings({ ...input(), source: 'private' }, '如鸢', categories))
  assert.throws(() => achievementSettings(input(), '如鸢', []))
  assert.throws(() => achievementSettings(input(), '如鸢', [...categories, { category_id: 'b', name: '测试分类' }]))
})

test('损坏的奖励字典在应用前拒绝，不让无 games 或 null 条目进入编辑器', () => {
  for (const reward_items of [[null], [{}], [{ item_key: 'test', name: '测试币' }], [{ item_key: 'test', name: '测试币', games: '如鸢' }]]) {
    assert.throws(() => achievementSettings({ ...input(), reward_items }, '如鸢', [{ category_id: 'test', name: '测试分类' }]))
  }
})
