import test from 'node:test'
import assert from 'node:assert/strict'
import { replaceStarExchange } from '../src/api/starExchange.js'

test('replacement exchange posts its one atomic body to the dedicated endpoint', async function () {
  const previousFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async function (url, options) {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ status_code: 200, data: { inventory: { revision: 1 }, workspace: { revision: 1 } } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const body = { account_id: 'account one', inventory: { expected_revision: 0, entries: [] }, workspace: { expected_revision: 0, plan_targets: {}, bag: {}, experience: {} } }
    await replaceStarExchange(body)
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /\/v1\/star-exchange\/replace$/)
    assert.equal(calls[0].options.method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].options.body), body)
  } finally { globalThis.fetch = previousFetch }
})
