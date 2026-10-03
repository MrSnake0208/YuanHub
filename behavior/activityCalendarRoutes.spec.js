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
beforeEach(() => { vi.clearAllMocks(); auth.accessToken = ''; auth.userInfo = null; auth.adminAccess = null; auth.adminAccessError = ''; isFeatureEnabled.mockReturnValue(true) })

it.each(['/calendar', '/calendar/admin', '/calendar/suggestions', '/calendar/suggestions/new?game=%E5%A6%82%E9%B8%A2'])('访客访问%s跳登录并保留回跳，不加载日历组件', async path => {
  const { router, publicLoader, adminLoader } = guardRouter()
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/login')
  expect(router.currentRoute.value.query.redirect).toBe(path)
  expect(publicLoader).not.toHaveBeenCalled()
  expect(adminLoader).not.toHaveBeenCalled()
})
it.each(['/calendar', '/calendar/admin', '/calendar/suggestions', '/calendar/suggestions/new'])('flag关闭阻断%s的lazy初始化', async path => {
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

it.each(['/calendar', '/calendar/suggestions', '/calendar/suggestions/new?game=%E5%A6%82%E9%B8%A2'])('普通登录用户不能访问%s，管理员无需日历写权限即可测试', async path => {
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'user-a' }; auth.adminAccess = { permissions: [] }
  const { router, publicLoader, adminLoader } = guardRouter()
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/forbidden')
  expect(publicLoader).not.toHaveBeenCalled()
  expect(adminLoader).not.toHaveBeenCalled()
  auth.adminAccess = { permissions: ['beta:manage'] }
  await router.push(path)
  expect(router.currentRoute.value.path).toBe(path.split('?')[0])
  expect(publicLoader.mock.calls.length + adminLoader.mock.calls.length).toBe(1)
})

it('管理权限请求失败不能通过测试阶段日历的鉴权', async () => {
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'user-a' }
  auth.refreshAdminAccess.mockImplementationOnce(() => { auth.adminAccessError = '读取失败' })
  const { router, publicLoader } = guardRouter()
  await router.push('/calendar')
  expect(router.currentRoute.value.path).toBe('/forbidden')
  expect(publicLoader).not.toHaveBeenCalled()
})
