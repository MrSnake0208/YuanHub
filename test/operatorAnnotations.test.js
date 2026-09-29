import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileOperatorAnnotations } from '../src/utils/operatorAnnotations.js'

test('标注刷新不会让保存中的密探回到旧状态，也不会覆盖已保存的新修订', () => {
  const remote = {
    statuses: { first: 'growing', second: 'growing', third: 'graduated' },
    remarks: { first: '', second: '', third: '新备注' },
    revisions: { first: 1, second: 1, third: 3 },
  }
  const local = {
    statuses: { first: 'graduated', second: 'graduated', third: 'growing' },
    remarks: { first: '', second: '旧备注', third: '旧备注' },
    revisions: { first: 1, second: 2, third: 2 },
  }

  const pending = reconcileOperatorAnnotations(remote, local, new Set(['first']))
  assert.deepEqual(pending.statuses, { first: 'graduated', second: 'graduated', third: 'graduated' })
  assert.deepEqual(pending.remarks, { first: '', second: '旧备注', third: '新备注' })
  assert.deepEqual(pending.revisions, { first: 1, second: 2, third: 3 })

  const settled = reconcileOperatorAnnotations(remote, local, new Set())
  assert.deepEqual(settled.statuses, { first: 'growing', second: 'graduated', third: 'graduated' })

  const beforeFirstSave = reconcileOperatorAnnotations(
    { statuses: {}, remarks: {}, revisions: {} },
    { statuses: { first: 'graduated' }, remarks: {}, revisions: { first: 0 } },
    new Set(['first']),
  )
  assert.equal(beforeFirstSave.statuses.first, 'graduated')
})
