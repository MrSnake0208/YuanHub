import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStarCaptureHost, createStarCaptureInbox, createStarCaptureLifecycle, importAndMarkStarCapture, STAR_CAPTURE_LIFECYCLE_KEY } from '../src/pages/star/starCaptureLifecycle.js'

function storage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('imported marker survives reload and suppresses pending, route and repeated events', () => {
  const backing = storage()
  const first = createStarCaptureLifecycle(backing, () => 123)
  first.markImported('A', 'M1')
  const restored = createStarCaptureLifecycle(backing)
  assert.deepEqual(restored.get('A'), { accountId: 'A', captureId: 'M1', state: 'imported', updatedAt: 123 })
  for (const source of ['pending', 'route', 'sse']) {
    assert.equal(restored.captureAction('A', 'M1'), 'imported', source)
  }
})

test('new capture replaces the same account marker only after async import succeeds', async () => {
  const lifecycle = createStarCaptureLifecycle(storage())
  lifecycle.markImported('A', 'M1')
  const gate = deferred()
  const work = importAndMarkStarCapture({ lifecycle, accountId: 'A', captureId: 'M2', importCapture: () => gate.promise, isCurrent: () => true })
  assert.equal(lifecycle.get('A').captureId, 'M1')
  gate.resolve(true)
  assert.equal(await work, true)
  assert.equal(lifecycle.get('A').captureId, 'M2')
  assert.equal(lifecycle.captureAction('A', 'M2'), 'imported')
  assert.equal(lifecycle.captureAction('A', 'M1'), 'import')
})

test('failed or stale async import does not mark the wrong account', async () => {
  const lifecycle = createStarCaptureLifecycle(storage())
  const gate = deferred()
  let active = true
  const work = importAndMarkStarCapture({ lifecycle, accountId: 'A', captureId: 'M1', importCapture: () => gate.promise, isCurrent: () => active })
  active = false
  gate.resolve(true)
  assert.equal(await work, false)
  assert.equal(lifecycle.get('A'), null)
  await assert.rejects(importAndMarkStarCapture({ lifecycle, accountId: 'A', captureId: 'M1', importCapture: () => Promise.reject(new Error('import failed')), isCurrent: () => true }))
  assert.equal(lifecycle.get('A'), null)
})

test('commit persists consume_pending before consume, then clears matching marker', async () => {
  const lifecycle = createStarCaptureLifecycle(storage())
  lifecycle.markImported('A', 'M1')
  const seen = []
  const host = createStarCaptureHost({ lifecycle, consume: async (account, capture) => { seen.push([account, capture, lifecycle.get(account).state]) } })
  assert.equal(await host.onCaptureCommitted({ source: 'maayuan', accountId: 'A', captureId: 'M1', jobId: 'J1' }), true)
  assert.deepEqual(seen, [['A', 'M1', 'consume_pending']])
  assert.equal(lifecycle.get('A'), null)
})

test('network failure remains pending, suppresses import, and entry retry succeeds', async () => {
  const backing = storage()
  const lifecycle = createStarCaptureLifecycle(backing)
  const events = []
  let attempts = 0
  const host = createStarCaptureHost({ lifecycle, consume: async () => { if (++attempts === 1) throw Object.assign(new Error('offline'), { status: 503 }) }, onState: state => events.push(state.type) })
  assert.equal(await host.onCaptureCommitted({ source: 'maayuan', accountId: 'A', captureId: 'M1' }), false)
  assert.equal(lifecycle.captureAction('A', 'M1'), 'consume_pending')
  assert.ok(events.includes('failed'))
  const reloaded = createStarCaptureLifecycle(backing)
  assert.equal(reloaded.captureAction('A', 'M1'), 'consume_pending')
  assert.equal(await host.retry('A', 'M1'), true)
  assert.equal(lifecycle.get('A'), null)
})

test('404 and star_capture_not_found are terminal cleanup', async () => {
  for (const error of [{ status: 404 }, { status: 410, code: 'star_capture_not_found' }]) {
    const lifecycle = createStarCaptureLifecycle(storage())
    const host = createStarCaptureHost({ lifecycle, consume: async () => { throw error } })
    assert.equal(await host.onCaptureCommitted({ source: 'maayuan', accountId: 'A', captureId: 'M1' }), true)
    assert.equal(lifecycle.get('A'), null)
  }
})

test('401 and 403 retain durable retry state without throwing into OCR', async () => {
  for (const status of [401, 403]) {
    const lifecycle = createStarCaptureLifecycle(storage())
    const host = createStarCaptureHost({ lifecycle, consume: async () => { throw Object.assign(new Error('auth'), { status }) } })
    assert.equal(await host.onCaptureCommitted({ source: 'maayuan', accountId: 'A', captureId: 'M1' }), false)
    assert.equal(lifecycle.captureAction('A', 'M1'), 'consume_pending')
  }
})

test('repeated consume retries share one in-flight request', async () => {
  const lifecycle = createStarCaptureLifecycle(storage())
  lifecycle.markConsumePending('A', 'M1')
  const gate = deferred()
  let calls = 0
  const host = createStarCaptureHost({ lifecycle, consume: () => { calls += 1; return gate.promise } })
  const first = host.retry('A', 'M1')
  const second = host.retry('A', 'M1')
  assert.equal(calls, 1)
  gate.resolve()
  assert.equal(await first, true)
  assert.equal(await second, true)
})

test('old consume completion cannot clear a newer capture or emit its success', async () => {
  const lifecycle = createStarCaptureLifecycle(storage())
  const gate = deferred()
  const events = []
  const host = createStarCaptureHost({ lifecycle, consume: () => gate.promise, onState: state => events.push(state.type) })
  const work = host.onCaptureCommitted({ source: 'maayuan', accountId: 'A', captureId: 'M1' })
  lifecycle.markImported('A', 'M2')
  gate.resolve()
  assert.equal(await work, true)
  assert.equal(lifecycle.get('A').captureId, 'M2')
  assert.equal(events.includes('consumed'), false)
})

test('account records are isolated and callback uses its event account', async () => {
  const lifecycle = createStarCaptureLifecycle(storage())
  lifecycle.markImported('A', 'M1')
  lifecycle.markImported('B', 'B1')
  const calls = []
  const host = createStarCaptureHost({ lifecycle, consume: async (account, capture) => calls.push([account, capture]) })
  await host.onCaptureCommitted({ source: 'maayuan', accountId: 'A', captureId: 'M1' })
  assert.deepEqual(calls, [['A', 'M1']])
  assert.equal(lifecycle.get('B').captureId, 'B1')
  assert.equal(lifecycle.get('A'), null)
})

test('invalid event and explicit clear without callback do not consume', async () => {
  const lifecycle = createStarCaptureLifecycle(storage())
  lifecycle.markImported('A', 'M1')
  let calls = 0
  const host = createStarCaptureHost({ lifecycle, consume: async () => { calls += 1 } })
  assert.equal(await host.onCaptureCommitted({ source: 'manual', accountId: 'A', captureId: 'M1' }), false)
  assert.equal(lifecycle.captureAction('A', 'M1'), 'imported')
  assert.equal(calls, 0)
})

test('corrupt lifecycle storage resets safely', () => {
  const backing = storage()
  backing.setItem(STAR_CAPTURE_LIFECYCLE_KEY, '{broken')
  const lifecycle = createStarCaptureLifecycle(backing)
  assert.equal(lifecycle.get('A'), null)
  assert.equal(lifecycle.captureAction('A', 'M1'), 'import')
  lifecycle.markImported('A', 'M1')
  assert.equal(lifecycle.get('A').state, 'imported')
})

test('unavailable browser storage does not crash lifecycle reads', () => {
  const lifecycle = createStarCaptureLifecycle()
  assert.equal(lifecycle.get('A'), null)
  assert.equal(lifecycle.captureAction('A', 'M1'), 'import')
})

test('a late pending response or duplicate SSE cannot reimport after consume succeeds in the page', async () => {
  const lifecycle = createStarCaptureLifecycle(storage())
  const inbox = createStarCaptureInbox(lifecycle)
  lifecycle.markConsumePending('A', 'M1')
  const host = createStarCaptureHost({ lifecycle, consume: async () => {}, onState: state => {
    if (state.type === 'consumed') inbox.markConsumed(state.accountId, state.captureId)
  } })
  assert.equal(await host.retry('A', 'M1'), true)
  assert.equal(lifecycle.get('A'), null)
  for (const source of ['late pending', 'route', 'repeated SSE']) {
    assert.equal(inbox.captureAction('A', 'M1'), 'consumed', source)
  }
  assert.equal(inbox.captureAction('A', 'M2'), 'import')
  assert.equal(inbox.captureAction('B', 'M1'), 'import')
})
