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
