import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Roadmap from '../src/pages/roadmap/index.vue'
import TodayLobby from '../src/components/today/TodayLobby.vue'
import { routes } from '../src/router/routes.js'
import { authGuard } from '../src/router/index.js'
import { auth } from '../src/store/auth.js'
import { beta } from '../src/store/beta.js'

vi.mock('../src/store/auth.js', () => ({
  init: vi.fn(),
  auth: { accessToken: '', userInfo: null, isLoggedIn: false, adminAccess: null, refreshAdminAccess: vi.fn() }
}))
vi.mock('../src/store/beta.js', () => ({ beta: { setIdentity: vi.fn(), refresh: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(auth, { accessToken: '', userInfo: null, isLoggedIn: false, adminAccess: null })
})

function routerForRoadmap() {
  const selected = routes.filter(route => ['/roadmap', '/feedback', '/login', '/changelog'].includes(route.path))
    .map(route => route.path === '/roadmap' ? route : { ...route, component: { template: '<div />' } })
  const router = createRouter({ history: createMemoryHistory(), routes: selected })
  router.beforeEach(authGuard)
  return router
}

it('访客直接打开规划页，无内测或管理权限请求；建议入口仍要求登录并保留回跳参数', async () => {
  const router = routerForRoadmap()
  await router.push('/roadmap')
  expect(router.currentRoute.value.name).toBe('roadmap')
  expect(router.currentRoute.value.matched[0].components.default).toBe(Roadmap)
  expect(beta.refresh).not.toHaveBeenCalled()
  expect(auth.refreshAdminAccess).not.toHaveBeenCalled()
  await router.push({ path: '/feedback', query: { new: '1', type: 'FEATURE' } })
  expect(router.currentRoute.value.path).toBe('/login')
  expect(router.currentRoute.value.query.redirect).toBe('/feedback?new=1&type=FEATURE')
})

it('展示六个真实规划方向和依赖说明，保留现有页头，未将规划变成可执行功能或虚构进度', async () => {
  const wrapper = mount(Roadmap, {
    global: { stubs: { IslandSidebar: true, RouterLink: RouterLinkStub } }
  })
  await flushPromises()
  expect(wrapper.findAll('h4').map(node => node.text())).toEqual([
    '成就系统', '羁绊系统', '信赖值 & 传闻', '密探面板自动计算', '入战数据计算', '安卓端小组件'
  ])
  expect(wrapper.get('h1').text()).toBe('发展规划')
  expect(wrapper.getComponent(TodayLobby).props('ownerId')).toBe('')
  expect(wrapper.get('.lobby-greeting').text()).toContain('殿下')
  expect(wrapper.text()).toContain('面板计算作为基础，入战规则与数据仍需确认')
  expect(wrapper.text()).toContain('上线时间待定')
  expect(wrapper.find('.roadmap-sheet progress').exists()).toBe(false)
  expect(wrapper.find('.roadmap-sheet button').exists()).toBe(false)
  expect(wrapper.findAll('.roadmap-art[aria-hidden="true"]')).toHaveLength(6)
  const destinations = wrapper.findAllComponents(RouterLinkStub).map(link => link.props('to'))
  expect(destinations).toContainEqual({ path: '/feedback', query: { new: '1', type: 'FEATURE' } })
  expect(destinations).toContain('/changelog')
  expect(fetch).not.toHaveBeenCalled()
})
