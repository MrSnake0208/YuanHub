import test from 'node:test'
import assert from 'node:assert/strict'
import { filterBonds, groupBonds, groupBondsByOperator, legacySources, readBondBackup } from '../src/pages/bonds/rules.js'
import { linkedProgress } from '../src/pages/achievement/rules.js'
import { routes } from '../src/router/routes.js'
import { getVisibleAdminTools } from '../src/utils/adminTools.js'
import { ADMIN_PERMISSIONS } from '../src/utils/authPermissions.js'

const a = { bond_id: 'bond_a', game: '代号鸢', members: ['a', 'b'], action: 'arson', weather: 'sunny', effect: 'positive', status: 'active' }
const entries = [a, { ...a, bond_id: 'bond_b', members: ['b', 'a'], weather: 'rain' }, { ...a, bond_id: 'bond_c', action: 'poison' }]
const filters = { query: '', action: '', weather: '', status: '', effect: '', onlyOwned: false, hideRecorded: false }
test('羁绊路由需要访问授权，目录管理同时需要写权限', () => {
  const page = routes.find(r => r.path === '/bonds')
  const admin = routes.find(r => r.path === '/bonds/admin')
  assert.equal(page.meta.requiresAuth, true)
  assert.equal(page.meta.requiredPermission, ADMIN_PERMISSIONS.ARCHIVE_ACCESS)
  assert.equal(admin.meta.requiresAuth, true)
  assert.equal(admin.meta.requiredPermission, ADMIN_PERMISSIONS.BOND_CATALOG_WRITE)
  assert.equal(getVisibleAdminTools(null).some(t => t.to === '/bonds/admin'), false)
  assert.equal(getVisibleAdminTools({ permissions: [ADMIN_PERMISSIONS.BOND_CATALOG_WRITE, ADMIN_PERMISSIONS.ARCHIVE_ACCESS] }).some(t => t.to === '/bonds/admin'), true)
})
test('无序成员分组，天气及行动保留独立记录，筛选不修改事实', () => {
  const records = [{ bond_id: 'bond_a', triggered: true }]
  assert.equal(groupBonds(entries).length, 2)
  assert.equal(groupBonds(entries)[0].entries.length, 2)
  assert.equal(filterBonds(entries, records, [], { ...filters, hideRecorded: true }, null).length, 2)
  assert.equal(filterBonds(entries, records, [], { ...filters, weather: 'rain' }, null)[0].bond_id, 'bond_b')
  assert.equal(filterBonds(entries, records, [], { ...filters, onlyOwned: true }, null).length, 3)
  assert.equal(records.length, 1); assert.equal(entries.length, 3)
})
test('原生备份只识别独立协议，旧账号来源不猜测游戏', () => {
  const native = { format: 'yuanhub-bonds', schema_version: 1, game: '如鸢', records: [{ bond_id: 'bond_a', triggered: false }] }
  assert.deepEqual(readBondBackup(JSON.stringify(native)), native)
  assert.throws(() => readBondBackup(JSON.stringify({ ...native, format: 'yuanhub-achievement' })))
  const sources = legacySources({ '未知账号': { '__missing__': ['某人'] }, 'ry::同名': { '__server__': 'ry', '带_下划线_记录': true }, 'dyy::冲突': { '__server__': 'ry' } })
  assert.equal(sources[0].game, ''); assert.equal(sources[1].game, '如鸢'); assert.equal(sources[1].count, 1); assert.equal(sources[2].conflict, true)
})
test('密探分组归并同效果配对，保留各天气行动，进度按未筛选目录的唯一当前ID计算', () => {
  const mixed = [...entries, { ...a, bond_id: 'old', status: 'retired' }, { ...a, bond_id: 'bad', status: 'invalid' }, { ...a, bond_id: 'negative', effect: 'negative' }]
  const records = ['bond_a', 'old', 'bad'].map(bond_id => ({ bond_id, triggered: true }))
  const groups = groupBondsByOperator(mixed, mixed, records)
  assert.equal(groups.length, 2)
  for (const group of groups) {
    assert.equal(group.total, 4)
    assert.equal(group.collected, 1)
    assert.equal(group.pairs.length, 2)
    assert.equal(group.pairs[0].entries.length, 5)
    assert.equal(group.pairs[0].entries[2].action, 'poison')
    assert.deepEqual(group.pairs[0].members, [group.id === 'a' ? 'b' : 'a'])
  }
  const filteredGroups = groupBondsByOperator([entries[1]], mixed, records)
  assert.equal(filteredGroups[0].total, 4)
  assert.equal(filteredGroups[0].collected, 1)
  assert.deepEqual(filteredGroups[0].pairs[0].entries.map(e => e.weather), ['rain'])
  assert.equal(groupBondsByOperator([a], [a, a], records)[0].total, 1)
})
test('双成员搜索与收录状态筛选复用密探拼音，不改变原有拥有和隐藏规则', () => {
  const operators = [{ id: 'a', name: '甘宁', pinyin: 'ganning', alias: '兴霸' }, { id: 'b', name: '张闿', pinyin: 'zhangkai' }]
  const records = [{ bond_id: 'bond_a', triggered: true }]
  for (const query of ['甘宁 张闿', '张闿、甘宁', 'gn zk', '兴霸 张闿']) assert.equal(filterBonds(entries, records, operators, { ...filters, query }, null).length, 3)
  assert.equal(filterBonds(entries, records, operators, { ...filters, query: '甘宁 不存在' }, null).length, 0)
  assert.equal(filterBonds(entries, records, operators, { ...filters, recorded: 'collected' }, null).length, 1)
  assert.equal(filterBonds(entries, records, operators, { ...filters, recorded: 'missing' }, null).length, 2)
  assert.equal(filterBonds(entries, records, operators, { ...filters, recorded: 'collected', hideRecorded: true }, null).length, 0)
  assert.equal(filterBonds(entries, records, operators, { ...filters, onlyOwned: true }, new Map([['a', true], ['b', false]])).length, 0)
})
test('7档指标展示边界，保留绝对值，不匹配中文名称或人工状态', () => {
  for (const target of [1, 3, 10, 20, 50, 100, 200]) {
    const entry = { target, linked_metric: 'yuan_bond_variants', name: '任意名称' }
    for (const value of [0, target - 1, target, target + 1, 5000]) {
      const result = linkedProgress(entry, [{ metric: 'yuan_bond_variants', value }])
      assert.equal(result.displayed, Math.min(target, value)); assert.equal(result.reached, value >= target); assert.equal(result.value, value)
    }
    assert.equal(linkedProgress(entry), null)
  }
  assert.equal(linkedProgress({ name: '羁缘·一', target: 1 }, [{ metric: 'yuan_bond_variants', value: 5 }]), null)
})
