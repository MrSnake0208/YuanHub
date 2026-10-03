import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileOperatorAnnotations, operatorAnnotationStatus, operatorAnnotationApiState, operatorAnnotationStatusLabel, matchesOperatorStatus, operatorEditableStatusOptions, assertOperatorStateWriteEnabled } from '../src/utils/operatorAnnotations.js'

test('暂缓弃置只限制编辑和写入，仍能读取四态', () => {
  assert.deepEqual(operatorEditableStatusOptions().map(option => option.value), ['growing', 'graduated', 'inactive'])
  assert.throws(() => assertOperatorStateWriteEnabled('discarded'), /暂未开放/)
  for (const state of ['active', 'graduated', 'skip', undefined]) assert.doesNotThrow(() => assertOperatorStateWriteEnabled(state))
  assert.equal(operatorAnnotationStatusLabel('discarded'), '已弃置')
  assert.equal(operatorAnnotationApiState('discarded'), 'discarded')
})

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


test('四值双向映射，缺失默认，未知值保留并拒绝写入', () => {
  for (const [ui, api, label] of [
    ['growing', 'active', '养成中'], ['graduated', 'graduated', '已毕业'],
    ['inactive', 'skip', '养老中'], ['discarded', 'discarded', '已弃置'],
  ]) {
    assert.equal(operatorAnnotationStatus(api), ui)
    assert.equal(operatorAnnotationApiState(ui), api)
    assert.equal(operatorAnnotationStatusLabel(api), label)
  }
  for (const missing of [undefined, null, '']) assert.equal(operatorAnnotationStatus(missing), 'growing')
  for (const unknown of ['future', '__proto__', 'constructor']) {
    assert.equal(operatorAnnotationStatus(unknown), unknown)
    assert.match(operatorAnnotationStatusLabel(unknown), /不支持/)
    assert.throws(() => operatorAnnotationApiState(unknown), /不支持/)
    assert.equal(matchesOperatorStatus(unknown, 'registered'), false)
  }
  assert.equal(matchesOperatorStatus('discarded', 'registered'), false)
  assert.equal(matchesOperatorStatus('discarded', 'all'), true)
  assert.equal(matchesOperatorStatus('skip', 'registered'), true)
})

test('弃置缓存参与保存中及较新revision保护', () => {
  const remote = { statuses: { op: 'growing' }, remarks: { op: '备注' }, revisions: { op: 1 } }
  const local = { statuses: { op: 'discarded' }, remarks: { op: '备注' }, revisions: { op: 2 } }
  assert.equal(reconcileOperatorAnnotations(remote, local, new Set()).statuses.op, 'discarded')
  assert.equal(reconcileOperatorAnnotations(remote, local, new Set(['op'])).statuses.op, 'discarded')
  remote.statuses.op = 'inactive'; remote.revisions.op = 3
  assert.equal(reconcileOperatorAnnotations(remote, local, new Set()).statuses.op, 'inactive')
})
