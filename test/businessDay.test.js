import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addCalendarDays,
  businessDate,
  businessDayStartIso,
  nextBusinessDayStartIso
} from '../src/utils/businessDay.js'

test('北京/上海时间凌晨 5 点切换业务日', () => {
  assert.equal(businessDate('2026-09-12T20:59:59Z'), '2026-09-12')
  assert.equal(businessDate('2026-09-12T21:00:00Z'), '2026-09-13')
  assert.equal(businessDate('2026-09-12T21:00:01Z'), '2026-09-13')
})

test('业务日边界转换为稳定的 UTC 查询区间', () => {
  assert.equal(businessDayStartIso('2026-09-13'), '2026-09-12T21:00:00.000Z')
  assert.equal(nextBusinessDayStartIso('2026-09-13'), '2026-09-13T21:00:00.000Z')
  assert.equal(addCalendarDays('2026-09-30', 1), '2026-10-01')
})
