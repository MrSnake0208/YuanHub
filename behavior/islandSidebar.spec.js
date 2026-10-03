import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import Sidebar from '../src/components/IslandSidebar.vue'
import { auth } from '../src/store/auth.js'
import { recruitmentAccess } from '../src/store/recruitmentAccess.js'
import { notificationUnreadState } from '../src/store/notificationUnread.js'
import { subscribeFeedbackUnread } from '../src/store/feedbackUnread.js'
import { logout } from '../src/store/auth.js'
import { isFeatureEnabled, FEATURE_KEYS } from '../src/config/features.js'
import { dialog } from '../src/utils/dialog.js'
vi.mock('../src/config/features.js', async importOriginal => {
  const original = await importOriginal()
  return { ...original, isFeatureEnabled: vi.fn(original.isFeatureEnabled) }
})
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null }), logout: vi.fn() }
})
vi.mock('../src/store/recruitmentAccess.js', async () => {
  const { reactive } = await import('vue')
  return { recruitmentAccess: reactive({ canAccess: false, setIdentity: vi.fn(), refresh: vi.fn().mockResolvedValue(null) }) }
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
  isFeatureEnabled.mockImplementation(key => [FEATURE_KEYS.ACTIVITY_CALENDAR, FEATURE_KEYS.RECRUITMENT_ARCHIVE].includes(key))
  auth.accessToken = ''; auth.userInfo = null; auth.isAdmin = false
  recruitmentAccess.canAccess = false; recruitmentAccess.setIdentity.mockClear(); recruitmentAccess.refresh.mockClear()
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
it('招募档案导航只对拥有独立招募访问权限的登录用户显示', async () => {
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'user-a', user_name: '测试殿下' }
  let wrapper = render(); await flushPromises()
  expect(routes(wrapper)).not.toContain('/recruitment')
  expect(recruitmentAccess.setIdentity).toHaveBeenCalledWith('user-a')
  expect(recruitmentAccess.refresh).toHaveBeenCalled()
  wrapper.unmount()

  recruitmentAccess.canAccess = true
  wrapper = render(); await flushPromises()
  expect(routes(wrapper)).toContain('/recruitment')
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


it('管理员活动日历桌面/手机入口紧跟今日一览，原导航编号保留', async () => {
  const wrapper = render()
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'admin-a' }; auth.isAdmin = true
  await flushPromises()
  const desktopLinks = wrapper.findAll('.island .nav a')
  expect(desktopLinks[1].text()).toBe('活动日历')
  expect(desktopLinks[2].text()).toBe('01密探名册')
  await wrapper.get('.mobile-menu-button').trigger('click')
  const links = wrapper.findAll('#mobile-main-nav .mobile-drawer-section')[0].findAll('a')
  expect(links[1].text()).toBe('活动日历')
  expect(links[1].find('svg').exists()).toBe(true)
})
it('关闭活动flag时两处导航都没有入口', async () => {
  isFeatureEnabled.mockImplementation(key => key !== FEATURE_KEYS.ACTIVITY_CALENDAR)
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'admin-a' }; auth.isAdmin = true
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  expect(routes(wrapper)).not.toContain('/calendar')
})


it('访客、普通用户和权限未加载时两处导航不显示日历；权限撤销立即隐藏', async () => {
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  expect(routes(wrapper)).not.toContain('/calendar')
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'user-a' }
  await flushPromises()
  expect(routes(wrapper)).not.toContain('/calendar')
  auth.isAdmin = true
  await flushPromises()
  expect(routes(wrapper).filter(path => path === '/calendar')).toHaveLength(2)
  auth.isAdmin = false
  await flushPromises()
  expect(routes(wrapper)).not.toContain('/calendar')
})
