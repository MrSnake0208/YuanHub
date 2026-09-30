import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRewardDocument, buildReportDocument, parseRewardReport, validateRewardTime } from '../src/data/inventory/rewardImport.js'

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
    '#@MaaYInventoryRefV2 ' + JSON.stringify(reference || { r: [id], ...(account ? { a: account } : {}), ...(stamina == null ? {} : { c: stamina }), ...(type === '库存快照' ? { s: 'listed' } : {}) }),
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

test('成功记录不默认选择，失败快照保留原类型并可补传', () => {
  const preview = parse(block({ status: '自动上报成功（HTTP 200）' }) + block({ id: 'myshare:snapshot', type: '库存快照', stamina: null, channel: '背包-物品' }))
  assert.equal(preview.rows.length, 2)
  assert.equal(preview.rows[0].selected, false)
  assert.equal(preview.rows[1].selected, true)
  assert.equal(preview.rows[1].error, '')
  assert.equal(preview.rows[1].record.record_type, 'stock_snapshot')
  assert.equal(preview.rows[1].record.snapshot_scope, 'listed')
  const document = buildReportDocument(preview.rows.map(row => row.record), 'acc_demo', entities)
  assert.deepEqual(document.records.map(record => record.record_type), ['reward_delta', 'stock_snapshot'])
  assert.throws(() => buildRewardDocument([preview.rows[1].record], 'acc_demo', entities), /仅支持奖励/)
})

test('三段背包 TXT 恢复三条快照，保留零值、原时间/ID/账号，只选失败的心纸', () => {
  const source = '\uFEFF' + [
    block({ id: 'myshare:bag-items', account: 'acc_demo', type: '库存快照', stamina: null, channel: '背包-物品', status: '自动上报成功（HTTP 200）', entries: '道具：\n  鸡炙 × 8\n  白金币 × 0' }),
    block({ id: 'myshare:bag-tools', account: 'acc_demo', type: '库存快照', stamina: null, channel: '背包-道具', status: '自动上报成功（HTTP 200）' }),
    block({ id: 'myshare:bag-agents', account: 'acc_demo', type: '库存快照', stamina: null, channel: '背包-心纸', entries: '密探：\n  吕蒙 × 4\n  周忠 × 0' }),
  ].join('\n').replaceAll('\n', '\r\n')
  const catalog = [...entities, { entity_type: 'agent', id: 'char_100_zhouzhong', name: '周忠', games: ['代号鸢'] }]
  const preview = parseRewardReport(source, 'acc_demo', catalog, '如鸢')
  assert.equal(preview.rows.length, 3)
  assert.ok(preview.rows.every(row => !row.error))
  assert.deepEqual(preview.rows.map(row => row.selected), [false, false, true])
  const document = buildReportDocument(preview.rows.map(row => row.record), 'acc_demo', catalog, '如鸢')
  assert.deepEqual(document.records.map(record => record.record_id), ['myshare:bag-items', 'myshare:bag-tools', 'myshare:bag-agents'])
  assert.ok(document.records.every(record => record.record_type === 'stock_snapshot' && record.snapshot_scope === 'listed' && record.account_id === 'acc_demo' && record.effective_at === '2026-09-14T15:42:56.071+08:00' && !('stamina_cost' in record)))
  assert.deepEqual(document.records[2].entries, [{ id: 'char_lvmeng', name: '吕蒙', count: 4 }, { id: 'char_100_zhouzhong', name: '周忠', count: 0 }])
  assert.equal(document.records[0].entries[1].count, 0)
})

test('快照继续拦截错误账号、无效范围、体力、未知名字和重复 ID', () => {
  const snapshot = { type: '库存快照', stamina: null, channel: '背包-物品' }
  for (const invalid of [
    { account: 'acc_other' },
    { reference: { r: ['id'] } },
    { reference: { r: ['id'], s: 'unknown' } },
    { reference: { r: ['id'], a: 'acc_other', s: 'listed' } },
    { stamina: 0 },
    { entries: '道具：\n  未知物品 × 0' },
    { entries: '道具：\n  鸡炙 × 0\n  鸡炙 × 1' },
    { entries: '道具：\n  鸡炙 × 2147483648' },
  ]) {
    const preview = parse(block({ ...snapshot, ...invalid }))
    assert.ok(preview.rows[0].error, JSON.stringify(invalid))
    assert.equal(preview.rows[0].selected, false)
  }
  const preview = parse(block(snapshot) + block(snapshot))
  assert.equal(preview.rows[0].error, '')
  assert.match(preview.rows[1].error, /重复/)
  assert.throws(() => buildReportDocument(preview.rows.map(row => row.record), 'acc_demo', entities), /重复/)
})

test('JSON full 空快照保留清空语义，listed 空快照拒绝；奖励零值仍拒绝', () => {
  const snapshot = { record_id: 'myshare:full', record_type: 'stock_snapshot', snapshot_scope: 'full', entity_type: 'item', effective_at: '2026-09-14T15:42:56.071+08:00', entries: [] }
  const document = buildReportDocument([snapshot], 'acc_demo', entities)
  const preview = parse(JSON.stringify(document))
  assert.equal(preview.rows[0].error, '')
  assert.equal(preview.rows[0].selected, false)
  assert.deepEqual(preview.rows[0].record, document.records[0])
  assert.throws(() => buildReportDocument([{ ...snapshot, snapshot_scope: 'listed' }], 'acc_demo', entities), /至少/)
  assert.throws(() => buildReportDocument([{ ...snapshot, record_type: 'reward_delta', snapshot_scope: undefined }], 'acc_demo', entities), /快照/)
  const reward = parse(block()).rows[0].record
  assert.throws(() => buildReportDocument([{ ...reward, entries: [{ id: 'jizhi', count: 0 }] }], 'acc_demo', entities), /数量/)
})

test('跨游戏密探仅允许快照补零，不删改原条目；非零快照与奖励都拒绝', () => {
  const catalog = [...entities, { entity_type: 'agent', id: 'char_100_zhouzhong', name: '周忠', games: ['代号鸢'] }]
  for (const [type, count, allowed] of [['库存快照', 0, true], ['库存快照', 1, false], ['奖励增量', 1, false], ['奖励增量', 0, false]]) {
    const preview = parseRewardReport(block({ type, stamina: null, channel: '背包-心纸', entries: `密探：\n  周忠 × ${count}` }), 'acc_demo', catalog, '如鸢')
    assert.equal(!preview.rows[0].error, allowed)
    if (allowed) {
      const document = buildReportDocument([preview.rows[0].record], 'acc_demo', catalog, '如鸢')
      assert.deepEqual(document.records[0].entries, [{ id: 'char_100_zhouzhong', name: '周忠', count: 0 }])
      assert.throws(() => buildReportDocument([{ ...preview.rows[0].record, entries: [{ id: 'char_100_zhouzhong', count: 1 }] }], 'acc_demo', catalog, '如鸢'), /不适用/)
    }
  }
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
