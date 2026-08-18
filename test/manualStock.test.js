import test from 'node:test'
import assert from 'node:assert/strict'
import { buildManualStockSnapshot, nextManualSnapshotTime, preserveHiddenStockEntries } from '../src/data/inventory/manualStock.js'

test('手动调整生成 item full stock_snapshot 并省略 0 值', function () {
  const doc = buildManualStockSnapshot({
    accountId: 'acc_main',
    catalogVersion: '2026-08-16',
    effectiveAt: '2026-08-18T08:00:00.000Z',
    recordId: 'yuanhub:manual:test',
    entries: [
      { id: 'zhuangjinboli', name: '装金玻璃', count: 15 },
      { id: 'liutaobingshu', name: '六韬兵书', count: 0 }
    ]
  })

  assert.equal(doc.format, 'myshare-inventory-exchange')
  assert.equal(doc.version, 2)
  assert.deepEqual(doc.producer, { platform: 'yuanhub', version: '1' })
  assert.equal(doc.records[0].snapshot_scope, 'full')
  assert.equal(doc.records[0].entity_type, 'item')
  assert.deepEqual(doc.records[0].entries, [{ id: 'zhuangjinboli', name: '装金玻璃', count: 15 }])
})

test('手动快照时间晚于现有 full 与 listed 基线', function () {
  const time = nextManualSnapshotTime(
    '2026-08-18T08:00:00.000Z',
    ['2026-08-18T09:00:00.000Z'],
    Date.parse('2026-08-18T07:00:00.000Z')
  )

  assert.equal(time, '2026-08-18T09:00:00.001Z')
})

test('手动保存时静默保留前端隐藏道具的库存', function () {
  const entries = preserveHiddenStockEntries(
    [{ id: 'liutaobingshu', name: '六韬兵书', count: 12 }],
    [{ id: 'zhuangjinboli', name: '装金玻璃', count: 15 }],
    ['zhuangjinboli']
  )

  assert.deepEqual(entries, [
    { id: 'liutaobingshu', name: '六韬兵书', count: 12 },
    { id: 'zhuangjinboli', name: '装金玻璃', count: 15 }
  ])
})
