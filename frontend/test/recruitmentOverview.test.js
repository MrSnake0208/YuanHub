import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordBarClass, recordSpanWidth } from '../src/pages/recruitment/recruitmentRecordPresentation.js'
import { recruitmentGoldMetrics } from '../src/pages/recruitment/recruitmentGoldStatistics.js'

test('预览与编辑共用40抽刻度、颜色、未知及4星状态', () => {
  for (const [span, color, width] of [[5, 'low', '12.5%'], [20, 'low', '50%'], [21, 'mid', '52.5%'], [30, 'mid', '75%'], [31, 'high', '77.5%'], [60, 'high', '100%'], [null, 'unknown', '100%'], ['', 'unknown', '100%']]) {
    assert.equal(recordBarClass(span), `bar-${color}`)
    assert.equal(recordSpanWidth(span), width)
  }
  assert.equal(recordBarClass(20, true), 'bar-count')
  assert.equal(recordSpanWidth(20, true), '0%')
})

test('总UP与大保底、小保底分别使用服务器摘要，零值保留', () => {
  const metrics = recruitmentGoldMetrics({ total_up_rate: 66.7, up_gold_count: 2, known_up_gold_count: 3, unknown_up_gold_count: 0, guaranteed_gold_count: 1, small_pity_win_rate: 50, pity_status: 'inferred' })
  assert.deepEqual(metrics.map(metric => metric.value), ['66.7%', '1 次', '50%'])
  assert.match(metrics[0].note, /UP 2 \/ 归属已知 3 条；未知 0 条/)
  assert.deepEqual(recruitmentGoldMetrics({ total_up_rate: 0, guaranteed_gold_count: 0, small_pity_win_rate: 0 }).map(metric => metric.value), ['0%', '0 次', '0%'])
})

test('未知样本单列，历史不足不显示大保底次数或小保底率', () => {
  const metrics = recruitmentGoldMetrics({ total_up_rate: 100, up_gold_count: 1, known_up_gold_count: 1, unknown_up_gold_count: 1, guaranteed_gold_count: null, small_pity_win_rate: null, pity_status: 'insufficient_history' })
  assert.deepEqual(metrics.map(metric => metric.value), ['100%', '—', '—'])
  assert.match(metrics[0].note, /未知 1 条（未计入比例）/)
  assert.equal(metrics[1].note, '历史不足以推断')
  assert.equal(metrics[2].note, '历史不足以推断')
})

test('无样本为零次且命中率未知，归属全未知不当作0%', () => {
  const metrics = recruitmentGoldMetrics({ up_gold_count: 0, known_up_gold_count: 0, unknown_up_gold_count: 0, total_up_rate: null, guaranteed_gold_count: 0, pity_status: 'no_samples' })
  assert.deepEqual(metrics.map(metric => metric.value), ['—', '0 次', '—'])
  assert.match(metrics[0].note, /暂无已知归属/)
  assert.equal(metrics[1].note, '暂无五星样本')
  const unknown = recruitmentGoldMetrics({ up_gold_count: 0, known_up_gold_count: 0, unknown_up_gold_count: 2, pity_status: 'insufficient_history' })
  assert.equal(unknown[0].value, '—')
  assert.match(unknown[0].note, /未知 2 条/)
})

test('无UP机制与旧后端缺失字段不冒充零，账号不跨池展示小保底率', () => {
  assert.ok(recruitmentGoldMetrics({ pity_status: 'not_applicable' }).every(metric => metric.value === '—' && metric.note === '无 UP 机制，不适用'))
  for (const value of [undefined, null, {}]) assert.ok(recruitmentGoldMetrics(value).every(metric => metric.value === '—' && !metric.note.includes('0')))
  const metrics = recruitmentGoldMetrics({ small_pity_win_rate: 50 }, true)
  assert.deepEqual(metrics.map(metric => metric.key), ['total-up', 'guaranteed-gold'])
})
