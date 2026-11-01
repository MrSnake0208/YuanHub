import test from 'node:test'
import assert from 'node:assert/strict'
import { isPermanentRecruitmentPool, recruitmentPoolDateLabel } from '../src/data/recruitmentPoolTypes.js'

test('常驻空结束日期显示无限期，可保留已知开始日期', () => {
  for (const pool_type of ['permanent', 'standard', '常驻', '常驻卡池']) {
    const pool = { pool_type, start_date: null, end_date: null }
    assert.equal(isPermanentRecruitmentPool(pool), true)
    assert.equal(recruitmentPoolDateLabel(pool), '常驻 · 无限期')
    assert.equal(recruitmentPoolDateLabel({ ...pool, start_date: '2026-01-01' }), '2026-01-01 — 常驻 · 无限期')
  }
})

test('有限日期与非普通常驻的未知日期不推断为无限期', () => {
  const finite = { pool_type: 'permanent', start_date: '2026-01-01', end_date: '2026-01-31' }
  assert.equal(isPermanentRecruitmentPool(finite), false)
  assert.equal(recruitmentPoolDateLabel(finite), '2026-01-01 — 2026-01-31')
  assert.equal(recruitmentPoolDateLabel({ pool_type: 'limited' }), '开始日期未知 — 结束日期未知')
  assert.equal(recruitmentPoolDateLabel(null), '开始日期未知 — 结束日期未知')
})
