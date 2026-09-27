import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOperatorV2BrowserPreview } from '../src/utils/operatorV2ImportPreview.js'

const document = {
  format: 'myshare-operator-exchange', version: 2,
  accounts: [{ id: 'from', name: '来源' }],
  records: [{ account_id: 'from', record_id: 'r1', snapshot_scope: 'full', entries: [{ id: 'a', name: '甲' }] }],
}

test('v2 预览显示涉及条目及全量快照覆盖范围，提交目标与来源保持分离', () => {
  const preview = buildOperatorV2BrowserPreview(document, 'target', { a: {}, b: {} })
  assert.equal(preview.recordCount, 1)
  assert.equal(preview.fullCount, 1)
  assert.equal(preview.overlapCount, 1)
  assert.equal(preview.possibleRemovedCount, 1)
  assert.deepEqual(preview.entries, [{ id: 'a', name: '甲' }])
  assert.equal(preview.document.records[0].account_id, 'target')
  assert.equal(document.records[0].account_id, 'from')
})

test('v2 预览拒绝多来源与不匹配的记录账号', () => {
  assert.throws(() => buildOperatorV2BrowserPreview({ ...document, accounts: [{ id: 'from' }, { id: 'other' }] }, 'target', {}), /一个来源账号/)
  assert.throws(() => buildOperatorV2BrowserPreview({ ...document, records: [{ ...document.records[0], account_id: 'other' }] }, 'target', {}), /来源账号不一致/)
})
