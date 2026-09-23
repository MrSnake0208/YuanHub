import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDevServerConfig } from '../vite.config.js'

test('normal dev mode keeps LAN binding and does not proxy backend paths', () => {
  const config = buildDevServerConfig('development', {})

  assert.equal(config.host, true)
  assert.equal(config.port, 5173)
  assert.equal(config.proxy, undefined)
  assert.ok(config.allowedHosts.includes('hubf.maayuan.fun'))
})

test('tunnel mode binds loopback, allowlists configured host and proxies backend paths', () => {
  const config = buildDevServerConfig('tunnel', {
    YUANHUB_TUNNEL_HOST: 'preview.example.com',
    YUANHUB_TUNNEL_API_TARGET: 'http://127.0.0.1:18080'
  })

  assert.equal(config.host, '127.0.0.1')
  assert.ok(config.allowedHosts.includes('preview.example.com'))

  for (const path of ['/v1', '/user', '/hub', '/open-api', '/avatar', '/ready', '/version']) {
    assert.equal(config.proxy[path].target, 'http://127.0.0.1:18080')
    assert.equal(config.proxy[path].changeOrigin, true)
  }
})
