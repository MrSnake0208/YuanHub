import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import Sidebar from '../src/components/IslandSidebar.vue'
import { auth } from '../src/store/auth.js'
import { notificationUnreadState } from '../src/store/notificationUnread.js'
import { subscribeFeedbackUnread } from '../src/store/feedbackUnread.js'
import { logout } from '../src/store/auth.js'
import { dialog } from '../src/utils/dialog.js'
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null }), logout: vi.fn() }
})
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ fullPath: '/', meta: { title: '今日一览 — YuanHub' } }) }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
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
  logout.mockReset(); dialog.confirm.mockReset()
})
const render = () => mount(Sidebar, { global: { stubs: { RouterLink: RouterLinkStub, MobileHeader: { template: '<header><slot /></header>' } }, mocks: { $route: { path: '/', meta: { title: '今日一览 — YuanHub' } } } } })
const routes = wrapper => wrapper.findAllComponents(RouterLinkStub).map(node => node.props('to'))
it('访客没有通知/反馈私有入口，保留登录入口', async () => {
  const wrapper = render(); await flushPromises()
  expect(routes(wrapper)).toContain('/login')
  expect(routes(wrapper)).not.toContain('/notifications')
  expect(routes(wrapper)).not.toContain('/feedback')
  expect(routes(wrapper)).toContain('/feedback/plaza')
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
it('手机导航明确标出当前页，展开后可发现首尾入口和内测图标', async () => {
  const wrapper = render()
  // 新的移动端头部把当前页标题放在独立的 .mobile-page-title 上，菜单按钮只保留图标。
  expect(wrapper.get('.mobile-page-title').text()).toBe('今日一览')
  const toggle = wrapper.get('.mobile-menu-button')
  expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(toggle.attributes('aria-label')).toBe('打开导航')
  await toggle.trigger('click')
  expect(toggle.attributes('aria-expanded')).toBe('true')
  expect(toggle.attributes('aria-label')).toBe('关闭导航')
  expect(wrapper.get('#mobile-main-nav').isVisible()).toBe(true)
  expect(wrapper.get('#mobile-main-nav').text()).toContain('内测')
  expect(wrapper.get('#mobile-main-nav').text()).toContain('教程')
  const betaLink = wrapper.findAllComponents(RouterLinkStub).find(link => link.props('to') === '/beta' && link.element.closest('#mobile-main-nav'))
  expect(betaLink?.find('svg').exists()).toBe(true)
})
it('手机登出先确认，取消不清会话，确认后显示登录结果入口', async () => {
  auth.accessToken = 'test-only'; auth.userInfo = { user_name: '测试殿下' }
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  dialog.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  await wrapper.get('.mobile-drawer-logout').trigger('click')
  await flushPromises()
  expect(logout).not.toHaveBeenCalled()
  await wrapper.get('.mobile-drawer-logout').trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmText: '退出登录' }))
  expect(logout).toHaveBeenCalledWith('/login?loggedOut=1')
})
