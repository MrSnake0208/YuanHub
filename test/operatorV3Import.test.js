import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOperatorV3BrowserRequest,
  isOperatorV3Document,
  normalizeOperatorV3ImportResponse,
  operatorV3CommittableCount
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
