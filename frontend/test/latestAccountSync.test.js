import test from 'node:test'
import assert from 'node:assert/strict'
import { createLatestAccountSync } from '../src/pages/star/latestAccountSync.js'

function deferred() {
  let resolve
  return { promise: new Promise(done => { resolve = done }), resolve }
}

test('rapid account switches serialize and only the latest completion may commit', async function () {
  const started = deferred(), gate = deferred(), events = []
  const sync = createLatestAccountSync()
  const first = sync(async isLatest => {
    events.push('a:start')
    started.resolve()
    await gate.promise
    if (isLatest()) events.push('a:commit')
  })
  await started.promise
  const second = sync(async isLatest => {
    events.push('b:start')
    if (isLatest()) events.push('b:commit')
  })

  gate.resolve()
  assert.deepEqual(await Promise.all([first, second]), [false, true])
  assert.deepEqual(events, ['a:start', 'b:start', 'b:commit'])
})
