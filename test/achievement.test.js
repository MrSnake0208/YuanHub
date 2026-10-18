import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { completionStatus, emptyRecord, filterAchievements, progressValidationError, hasQuantifiedProgress, readAchievementBackup, summarizeAchievements } from '../src/pages/achievement/rules.js'
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
test('搜索仅使用已有名称、别名、条件和关联密探，隐藏属性独立于状态', () => {
  const { entries } = achievementCatalog()
  for (const query of ['测试别名', '测试密探', '条件 1']) assert.deepEqual(filterAchievements(entries, [], filters({ query })).map(entry => entry.achievement_id), [entries[0].achievement_id])
  assert.deepEqual(filterAchievements(entries, [], filters({ hidden: true })).map(entry => entry.achievement_id), [entries[1].achievement_id])
  assert.equal(filterAchievements(entries, [], filters({ query: '不存在的条件' })).length, 0)
})
test('备份解析拒绝损坏、版本、条数与 UTF-8 体积越界', () => {
  const document = achievementBackup([{ ...emptyRecord('yh_fixture_dhy_1'), note: '<b>纯文本</b>' }])
  assert.deepEqual(readAchievementBackup(JSON.stringify(document)), document)
  assert.throws(() => readAchievementBackup('{'), /损坏/)
  assert.throws(() => readAchievementBackup(JSON.stringify({ ...document, schema_version: 2 })), /版本/)
  assert.throws(() => readAchievementBackup(JSON.stringify(achievementBackup(Array(1001).fill({})))), /1000/)
  assert.throws(() => readAchievementBackup('文'.repeat(350000)), /1MiB/)
})
test('成就私有路径使用既有 Beta，公开目录可由游客读取', () => {
  assert.equal(requiresBetaApi('GET', '/v1/achievements/catalog?game=如鸢'), false)
  for (const path of ['/archive', '/export', '/batch', '/records/id', '/import/preview', '/import/confirm']) assert.equal(requiresBetaApi('POST', '/v1/achievements' + path), true)
  assert.equal(requiresBetaApi('GET', '/v1/achievements-other'), false)
})
test('资料未准备时生产开关关闭、开发不注入样例、路由允许公开浏览', async () => {
  const source = readFileSync(new URL('../src/config/features.js', import.meta.url), 'utf8')
  for (const env of [{ DEV: false, PROD: true }, { DEV: true, PROD: false }]) {
    const flags = await import('data:text/javascript;base64,' + Buffer.from(source.replaceAll('import.meta.env', JSON.stringify(env))).toString('base64'))
    assert.equal(flags.isFeatureEnabled(flags.FEATURE_KEYS.ACHIEVEMENT_ARCHIVE), env.DEV)
  }
  const { routes } = await import('../src/router/routes.js')
  const route = routes.find(item => item.path === '/achievement')
  assert.equal(route.meta.feature, 'achievementArchive')
  assert.equal(route.meta.requiresAuth, undefined)
})


test('奖励文本支持真实选项和关键词，与分类/状态/关注/搜索共同筛选', () => {
  const entries = achievementCatalog().entries.map((entry, index) => ({ ...entry, reward: index === 2 ? null : '测试资源 × ' + (index + 1) }))
  const records = [{ ...emptyRecord(entries[0].achievement_id), status: 'completed', favorite: true }, { ...emptyRecord('removed'), favorite: true }]
  assert.deepEqual(filterAchievements(entries, records, filters({ reward: '  测试资源  ', category: 'test', status: 'completed', favorite: true, query: '别名' })).map(item => item.achievement_id), [entries[0].achievement_id])
  assert.equal(filterAchievements(entries, records, filters({ reward: '测试资源', hidden: true })).length, 1)
  assert.equal(filterAchievements(entries, records, filters({ reward: '不存在' })).length, 0)
  assert.equal(filterAchievements(entries, records, filters({ reward: '   ' })).length, 3)
  assert.equal(filterAchievements([{ ...entries[0], reward: 'Fixture TOKEN' }], [], filters({ reward: 'token' })).length, 1)
  const summary = summarizeAchievements(entries, records)
  assert.equal(summary.favorite, 1)
  assert.equal(summary.incomplete + summary.completed, summary.total)
})
test('只有明确的数值类型和正目标可展示进度，不虚构0/1', () => {
  for (const entry of [{}, { target: 1 }, { progress_kind: 'boolean', target: 1 }, { progress_kind: 'integer' }, { progress_kind: 'integer', target: 0 }, { progress_kind: 'number', target: '10' }]) assert.equal(hasQuantifiedProgress(entry), false)
  assert.equal(hasQuantifiedProgress({ progress_kind: 'integer', target: 10 }), true)
  assert.equal(hasQuantifiedProgress({ progress_kind: 'number', target: 2.5 }), true)
})

test('行内进度校验允许未知、零、超目标及小数，拒绝负数、非数和整数口径小数', () => {
  const integer = { progress_kind: 'integer', target: 10 }, number = { progress_kind: 'number', target: 2.5 }
  for (const value of ['', '0', '15']) assert.equal(progressValidationError(integer, value), '')
  assert.equal(progressValidationError(number, '1.5'), '')
  for (const value of ['-1', 'NaN', 'Infinity', '9007199254740992', '1.5']) assert.ok(progressValidationError(integer, value))
  assert.ok(progressValidationError({}, '1'))
})
