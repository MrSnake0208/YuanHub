import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  MAX_STAMINA_COST,
  deserializeInventoryExchangeDocument,
  deserializeInventoryRecord,
  isDispatchReward,
  serializeInventoryExchangeDocument,
  staminaCostOf,
  validateInventoryExchangeDocument
} from '../src/data/inventory/exchange.js'

const inventoryPage = readFileSync(new URL('../src/pages/inventory/index.vue', import.meta.url), 'utf8')
const mobileHeader = readFileSync(new URL('../src/components/MobileHeader.vue', import.meta.url), 'utf8')

test('inventory import panel follows the shared archive visibility state', function () {
  assert.match(inventoryPage, /v-if="showArchive && !editingStock && showImport"/)
  assert.match(inventoryPage, /function toggleInventoryArchive\(\)[\s\S]*if \(!showArchive\.value\) showImport\.value = false/)
  assert.match(inventoryPage, /function toggleInventoryImport\(\)[\s\S]*if \(!showArchive\.value \|\| editingStock\.value\)[\s\S]*showImport\.value = false/)
})

test('库存类型切换复用单一入口，桌面遵循模式到工具动线且手机端顶部 sticky', function () {
  const switchMarkers = inventoryPage.match(/class="type-switch manifest-type-switch"/g) || []
  const toolbarIndex = inventoryPage.indexOf('class="manifest-toolbar"')
  const switchIndex = inventoryPage.indexOf('class="type-switch manifest-type-switch"', toolbarIndex)
  const barIndex = inventoryPage.indexOf('class="manifest-bar"', switchIndex)
  const dividerIndex = inventoryPage.indexOf('class="manifest-bar-divider"', switchIndex)
  const summaryIndex = inventoryPage.indexOf('class="manifest-bar-summary"', dividerIndex)
  const toolsIndex = inventoryPage.indexOf('class="manifest-item-tools"', summaryIndex)

  assert.equal(switchMarkers.length, 1)
  assert.ok(
    toolbarIndex >= 0 &&
      switchIndex > toolbarIndex &&
      barIndex > switchIndex &&
      dividerIndex > switchIndex &&
      summaryIndex > dividerIndex &&
      toolsIndex > summaryIndex
  )
  assert.match(inventoryPage, /class="type-switch manifest-type-switch"[\s\S]*aria-label="库存类型"[\s\S]*@click="setEntityType\('item'\)"[\s\S]*@click="setEntityType\('agent'\)"/)
  assert.match(inventoryPage, /manifest-type-label-compact"[\s\S]*>道具<[\s\S]*manifest-type-label-compact"[\s\S]*>心纸</)
  assert.match(inventoryPage, /class="manifest-item-tools"[\s\S]*id="manifest-search"[\s\S]*class="mf-filter"/)
  assert.match(inventoryPage, /@media \(min-width: 1081px\)[\s\S]*\.manifest-toolbar\s*\{[\s\S]*position:\s*sticky;[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/)
  assert.match(inventoryPage, /\.manifest-bar-spacer\s*\{[\s\S]*flex:\s*1 1 24px;/)
  assert.match(inventoryPage, /\.manifest-bar-divider\s*\{[\s\S]*width:\s*1px;[\s\S]*height:\s*30px;/)
  assert.match(inventoryPage, /@media \(max-width: 640px\)[\s\S]*\.manifest-type-switch\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*var\([\s\S]*--mobile-shell-follow-top,[\s\S]*72px[\s\S]*safe-area-inset-top[\s\S]*\);[\s\S]*bottom:\s*auto;[\s\S]*width:\s*min\(100%, 360px\);/)
  assert.doesNotMatch(inventoryPage, /page-inventory:has\(\.mobile-shell--hidden\)/)
  assert.match(inventoryPage, /\.manifest-type-switch > button\s*\{[\s\S]*min-height:\s*44px;/)
  assert.match(inventoryPage, /\.manifest-type-label-compact\s*\{[\s\S]*display:\s*none;/)
  assert.match(inventoryPage, /v-if="!editingStock" class="manifest-toolbar"[\s\S]*class="type-switch manifest-type-switch"[\s\S]*class="manifest-bar"/)
})

test('库存类型切换后台刷新时不让目录因 loading 状态塌陷', function () {
  assert.match(inventoryPage, /function setEntityType\(t\)[\s\S]*reloadCurrent\(false, true\)/)
  assert.match(inventoryPage, /async function safeLoad\(fn, quiet, preserveContent\)[\s\S]*if \(!preserveContent\) loading\.value = true;[\s\S]*finally \{[\s\S]*if \(!preserveContent\) loading\.value = false;/)
  assert.match(inventoryPage, /async function reloadCurrent\(quiet, preserveContent\)[\s\S]*safeLoad\([\s\S]*quiet,\s*preserveContent\s*\)/)
})

test('手机顶部导航隐藏状态通过 CSS 变量显式驱动库存 sticky 偏移', function () {
  assert.match(inventoryPage, /top:\s*var\([\s\S]*--mobile-shell-follow-top,[\s\S]*72px[\s\S]*safe-area-inset-top/)
  assert.doesNotMatch(inventoryPage, /page-inventory:has\(\.mobile-shell--hidden\)/)
  assert.match(mobileHeader, /--mobile-shell-follow-top/)
  assert.match(mobileHeader, /hidden\.value[\s\S]*8px[\s\S]*72px/)
})

function reward(overrides = {}) {
  return Object.assign({
    record_id: 'dispatch:1',
    record_type: 'reward_delta',
    entity_type: 'item',
    acquisition_channel: '派遣-洛阳',
    effective_at: '2026-08-18T10:00:00+08:00',
    entries: []
  }, overrides)
}

test('派遣奖励的 staminaCost 序列化为 stamina_cost', function () {
  const source = { format: 'myshare-inventory-exchange', version: 2, records: [reward({ staminaCost: 37 })] }
  const wire = serializeInventoryExchangeDocument(source)

  assert.equal(wire.records[0].stamina_cost, 37)
  assert.equal(Object.hasOwn(wire.records[0], 'staminaCost'), false)
  assert.equal(source.records[0].staminaCost, 37)
  assert.equal(Object.hasOwn(source.records[0], 'stamina_cost'), false)
})

test('渠道只要包含派遣就要求消耗体力', function () {
  assert.equal(isDispatchReward(reward({ acquisition_channel: '日常派遣-洛阳', stamina_cost: 1 })), true)
  assert.throws(function () {
    validateInventoryExchangeDocument({ records: [reward()] })
  }, { message: '派遣奖励必须填写消耗体力数' })
})

test('非派遣奖励和快照禁止携带消耗体力', function () {
  assert.throws(function () {
    serializeInventoryExchangeDocument({ records: [reward({ acquisition_channel: '据点情报', staminaCost: 20 })] })
  }, /仅派遣奖励/)

  assert.throws(function () {
    serializeInventoryExchangeDocument({ records: [reward({ record_type: 'stock_snapshot', stamina_cost: 20 })] })
  }, /仅派遣奖励/)

  const snapshot = serializeInventoryExchangeDocument({ records: [reward({ record_type: 'stock_snapshot', staminaCost: undefined })] })
  assert.equal(Object.hasOwn(snapshot.records[0], 'stamina_cost'), false)
})

test('消耗体力只接受协议范围内的整数', function () {
  for (const value of [-1, 1.5, '80', null, MAX_STAMINA_COST + 1]) {
    assert.throws(function () {
      validateInventoryExchangeDocument({ records: [reward({ stamina_cost: value })] })
    }, /消耗体力必须是 0 至 2147483647 的整数/)
  }
  assert.doesNotThrow(function () {
    validateInventoryExchangeDocument({ records: [reward({ stamina_cost: 0 }), reward({ record_id: 'max', stamina_cost: MAX_STAMINA_COST })] })
  })
})

test('历史记录缺失时不补 0，后端字段反序列化为 staminaCost', function () {
  const historical = deserializeInventoryRecord(reward())
  const current = deserializeInventoryRecord(reward({ stamina_cost: 0 }))

  assert.equal(Object.hasOwn(historical, 'staminaCost'), false)
  assert.equal(staminaCostOf(historical), undefined)
  assert.equal(current.staminaCost, 0)
  assert.equal(Object.hasOwn(current, 'stamina_cost'), false)
  assert.equal(staminaCostOf(current), 0)

  const document = deserializeInventoryExchangeDocument({ records: [reward({ stamina_cost: 12 })] })
  assert.equal(document.records[0].staminaCost, 12)
})

test('同一 record_id 重试保持原 stamina_cost，序列化结果幂等', function () {
  const document = { records: [reward({ record_id: 'stable-id', staminaCost: 36 })] }
  const first = serializeInventoryExchangeDocument(document)
  const retry = serializeInventoryExchangeDocument(first)

  assert.deepEqual(retry, first)
  assert.equal(retry.records[0].record_id, 'stable-id')
  assert.equal(retry.records[0].stamina_cost, 36)
})

test('登录和第三方导入共用协议序列化，列表响应执行反序列化', function () {
  const source = readFileSync(new URL('../src/api/inventory.js', import.meta.url), 'utf8')

  assert.match(source, /PATH \+ '\/import'[\s\S]*body: serializeInventoryExchangeDocument\(doc\)/)
  assert.match(source, /'\/open-api\/inventory\/import'[\s\S]*body: serializeInventoryExchangeDocument\(doc\)/)
  assert.match(source, /deserializeInventoryRecordPage\(page\)/)
})

test('前端示例档案符合 stamina_cost 条件约束', function () {
  const source = readFileSync(new URL('../public/inventory-import-example.json', import.meta.url), 'utf8')
  const document = JSON.parse(source)

  assert.doesNotThrow(function () { validateInventoryExchangeDocument(document) })
  const dispatchRecords = document.records.filter(isDispatchReward)
  assert.ok(dispatchRecords.length > 0)
  assert.equal(dispatchRecords.every(function (record) { return Number.isInteger(record.stamina_cost) }), true)
  assert.ok(new Set(dispatchRecords.map(function (record) { return record.stamina_cost })).size > 1)
})
