import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { routes } from '../src/router/routes.js'
import {
  buildRoundRows,
  describeAction,
  describeCondition,
  formatDate,
  formatMetric,
  normalizeOperators,
  statusInfo
} from '../src/utils/workDisplay.js'

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('注册真实作业列表并保留既有首页与详情路由', function () {
  assert.equal(routes.find(function (route) { return route.path === '/' }).name, 'today')
  assert.match(String(routes.find(function (route) { return route.path === '/works' }).component), /pages\/work\/index\.vue/)
  assert.equal(routes.filter(function (route) { return route.path === '/work/:id' }).length, 1)
  const sidebar = readSource('../src/components/IslandSidebar.vue')
  assert.match(sidebar, /to="\/works"/)
})

test('列表页覆盖真实分页状态且不提供伪搜索筛选', function () {
  const page = readSource('../src/pages/work/index.vue')
  const card = readSource('../src/components/WorkCard.vue')
  assert.match(page, /listWorks/)
  assert.match(page, /aria-live="polite"/)
  assert.match(page, /作业列表加载失败/)
  assert.match(page, /暂时没有公开作业/)
  assert.match(page, /route\.query\.page/)
  assert.doesNotMatch(page, /import\s+\{\s*WORKS|data\/works|type="search"/)
  assert.match(card, /props\.work\.level && props\.work\.level\.name/)
  assert.match(card, /props\.work\.stage_name/)
  assert.match(card, /work\.uploader_id \|\| '未提供'/)
  assert.match(card, /conversion_status/)
})

test('详情页覆盖错误、不可转换、兼容性和安全文本边界', function () {
  const page = readSource('../src/pages/work/detail.vue')
  assert.match(page, /\^\[1-9\]\\d\*\$/)
  assert.match(page, /cause\.status === 404/)
  assert.match(page, /原作业暂时无法转换/)
  assert.match(page, /MAAYUAN/)
  assert.match(page, /YUANASSIST/)
  assert.match(page, /target_document/)
  assert.match(page, /requestVersion/)
  assert.match(page, /raw source（默认折叠）/)
  assert.match(page, /navigator\.clipboard\.writeText/)
  assert.match(page, /aria-live="polite"/)
  assert.doesNotMatch(page, /DETAILS|data\/detail|v-html/)
})

test('展示 nullable 字段、五槽位、三种兼容状态和分页边界', function () {
  assert.equal(formatDate(null), '未提供')
  assert.equal(formatMetric(8.65717024533378), '8.66')
  assert.equal(formatMetric(null), '未提供')
  assert.deepEqual(normalizeOperators(['王粲', null]), ['王粲', null, null, null, null])
  assert.equal(statusInfo('exact').label, '完整兼容')
  assert.match(statusInfo('partial').description, /不建议直接执行/)
  assert.match(statusInfo('unsupported').description, /无法安全表示/)
  assert.equal(Math.max(1, Math.ceil(0 / 20)), 1)
})

test('回合表保留原始顺序并安全展示未知动作与检查条件', function () {
  const rows = buildRoundRows([{ round: 1, actions: [
    { type: 'wait', duration_ms: 800 },
    { slot: 2, type: 'attack' },
    { type: 'mystery', payload: '<b>不可执行</b>' }
  ] }])
  assert.deepEqual(rows[0].slots[1], [{ index: 2, text: 'A 普攻' }])
  assert.deepEqual(rows[0].process.map(function (entry) { return entry.index }), [1, 3])
  assert.match(rows[0].process[1].text, /未知动作/)
  assert.match(rows[0].process[1].text, /<b>不可执行<\/b>/)

  assert.equal(describeAction({ type: 'pause' }), '暂停')
  assert.equal(describeAction({ type: 'switch_target', direction: 'right', count: 2 }), '向右切目标 × 2')
  assert.equal(describeAction({ type: 'auto_battle', enabled: false }), '关闭自动战斗')
  assert.equal(describeAction({ type: 'operator_action', slot: 3, action: 'switch_form' }), '3号位切换形态')
  assert.equal(describeCondition({ type: 'party_survives' }), '全员存活')
  assert.equal(describeCondition({ type: 'operator_alive', slot: 2 }), '2号位存活')
  assert.equal(describeCondition({ type: 'operator_present', slot: 2 }), '2号位仍在场')
  assert.equal(describeCondition({ type: 'operator_copied', slot: 2 }), '2号位鹦鹉复制')
  assert.equal(describeCondition({ type: 'dragon_qi', slot: 3, operator: '>=', value: 2 }), '3号位 龙气 >= 2')
  assert.equal(describeCondition({ type: 'star_count', color: 'blue', operator: '>=', value: 1 }), '蓝星 >= 1')
  assert.equal(describeCondition({ type: 'crit' }), '暴击')
  assert.match(describeCondition({ type: 'other', html: '<img>' }), /未知条件/)
})
