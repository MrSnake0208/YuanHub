import test from 'node:test'
import assert from 'node:assert/strict'
import { filterBonds, groupBonds, legacySources, readBondBackup } from '../src/pages/bonds/rules.js'
import { linkedProgress } from '../src/pages/achievement/rules.js'
import { routes } from '../src/router/routes.js'
import { getVisibleAdminTools } from '../src/utils/adminTools.js'
import { ADMIN_PERMISSIONS } from '../src/utils/authPermissions.js'

const a = { bond_id: 'bond_a', game: '代号鸢', members: ['a', 'b'], action: 'arson', weather: 'sunny', effect: 'positive', status: 'active' }
const entries = [a, { ...a, bond_id: 'bond_b', members: ['b', 'a'], weather: 'rain' }, { ...a, bond_id: 'bond_c', action: 'poison' }]
const filters = { query: '', action: '', weather: '', status: '', effect: '', onlyOwned: false, hideRecorded: false }
test('玩家目录路由公开，目录管理入口复用独立权限', () => {
  const page = routes.find(r => r.path === '/bonds')
  const admin = routes.find(r => r.path === '/bonds/admin')
  assert.equal(page.meta.requiresAuth, undefined)
  assert.equal(admin.meta.requiresAuth, true)
  assert.equal(admin.meta.requiredPermission, ADMIN_PERMISSIONS.BOND_CATALOG_WRITE)
  assert.equal(getVisibleAdminTools(null).some(t => t.to === '/bonds/admin'), false)
  assert.equal(getVisibleAdminTools({ permissions: [ADMIN_PERMISSIONS.BOND_CATALOG_WRITE] }).some(t => t.to === '/bonds/admin'), true)
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
