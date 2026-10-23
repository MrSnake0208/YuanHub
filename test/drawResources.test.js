import test from 'node:test'
import assert from 'node:assert/strict'
import { drawResourceChanges, drawResourcePreview, resourceEntrySummary } from '../src/data/inventory/drawResources.js'

const draft = (overrides = {}) => ({ action: 'exchange', ticketId: 'tianjifuchuan', quantity: '10', channel: 'standard', ...overrides })
test('两种符传常规200每张，普通符传月卡商店1600每十张', () => {
  for (const ticketId of ['fuchuan', 'tianjifuchuan']) {
    assert.deepEqual(drawResourceChanges(draft({ ticketId })), [{ id: 'baijinbi', count: -2000 }, { id: ticketId, count: 10 }])
  }
  assert.deepEqual(drawResourceChanges(draft({ ticketId: 'fuchuan', channel: 'monthly-shop', quantity: '20' })), [{ id: 'baijinbi', count: -3200 }, { id: 'fuchuan', count: 20 }])
  assert.throws(() => drawResourceChanges(draft({ channel: 'monthly-shop' })))
  assert.throws(() => drawResourceChanges(draft({ ticketId: 'fuchuan', channel: 'monthly-shop', quantity: '11' })))
})
test('奖励不扣币，使用只扣券，拒绝非法数量与溢出', () => {
  assert.deepEqual(drawResourceChanges(draft({ action: 'gain', channel: '活动' })), [{ id: 'tianjifuchuan', count: 10 }])
  assert.deepEqual(drawResourceChanges(draft({ action: 'use', channel: 'use' })), [{ id: 'tianjifuchuan', count: -10 }])
  for (const quantity of ['', '0', '-1', '1.5', '1e2', '2147483648']) assert.throws(() => drawResourceChanges(draft({ quantity })))
  assert.throws(() => drawResourceChanges(draft({ quantity: '10737419' })))
})
test('预览区分未知和零余额，检查双方上下限并保留原余额', () => {
  assert.throws(() => drawResourcePreview(draft(), { baijinbi: null, tianjifuchuan: 0 }), /先盘点/)
  assert.throws(() => drawResourcePreview(draft(), { baijinbi: 1999, tianjifuchuan: 0 }), /不足/)
  assert.throws(() => drawResourcePreview(draft(), { baijinbi: 2000, tianjifuchuan: 2147483647 }), /上限/)
  const rows = drawResourcePreview(draft(), { baijinbi: 2000, tianjifuchuan: 0 })
  assert.deepEqual(rows.map(row => [row.before, row.after]), [[2000, 0], [0, 10]])
  assert.equal(resourceEntrySummary(rows, 'resource_delta'), '白金币−2000、天机符传+10')
})
