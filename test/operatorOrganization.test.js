import test from 'node:test'
import assert from 'node:assert/strict'
import { compareOperatorOrganization, emptyOperatorOrganization, operatorOrganizationBackup, operatorOrganizationContent,
  operatorOrganizationRanks, readOperatorOrganizationBackup, updateOperatorTag } from '../src/utils/operatorOrganization.js'

const content = () => ({ ...emptyOperatorOrganization(), pinned_ids: ['retired'], tags: [{ id: 'team', name: '主力队', operator_ids: ['a'] }] })
const catalog = Object.fromEntries(['a', 'retired'].map(id => [id, { games: ['如鸢'] }]))

test('置顶跨状态提前，多个置顶遵守顺序，未置顶遵守自定义分组顺序', () => {
  const value = content(); value.pinned_ids = ['retired', 'graduate']; value.status_order = ['skip', 'graduated', 'active', 'discarded']
  const entries = [{ id: 'a', state: 'growing' }, { id: 'graduate', state: 'graduated' }, { id: 'b', state: 'inactive' }, { id: 'retired', state: 'skip' }]
  const ranks = operatorOrganizationRanks(value)
  entries.sort((a, b) => compareOperatorOrganization(a.id, a.state, b.id, b.state, ranks))
  assert.deepEqual(entries.map(item => item.id), ['retired', 'graduate', 'b', 'a'])
  assert.equal(compareOperatorOrganization('a', 'growing', 'b', 'active', ranks), 0)
  assert.ok(compareOperatorOrganization('unknown', 'future', 'a', 'active', ranks) > 0)
})

test('批量标签添加去重、移除只影响所选成员，原数据与其他标签保留', () => {
  const value = content(); value.tags.push({ id: 'reserve', name: '备用', operator_ids: ['retired'] })
  const original = structuredClone(value)
  const added = updateOperatorTag(value, 'team', ['a', 'retired'], true)
  assert.deepEqual(added.tags[0].operator_ids, ['a', 'retired'])
  const removed = updateOperatorTag(added, 'team', ['a'], false)
  assert.deepEqual(removed.tags[0].operator_ids, ['retired'])
  assert.deepEqual(removed.tags[1], value.tags[1]); assert.deepEqual(value, original)
  assert.throws(() => updateOperatorTag(value, 'missing', ['a'], true), /标签不存在/)
})

test('分类输入拒绝非法状态、重复标识、重复名称、超限和额外字段', () => {
  const bad = [
    { ...content(), status_order: ['active', 'active', 'skip', 'discarded'] }, { ...content(), schema_version: 2 },
    { ...content(), pinned_ids: ['a', 'a'] }, { ...content(), growth_state: 'discarded' },
    { ...content(), tags: [{ id: 'x', name: ' ', operator_ids: [] }] },
    { ...content(), tags: [{ id: '<x>', name: 'xx', operator_ids: [] }] },
    { ...content(), tags: Array.from({ length: 21 }, (_, i) => ({ id: String(i), name: String(i), operator_ids: [] })) },
    { ...content(), tags: [...content().tags, { id: 'new', name: ' 主力队 ', operator_ids: [] }] },
  ]
  bad.forEach(value => assert.throws(() => operatorOrganizationContent(value)))
  assert.equal(operatorOrganizationContent({ ...content(), revision: 4, account_id: 'a' }).revision, undefined)
})

test('分类备份独立往返，拒绝游戏不符、未知密探、旧档案文件与过大输入', () => {
  const value = { ...content(), account_id: 'a', revision: 2 }
  const backup = operatorOrganizationBackup(value, '如鸢')
  assert.deepEqual(readOperatorOrganizationBackup(JSON.stringify(backup), '如鸢', catalog), content())
  assert.throws(() => readOperatorOrganizationBackup(JSON.stringify(backup), '代号鸢', catalog), /不一致/)
  assert.throws(() => readOperatorOrganizationBackup(JSON.stringify(backup), '如鸢', {}), /未收录/)
  assert.throws(() => readOperatorOrganizationBackup('{"format":"yuanhub.operator","version":4}', '如鸢', catalog), /独立/)
  assert.throws(() => readOperatorOrganizationBackup(' '.repeat(1024 * 1024 + 1), '如鸢', catalog), /1 MB/)
  assert.equal(backup.organization.account_id, undefined); assert.equal(backup.organization.revision, undefined)
})
