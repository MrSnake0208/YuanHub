import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { achievementRewardOptions, completionStatus, emptyRecord, filterAchievements, pointRewardSources, progressValidationError, hasQuantifiedProgress, readAchievementBackup, summarizeAchievements } from '../src/pages/achievement/rules.js'
import { requiresBetaApi } from '../src/utils/betaAccess.js'
import { achievementArchive, achievementBackup, achievementCatalog } from '../test-support/achievement.js'

const filters = extra => ({ query: '', category: '', status: '', favorite: false, hidden: false, ...extra })
test('历史三态映射两态、目录分母固定，关注和移出目录记录独立统计', () => {
  const { entries } = achievementCatalog()
  const records = [
    { ...emptyRecord(entries[0].achievement_id), favorite: true, note: '关注但待核对' },
    { ...emptyRecord(entries[1].achievement_id), status: 'completed' },
    { ...emptyRecord('removed'), status: 'completed' }
  ]
  assert.deepEqual(summarizeAchievements(entries, records), { total: 3, completed: 1, incomplete: 2, favorite: 1 })
  assert.equal(filterAchievements(entries, records, filters({ favorite: true })).length, 1)
  assert.equal(filterAchievements(entries, records, filters({ status: 'incomplete' })).length, 2)
  assert.equal(records[0].status, 'pending')
  assert.equal(completionStatus({ status: 'incomplete' }), 'incomplete')
  assert.equal(completionStatus(), 'incomplete')
  const updated = [...entries].reverse().map(entry => ({ ...entry, name: '修改后名称' }))
  assert.deepEqual(summarizeAchievements(updated, records), summarizeAchievements(entries, records))
  assert.equal(achievementArchive().records.length, 0)
})
test('搜索使用名称、条件，不使用历史别名，隐藏属性独立于状态', () => {
  const { entries } = achievementCatalog()
  for (const query of ['测试成就 1', '条件 1']) assert.deepEqual(filterAchievements(entries, [], filters({ query })).map(entry => entry.achievement_id), [entries[0].achievement_id])
  assert.deepEqual(filterAchievements(entries, [], filters({ query: '测试别名' })), [])
  assert.deepEqual(filterAchievements(entries, [], filters({ hidden: true })).map(entry => entry.achievement_id), [entries[1].achievement_id])
  assert.equal(filterAchievements(entries, [], filters({ query: '不存在的条件' })).length, 0)
})
test('备份解析拒绝损坏、版本、条数与 UTF-8 体积越界', () => {
  const document = achievementBackup([{ ...emptyRecord('yh_fixture_dhy_1'), note: '<b>纯文本</b>' }])
  assert.deepEqual(readAchievementBackup(JSON.stringify(document)), document)
  assert.throws(() => readAchievementBackup('{'), /损坏/)
  assert.throws(() => readAchievementBackup(JSON.stringify({ ...document, schema_version: 2 })), /版本/)
  assert.throws(() => readAchievementBackup(JSON.stringify(achievementBackup(Array(5001).fill({})))), /5000/)
  assert.throws(() => readAchievementBackup('文'.repeat(5600000)), /16MiB/)
})
test('成就私有路径使用既有 Beta，公开目录可由游客读取', () => {
  assert.equal(requiresBetaApi('GET', '/v1/achievements/catalog?game=如鸢'), false)
  for (const path of ['/archive', '/export', '/batch', '/records/id', '/import/preview', '/import/confirm']) assert.equal(requiresBetaApi('POST', '/v1/achievements' + path), true)
  assert.equal(requiresBetaApi('GET', '/v1/achievements-other'), false)
})
test('成就开发及生产均开放登录入口，不再要求管理员访问权限', async () => {
  const source = readFileSync(new URL('../src/config/features.js', import.meta.url), 'utf8')
  for (const env of [{ DEV: false, PROD: true }, { DEV: true, PROD: false }]) {
    const flags = await import('data:text/javascript;base64,' + Buffer.from(source.replaceAll('import.meta.env', JSON.stringify(env))).toString('base64'))
    assert.equal(flags.isFeatureEnabled(flags.FEATURE_KEYS.ACHIEVEMENT_ARCHIVE), true)
  }
  const { routes } = await import('../src/router/routes.js')
  const route = routes.find(item => item.path === '/achievement')
  assert.equal(route.meta.feature, 'achievementArchive')
  assert.equal(route.meta.requiresAuth, true)
  assert.equal(route.meta.requiredPermission, undefined)
})


test('奖励名称与分类/状态/关注/搜索共同筛选', () => {
  const entries = achievementCatalog().entries.map((entry, index) => ({ ...entry, rewards: index === 2 ? null : [{ item_key: 'test', name: '测试资源', quantity: index + 1 }] }))
  const records = [{ ...emptyRecord(entries[0].achievement_id), status: 'completed', favorite: true }, { ...emptyRecord('removed'), favorite: true }]
  assert.deepEqual(filterAchievements(entries, records, filters({ reward: '  测试资源  ', category: 'test', status: 'completed', favorite: true, query: '测试成就 1' })).map(item => item.achievement_id), [entries[0].achievement_id])
  assert.equal(filterAchievements(entries, records, filters({ reward: '测试资源', hidden: true })).length, 1)
  assert.equal(filterAchievements(entries, records, filters({ reward: '不存在' })).length, 0)
  assert.equal(filterAchievements(entries, records, filters({ reward: '   ' })).length, 3)
  assert.equal(filterAchievements([{ ...entries[0], rewards: [{ item_key: 'test', name: 'Fixture TOKEN', quantity: 1 }] }], [], filters({ reward: 'fixture token' })).length, 1)
  const summary = summarizeAchievements(entries, records)
  assert.equal(summary.favorite, 1)
  assert.equal(summary.incomplete + summary.completed, summary.total)
})
test('奖励筛选固定五项，不随目录配置、单条奖励或积分档位扩展', () => {
  const catalog = achievementCatalog(5)
  catalog.reward_filters = []
  const names = ['白金币', '符传', '称号【测试甲】', '并蒂莲', '头像框【测试】']
  catalog.entries.forEach((entry, index) => { entry.rewards = [{ item_key: 'test_' + index, name: names[index], quantity: 1 }] })
  assert.deepEqual(achievementRewardOptions(catalog), ['白金币', '称号', '功过格', '符传', '头像框'])
  catalog.reward_filters = ['功过格', '白金币', '五铢钱']
  catalog.point_tracks = [{ category_id: 'test', tiers: [{ at: 100, name: '醉骨草', quantity: 1 }] }]
  assert.deepEqual(achievementRewardOptions(catalog), ['白金币', '称号', '功过格', '符传', '头像框'])
  assert.deepEqual(achievementRewardOptions({}), ['白金币', '称号', '功过格', '符传', '头像框'])
  assert.deepEqual(achievementRewardOptions(null), [])
})
test('奖励名称可模糊反查，物品筛选精确匹配，头像不混入头像框，缺资料不作为奖励名', () => {
  const names = ['符传', '天机符传', '称号【风起】', '头像框【风起】', '头像【风起】']
  const catalog = achievementCatalog(names.length + 2)
  catalog.entries.forEach((entry, index) => { entry.rewards = index < names.length ? [{ item_key: 'test_' + index, name: names[index], quantity: 1 }] : null })
  const legacy = { [catalog.entries[5].achievement_id]: '称号【旧风起】' }
  const find = values => filterAchievements(catalog.entries, [], filters(values), [], legacy).map(entry => entry.achievement_id)
  assert.deepEqual(find({ reward: '符传' }), [catalog.entries[0].achievement_id])
  assert.deepEqual(find({ reward: '头像' }), [catalog.entries[4].achievement_id])
  assert.deepEqual(find({ reward: '头像框', query: '风起' }), [catalog.entries[3].achievement_id])
  assert.deepEqual(find({ reward: '称号', query: '风起' }), [catalog.entries[2].achievement_id, catalog.entries[5].achievement_id])
  assert.equal(find({ query: '风起' }).length, 4)
  assert.deepEqual(find({ query: '奖励资料未补齐' }), [])
  catalog.entries[5].rewards = [{ item_key: 'test_coin', name: '白金币', quantity: 1 }]
  assert.deepEqual(find({ query: '旧风起' }), [])
})
test('按奖励名和类型反查积分来源，保留分类与门槛，不伪造成单条成就奖励', () => {
  const catalog = achievementCatalog()
  catalog.categories.push({ category_id: 'other', name: '另一分类' })
  catalog.point_tracks = [{ category_id: 'test', tiers: [{ at: 100, name: '风起', quantity: 1, icon: 'title' }, { at: 200, name: '云涌', quantity: 1, icon: 'frame' }] }, { category_id: 'other', tiers: [{ at: 300, name: '风起', quantity: 1, icon: 'frame' }] }]
  assert.deepEqual(pointRewardSources(catalog, filters({})), [])
  assert.deepEqual(pointRewardSources(catalog, filters({ query: ' 风起 ', reward: '称号' })), [{ at: 100, name: '风起', quantity: 1, icon: 'title', category_id: 'test', category_name: '测试分类' }])
  assert.equal(pointRewardSources(catalog, filters({ query: '风起' })).length, 2)
  assert.equal(pointRewardSources(catalog, filters({ query: '风起', category: 'other', reward: '头像框' }))[0].at, 300)
  assert.equal(pointRewardSources(catalog, filters({ query: '风起', category: 'other', reward: '称号' })).length, 0)
  assert.ok(achievementRewardOptions(catalog).includes('称号'))
  assert.ok(achievementRewardOptions(catalog).includes('头像框'))
})
test('只有明确正整数目标可展示进度，不虚构0/1', () => {
  for (const entry of [{}, { target: null }, { target: 0 }, { target: 2.5 }, { target: '10' }, { target: 1e12 + 1 }]) assert.equal(hasQuantifiedProgress(entry), false)
  for (const target of [1, 10, 1e12]) assert.equal(hasQuantifiedProgress({ target }), true)
})

test('行内进度只接受安全整数，允许留空、零和超目标', () => {
  const entry = { target: 10 }
  for (const value of ['', '0', '15']) assert.equal(progressValidationError(entry, value), '')
  for (const value of ['-1', 'NaN', 'Infinity', '9007199254740992', '1.5', '1.0000000000000001', '9007199254740990.9']) assert.ok(progressValidationError(entry, value))
  assert.ok(progressValidationError({}, '1'))
})

test('分类先后优先于组内顺序，稳定ID解决排序相同，5000条长中文备份可读取', () => {
  const entries = [
    { ...achievementCatalog().entries[0], achievement_id: 'yh_late', category_id: 'late', sort: 1 },
    { ...achievementCatalog().entries[0], achievement_id: 'yh_b', sort: 2 },
    { ...achievementCatalog().entries[0], achievement_id: 'yh_a', sort: 2 }
  ]
  const categories = [{ category_id: 'test' }, { category_id: 'late' }]
  assert.deepEqual(filterAchievements(entries, [], filters({}), categories).map(e => e.achievement_id), ['yh_a', 'yh_b', 'yh_late'])
  const backup = achievementBackup(Array.from({ length: 5000 }, (_, i) => ({ ...emptyRecord('yh_' + i), note: '文'.repeat(500) })))
  const text = JSON.stringify(backup)
  assert.ok(new TextEncoder().encode(text).length > 1024 * 1024)
  assert.equal(readAchievementBackup(text).records.length, 5000)
})
