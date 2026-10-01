import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { progressFromRemaining, fromWindowPositions, csvCell, integer, recruitmentCsv, operatorCatalogEntries, poolAgentOptions, resolveRecruitmentAgent } from '../src/pages/recruitment/rules.js'

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

test('真实图鉴 contract 拒绝数组或缺失 operators，不修改共享 operator API', () => {
  const operators = [{ id: 'official', name: '正式绝密', rarity: 5, games: ['代号鸢'] }]
  assert.equal(operatorCatalogEntries({ format: 'myshare-operator-catalog', catalog_version: 'v1', operators }), operators)
  for (const data of [operators, {}, null, { operators: null }]) assert.throws(() => operatorCatalogEntries(data), /公共密探图鉴响应无效/)
})

test('CSV用同池稳定UP身份解释最新绑定，保留原始快照、计数和公式转义', () => {
  const pools = [{ pool_id: 'personal-a', snapshot: { name: '旧池', up_agents: [{ id: 'catalog:up:1', name: '旧占位' }] }, mapped_snapshot: { name: '管理员池', up_agents: [{ id: 'catalog:up:1', name: '=正式密探', operator_id: 'official', active: false }] }, progress: 0 }]
  const event = { event_id: 'record-a', pool_id: 'personal-a', pool_snapshot: { name: '原始池' }, agent_snapshot: { agent_id: 'catalog:up:1', name: '原始占位' }, pull_span: 17, up_status: 'up', acquired_date: '2026-10-01', note: '原始备注', source: 'manual' }
  const fallback = { ...event, event_id: 'fallback', pool_id: 'other-pool', agent_snapshot: { agent_id: 'catalog:up:1', name: '另一池原名' }, pull_span: null }
  const csv = recruitmentCsv({ accountId: 'account', accountName: '账号', game: '如鸢', baseline: 0, pools, events: [event, fallback], batches: [] })
  assert.ok(csv.includes('"record-a","原始池","\'=正式密探","17","17","","up","2026-10-01","原始备注","manual"'))
  assert.ok(csv.includes('"fallback","原始池","另一池原名","",""'))
  assert.equal(event.agent_snapshot.name, '原始占位')
  assert.equal(event.pull_span, 17)
})
test('本池 active 槽可选而其他池和退役槽不可新增，真实映射只改变信息不改变身份', () => {
  const pool = { snapshot: { catalog_pool_id: 'catalog-a' } }
  const catalog = [{ pool_id: 'catalog-a', up_agents: [{ id: 'catalog-a:up:1', name: '占位1', operator_id: null, active: true }, { id: 'catalog-a:up:old', name: '退役', operator_id: null, active: false }] }, { pool_id: 'catalog-b', up_agents: [{ id: 'catalog-b:up:1', name: '另一池', active: true }] }]
  const operators = [{ id: 'formal', name: '正式绝密', avatar: '/formal.png' }, { id: 'non-up', name: '非UP' }]
  assert.deepEqual(poolAgentOptions(pool, catalog, operators).map(agent => agent.id), ['catalog-a:up:1', 'formal', 'non-up'])
  const event = { agent_snapshot: { agent_id: 'catalog-a:up:1', name: '原始占位' }, pull_span: 17 }
  catalog[0].up_agents[0].operator_id = 'formal'
  const resolved = resolveRecruitmentAgent(event, pool, catalog, operators)
  assert.equal(resolved.id, 'catalog-a:up:1'); assert.equal(resolved.name, '正式绝密'); assert.equal(resolved.avatar, '/formal.png'); assert.equal(event.agent_snapshot.name, '原始占位'); assert.equal(event.pull_span, 17)
  assert.deepEqual(poolAgentOptions(pool, catalog, operators).map(agent => agent.id), ['catalog-a:up:1', 'non-up'])
})
