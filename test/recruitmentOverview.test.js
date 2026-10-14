import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordBarClass, recordSpanWidth } from '../src/pages/recruitment/recruitmentRecordPresentation.js'

test('预览与编辑共用40抽刻度、颜色、未知及4星状态', () => {
  for (const [span, color, width] of [[5, 'low', '12.5%'], [20, 'low', '50%'], [21, 'mid', '52.5%'], [30, 'mid', '75%'], [31, 'high', '77.5%'], [60, 'high', '100%'], [null, 'unknown', '100%'], ['', 'unknown', '100%']]) {
    assert.equal(recordBarClass(span), `bar-${color}`)
    assert.equal(recordSpanWidth(span), width)
  }
  assert.equal(recordBarClass(20, true), 'bar-count')
  assert.equal(recordSpanWidth(20, true), '0%')
})
