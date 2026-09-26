import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import Sidebar from '../src/components/IslandSidebar.vue'
import { auth } from '../src/store/auth.js'
import { notificationUnreadState } from '../src/store/notificationUnread.js'
import { subscribeFeedbackUnread } from '../src/store/feedbackUnread.js'
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null }), logout: vi.fn() }
})
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../src/utils/onboardingTour.js', () => ({ restartOnboardingTour: vi.fn() }))
vi.mock('../src/store/notificationUnread.js', async () => {
  const { reactive } = await import('vue')
  return { notificationUnreadState: reactive({ count: 0 }) }
})
vi.mock('../src/store/feedbackUnread.js', () => ({ feedbackUnreadState: { count: 0 }, subscribeFeedbackUnread: vi.fn() }))
let unsubscribe
beforeEach(() => {
  vi.useFakeTimers()
  auth.accessToken = ''; auth.userInfo = null
  notificationUnreadState.count = 0
  unsubscribe = vi.fn(); subscribeFeedbackUnread.mockReturnValue(unsubscribe)
})
const render = () => mount(Sidebar, { global: { stubs: { RouterLink: RouterLinkStub, MobileHeader: true }, mocks: { $route: { path: '/' } } } })
const routes = wrapper => wrapper.findAllComponents(RouterLinkStub).map(node => node.props('to'))
it('访客没有通知/反馈私有入口，保留登录入口', async () => {
  const wrapper = render(); await flushPromises()
  expect(routes(wrapper)).toContain('/login')
  expect(routes(wrapper)).not.toContain('/notifications')
  expect(routes(wrapper)).not.toContain('/feedback')
  expect(routes(wrapper)).not.toContain('/manage')
})
it('登录用户获得实用导航与共享未读状态，不锁死入口顺序或桌面/手机 DOM 结构', async () => {
  auth.accessToken = 'test-only'; auth.userInfo = { user_name: '测试殿下' }
  notificationUnreadState.count = 2
  const wrapper = render(); await flushPromises()
  for (const route of ['/cart', '/inventory', '/operator', '/star', '/notifications', '/feedback', '/user/profile']) expect(routes(wrapper)).toContain(route)
  expect(routes(wrapper)).not.toContain('/manage')
  expect(wrapper.text()).toContain('测试殿下')
  expect(wrapper.text()).toContain('2')
})
it('卸载只释放反馈订阅，不在 Sidebar 内维护通知轮询', async () => {
  auth.accessToken = 'test-only'; auth.userInfo = { user_name: '测试殿下' }
  const wrapper = render(); await flushPromises()
  wrapper.unmount()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
