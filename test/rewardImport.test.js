import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRewardDocument, parseRewardReport, validateRewardTime } from '../src/data/inventory/rewardImport.js'

const entities = [
  { entity_type: 'item', id: 'jizhi', name: '鸡炙' },
  { entity_type: 'item', id: 'baijinbi', name: '白金币' },
  { entity_type: 'agent', id: 'char_lvmeng', name: '吕蒙' },
]
function block({ id = 'myshare:dispatch-1', account, channel = '派遣-洛阳', stamina = 72, status = '自动上报失败（网络连接失败）', type = '奖励增量', entries = '道具：\n  鸡炙 × 8\n  白金币 × 20', time = '2026-09-14T15:42:56.071+08:00', reference } = {}) {
  return [
    '========== MaaYuan 库存记录 ==========', `时间：${time}`, `渠道：${channel}`, `类型：${type}`,
    ...(stamina === undefined || stamina === null ? [] : [`消耗体力：${stamina}`]),
    ...(account ? [`子账号ID：${account}`] : []), `上报状态：${status}`, '', entries, '',
    '以下内容供导入工具使用，无需修改：',
    '#@MaaYInventoryRefV2 ' + JSON.stringify(reference || { r: [id], ...(account ? { a: account } : {}), ...(stamina == null ? {} : { c: stamina }) }),
    '========== 记录结束 ==========', '',
  ].join('\n')
}
const parse = source => parseRewardReport(source, 'acc_demo', entities)

test('恢复失败的道具派遣、心纸派遣和据点情报，保留原 ID、时间与体力，绑定缺失账号', () => {
  const source = '\uFEFF' + [
    block(),
    block({ id: 'myshare:dispatch-2', channel: '派遣-寿春', stamina: 70, entries: '密探：\n  吕蒙 × 1' }),
    block({ id: 'myshare:base-3', channel: '据点情报', stamina: null, entries: '密探：\n  吕蒙 × 2' }),
  ].join('\n').replaceAll('\n', '\r\n')
  const preview = parse(source)
  assert.equal(preview.rows.length, 3)
  assert.ok(preview.rows.every(row => row.selected && !row.error))
  const doc = buildRewardDocument(preview.rows.map(row => row.record), 'acc_demo', entities, '2026-09-14T09:00:00Z')
  assert.deepEqual(doc.records.map(record => record.record_id), ['myshare:dispatch-1', 'myshare:dispatch-2', 'myshare:base-3'])
  assert.equal(doc.records[0].effective_at, '2026-09-14T15:42:56.071+08:00')
  assert.deepEqual(doc.records.map(record => record.stamina_cost), [72, 70, undefined])
  assert.ok(doc.records.every(record => record.account_id === 'acc_demo' && record.record_type === 'reward_delta' && !('snapshot_scope' in record)))
  assert.deepEqual(doc.records[0].entries, [{ id: 'jizhi', name: '鸡炙', count: 8 }, { id: 'baijinbi', name: '白金币', count: 20 }])
})

test('成功记录不默认选择，快照明确跳过，不因补录转换为奖励', () => {
  const preview = parse(block({ status: '自动上报成功（HTTP 200）' }) + block({ type: '库存快照' }))
  assert.equal(preview.skipped, 1)
  assert.equal(preview.rows.length, 1)
  assert.equal(preview.rows[0].selected, false)
})

test('混合报告按生成端顺序还原多个 ID，不能错配道具和心纸', () => {
  const preview = parse(block({ entries: '密探：\n  吕蒙 × 1\n\n道具：\n  鸡炙 × 2', reference: { r: ['myshare:mixed:agent', 'myshare:mixed:item'], c: 72 } }))
  assert.deepEqual(preview.rows.map(row => [row.record.record_id, row.record.entity_type]), [['myshare:mixed:agent', 'agent'], ['myshare:mixed:item', 'item']])
})

test('账号不符、体力不符、未知名称、歧义名称和截断文本不可导入', () => {
  for (const source of [
    block({ account: 'acc_other' }),
    block({ account: 'acc_demo', reference: { r: ['id'], a: 'acc_other', c: 72 } }),
    block({ reference: { r: ['id'], c: 80 } }),
    block({ entries: '道具：\n  未知物品 × 1' }),
    block().replace('========== 记录结束 ==========', ''),
    block().replace('#@MaaYInventoryRefV2 ', '#broken '),
    block({ reference: { r: [] } }),
    block({ stamina: null }),
  ]) {
    const preview = parse(source)
    assert.ok(preview.rows[0].error, source)
    assert.equal(preview.rows[0].selected, false)
  }
  const ambiguous = parseRewardReport(block(), 'acc_demo', [...entities, { entity_type: 'item', id: 'other', name: '鸡炙' }])
  assert.match(ambiguous.rows[0].error, /多个匹配/)
})

test('损坏混合块整体拦截，同时保留其他有效记录供选择', () => {
  const preview = parse(block({ entries: '密探：\n  吕蒙 × 1\n道具：\n  未知 × 1', reference: { r: ['agent', 'item'], c: 72 } }) + block())
  assert.equal(preview.rows.length, 2)
  assert.ok(preview.rows[0].error)
  assert.equal(preview.rows[1].selected, true)
})

test('同 ID 再次出现时不可勾选；提交也拒绝重复 ID', () => {
  const preview = parse(block() + block())
  assert.equal(preview.rows[0].selected, true)
  assert.match(preview.rows[1].error, /重复/)
  assert.throws(() => buildRewardDocument(preview.rows.map(row => row.record), 'acc_demo', entities), /重复/)
})

test('协议范围、时间、空奖励和重复条目校验阻止错误补录', () => {
  const record = parse(block()).rows[0].record
  for (const count of [0, -1, 1.5, 2147483648, NaN, '8']) {
    assert.throws(() => buildRewardDocument([{ ...record, entries: [{ id: 'jizhi', count }] }], 'acc_demo', entities), /数量/)
  }
  assert.throws(() => buildRewardDocument([{ ...record, entries: [] }], 'acc_demo', entities), /至少/)
  assert.throws(() => buildRewardDocument([{ ...record, entries: [record.entries[0], record.entries[0]] }], 'acc_demo', entities), /重复/)
  assert.throws(() => buildRewardDocument([{ ...record, acquisition_channel: '据点情报' }], 'acc_demo', entities), /仅派遣/)
  assert.throws(() => buildRewardDocument([{ ...record, snapshot_scope: 'listed' }], 'acc_demo', entities), /快照/)
  assert.throws(() => buildRewardDocument([record], '', entities), /子账号/)
  assert.throws(() => buildRewardDocument([], 'acc_demo', entities), /1 至 1000/)
  assert.throws(() => buildRewardDocument(Array(1001).fill(record), 'acc_demo', entities), /1 至 1000/)
  for (const time of ['2026-09-14T15:42:56', '2026-02-30T15:42:56Z', '2026-09-14T25:00:00Z', 'nonsense']) assert.throws(() => validateRewardTime(time))
  assert.equal(validateRewardTime('2026-09-14T15:42:56.071+08:00'), record.effective_at)
})

test('v2 JSON 保留原奖励正文，未知状态不默认勾选，拒绝其他协议', () => {
  const record = parse(block()).rows[0].record
  const document = buildRewardDocument([record], 'acc_demo', entities)
  const preview = parse(JSON.stringify(document))
  assert.deepEqual(preview.rows[0].record, record)
  assert.equal(preview.rows[0].selected, false)
  assert.deepEqual(buildRewardDocument([preview.rows[0].record], 'acc_demo', entities, document.exported_at), document)
  assert.throws(() => parse(JSON.stringify({ ...document, version: 1 })), /v2/)
  assert.throws(() => parse(JSON.stringify({ ...document, user_id: 'u' })), /user_id/)
})
