import { installBetaAccessFixture } from '../test-support/betaContractFixture.js'
installBetaAccessFixture()
import test from 'node:test'
import assert from 'node:assert/strict'
import { getCurrentOperatorPanels, previewOperatorPanel } from '../src/api/operator.js'
import { auth } from '../src/store/auth.js'

test('panel uses authenticated POST and splits a full catalog into bounded batches', async () => {
  const previousFetch = globalThis.fetch, previousToken = auth.accessToken, calls = []
  auth.accessToken = 'panel-test-token'
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body)
    calls.push({ url, options, body })
    const data = body.operator_ids ? Object.fromEntries(body.operator_ids.map(id => [id, { status: 'calculated', hp: 123, attack: 45 }])) : { status: 'incomplete' }
    return new Response(JSON.stringify({ status_code: 200, data }), { headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const ids = Array.from({ length: 121 }, (_, i) => 'op' + i)
    const result = await getCurrentOperatorPanels('account-a', ids)
    assert.equal(Object.keys(result).length, 121)
    assert.deepEqual(calls.map(call => call.body.operator_ids.length), [100, 21])
    assert.ok(calls.every(call => call.url === '/v1/operator/panel/current' && call.body.account_id === 'account-a'))
    assert.deepEqual(await getCurrentOperatorPanels('account-a', []), {})
    const draft = { account_id: 'account-a', operator_id: 'op0' }
    await previewOperatorPanel(draft)
    assert.equal(calls[2].url, '/v1/operator/panel/preview')
    assert.deepEqual(calls[2].body, draft)
    assert.ok(calls.every(call => call.options.method === 'POST' && call.options.headers.Authorization === 'Bearer panel-test-token'))
  } finally { globalThis.fetch = previousFetch; auth.accessToken = previousToken }
})
