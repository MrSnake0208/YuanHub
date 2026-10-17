import test from 'node:test'
import assert from 'node:assert/strict'
import { operatorScanReviewFixture } from '../test-support/operatorScanReviewFixtures.js'
import { buildOperatorReviewCorrection, operatorReviewCanClose, operatorReviewCurrentValue, operatorReviewDiagnostic, operatorReviewField, operatorReviewIssueText, operatorReviewRows, operatorReviewRowError, operatorReviewValueLabel } from '../src/utils/operatorScanReview.js'
import { normalizeOperatorV3ImportResponse, isOperatorScanReviewDraft } from '../src/utils/operatorV3Import.js'

test('安全：修正仅含显式确认的待核字段，可靠分区和其他密探绝不重传', () => {
  const { review, catalog, current, entry } = operatorScanReviewFixture()
  const original = JSON.stringify(review.document)
  review.document.accounts.push({ id: 'other-account', name: '其他合成账号' })
  review.document.records[0].entries.push({ operator_id: 'other', level: 1 })
  const rows = operatorReviewRows(review, catalog)
  assert.equal(rows.find(row => row.id === 'level').pending, false)
  assert.equal(buildOperatorReviewCorrection(review, rows, 'new', review.correctedAt, catalog, current), null)
  rows.find(row => row.id === 'level').included = true
  Object.assign(rows.find(row => row.id === 'huaji'), { included: true, value: { owned: true, stage: 13, awakened: null } })
  const draft = buildOperatorReviewCorrection(review, rows, 'new', review.correctedAt, catalog, current)
  assert.deepEqual(draft.records[0].entries, [{ operator_id: 'review-op', huaji: { owned: true, stage: 13, awakened: false } }])
  assert.equal(draft.records[0].snapshot_scope, 'listed')
  assert.equal(draft.records[0].source_kind, 'manual')
  assert.equal(draft.records[0].effective_at, review.correctedAt)
  assert.deepEqual(draft.accounts, [{ id: 'local-synthetic', name: '合成采集账号' }])
  assert.equal(entry.huaji.stage, null)
  review.document.records[0].entries.pop()
  review.document.accounts.pop()
  assert.equal(JSON.stringify(review.document), original)
})

test('未知值不补零、不拉满，隐密与 SP 复用化极上限', () => {
  const { review, catalog, current } = operatorScanReviewFixture('oddity')
  const rows = operatorReviewRows(review, catalog)
  const missing = rows.find(row => row.id === 'oddity-special')
  assert.equal(missing.value, '')
  assert.equal(operatorReviewValueLabel(missing.collected, missing.id, catalog), '未知')
  assert.equal(operatorReviewCurrentValue(missing, current, catalog), null)
  missing.included = true
  assert.throws(() => buildOperatorReviewCorrection(review, rows, 'new', review.correctedAt, catalog, current), /有效数值/)
  const huaji = rows.find(row => row.id === 'huaji')
  Object.assign(huaji, { included: true, value: { owned: true, stage: 25, awakened: null } })
  assert.match(operatorReviewRowError(huaji, rows, { rarity: 3 }, current), /合法星级/)
  huaji.value.stage = 2
  assert.match(operatorReviewRowError(huaji, rows, { ...catalog, spOf: 'base' }, current), /整星/)
  review.document.records[0].entries[0].huaji = null
  const unknown = operatorReviewRows(review, catalog).find(row => row.id === 'huaji')
  assert.deepEqual(unknown.value, { owned: null, stage: null, awakened: null })
})

test('奇闻超限与小数精度、非法命盘必须修正，部分奇闻只提交所选键', () => {
  const { review, catalog, current } = operatorScanReviewFixture('oddity')
  const rows = operatorReviewRows(review, catalog)
  const attack = rows.find(row => row.id === 'oddity-attack')
  attack.included = true
  assert.match(operatorReviewRowError(attack, rows, catalog, current), /上限 350/)
  attack.value = 350
  const doc = buildOperatorReviewCorrection(review, rows, 'new', review.correctedAt, catalog, current)
  assert.deepEqual(doc.records[0].entries[0].combat_stats, { oddities: { attack: { current: 350 } } })
  assert.equal(doc.records[0].entries[0].section_status.oddities, 'partial')
  const special = rows.find(row => row.id === 'oddity-special')
  Object.assign(special, { included: true, value: 1.23 })
  assert.match(operatorReviewRowError(special, rows, catalog, current), /一位小数/)
  const discFixture = operatorScanReviewFixture('disc')
  const discs = operatorReviewRows(discFixture.review, catalog).find(row => row.id === 'disc_loadouts')
  discs.included = true
  assert.match(operatorReviewRowError(discs, [discs], catalog, current), /图鉴/)
  discs.value[0].discs = [{ ot_name: '合成命盘甲' }]
  assert.equal(operatorReviewRowError(discs, [discs], catalog, current), '')
})

test('安全：部分成功、全部拒绝、旧回执或不匹配身份不能关闭原提醒', () => {
  const { review } = operatorScanReviewFixture()
  const document = { records: [{ record_id: 'review:synthetic', entries: [{ operator_id: 'review-op' }] }] }
  const response = normalizeOperatorV3ImportResponse({ accepted: 1, items: [{ account_id: review.account_id, operator_id: review.operator_id, record_id: 'review:synthetic', status: 'accepted' }] })
  assert.equal(operatorReviewCanClose(response, review, document, true), true)
  assert.equal(operatorReviewCanClose(response, review, document, false), false)
  for (const status of ['partial', 'review', 'rejected']) {
    assert.equal(operatorReviewCanClose({ ...response, items: [{ ...response.items[0], status }] }, review, document, true), false)
  }
  assert.equal(operatorReviewCanClose(normalizeOperatorV3ImportResponse({ accepted: 1 }), review, document, true), false)
  for (const key of ['accountId', 'operatorId', 'recordId']) assert.equal(operatorReviewCanClose({ ...response, items: [{ ...response.items[0], [key]: 'other' }] }, review, document, true), false)
  assert.equal(isOperatorScanReviewDraft(review, { records: [{ record_id: review.draftRecordId, entries: [{ operator_id: 'other' }] }] }), false)
})

test('安全：未知化极/觉醒不隐式清除现有已确认事实，显式改为未知仍可保留意图', () => {
  const { review, catalog, current } = operatorScanReviewFixture()
  const rows = operatorReviewRows(review, catalog)
  const huaji = rows.find(row => row.id === 'huaji')
  huaji.included = true
  current.huaji.awakened = true
  huaji.value.stage = 13
  let doc = buildOperatorReviewCorrection(review, rows, 'new', review.correctedAt, catalog, current)
  assert.deepEqual(doc.records[0].entries[0].huaji, { owned: true, stage: 13, awakened: true })
  huaji.awakenedEdited = true
  doc = buildOperatorReviewCorrection(review, rows, 'new', review.correctedAt, catalog, current)
  assert.equal(doc.records[0].entries[0].huaji.awakened, null)
  assert.equal(current.huaji.awakened, true)
})

test('中文原因保留未知服务端原意，脱敏诊断不包含身份、原文或自由文本', () => {
  const { review, catalog } = operatorScanReviewFixture('unsupported')
  review.warnings = [{ code: 'private value token', message: 'private text', field: 'private.account' }]
  review.document.accounts[0].name = 'private-name'
  assert.match(operatorReviewIssueText({ code: 'invalid_disc_loadout' }), /重新选择/)
  assert.equal(operatorReviewIssueText({ code: 'new_code', message: 'Keep this exact meaning' }), 'Keep this exact meaning')
  assert.equal(operatorReviewField({ field_path: 'combat_stats.oddities.special.current' }), 'oddity-special')
  const diagnostic = operatorReviewDiagnostic(review)
  for (const value of ['private', review.account_id, review.operator_id, review.record_id, 'local-synthetic']) assert.equal(diagnostic.includes(value), false)
  assert.equal(operatorReviewRows(review, catalog).find(row => row.id === 'equipment').supported, false)
})


test('突破可独立复核为未知或合法阶段，不重传历史观测', () => {
  const { review, catalog, current, entry } = operatorScanReviewFixture()
  entry.level = 90
  entry.level_breakthrough_stage = null
  entry.section_status.breakthrough = 'review'
  current.level = 90
  const rows = operatorReviewRows(review, catalog)
  const row = rows.find(item => item.kind === 'breakthrough')
  assert.equal(row.value, null)
  row.included = true
  for (const value of [null, 8, 9]) {
    row.value = value
    const doc = buildOperatorReviewCorrection(review, rows, 'new', review.correctedAt, catalog, current)
    assert.equal(doc.version, 5)
    assert.deepEqual(doc.records[0].entries[0], { operator_id: review.operator_id, level_breakthrough_stage: value })
  }
  row.value = 7
  assert.match(operatorReviewRowError(row, rows, catalog, current), /不匹配/)
})
