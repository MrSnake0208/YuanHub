import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emptyRecord, filterAchievements, readAchievementBackup, summarizeAchievements } from '../src/pages/achievement/rules.js'
import { requiresBetaApi } from '../src/utils/betaAccess.js'
import { achievementArchive, achievementBackup, achievementCatalog } from '../test-support/achievement.js'

const filters = extra => ({ query: '', category: '', status: '', favorite: false, hidden: false, ...extra })
test('三态互斥、目录分母固定，关注备注和历史记录不冒充未完成或当前成就', () => {
  const { entries } = achievementCatalog()
  const records = [
    { ...emptyRecord(entries[0].achievement_id), favorite: true, note: '关注但待核对' },
    { ...emptyRecord(entries[1].achievement_id), status: 'completed' },
    { ...emptyRecord('removed'), status: 'completed' }
  ]
  assert.deepEqual(summarizeAchievements(entries, records), { total: 3, completed: 1, incomplete: 0, pending: 2 })
  assert.equal(filterAchievements(entries, records, filters({ favorite: true })).length, 1)
  assert.equal(filterAchievements(entries, records, filters({ status: 'incomplete' })).length, 0)
  assert.equal(filterAchievements(entries, records, filters({ status: 'pending' })).length, 2)
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
