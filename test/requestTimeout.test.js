// Case 5 / Case 6：普通 API 统一超时，以及 401 重放必须收敛。
import test from 'node:test'
import assert from 'node:assert/strict'
import { installAuthStorage } from '../test-support/authStorageFixture.js'
import {
  delay,
  hangingFetch,
  installFetch,
  jsonResponse,
  ok,
  unauthorized,
  withDeadline
} from '../test-support/fakeApiFetch.js'
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DOWNLOAD_REQUEST_TIMEOUT_MS,
  UPLOAD_REQUEST_TIMEOUT_MS,
  resolveRequestTimeoutMs
} from '../src/utils/requestTimeout.js'
import { getFrontendDeployMeta } from '../src/api/system.js'

const authStorage = installAuthStorage()
const { request } = await import('../src/api/request.js')
const { auth, setTokens } = await import('../src/store/auth.js')

const ACCESS_ME = '/v1/admin/access/me'
const ROLES_USERS = '/v1/admin/roles/users'
const REFRESH = '/user/refresh'

function freshTokens() {
  return { token: 'fresh-access', refresh_token: 'refresh-2', user_info: { id: 'u1' } }
}

test('Case 5：fetch 永不 resolve 时，超时 Abort 并 reject 一个可捕获的错误', async function () {
  const previousFetch = globalThis.fetch
  globalThis.fetch = hangingFetch()
  try {
    let caught = null
    try {
      await request('/v1/slow/thing', { timeoutMs: 40 })
    } catch (error) {
      caught = error
    }
    assert.ok(caught instanceof Error, '超时必须 reject，而不是永远 pending')
    assert.equal(caught.code, 'REQUEST_TIMEOUT')
    assert.match(caught.message, /超时/)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('超时请求同样携带 AbortController signal，且可在拒绝后正常发起下一次请求', async function () {
  const previousFetch = globalThis.fetch
  const signals = []
  let aborted = false
  globalThis.fetch = function (url, options = {}) {
    signals.push(options.signal)
    return new Promise(function (_resolve, reject) {
      if (!options.signal) return
      options.signal.addEventListener('abort', function () { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) })
    })
  }
  try {
    await assert.rejects(request('/v1/slow/one', { timeoutMs: 20 }))
    assert.ok(signals[0], '必须传入 signal')
    assert.equal(aborted, true)

    globalThis.fetch = async function () { return ok({ fine: true }) }
    const data = await withDeadline(request('/v1/after/timeout'), 1000, '超时后的正常请求')
    assert.deepEqual(data, { fine: true })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('timeoutMs 可被调用方覆盖或显式关闭', async function () {
  const previousFetch = globalThis.fetch
  let seenSignal = 'unset'
  globalThis.fetch = async function (url, options = {}) {
    seenSignal = options.signal === undefined ? 'none' : 'present'
    return ok({ fine: true })
  }
  try {
    await request('/v1/anything', { timeoutMs: 0 })
    assert.equal(seenSignal, 'none', 'timeoutMs: 0 表示关闭超时')
    await request('/v1/anything', { timeoutMs: -1 })
    assert.equal(seenSignal, 'none', '负数同样表示关闭超时')
    await request('/v1/anything')
    assert.equal(seenSignal, 'present', '默认必须带超时')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('上传、下载与整包导出类慢接口默认不会被普通请求的短超时截断', function () {
  assert.equal(resolveRequestTimeoutMs({}), DEFAULT_REQUEST_TIMEOUT_MS)
  assert.equal(resolveRequestTimeoutMs({ responseType: 'json' }), DEFAULT_REQUEST_TIMEOUT_MS)
  assert.equal(resolveRequestTimeoutMs({ multipart: true }), UPLOAD_REQUEST_TIMEOUT_MS)
  assert.equal(resolveRequestTimeoutMs({ responseType: 'blob' }), DOWNLOAD_REQUEST_TIMEOUT_MS)
  assert.equal(resolveRequestTimeoutMs({ raw: true }), DOWNLOAD_REQUEST_TIMEOUT_MS)
  assert.ok(UPLOAD_REQUEST_TIMEOUT_MS > DEFAULT_REQUEST_TIMEOUT_MS * 4)
  assert.ok(DOWNLOAD_REQUEST_TIMEOUT_MS > DEFAULT_REQUEST_TIMEOUT_MS)
  assert.ok(DEFAULT_REQUEST_TIMEOUT_MS >= 10000 && DEFAULT_REQUEST_TIMEOUT_MS <= 15000)
  // 显式覆盖优先于分类默认值
  assert.equal(resolveRequestTimeoutMs({ multipart: true, timeoutMs: 1234 }), 1234)
  assert.equal(resolveRequestTimeoutMs({ responseType: 'blob', timeoutMs: 0 }), 0)
})

test('版本检查（deploy-meta.json）复用同一套超时工具：挂起会被 Abort，也可显式关闭', async function () {
  const previousFetch = globalThis.fetch
  globalThis.fetch = hangingFetch()
  try {
    await assert.rejects(getFrontendDeployMeta({ timeoutMs: 20 }), /abort/i)
  } finally {
    globalThis.fetch = previousFetch
  }

  let seenSignal = 'unset'
  globalThis.fetch = async function (url, options = {}) {
    seenSignal = options.signal === undefined ? 'none' : 'present'
    return jsonResponse({ version: '0.0.1-beta.5' })
  }
  try {
    const meta = await getFrontendDeployMeta({ timeoutMs: 0 })
    assert.deepEqual(meta, { version: '0.0.1-beta.5' })
    assert.equal(seenSignal, 'none')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('Case 6：401 → 刷新一次 → 重放；重放仍 401 时立即结束，不无限刷新', async function () {
  await auth.logout()
  setTokens({ token: 'expired-access', refresh_token: 'refresh-1', user_info: { id: 'u1' } })
  const backend = installFetch([
    { method: 'GET', path: ROLES_USERS, respond: () => unauthorized() },
    { method: 'POST', path: REFRESH, respond: () => ok(freshTokens()) }
  ])
  try {
    let caught = null
    try {
      await withDeadline(request(ROLES_USERS, { auth: true, timeoutMs: 2000 }), 3000, '401 重放')
    } catch (error) {
      caught = error
    }
    assert.ok(caught, '重放后仍 401 必须抛错')
    assert.equal(caught.status, 401)
    assert.equal(backend.count(ROLES_USERS), 2, '原请求最多重放一次')
    assert.equal(backend.count(REFRESH, 'POST'), 1, '只允许刷新一次 token')
    assert.deepEqual(backend.tokensFor(ROLES_USERS), ['expired-access', 'fresh-access'])
    assert.equal(backend.count(ACCESS_ME), 0, '请求层不应隐式拉取管理权限')
  } finally {
    backend.restore()
  }
})

test('本次请求 401 时 token 已被其他请求换新，则直接重放而不再刷新', async function () {
  await auth.logout()
  setTokens({ token: 'expired-access', refresh_token: 'refresh-1', user_info: { id: 'u1' } })
  const backend = installFetch([
    // 第一条请求立即 401，触发刷新；第二条延迟到刷新完成后才 401。
    {
      method: 'GET',
      path: ACCESS_ME,
      respond({ token }) { return token === 'fresh-access' ? ok({ permissions: [] }) : unauthorized() }
    },
    {
      method: 'GET',
      path: ROLES_USERS,
      async respond({ token }) {
        if (token !== 'fresh-access') await delay(80)
        return token === 'fresh-access' ? ok([]) : unauthorized()
      }
    },
    {
      method: 'POST',
      path: REFRESH,
      async respond() { await delay(20); return ok(freshTokens()) }
    }
  ])
  try {
    const results = await withDeadline(
      Promise.all([
        request(ACCESS_ME, { auth: true, timeoutMs: 2000 }),
        request(ROLES_USERS, { auth: true, timeoutMs: 2000 })
      ]),
      3000,
      'token 轮换后的重放'
    )
    assert.deepEqual(results, [{ permissions: [] }, []])
    assert.equal(backend.count(REFRESH, 'POST'), 1, '旧 token 的使用者不应再次使用已轮换的 refresh token')
    assert.deepEqual(backend.tokensFor(ROLES_USERS), ['expired-access', 'fresh-access'])
  } finally {
    backend.restore()
    authStorage.restore()
  }
})
