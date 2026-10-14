import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knownGoldAverage, recordBarClass, recordSpanWidth, smallPityRate } from '../src/pages/recruitment/recruitmentRecordPresentation.js'

test('平均只取已知5星间隔，4星、删除、未知及未完成垫抽不计入', () => {
  const event = (span, rarity = 5, extra = {}) => ({ pull_span: span, agent_snapshot: { rarity }, ...extra })
  assert.deepEqual(knownGoldAverage([event(39), event(38), event(null), event(1, 4), event(8, 5, { deleted_at: 'deleted' })]), { count: 2, value: 38.5 })
  assert.deepEqual(knownGoldAverage([event(null), event(0), event(''), event('20'), event(5, 4)]), { count: 0, value: null })
  assert.deepEqual(knownGoldAverage([event(20, 5, { batch_id: 'batch' }), event(null, 5, { batch_id: 'batch' })]), { count: 1, value: 20 })
  assert.deepEqual(knownGoldAverage([event(1), event(1), event(2)]), { count: 3, value: 1.3 })
})

test('预览与编辑共用40抽刻度、颜色、未知及4星状态', () => {
  for (const [span, color, width] of [[5, 'low', '12.5%'], [20, 'low', '50%'], [21, 'mid', '52.5%'], [30, 'mid', '75%'], [31, 'high', '77.5%'], [60, 'high', '100%'], [null, 'unknown', '100%'], ['', 'unknown', '100%']]) {
    assert.equal(recordBarClass(span), `bar-${color}`)
    assert.equal(recordSpanWidth(span), width)
  }
  assert.equal(recordBarClass(20, true), 'bar-count')
  assert.equal(recordSpanWidth(20, true), '0%')
})

const gold = (status, extra = {}) => ({ agent_snapshot: { rarity: 5 }, up_status: status, ...extra })
test('首金默认小保底，UP重置、非UP转大保底，大保底不进入分子分母', () => {
  assert.deepEqual(smallPityRate(['up', 'non_up', 'up', 'up'].map(status => gold(status))), { wins: 2, count: 3, value: 66.7 })
  assert.deepEqual(smallPityRate([gold('non_up')]), { wins: 0, count: 1, value: 0 })
  assert.deepEqual(smallPityRate([gold('non_up'), gold('up')]), { wins: 0, count: 1, value: 0 })
  assert.deepEqual(smallPityRate([gold('up'), gold('up')]), { wins: 2, count: 2, value: 100 })
})

test('与抽数和批次无关，4星和删除记录不推进保底，无出金无有效0%', () => {
  const records = [gold('non_up', { pull_span: null }), gold('unknown', { agent_snapshot: { rarity: 4 } }), gold('non_up', { deleted_at: 'deleted' }), gold('up', { batch_id: 'batch', pull_span: 1 }), gold('up', { pull_span: 40 })]
  const original = structuredClone(records)
  assert.deepEqual(smallPityRate(records), { wins: 1, count: 2, value: 50 })
  assert.deepEqual(records, original)
  assert.deepEqual(smallPityRate([]), { wins: 0, count: 0, value: null })
  assert.deepEqual(smallPityRate([gold('up', { agent_snapshot: { rarity: 4 } })]), { wins: 0, count: 0, value: null })
})

test('依记录实际顺序推演，未知UP或连续非UP不猜测有效比例', () => {
  assert.deepEqual(smallPityRate(['up', 'up', 'non_up'].map(status => gold(status))), { wins: 2, count: 3, value: 66.7 })
  assert.deepEqual(smallPityRate(['non_up', 'up', 'up'].map(status => gold(status))), { wins: 1, count: 2, value: 50 })
  assert.equal(smallPityRate([gold('unknown'), gold('up')]), null)
  assert.equal(smallPityRate([gold('non_up'), gold('non_up')]), null)
})
