import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { adminCatalogEntries, compareOperatorIdDesc, operatorIdSequence } from '../src/utils/operatorAdmin.js'

const adminPage = readFileSync(fileURLToPath(new URL('../src/pages/operator/admin.vue', import.meta.url)), 'utf8')

test('adminCatalogEntries accepts supported admin response shapes', function () {
  const rows = [{ id: 'char_125_zhaoyun' }]
  assert.equal(adminCatalogEntries(rows), rows)
  assert.equal(adminCatalogEntries({ operators: rows }), rows)
  assert.equal(adminCatalogEntries({ items: rows }), rows)
  assert.equal(adminCatalogEntries({ content: rows }), rows)
  assert.equal(adminCatalogEntries({ data: rows }), null)
  assert.equal(adminCatalogEntries(null), null)
})

test('operatorIdSequence reads the numeric sequence after char_', function () {
  assert.equal(operatorIdSequence('char_125_zhaoyun'), 125)
  assert.equal(operatorIdSequence('char_084_chendengsp'), 84)
  assert.equal(operatorIdSequence('invalid'), -1)
})

test('compareOperatorIdDesc sorts larger operator sequences first', function () {
  const rows = [
    { id: 'char_009_yanbaihu' },
    { id: 'char_125_zhaoyun' },
    { id: 'invalid' },
    { id: 'char_084_chendengsp' },
    { id: 'char_010_xuyou' }
  ]

  assert.deepEqual(rows.sort(compareOperatorIdDesc).map(function (row) { return row.id }), [
    'char_125_zhaoyun',
    'char_084_chendengsp',
    'char_010_xuyou',
    'char_009_yanbaihu',
    'invalid'
  ])
})

test('admin catalog table is not hidden behind reveal animation', function () {
  assert.match(adminPage, /class="catalog-table-wrap"/)
  assert.doesNotMatch(adminPage, /class="catalog-table-wrap"\s+v-reveal/)
})

test('桌面端操作列始终固定在表格右侧', function () {
  assert.match(adminPage, /\.ops-col\s*\{[^}]*position:\s*sticky[^}]*right:\s*0/s)
  assert.match(adminPage, /\.catalog-table\s*\{[^}]*min-width:\s*980px/s)
})

test('移动端命盘、星石、第三奇闻和目录使用同一行四列摘要', function () {
  assert.match(adminPage, /\.mobile-data\s*\{[^}]*grid-template-columns:\s*42px 42px minmax\(104px, 1\.45fr\) minmax\(58px, \.8fr\)/s)
  assert.doesNotMatch(adminPage, /\.mobile-oddity\s*\{[^}]*grid-column:\s*1 \/ -1/s)
})

test('管理端维护第三奇闻名称，但不在前端推导上限', function () {
  assert.match(adminPage, /SPECIAL_ODDITY_PRESETS = \['增伤值', '免伤值', '治疗加成'\]/)
  assert.match(adminPage, /<fieldset class="oddity-choice-field"/)
  assert.match(adminPage, /v-model="form\.specialOddityChoice"[^>]+type="radio"/)
  assert.match(adminPage, /v-model\.trim="form\.specialOddityCustomName"/)
  assert.match(adminPage, /specialOddityName: resolvedSpecialOddityName\(\)/)
  assert.match(adminPage, /aria-invalid="specialOddityError/)
  assert.match(adminPage, /上限由服务端按稀有度生成/)
  assert.doesNotMatch(adminPage, /rarity\s*===?\s*3[^\n]+(?:300|1560|9)/)
})
