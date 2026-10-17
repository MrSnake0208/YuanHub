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


test('v4浏览器往返保留owned未知stage和独立awake及raw/source', () => {
  for (const awakened of [true, false, null]) {
    const source = { format: 'myshare-operator-exchange', version: 4, accounts: [{ id: 'local' }], records: [{ record_id: 'backup', account_id: 'local', entries: [{ operator_id: 'op', huaji: { owned: true, stage: null, awakened }, huaji_legacy: { raw: 31, source: 'legacy_current' } }, { operator_id: 'missing', level: 90 }] }] }
    const document = JSON.parse(JSON.stringify(source))
    const body = buildOperatorV3BrowserRequest(document, 'target', false)
    assert.deepEqual(JSON.parse(JSON.stringify(body.document)), source)
    assert.equal('huaji' in body.document.records[0].entries[1], false)
    const review = operatorScanReviewDraft(body.document, 'op', 'review')
    assert.deepEqual(review.records[0].entries[0], source.records[0].entries[0])
    assert.equal(body.document.records[0].record_id, 'backup')
  }
})


test('v5读取保留独立突破与采集时未知，不改旧v4语义', () => {
  const document = { format: 'myshare-operator-exchange', version: 5, accounts: [{ id: 'local' }], records: [{ account_id: 'local', entries: [{ operator_id: 'op', level: 90, level_breakthrough_stage: 9, combat_stats: { observed_inputs: { level: 90, level_breakthrough_stage: null } } }] }] }
  assert.equal(isOperatorV3Document(document), true)
  const request = buildOperatorV3BrowserRequest(document, 'account', false)
  assert.deepEqual(request.document, document)
  assert.equal(request.document.records[0].entries[0].combat_stats.observed_inputs.level_breakthrough_stage, null)
})
