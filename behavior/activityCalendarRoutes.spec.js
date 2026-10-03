import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { authGuard } from '../src/router/index.js'
import { routes } from '../src/router/routes.js'
import { auth } from '../src/store/auth.js'
import { isFeatureEnabled } from '../src/config/features.js'

vi.mock('../src/store/auth.js', () => ({ init: vi.fn(), auth: { accessToken: '', userInfo: null, adminAccess: null, refreshAdminAccess: vi.fn() } }))
vi.mock('../src/store/beta.js', () => ({ beta: { setIdentity: vi.fn(), refresh: vi.fn() } }))
vi.mock('../src/store/recruitmentAccess.js', () => ({ recruitmentAccess: { setIdentity: vi.fn(), refresh: vi.fn() } }))
vi.mock('../src/config/features.js', async importOriginal => ({ ...(await importOriginal()), isFeatureEnabled: vi.fn(() => true) }))
const page = { template: '<div />' }
function guardRouter() {
  const publicLoader = vi.fn(async () => page), adminLoader = vi.fn(async () => page)
  const calendarRoutes = routes.filter(route => route.path.startsWith('/calendar')).map(route => ({ ...route, component: route.path === '/calendar' ? publicLoader : adminLoader }))
  const router = createRouter({ history: createMemoryHistory(), routes: [...calendarRoutes, ...['/', '/login', '/forbidden'].map(path => ({ path, component: page }))] })
  router.beforeEach(authGuard)
  return { router, publicLoader, adminLoader }
}
beforeEach(() => { vi.clearAllMocks(); auth.accessToken = ''; auth.userInfo = null; auth.adminAccess = null; isFeatureEnabled.mockReturnValue(true) })

it('真实路由守卫允许访客进入日历，管理页跳登录且不初始化管理页', async () => {
  const { router, publicLoader, adminLoader } = guardRouter()
  await router.push('/calendar')
  expect(router.currentRoute.value.path).toBe('/calendar')
  expect(publicLoader).toHaveBeenCalledTimes(1)
  expect(auth.refreshAdminAccess).not.toHaveBeenCalled()
  await router.push('/calendar/admin')
  expect(router.currentRoute.value.path).toBe('/login')
  expect(router.currentRoute.value.query.redirect).toBe('/calendar/admin')
  expect(adminLoader).not.toHaveBeenCalled()
})
it.each(['/calendar', '/calendar/admin'])('flag关闭阻断%s的lazy初始化', async path => {
  isFeatureEnabled.mockReturnValue(false)
  const { router, publicLoader, adminLoader } = guardRouter()
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/')
  expect(publicLoader).not.toHaveBeenCalled()
  expect(adminLoader).not.toHaveBeenCalled()
})
it('只有calendar写权限放行管理页，recruitment权限不能替代', async () => {
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'admin-a' }
  auth.adminAccess = { permissions: ['recruitment_catalog:write'] }
  const { router, adminLoader } = guardRouter()
  await router.push('/calendar/admin')
  expect(router.currentRoute.value.path).toBe('/forbidden')
  expect(adminLoader).not.toHaveBeenCalled()
  auth.adminAccess = { permissions: ['activity_calendar:write'] }
  await router.push('/calendar/admin')
  expect(router.currentRoute.value.path).toBe('/calendar/admin')
  expect(adminLoader).toHaveBeenCalledTimes(1)
})
