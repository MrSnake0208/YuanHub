// 冷启动登录态恢复回归测试（Case 1 / Case 2 + single-flight）。
//
// 背景：访问令牌默认 6 小时，隔夜从主屏幕冷启动时 access token 已过期，
// 而本地仍保留 userInfo / refreshToken。此时若 auth.refresh() 在刷新 token 之后
// 又隐式等待 refreshAdminAccess()，就会与最初那个仍在飞行中的 refreshAdminAccess()
// 互相等待，形成永不 resolve 的 Promise，首次路由守卫永远不 next()。
import test from 'node:test'
import assert from 'node:assert/strict'
import { installAuthStorage } from '../test-support/authStorageFixture.js'
import {
  delay,
  installFetch,
  ok,
  unauthorized,
  withDeadline
} from '../test-support/fakeApiFetch.js'

const authStorage = installAuthStorage()
const { auth, setTokens } = await import('../src/store/auth.js')
const { getCurrentAdminAccess, listAdminRoleUsers } = await import('../src/api/admin.js')

const ACCESS_ME = '/v1/admin/access/me'
const ROLES_USERS = '/v1/admin/roles/users'
const REFRESH = '/user/refresh'

const PLATFORM_ADMIN = {
  roles: ['PLATFORM_ADMIN'],
  permissions: ['beta:manage', 'admin:role:manage'],
  receive_areas: [],
  manage_areas: []
}

async function resetAuth(payload) {
  await auth.logout()
  setTokens(payload)
  auth.adminAccessLoaded = false
}

function accessMeRoute({ validToken = 'fresh-access', data = PLATFORM_ADMIN } = {}) {
  return {
    method: 'GET',
    path: ACCESS_ME,
    respond({ token }) {
      return token === validToken ? ok(data) : unauthorized()
    }
  }
}

function refreshRoute({ nextAccessToken = 'fresh-access', nextRefreshToken = 'refresh-2', delayMs = 0, userInfo = { id: 'u1' } } = {}) {
  return {
    method: 'POST',
    path: REFRESH,
    async respond() {
      if (delayMs) await delay(delayMs)
      return ok({ token: nextAccessToken, refresh_token: nextRefreshToken, user_info: userInfo })
    }
  }
}

test('Case 1：access token 有效时，管理权限直接读取成功且不触发刷新', async function () {
  await resetAuth({ token: 'fresh-access', refresh_token: 'refresh-1', user_info: { id: 'u1' } })
  const backend = installFetch([accessMeRoute()])
  try {
    const access = await withDeadline(auth.refreshAdminAccess({ suppressErrors: true }), 2000, '管理权限读取')
    assert.deepEqual(access.permissions, PLATFORM_ADMIN.permissions)
    assert.equal(backend.count(ACCESS_ME), 1)
    assert.equal(backend.count(REFRESH, 'POST'), 0)
    assert.equal(auth.adminAccessLoaded, true)
    assert.equal(auth.adminAccessError, '')
  } finally {
    backend.restore()
  }
})

test('Case 2：access token 过期 + refresh token 有效时，不会出现 refreshAdminAccess ↔ refresh 循环等待', async function () {
  await resetAuth({ token: 'expired-access', refresh_token: 'refresh-1', user_info: { id: 'u1' } })
  const backend = installFetch([
    accessMeRoute(),
    refreshRoute({ nextAccessToken: 'fresh-access', nextRefreshToken: 'refresh-2' })
  ])
  try {
    const access = await withDeadline(
      auth.refreshAdminAccess({ suppressErrors: true }),
      3000,
      '管理权限恢复'
    )

    assert.ok(access, '过期后仍应拿到管理权限，而不是返回 null')
    assert.deepEqual(access.permissions, PLATFORM_ADMIN.permissions)

    // refresh token 只换一次，且换出来的新 token 被用于重放 /v1/admin/access/me
    assert.equal(backend.count(REFRESH, 'POST'), 1)
    assert.deepEqual(backend.tokensFor(ACCESS_ME), ['expired-access', 'fresh-access'])
    assert.equal(auth.accessToken, 'fresh-access')
    assert.equal(auth.refreshToken, 'refresh-2')
    assert.equal(auth.adminAccessLoaded, true)
  } finally {
    backend.restore()
  }
})

test('auth.refresh() 只负责刷新 token，不再隐式请求 /v1/admin/access/me', async function () {
  await resetAuth({ token: 'expired-access', refresh_token: 'refresh-1', user_info: { id: 'u1' } })
  // 只注册 /user/refresh：一旦 refresh() 仍然隐式拉取管理权限，installFetch 会抛错。
  const backend = installFetch([refreshRoute()])
  try {
    const refreshed = await withDeadline(auth.refresh(), 2000, 'token 刷新')
    assert.equal(refreshed, true)
    assert.equal(backend.count(REFRESH, 'POST'), 1)
    assert.equal(backend.count(ACCESS_ME), 0, 'refresh() 不应触碰管理权限接口')
    assert.equal(auth.accessToken, 'fresh-access')
  } finally {
    backend.restore()
  }
})

test('并发 401 只触发一次 token refresh（single-flight），并各自用新 token 重放', async function () {
  await resetAuth({ token: 'expired-access', refresh_token: 'refresh-1', user_info: { id: 'u1' } })
  let refreshCalls = 0
  const backend = installFetch([
    accessMeRoute(),
    {
      method: 'GET',
      path: ROLES_USERS,
      respond({ token }) {
        return token === 'fresh-access'
          ? ok([{ user_id: 'user-1', user_name: 'alice', roles: ['PLATFORM_ADMIN'] }])
          : unauthorized()
      }
    },
    {
      method: 'POST',
      path: REFRESH,
      async respond() {
        refreshCalls += 1
        // 拉长刷新窗口，保证两个并发请求都在同一飞行期内
        await delay(30)
        return ok({ token: 'fresh-access', refresh_token: 'refresh-2', user_info: { id: 'u1' } })
      }
    }
  ])
  try {
    const results = await withDeadline(
      Promise.all([getCurrentAdminAccess(), listAdminRoleUsers()]),
      3000,
      '并发刷新'
    )
    assert.equal(refreshCalls, 1, '并发的 401 必须复用同一次 refresh')
    assert.ok(results[0].permissions.includes('beta:manage'))
    assert.equal(results[1][0].userName, 'alice')
    assert.deepEqual(backend.tokensFor(ACCESS_ME), ['expired-access', 'fresh-access'])
    assert.deepEqual(backend.tokensFor(ROLES_USERS), ['expired-access', 'fresh-access'])
  } finally {
    backend.restore()
  }
})

test('刷新 token 被后端拒绝时标记为拒绝态，网络类失败不误判为登录失效', async function () {
  await resetAuth({ token: 'expired-access', refresh_token: 'refresh-1', user_info: { id: 'u1' } })
  const backend = installFetch([
    { method: 'POST', path: REFRESH, respond: () => unauthorized('refresh token 已失效') }
  ])
  try {
    const refreshed = await withDeadline(auth.refresh(), 2000, '被拒绝的刷新')
    assert.equal(refreshed, false)
    assert.equal(auth.refreshRejected, true, '后端明确 401 才算登录态失效')
    assert.equal(auth.accessToken, 'expired-access', '刷新失败不应清掉本地 token')
  } finally {
    backend.restore()
  }

  const networkFailure = installFetch([
    { method: 'POST', path: REFRESH, respond: () => { throw new TypeError('Failed to fetch') } }
  ])
  try {
    const refreshed = await withDeadline(auth.refresh(), 2000, '网络失败的刷新')
    assert.equal(refreshed, false)
    assert.equal(auth.refreshRejected, false, '网络/超时失败不能当成登录态失效')
  } finally {
    networkFailure.restore()
    authStorage.restore()
  }
})
