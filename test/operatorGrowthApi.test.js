import { installBetaAccessFixture } from '../test-support/betaContractFixture.js'
installBetaAccessFixture()
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  executeOperatorUpgrade,
  exportOperator,
  getOperatorAnnotations,
  getOperatorGrowthTargets,
  importOperator,
  previewOperatorImport,
  previewOperatorUpgrade,
  putOperatorAnnotation,
  putOperatorGrowthTarget
} from '../src/api/operator.js'

function success(data) {
  return Promise.resolve(new Response(JSON.stringify({ status_code: 200, data: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }))
}

test('密探主观数据与快捷提升 API 使用后端约定的路径、字段和幂等头', async function () {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async function (url, options) {
    calls.push({ url: String(url), options: options || {} })
    if (String(url).includes('/export')) {
      return new Response(JSON.stringify({ format: 'myshare-operator-exchange', version: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    return success({ items: [] })
  }

  try {
    await getOperatorAnnotations('acc one')
    await putOperatorAnnotation({ accountId: 'acc one', operatorId: 'char/1', annotation: { growth_state: 'active', expected_revision: 2 } })
    await getOperatorGrowthTargets('acc one')
    await putOperatorGrowthTarget({ accountId: 'acc one', operatorId: 'char/1', target: { star_level: 31, expected_revision: 4 } })
    await previewOperatorUpgrade({ accountId: 'acc one', game: '如鸢', operatorId: 'char/1', dimension: 'level', target: 75, expectedOperatorRevision: 7, skipBreakthroughMaterials: true })
    await executeOperatorUpgrade({ accountId: 'acc one', game: '如鸢', operatorId: 'char/1', dimension: 'level', target: 75, expectedOperatorRevision: 7, expectedInventoryRevision: 42, previewToken: 'token', idempotencyKey: 'uuid', skipBreakthroughMaterials: true })
    await exportOperator({ accountId: 'acc one', version: 3 })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.match(calls[0].url, /\/v1\/operator\/annotations\?account_id=acc\+one$/)
  assert.match(calls[1].url, /\/v1\/operator\/annotations\/char%2F1\?account_id=acc\+one$/)
  assert.deepEqual(JSON.parse(calls[1].options.body), { growth_state: 'active', expected_revision: 2 })
  assert.match(calls[2].url, /\/v1\/operator\/growth-targets\?account_id=acc\+one$/)
  assert.deepEqual(JSON.parse(calls[3].options.body), { star_level: 31, expected_revision: 4 })
  assert.deepEqual(JSON.parse(calls[4].options.body), {
    account_id: 'acc one', game: '如鸢', operator_id: 'char/1', dimension: 'level', target: 75,
    expected_operator_revision: 7, skip_breakthrough_materials: true
  })
  assert.equal(calls[5].options.headers['Idempotency-Key'], 'uuid')
  assert.deepEqual(JSON.parse(calls[5].options.body), {
    account_id: 'acc one', game: '如鸢', operator_id: 'char/1', dimension: 'level', target: 75,
    expected_operator_revision: 7, expected_inventory_revision: 42, preview_token: 'token',
    skip_breakthrough_materials: true
  })
  assert.match(calls[6].url, /\/v1\/operator\/export\?account_id=acc\+one&version=3$/)
})

test('暂缓弃置时阻止标注和原始/映射备份写入及预览，旧三态和仅备注仍可保存', async function () {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async function (url, options) {
    calls.push({ url: String(url), options })
    return success({ items: [{ operator_id: 'd', growth_state: 'discarded' }] })
  }
  const document = {
    format: 'myshare-operator-exchange', version: 3,
    records: [{ record_type: 'operator_annotation_snapshot', entries: [{ operator_id: 'd', growth_state: ' discarded ' }] }]
  }
  try {
    assert.throws(() => putOperatorAnnotation({ accountId: 'a', operatorId: 'd', annotation: { growth_state: 'discarded' } }), /已弃置暂未开放/)
    assert.throws(() => importOperator(document), /已弃置暂未开放/)
    assert.throws(() => importOperator({ document, account_mapping: { local: 'a' } }), /已弃置暂未开放/)
    assert.throws(() => previewOperatorImport({ document }), /已弃置暂未开放/)
    assert.equal(calls.length, 0)
    assert.equal(document.records[0].entries[0].growth_state, ' discarded ')
    const read = await getOperatorAnnotations('a')
    assert.equal(read.items[0].growth_state, 'discarded')
    for (const state of ['active', 'graduated', 'skip']) {
      await putOperatorAnnotation({ accountId: 'a', operatorId: 'd', annotation: { growth_state: state, expected_revision: 1 } })
    }
    await putOperatorAnnotation({ accountId: 'a', operatorId: 'd', annotation: { note: '保留状态', expected_revision: 2 } })
    assert.deepEqual(calls.slice(1, 4).map(call => JSON.parse(call.options.body).growth_state), ['active', 'graduated', 'skip'])
    assert.deepEqual(JSON.parse(calls[4].options.body), { note: '保留状态', expected_revision: 2 })
    const oldDocument = { ...document, records: [{ entries: [{ operator_id: 'd', growth_state: 'skip' }] }] }
    await previewOperatorImport({ document: oldDocument })
    await importOperator({ document: oldDocument })
    await importOperator({ format: 'myshare-operator-exchange', version: 2, records: [{ entries: [{ id: 'd', level: 90 }] }] })
    assert.equal(calls.length, 8)
  } finally {
    globalThis.fetch = originalFetch
  }
})
