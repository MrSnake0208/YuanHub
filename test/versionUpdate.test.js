import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MIN_VERSION_CHECK_GAP_MS,
  VERSION_CHECK_INTERVAL_MS,
  hasNewVersion,
  isVersionCheckEnabled,
  normalizeVersion
} from '../src/utils/versionCheck.js'
import { FALLBACK_PRODUCT_VERSION } from '../src/config/buildInfo.js'
import { getFrontendDeployMeta } from '../src/api/system.js'

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

async function withFetch(handler, run) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async function (url, options) {
    calls.push({ url, options })
    return handler(url, options)
  }
  try {
    return { value: await run(), calls }
  } finally {
    globalThis.fetch = original
  }
}

test('版本检查间隔为 60 秒且存在去重最小间隔', function () {
  assert.equal(VERSION_CHECK_INTERVAL_MS, 60000)
  assert.ok(MIN_VERSION_CHECK_GAP_MS > 0)
  assert.ok(MIN_VERSION_CHECK_GAP_MS < VERSION_CHECK_INTERVAL_MS)
})

test('normalizeVersion 去掉空白与可选 v 前缀，空值返回空串', function () {
  assert.equal(normalizeVersion(' 0.0.1-beta.4 '), '0.0.1-beta.4')
  assert.equal(normalizeVersion('v0.0.1-beta.4'), '0.0.1-beta.4')
  assert.equal(normalizeVersion('V0.0.1-beta.4'), '0.0.1-beta.4')
  assert.equal(normalizeVersion(''), '')
  assert.equal(normalizeVersion(null), '')
  assert.equal(normalizeVersion(undefined), '')
})

test('hasNewVersion 只在两端都存在且不同时为 true', function () {
  assert.equal(hasNewVersion('0.0.1-beta.4', '0.0.1-beta.5'), true)
  assert.equal(hasNewVersion('v0.0.1-beta.4', '0.0.1-beta.4'), false)
  assert.equal(hasNewVersion('0.0.1-beta.4', '0.0.1-beta.4'), false)
  assert.equal(hasNewVersion('', '0.0.1-beta.5'), false)
  assert.equal(hasNewVersion('0.0.1-beta.4', ''), false)
  assert.equal(hasNewVersion(undefined, '0.0.1-beta.5'), false)
  assert.equal(hasNewVersion('0.0.1-beta.4', null), false)
})

test('占位构建版本不参与比较，避免构建异常导致全站永久提示', function () {
  assert.equal(FALLBACK_PRODUCT_VERSION, '0.0.0-dev')
  assert.equal(hasNewVersion(FALLBACK_PRODUCT_VERSION, '0.0.1-beta.5'), false)
})

test('开发环境默认关闭，生产开启，可用显式变量覆盖', function () {
  assert.equal(isVersionCheckEnabled({ DEV: true, PROD: false }), false)
  assert.equal(isVersionCheckEnabled({ PROD: true }), true)
  assert.equal(isVersionCheckEnabled({ PROD: false, VITE_ENABLE_VERSION_CHECK: 'true' }), true)
  assert.equal(isVersionCheckEnabled({ PROD: true, VITE_ENABLE_VERSION_CHECK: 'false' }), false)
  assert.equal(isVersionCheckEnabled(undefined), false)
})

test('版本检测读取同源 deploy-meta.json，绕过缓存并携带超时 signal', async function () {
  const { value, calls } = await withFetch(
    function () {
      return jsonResponse({
        version: '0.0.1-beta.5',
        tag: 'v0.0.1-beta.5',
        commit: 'abc1234'
      })
    },
    function () {
      return getFrontendDeployMeta({ now: () => 123456 })
    }
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/deploy-meta.json?versionCheck=123456')
  assert.equal(calls[0].options.cache, 'no-store')
  assert.equal(calls[0].options.headers['Cache-Control'], 'no-cache')
  assert.ok(calls[0].options.signal, '应携带 AbortController signal 做超时保护')
  assert.deepEqual(value, {
    version: '0.0.1-beta.5',
    tag: 'v0.0.1-beta.5',
    commit: 'abc1234'
  })
})

test('deploy-meta 非 2xx 时抛错，版本检测 composable 负责静默降级', async function () {
  await withFetch(
    function () {
      return jsonResponse({ error: 'not ready' }, 503)
    },
    async function () {
      await assert.rejects(
        () => getFrontendDeployMeta({ now: () => 1 }),
        /HTTP 503/
      )
    }
  )
})
