import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('账号事件流仅在断线重连时触发页面补读', () => {
  const store = source('../src/store/accountEvents.js')
  assert.match(store, /let openCount = 0/)
  assert.match(store, /const reconnected = openCount > 0\s+openCount \+= 1/)
  assert.match(store, /account_stream_open.*account_id: accountId, reconnected/s)

  for (const file of [
    '../src/pages/operator/index.vue',
    '../src/pages/inventory/index.vue',
    '../src/components/operator/OperatorGrowthTracker.vue'
  ]) {
    const consumer = source(file)
    assert.match(consumer, /account_stream_open[\s\S]{0,120}!message\.data\?\.reconnected/)
  }
})
