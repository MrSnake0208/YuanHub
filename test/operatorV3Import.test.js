import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOperatorV3BrowserRequest,
  isOperatorV3Document,
  normalizeOperatorV3ImportResponse,
  operatorV3CommittableCount,
  operatorScanReviewDraft,
  isOperatorScanReviewDraft
} from '../src/utils/operatorV3Import.js'

test('v3 浏览器导入使用 account_mapping，不改写来源文档', function () {
  const document = {
    format: 'myshare-operator-exchange',
    version: 3,
    accounts: [{ id: 'scan-local', name: '扫描账号' }],
    records: [{ account_id: 'scan-local' }]
  }
  const body = buildOperatorV3BrowserRequest(document, 'acc-cloud', true)
  assert.deepEqual(body.account_mapping, { 'scan-local': 'acc-cloud' })
  assert.equal(body.confirm_review, true)
  assert.equal(body.document, document)
  assert.equal(document.records[0].account_id, 'scan-local')
})

test('待复核修正稿只包含目标密探，使用新的幂等记录 ID', function () {
  const document = {
    format: 'myshare-operator-exchange', version: 3,
    records: [{ record_id: 'scan:old', entries: [{ operator_id: 'op1', level: 90 }, { operator_id: 'op2', level: 1 }] }]
  }
  const draft = operatorScanReviewDraft(document, 'op1', 'review:new')
  assert.equal(draft.records[0].record_id, 'review:new')
  assert.deepEqual(draft.records[0].entries, [{ operator_id: 'op1', level: 90 }])
  assert.equal(document.records[0].record_id, 'scan:old')
  assert.equal(document.records[0].entries.length, 2)
  assert.equal(isOperatorScanReviewDraft({ draftRecordId: 'review:new' }, draft), true)
  assert.equal(isOperatorScanReviewDraft({ draftRecordId: 'scan:old' }, draft), false)
  assert.equal(isOperatorScanReviewDraft({ draftRecordId: 'review:new' }, document), false)
  assert.throws(() => operatorScanReviewDraft(document, 'missing', 'review:new'), /缺少对应密探/)
})

test('当前单账号面板拒绝把多个来源账号合并到一个目标', function () {
  assert.throws(function () {
    buildOperatorV3BrowserRequest({
      format: 'myshare-operator-exchange',
      version: 3,
      accounts: [{ id: 'a' }, { id: 'b' }]
    }, 'target', false)
  }, /一次只支持一个来源账号/)
})

test('v3 响应兼容 snake_case 和 camelCase', function () {
  const normalized = normalizeOperatorV3ImportResponse({
    accepted: 1,
    partial: 1,
    items: [{
      operator_id: 'char_1',
      blocking_errors: [{ code: 'bad', message: '错误' }],
      target_revision: 3
    }]
  })
  assert.equal(isOperatorV3Document({ format: 'myshare-operator-exchange', version: 3 }), true)
  assert.equal(normalized.items[0].operatorId, 'char_1')
  assert.equal(normalized.items[0].blockingErrors[0].code, 'bad')
  assert.equal(normalized.items[0].targetRevision, 3)
  assert.equal(operatorV3CommittableCount(normalized), 2)
})
