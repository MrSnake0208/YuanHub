import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { progressFromRemaining, fromWindowPositions, csvCell, integer, recruitmentCsv } from '../src/pages/recruitment/rules.js'

test('手填剩余次数按40抽口径换算，拒绝小数和范围外数据', () => {
  assert.equal(progressFromRemaining(19), 21)
  assert.equal(progressFromRemaining(40), 0)
  assert.equal(progressFromRemaining(1), 39)
  for (const value of [0, 41, 1.5, '', 'word']) assert.throws(() => progressFromRemaining(value))
  assert.equal(integer('', '进度', { nullable: true }), null)
})
test('120抽窗口首条不伪造间隔，后续位置差与尾抽有确定值', () => {
  const value = fromWindowPositions([{ agent_id: 'a', position: 17 }, { agent_id: 'b', position: 48 }, { agent_id: 'c', position: 65 }], 120, false, '')
  assert.deepEqual(value.entries.map(entry => entry.pull_span), [null, 31, 17])
  assert.equal(value.tail_progress, 55)
  assert.equal(fromWindowPositions([{ agent_id: 'a', position: 17 }], 120, true, 9).entries[0].pull_span, 26)
  assert.throws(() => fromWindowPositions([{ agent_id: 'a', position: 17 }, { agent_id: 'b', position: 16 }], 120, false, ''))
  assert.throws(() => fromWindowPositions([{ agent_id: 'a', position: 121 }], 120, false, ''))
})
test('CSV转义引号、换行和电子表格公式，不把未知抽数变成零', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"')
  assert.equal(csvCell(' \t@formula'), '"\' \t@formula"')
  assert.equal(csvCell('卡池"甲'), '"卡池""甲"')
  assert.equal(csvCell('第一行\n第二行'), '"第一行\n第二行"')
  assert.equal(csvCell(null), '""')
})

test('完整CSV保留baseline/进度/批次/结果组成，批次内span及删除记录不重复贡献累计', () => {
  const csv = recruitmentCsv({ accountId: 'synthetic', accountName: '=公式账号', game: '代号鸢', baseline: 100, pools: [{ pool_id: 'pool', snapshot: { name: '池' }, progress: null }], batches: [{ batch_id: 'batch', pool_id: 'pool', total_pull_count: 120 }], events: [{ event_id: 'result', pool_id: 'pool', pool_snapshot: { name: '池' }, agent_snapshot: { name: '甲' }, pull_span: 31, batch_id: 'batch' }, { event_id: 'deleted', pool_snapshot: { name: '池' }, agent_snapshot: { name: '乙' }, pull_span: 17, deleted_at: '2026-10-01' }] })
  assert.match(csv, /"baseline"[^\r\n]+"100","100"/)
  assert.match(csv, /"pool_state"[^\r\n]+"pool","池","","","",""/)
  assert.match(csv, /"batch"[^\r\n]+"120","120"/)
  assert.match(csv, /"event"[^\r\n]+"result","池","甲","31","0"/)
  assert.match(csv, /"event"[^\r\n]+"deleted","池","乙","17","0"/)
  assert.ok(csv.includes('"\'=公式账号"'))
})
