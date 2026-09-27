import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '../src/router/routes.js'

test('unknown and expired URLs resolve to the named 404 page', () => {
  const router = createRouter({ history: createMemoryHistory(), routes })
  for (const path of ['/no-such-page', '/old/expired?source=bookmark']) {
    const route = router.resolve(path)
    assert.equal(route.name, 'not-found')
    assert.match(route.meta.title, /页面未找到/)
  }
  assert.equal(router.resolve('/inventory').name, 'inventory')
  assert.equal(router.resolve('/beta').name, 'beta')
  assert.equal(router.resolve('/').name, 'today')
})
