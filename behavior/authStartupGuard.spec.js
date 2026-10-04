import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/router/routes.js'
import { authGuard } from '@/router/index.js'
import { auth } from '@/store/auth.js'
import { beta } from '@/store/beta.js'
import { recruitmentAccess } from '@/store/recruitmentAccess.js'
import { NAVIGATION_SIGNAL } from '@/utils/navigationCancellation.js'
import { deferred } from '../test-support/factories.js'

// Case 2 / Case 3 / Case 4 的路由层回归：使用真实守卫 + 真实路由表 meta，
// 只把懒加载页面组件替换为桩组件（本测试不关心页面渲染）。
function stubRoutes() {
  return routes.map(function (route) {
    return Object.assign({}, route, {
      component: { name: 'Stub-' + (route.name || 'route'), template: '<div />' }
    })
  })
}

function createGuardRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes: stubRoutes() })
  router.beforeEach(authGuard)
  return router
}

function resetAuth() {
  auth.accessToken = ''
  auth.refreshToken = ''
  auth.userInfo = null
  auth.adminAccess = null
  auth.adminAccessError = ''
  auth.adminAccessLoaded = false
  auth.adminAccessLoading = false
  auth.refreshRejected = false
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

const ACCESS_ME = '/v1/admin/access/me'
const REFRESH = '/user/refresh'

const ADMIN_ACCESS = {
  status_code: 200,
  data: { roles: ['PLATFORM_ADMIN'], permissions: ['beta:manage', 'admin:role:manage'], manage_areas: [], receive_areas: [] }
}

function installFetch(routes) {
  const calls = []
  const fetchMock = vi.fn(async function (url, options = {}) {
    const path = String(url).split('?')[0]
    const method = String(options.method || 'GET').toUpperCase()
    const token = String((options.headers && options.headers.Authorization) || '').replace(/^Bearer\s+/i, '')
    calls.push({ path, method, token })
    const route = routes.find(function (candidate) {
      return candidate.path === path && candidate.method === method
    })
    if (!route) throw new Error('unexpected request: ' + method + ' ' + path)
    return route.respond({ path, method, token })
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    calls,
    count(path, method = 'GET') {
      return calls.filter(function (call) { return call.path === path && call.method === method }).length
    },
    tokensFor(path) {
      return calls.filter(function (call) { return call.path === path }).map(function (call) { return call.token })
    }
  }
}

async function settle(router) {
  // 处理重定向链上的后续导航
  for (let index = 0; index < 5; index += 1) await Promise.resolve()
  await router.isReady().catch(function () {})
  return router.currentRoute.value
}

describe('路由守卫的登录态 / 管理权限分层', function () {
  beforeEach(function () {
    resetAuth()
    recruitmentAccess.setIdentity('')
  })

  it('Case 3：首次导航（普通/公开页面）不请求也不等待管理权限接口', async function () {
    const backend = installFetch([])
    const router = createGuardRouter()

    const startedAt = Date.now()
    await router.push('/login')
    const route = await settle(router)

    expect(route.path).toBe('/login')
    expect(Date.now() - startedAt).toBeLessThan(500)
    expect(backend.count(ACCESS_ME)).toBe(0)
  })

  it('Case 4：受保护路由先等待权限结果，无权限时进入 /forbidden（不越权）', async function () {
    auth.accessToken = 'valid-token'
    auth.refreshToken = 'refresh-1'
    auth.userInfo = { id: 'u1' }
    const backend = installFetch([
      { path: ACCESS_ME, method: 'GET', respond: () => jsonResponse({ status_code: 200, data: { roles: [], permissions: [], manage_areas: [], receive_areas: [] } }) }
    ])
    const router = createGuardRouter()

    await router.push('/admin/roles')
    const route = await settle(router)

    expect(route.path).toBe('/forbidden')
    expect(route.query.from).toBe('/admin/roles')
    expect(route.query.reason).toBe('admin-required')
    expect(backend.count(ACCESS_ME)).toBe(1)
  })

  it('Case 4：权限已就绪时直接放行，且不产生多余权限请求', async function () {
    auth.accessToken = 'valid-token'
    auth.refreshToken = 'refresh-1'
    auth.userInfo = { id: 'u1' }
    auth.adminAccess = { roles: [], permissions: ['admin:role:manage'], manageAreas: [], receiveAreas: [], superAdmin: false }
    auth.adminAccessLoaded = true
    const backend = installFetch([])
    const router = createGuardRouter()

    await router.push('/admin/roles')
    const route = await settle(router)

    expect(route.path).toBe('/admin/roles')
    expect(backend.count(ACCESS_ME)).toBe(0)
  })

  it('管理权限读取失败时标明无法确认；恢复导航重新查权限后进入原页', async () => {
    auth.accessToken = 'valid-token'
    auth.userInfo = { id: 'u1' }
    let unavailable = true
    const backend = installFetch([
      { path: ACCESS_ME, method: 'GET', respond: () => unavailable
        ? jsonResponse({ status_code: 503, message: 'unavailable' }, 503)
        : jsonResponse(ADMIN_ACCESS) }
    ])
    const router = createGuardRouter()
    await router.push('/admin/roles?tab=roles')
    expect(router.currentRoute.value.path).toBe('/forbidden')
    expect(router.currentRoute.value.query.reason).toBe('admin-unavailable')
    unavailable = false
    await router.push(router.currentRoute.value.query.from)
    expect(router.currentRoute.value.fullPath).toBe('/admin/roles?tab=roles')
    expect(backend.count(ACCESS_ME)).toBe(2)
  })

  it.each([
    [200, { access_mode: 'LIMITED', granted: false, can_access: false }, 'recruitment-required'],
    [503, null, 'recruitment-unavailable']
  ])('招募查询状态 %s 对应有限原因，重试仍需真实资格', async (status, data, reason) => {
    auth.accessToken = 'valid-token'
    auth.userInfo = { id: 'u1' }
    let granted = false
    const backend = installFetch([
      { path: '/v1/recruitment/access/me', method: 'GET', respond: () => granted
        ? jsonResponse({ status_code: 200, data: { access_mode: 'LIMITED', granted: true, can_access: true } })
        : jsonResponse({ status_code: status, message: 'unavailable', data }, status) }
    ])
    const router = createGuardRouter()
    await router.push('/recruitment?game=如鸢')
    expect(router.currentRoute.value.path).toBe('/forbidden')
    expect(router.currentRoute.value.query.reason).toBe(reason)
    const target = router.currentRoute.value.query.from
    await router.push(target)
    expect(router.currentRoute.value.path).toBe('/forbidden')
    expect(recruitmentAccess.canAccess).toBe(false)
    granted = true
    await router.push(target)
    expect(router.currentRoute.value.path).toBe('/recruitment')
    expect(backend.count('/v1/recruitment/access/me')).toBe(3)
    expect(backend.count(ACCESS_ME)).toBe(0)
  })

  it('招募失败页换账号后重新查询，旧账号的资格不能放行新账号', async () => {
    auth.accessToken = 'account-a'
    auth.userInfo = { id: 'a' }
    const backend = installFetch([
      { path: '/v1/recruitment/access/me', method: 'GET', respond: ({ token }) =>
        jsonResponse({ status_code: 200, data: { access_mode: 'LIMITED', can_access: token === 'account-b' } }) }
    ])
    const router = createGuardRouter()
    await router.push('/recruitment')
    expect(router.currentRoute.value.query.reason).toBe('recruitment-required')
    auth.accessToken = 'account-b'
    auth.userInfo = { id: 'b' }
    await router.push('/recruitment')
    expect(router.currentRoute.value.path).toBe('/recruitment')
    expect(recruitmentAccess.userId).toBe('b')
    auth.accessToken = 'account-a'
    auth.userInfo = { id: 'a' }
    await router.push('/login')
    await router.push('/recruitment')
    expect(router.currentRoute.value.path).toBe('/forbidden')
    expect(backend.tokensFor('/v1/recruitment/access/me')).toEqual(['account-a', 'account-b', 'account-a'])
  })

  it.each(['identity-change', 'cancelled'])('招募资格读取期间 %s，迟到结果不得恢复旧导航', async scenario => {
    auth.accessToken = 'account-a'
    auth.userInfo = { id: 'a' }
    const pending = deferred(), entered = deferred()
    installFetch([
      { path: '/v1/recruitment/access/me', method: 'GET', respond: () => { entered.resolve(); return pending.promise } }
    ])
    const controller = new AbortController()
    const next = vi.fn()
    const navigation = authGuard({ fullPath: '/recruitment', meta: { requiresAuth: true, requiresRecruitmentAccess: true, [NAVIGATION_SIGNAL]: controller.signal } }, {}, next)
    await entered.promise
    if (scenario === 'identity-change') {
      auth.accessToken = 'account-b'
      auth.userInfo = { id: 'b' }
      recruitmentAccess.setIdentity('b')
    } else controller.abort()
    pending.resolve(jsonResponse({ status_code: 200, data: { can_access: true } }))
    await navigation
    expect(next).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('管理权限读取期间切换账号，迟到结果不能带新账号进入旧管理页', async () => {
    auth.accessToken = 'account-a'
    auth.userInfo = { id: 'a' }
    const pending = deferred(), entered = deferred()
    installFetch([{ path: ACCESS_ME, method: 'GET', respond: () => { entered.resolve(); return pending.promise } }])
    const next = vi.fn()
    const navigation = authGuard({ fullPath: '/admin/roles', meta: { requiresAuth: true, requiredPermission: 'admin:role:manage' } }, {}, next)
    await entered.promise
    auth.accessToken = 'account-b'
    auth.userInfo = { id: 'b' }
    pending.resolve(jsonResponse(ADMIN_ACCESS))
    await navigation
    expect(next).toHaveBeenCalledExactlyOnceWith(false)
    expect(auth.adminAccess).toBeNull()
  })

  it('Case 2：access token 隔夜过期时，受保护路由仍能完成刷新、重放并正常进入', async function () {
    auth.accessToken = 'expired-access'
    auth.refreshToken = 'refresh-1'
    auth.userInfo = { id: 'u1' }
    const backend = installFetch([
      {
        path: ACCESS_ME,
        method: 'GET',
        respond({ token }) {
          return token === 'fresh-access'
            ? jsonResponse(ADMIN_ACCESS)
            : jsonResponse({ status_code: 401, message: 'token expired' }, 401)
        }
      },
      {
        path: REFRESH,
        method: 'POST',
        respond: () => jsonResponse({ status_code: 200, data: { token: 'fresh-access', refresh_token: 'refresh-2', user_info: { id: 'u1' } } })
      }
    ])
    const router = createGuardRouter()

    await router.push('/manage')
    const route = await settle(router)

    expect(route.path).toBe('/manage')
    expect(backend.count(REFRESH, 'POST')).toBe(1)
    expect(backend.tokensFor(ACCESS_ME)).toEqual(['expired-access', 'fresh-access'])
    expect(auth.accessToken).toBe('fresh-access')
  })

  it('未登录访问受保护路由时仍先跳登录页，不触发权限请求', async function () {
    const backend = installFetch([])
    const router = createGuardRouter()

    await router.push('/admin/audit')
    const route = await settle(router)

    expect(route.path).toBe('/login')
    expect(route.query.redirect).toBe('/admin/audit')
    expect(backend.count(ACCESS_ME)).toBe(0)
  })

  it('教程取消后，晚到资格结果不会重定向或打断仍在等待的新导航', async function () {
    installFetch([])
    const router = createGuardRouter()
    await router.push('/login')
    let releaseBeta
    let enteredBeta
    const betaEntered = new Promise(resolve => { enteredBeta = resolve })
    const betaRefresh = vi.spyOn(beta, 'refresh').mockImplementation(() => {
      enteredBeta()
      return new Promise(resolve => { releaseBeta = resolve })
    })
    let releaseNew
    let enteredNew
    const newEntered = new Promise(resolve => { enteredNew = resolve })
    router.beforeEach(to => {
      if (to.path === '/changelog') {
        enteredNew()
        return new Promise(resolve => { releaseNew = resolve })
      }
    })
    const controller = new AbortController()
    const record = router.resolve('/operator').matched.at(-1)
    record.meta[NAVIGATION_SIGNAL] = controller.signal
    try {
      const oldNavigation = router.push('/operator')
      await betaEntered
      controller.abort()
      delete record.meta[NAVIGATION_SIGNAL]
      const newNavigation = router.push('/changelog')
      await newEntered
      releaseBeta()
      const oldFailure = await oldNavigation
      expect(oldFailure).toBeTruthy()
      expect(router.currentRoute.value.path).toBe('/login')
      releaseNew(true)
      expect(await newNavigation).toBeUndefined()
      expect(router.currentRoute.value.path).toBe('/changelog')
    } finally {
      releaseBeta?.()
      releaseNew?.(false)
      delete record.meta[NAVIGATION_SIGNAL]
      betaRefresh.mockRestore()
    }
  })
})
