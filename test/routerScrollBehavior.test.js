import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollBehavior } from '../src/router/scrollBehavior.js'

const route = (name, patch = {}) => ({ name, hash: '', query: {}, ...patch })

test('calendar query navigation leaves scroll to the current selection', () => {
  for (const query of [{ date: '2026-10-15' }, { view: 'month' }, { scope: 'mine' }, {}]) {
    assert.equal(scrollBehavior(route('calendar', { query }), route('calendar')), false)
  }
})

test('calendar reminder links leave scroll to the data-ready item locator', () => {
  for (const event of ['pci_test', ['pci_test']]) {
    assert.equal(scrollBehavior(route('calendar', { query: { event } }), route('today')), false)
  }
  assert.deepEqual(scrollBehavior(route('calendar'), route('today')), { top: 0 })
  assert.deepEqual(scrollBehavior(route('calendar', { query: { event: '' } }), route('today')), { top: 0 })
})

test('saved history positions, hash links and other pages retain their scroll behavior', () => {
  const saved = { left: 12, top: 480 }
  assert.equal(scrollBehavior(route('calendar', { query: { event: 'pci_test' } }), route('calendar'), saved), saved)
  assert.deepEqual(scrollBehavior(route('calendar', { hash: '#detail' }), route('calendar'), saved), { el: '#detail', behavior: 'smooth', top: 0 })
  assert.deepEqual(scrollBehavior(route('today', { query: { event: 'any' } }), route('calendar')), { top: 0 })
  assert.deepEqual(scrollBehavior(route('inventory'), route('inventory')), { top: 0 })
})
