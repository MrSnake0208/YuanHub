import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import Sidebar from '../src/components/IslandSidebar.vue'
import { auth } from '../src/store/auth.js'
import { getUnreadNotificationCount } from '../src/api/notifications.js'
import { subscribeFeedbackUnread } from '../src/store/feedbackUnread.js'
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null }), logout: vi.fn() }
})
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../src/utils/onboardingTour.js', () => ({ restartOnboardingTour: vi.fn() }))
vi.mock('../src/api/notifications.js', () => ({ getUnreadNotificationCount: vi.fn(), NOTIFICATION_STATE_EVENT: 'test-notification-state' }))
vi.mock('../src/store/feedbackUnread.js', () => ({ feedbackUnreadState: { count: 0 }, subscribeFeedbackUnread: vi.fn() }))
let unsubscribe
beforeEach(() => {
  vi.useFakeTimers()
  auth.accessToken = ''; auth.userInfo = null
  unsubscribe = vi.fn(); subscribeFeedbackUnread.mockReturnValue(unsubscribe)
  getUnreadNotificationCount.mockReset().mockResolvedValue({ count: 2 })
})
const render = () => mount(Sidebar, { global: { stubs: { RouterLink: RouterLinkStub, MobileHeader: true }, mocks: { $route: { path: '/' } } } })
const routes = wrapper => wrapper.findAllComponents(RouterLinkStub).map(node => node.props('to'))
it('访客没有通知/反馈私有入口，不向通知 API 发请求，保留登录入口', async () => {
  const wrapper = render(); await flushPromises()
  expect(routes(wrapper)).toContain('/login')
  expect(routes(wrapper)).not.toContain('/notifications')
  expect(routes(wrapper)).not.toContain('/feedback')
  expect(routes(wrapper)).not.toContain('/manage')
  expect(getUnreadNotificationCount).not.toHaveBeenCalled()
})
it('登录用户获得实用导航与未读状态，不锁死入口顺序或桌面/手机 DOM 结构', async () => {
  auth.accessToken = 'test-only'; auth.userInfo = { user_name: '测试殿下' }
  const wrapper = render(); await flushPromises()
  for (const route of ['/cart', '/inventory', '/operator', '/star', '/notifications', '/feedback', '/user/profile']) expect(routes(wrapper)).toContain(route)
  expect(routes(wrapper)).not.toContain('/manage')
  expect(wrapper.text()).toContain('测试殿下')
  expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('2')
})
it('卸载移除通知监听与定时轮询，不留下重复后台读请求', async () => {
  auth.accessToken = 'test-only'; auth.userInfo = { user_name: '测试殿下' }
  const wrapper = render(); await flushPromises()
  wrapper.unmount()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  const count = getUnreadNotificationCount.mock.calls.length
  window.dispatchEvent(new Event('test-notification-state'))
  await vi.advanceTimersByTimeAsync(90000)
  expect(getUnreadNotificationCount).toHaveBeenCalledTimes(count)
})
