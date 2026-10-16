import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { authGuard } from '../src/router/index.js'
import { routes } from '../src/router/routes.js'
import { auth } from '../src/store/auth.js'
import PlazaPage from '../src/pages/feedback/plaza.vue'

vi.mock('../src/store/auth.js', () => ({ init: vi.fn(), auth: { accessToken: '', userInfo: null, adminAccess: null, refreshAdminAccess: vi.fn() } }))
vi.mock('../src/store/beta.js', () => ({ beta: { setIdentity: vi.fn(), refresh: vi.fn() } }))

function guardRouter() {
  const page = { template: '<div />' }
  const terminalPaths = ['/changelog', '/feedback/plaza', '/manage', '/login', '/forbidden']
  const targetLoader = vi.fn(async () => page)
  const selected = routes.filter(route => route.path.startsWith('/co-creation') || terminalPaths.includes(route.path))
    .map(route => terminalPaths.includes(route.path) ? { ...route, component: targetLoader } : route)
  const router = createRouter({ history: createMemoryHistory(), routes: selected })
  router.beforeEach(authGuard)
  return { router, targetLoader }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(auth, { accessToken: '', userInfo: null, adminAccess: null, adminAccessError: '' })
})

it.each(['/co-creation', '/co-creation/', '/co-creation?tab=roadmap&type=FEATURE', '/co-creation?tab=unknown'])('%s 只跳更新日志，不加载目标页面', async path => {
  const { router, targetLoader } = guardRouter()
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/changelog')
  expect(router.currentRoute.value.query).toEqual({})
  expect(targetLoader).toHaveBeenCalledTimes(1)
  expect(auth.refreshAdminAccess).not.toHaveBeenCalled()
})

it.each([
  ['/co-creation?tab=plaza&feedback=public_1&type=BUG', { feedback: 'public_1' }],
  ['/co-creation?tab=wish&feedback=public_2&type=FEATURE', { feedback: 'public_2' }],
  ['/co-creation?tab=wish', {}],
  ['/co-creation?tab=plaza', {}],
  ['/co-creation?feedback=public_3', { feedback: 'public_3' }],
  ['/co-creation?tab=roadmap&feedback=public_4', { feedback: 'public_4' }],
  ['/co-creation?feedback=public%2Fid%3F%26%23&sort=updated', { feedback: 'public/id?&#', sort: 'updated' }]
])('%s 兼容游客分享并将定位传给反馈广场', async (path, query) => {
  const { router } = guardRouter()
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/feedback/plaza')
  expect(router.currentRoute.value.query).toEqual(query)
  const wrapper = mount(PlazaPage, {
    global: {
      plugins: [router],
      stubs: { IslandSidebar: true, FeedbackWorkspaceNav: true, RouterLink: RouterLinkStub, FeedbackPlaza: { name: 'FeedbackPlaza', props: ['focusId'], template: '<div />' } }
    }
  })
  await flushPromises()
  expect(wrapper.findComponent({ name: 'FeedbackPlaza' }).props('focusId')).toBe(query.feedback || '')
  expect(wrapper.text()).not.toContain('大饼中心')
  expect(wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))).not.toContain('/co-creation')
  expect(auth.refreshAdminAccess).not.toHaveBeenCalled()
  wrapper.unmount()
})

it.each(['/co-creation/admin', '/co-creation/admin/'])('游客的%s由管理工作台要求登录，回跳不再指向旧页', async path => {
  const { router } = guardRouter()
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/login')
  expect(router.currentRoute.value.query.redirect).toBe('/manage')
})

it('普通用户不能借旧管理地址绕过工作台权限', async () => {
  Object.assign(auth, { accessToken: 'synthetic', userInfo: { id: 'user' }, adminAccess: { permissions: [] } })
  const { router } = guardRouter()
  await router.push('/co-creation/admin')
  expect(router.currentRoute.value.path).toBe('/forbidden')
  expect(router.currentRoute.value.query.from).toBe('/manage')
  expect(auth.refreshAdminAccess).toHaveBeenCalledTimes(1)
})

it.each([{ superAdmin: true }, { permissions: ['changelog:write'] }, { operatorAreas: ['OTHER'] }])('有管理能力的用户经旧地址进入现有工作台 %j', async adminAccess => {
  Object.assign(auth, { accessToken: 'synthetic', userInfo: { id: 'admin' }, adminAccess })
  const { router, targetLoader } = guardRouter()
  await router.push('/co-creation/admin')
  expect(router.currentRoute.value.path).toBe('/manage')
  expect(targetLoader).toHaveBeenCalledTimes(1)
})
