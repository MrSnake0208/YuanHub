import test from 'node:test'
import assert from 'node:assert/strict'
import { elapsedDays, milestoneRows } from '../src/utils/operatorMilestones.js'

test('按日历日计算，跨闰日、同日和缺失日期', () => {
  assert.equal(elapsedDays('2024-02-28', '2024-03-01'), 2)
  assert.equal(elapsedDays('2026-01-01', '2026-01-01'), 0)
  assert.equal(elapsedDays(null, '2026-01-01'), null)
  assert.equal(elapsedDays('2026-01-02', '2026-01-01'), null)
})
test('缺少二星时三星分段未知；观察日期不能填补实际日期', () => {
  const rows = milestoneRows(['star_1', 'star_2', 'star_3'].map(key => ({ key, observed_at: '2026-02-01T00:00:00Z' })), { star_1: '2026-01-01', star_3: '2026-02-01' })
  assert.equal(rows[2].previousDays, null)
  assert.equal(rows[2].totalDays, 31)
  assert.equal(rows[1].totalDays, null)
})
