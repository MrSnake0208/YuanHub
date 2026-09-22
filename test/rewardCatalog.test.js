import { installBetaAccessFixture } from '../test-support/betaContractFixture.js'
installBetaAccessFixture()
import test from 'node:test'
import assert from 'node:assert/strict'
import { getRewardCatalog } from '../src/api/rewardCatalog.js'
import { buildRewardCatalog } from '../src/data/inventory/rewardCatalog.js'
import { buildRewardDocument, parseRewardReport } from '../src/data/inventory/rewardImport.js'
import { removeOrphanOperatorCurrent } from '../src/api/operator.js'

const inventory = { entities: [
  { entity_type: 'item', id: 'baijinbi', name: '白金币', category: '货币' },
  { entity_type: 'agent', id: 'char_130_zhoutai', name: '周泰' },
  { entity_type: 'agent', id: 'char_129_chenlin', name: '陈琳' },
  { entity_type: 'agent', id: 'char_129_zhoutai', name: '周泰' },
  { entity_type: 'agent', id: 'char_130_chenlin', name: '陈琳' },
] }
const operators = { operators: [
  { id: 'char_129_zhoutai', name: '周泰', rarity: 5, games: ['代号鸢'] },
  { id: 'char_130_chenlin', name: '陈琳', rarity: 5, games: ['代号鸢'] },
] }
const report = `========== MaaYuan 库存记录 ==========
时间：2026-09-19T10:00:00+08:00
渠道：据点情报
类型：奖励增量
上报状态：自动上报失败
密探：
周泰 × 2
陈琳 × 1
#@MaaYInventoryRefV2 {"r":["myshare:original-1"]}
========== 记录结束 ==========`

test('删除后重建周泰和陈琳时，报告只匹配当前公共图鉴，保留原记录 ID 与数量', () => {
  assert.match(parseRewardReport(report, 'acc_alt', inventory.entities).rows[0].error, /多个匹配/)
  const catalog = buildRewardCatalog(inventory, operators)
  const preview = parseRewardReport(report, 'acc_alt', catalog)
  assert.equal(preview.rows[0].error, '')
  const document = buildRewardDocument(preview.rows.map(row => row.record), 'acc_alt', catalog)
  assert.equal(document.records[0].record_id, 'myshare:original-1')
  assert.deepEqual(document.records[0].entries, [
    { id: 'char_129_zhoutai', name: '周泰', count: 2 },
    { id: 'char_130_chenlin', name: '陈琳', count: 1 },
  ])
  assert.deepEqual(catalog[0], inventory.entities[0])
  assert.equal(catalog[1].rarity, 5)
  assert.equal(inventory.entities.length, 5)
})

test('公共图鉴里的真实同名仍报歧义；JSON 携带旧 ID 不会按名称自动迁移', () => {
  const catalog = buildRewardCatalog(inventory, operators)
  const ambiguous = buildRewardCatalog(inventory, { operators: [...operators.operators, { id: 'char_131_zhoutai', name: '周泰' }] })
  assert.match(parseRewardReport(report, 'acc_alt', ambiguous).rows[0].error, /多个匹配/)
  const record = parseRewardReport(report, 'acc_alt', catalog).rows[0].record
  assert.throws(() => buildRewardDocument([{ ...record, entries: [{ id: 'char_130_zhoutai', name: '周泰', count: 2 }] }], 'acc_alt', catalog), /无法识别奖励/)
})

test('公共图鉴空数组是有效结果；响应缺失或重复 ID 时不退回旧目录', () => {
  assert.deepEqual(buildRewardCatalog(inventory, { operators: [] }), [inventory.entities[0]])
  for (const value of [null, {}, { operators: null }, { operators: [operators.operators[0], operators.operators[0]] }]) {
    assert.throws(() => buildRewardCatalog(inventory, value), /公共图鉴/)
  }
})

test('奖励目录读取两个公开接口，每次调用取得最新图鉴，不请求子账号养成', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  let current = operators
  globalThis.fetch = async url => {
    calls.push(String(url))
    const data = url === '/v1/operator/catalog' ? current : inventory
    return new Response(JSON.stringify({ status_code: 200, data }), { status: 200 })
  }
  try {
    assert.equal((await getRewardCatalog()).length, 3)
    current = { operators: [] }
    assert.equal((await getRewardCatalog()).length, 1)
    assert.deepEqual(calls.sort(), ['/v1/inventory/catalog', '/v1/inventory/catalog', '/v1/operator/catalog', '/v1/operator/catalog'])
    globalThis.fetch = async url => {
      if (url === '/v1/operator/catalog') throw new Error('图鉴离线')
      return new Response(JSON.stringify({ status_code: 200, data: inventory }), { status: 200 })
    }
    await assert.rejects(getRewardCatalog(), /图鉴离线/)
  } finally { globalThis.fetch = originalFetch }
})

test('旧养成清理使用当前子账号和完整 ID，复用登录鉴权', async () => {
  const originalFetch = globalThis.fetch
  let call
  globalThis.fetch = async (url, options) => {
    call = { url, options }
    return new Response(JSON.stringify({ status_code: 200, data: true }), { status: 200 })
  }
  try {
    assert.equal(await removeOrphanOperatorCurrent({ accountId: 'acc alt', operatorId: 'char_130_zhoutai' }), true)
    assert.equal(call.url, '/v1/operator/current/char_130_zhoutai?account_id=acc+alt')
    assert.equal(call.options.method, 'DELETE')
  } finally { globalThis.fetch = originalFetch }
})
