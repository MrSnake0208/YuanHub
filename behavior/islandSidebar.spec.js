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
import { useRoute } from 'vue-router'
import { feedbackUnreadState } from '../src/store/feedbackUnread.js'
import { beta } from '../src/store/beta.js'
import { betaCommunity } from '../src/store/betaCommunity.js'
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
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ path: '/', fullPath: '/', meta: { title: '今日一览 — YuanHub' } })
  return { useRouter: () => ({ push: vi.fn() }), useRoute: () => route }
})
vi.mock('../src/store/beta.js', async () => {
  const { reactive } = await import('vue')
  return { beta: reactive({ campaign: { accessMode: 'BETA' }, mine: { canUseBetaFeatures: false, enrollmentStatus: '' } }) }
})
vi.mock('../src/store/betaCommunity.js', () => ({ betaCommunity: { open: vi.fn() } }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('../src/store/notificationUnread.js', async () => {
  const { reactive } = await import('vue')
  return { notificationUnreadState: reactive({ count: 0 }) }
})
vi.mock('../src/store/feedbackUnread.js', async () => {
  const { reactive } = await import('vue')
  return { feedbackUnreadState: reactive({ count: 0 }), subscribeFeedbackUnread: vi.fn() }
})
const currentRoute = useRoute()
let unsubscribe
beforeEach(() => {
  vi.useFakeTimers()
  isFeatureEnabled.mockImplementation(key => [FEATURE_KEYS.ACTIVITY_CALENDAR, FEATURE_KEYS.RECRUITMENT_ARCHIVE].includes(key))
  auth.accessToken = ''; auth.userInfo = null; auth.isAdmin = false
  auth.adminAccess = null; auth.adminAccessLoaded = false; auth.adminAccessLoading = false; auth.adminAccessError = ''
  recruitmentAccess.canAccess = false; recruitmentAccess.setIdentity.mockClear(); recruitmentAccess.refresh.mockClear()
  notificationUnreadState.count = 0; feedbackUnreadState.count = 0
  Object.assign(currentRoute, { path: '/', fullPath: '/', meta: { title: '今日一览 — YuanHub' } })
  beta.mine.canUseBetaFeatures = false; beta.mine.enrollmentStatus = ''
  betaCommunity.open.mockClear()
  unsubscribe = vi.fn(); subscribeFeedbackUnread.mockReturnValue(unsubscribe)
  logout.mockReset(); dialog.confirm.mockReset()
})
const render = () => mount(Sidebar, { attachTo: document.body, global: { stubs: { RouterLink: RouterLinkStub, MobileHeader: { template: '<header><slot /></header>' } }, mocks: { $route: currentRoute } } })
const routes = wrapper => wrapper.findAllComponents(RouterLinkStub).map(node => node.props('to'))
it('移动导航关闭时仍提供教程末步的可达菜单目标', () => {
  const wrapper = render()
  expect(wrapper.find('.mobile-drawer-layer').exists()).toBe(false)
  const target = wrapper.get('[data-tour="replay-menu"]')
  expect(target.attributes('aria-label')).toBe('打开导航')
  expect(target.attributes('aria-expanded')).toBe('false')
})
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
  expect(wrapper.get('#mobile-main-nav').text()).not.toContain('实操教程')
  await wrapper.get('.mobile-more > summary').trigger('click')
  expect(wrapper.get('.mobile-more').attributes('open')).toBeDefined()
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


it('管理员活动日历双端下移至账房之后，密探与数据入口优先且编号保留', async () => {
  const wrapper = render()
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'admin-a' }; auth.isAdmin = true
  await flushPromises()
  const desktopLinks = wrapper.findAll('.island .nav a')
  expect(desktopLinks.at(-1).text()).toBe('活动日历')
  expect(desktopLinks[1].text()).toBe('01密探名册')
  await wrapper.get('.mobile-menu-button').trigger('click')
  const links = wrapper.findAll('#mobile-main-nav .mobile-drawer-section')[0].findAll('a')
  expect(links.at(-1).text()).toBe('活动日历')
  expect(links.at(-1).find('svg').exists()).toBe(true)
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

it.each([
  ['单项目录权限', { permissions: ['recruitment_catalog:write'] }],
  ['仅反馈操作员', { operatorAreas: ['INVENTORY'] }],
  ['仅反馈开发人员', { developerAreas: ['UI'] }],
  ['超级管理员', { superAdmin: true }],
])('%s 在双端只有独立工作台入口，撤权后消失', async (_, access) => {
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'admin-a' }
  auth.adminAccess = access; auth.adminAccessLoaded = true
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  const desktopLink = wrapper.findAllComponents(RouterLinkStub).find(link => link.props('to') === '/manage' && link.element.closest('.island'))
  expect(desktopLink.text()).toBe('管理工作台')
  const group = wrapper.get('.mobile-management')
  expect(group.findAllComponents(RouterLinkStub).map(link => link.props('to'))).toEqual(['/manage'])
  expect(wrapper.find('.nav-lb,.mobile-drawer-label').exists()).toBe(false)
  expect(routes(wrapper).filter(path => path === '/manage')).toHaveLength(2)
  for (const path of ['/recruitment/admin', '/feedback/manage', '/admin/roles', '/admin/audit']) expect(routes(wrapper)).not.toContain(path)

  auth.adminAccess = { permissions: [] }
  await flushPromises()
  expect(routes(wrapper)).not.toContain('/manage')
  expect(wrapper.findAll('.nav-lb,.mobile-drawer-label').map(label => label.text())).not.toContain('管理')
  wrapper.unmount()
})

it.each([
  ['未登录，即便留有授权', { accessToken: '', adminAccessLoaded: true }],
  ['权限尚未加载', { adminAccessLoaded: false }],
  ['重新加载期间留有旧授权', { adminAccessLoading: true }],
  ['读取失败，即便留有旧授权', { adminAccessError: '读取失败' }],
  ['普通用户', { adminAccess: { permissions: [] } }],
  ['只有管理员角色标签', { adminAccess: { roles: ['PLATFORM_ADMIN'] } }],
  ['仅接收反馈通知', { adminAccess: { receiveAreas: ['UI'] } }],
])('%s 不显示双端管理分组或占位', async (_, state) => {
  Object.assign(auth, { accessToken: 'test-only', userInfo: { id: 'user-a' }, adminAccess: { permissions: ['admin:audit:read'] }, adminAccessLoaded: true }, state)
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  expect(routes(wrapper)).not.toContain('/manage')
  expect(wrapper.findAll('.nav-lb,.mobile-drawer-label').map(label => label.text())).not.toContain('管理')
  wrapper.unmount()
})

it('授权异步成功后双端同步显示，刷新与失败时立即隐藏并可恢复', async () => {
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'admin-a' }
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  expect(routes(wrapper)).not.toContain('/manage')
  Object.assign(auth, { adminAccess: { permissions: ['changelog:review'] }, adminAccessLoaded: true })
  await flushPromises()
  expect(routes(wrapper).filter(path => path === '/manage')).toHaveLength(2)
  auth.adminAccessLoading = true
  await flushPromises()
  expect(routes(wrapper)).not.toContain('/manage')
  Object.assign(auth, { adminAccessLoading: false, adminAccessError: '读取失败' })
  await flushPromises()
  expect(routes(wrapper)).not.toContain('/manage')
  auth.adminAccessError = ''
  await flushPromises()
  expect(routes(wrapper).filter(path => path === '/manage')).toHaveLength(2)
  auth.accessToken = ''
  await flushPromises()
  expect(routes(wrapper)).not.toContain('/manage')
  wrapper.unmount()
})

it('常用功能保持双端一致顺序和直达，不增加分类标题或账房第二行', async () => {
  Object.assign(auth, { accessToken: 'test-only', userInfo: { id: 'user-a' }, isAdmin: true })
  recruitmentAccess.canAccess = true
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  const expected = ['/', '/operator', '/recruitment', '/inventory', '/star', '/cart', '/calendar']
  const linksIn = selector => wrapper.get(selector).findAllComponents(RouterLinkStub).map(link => link.props('to'))
  expect(linksIn('.island .nav')).toEqual(expected)
  expect(linksIn('.mobile-drawer-nav > .mobile-drawer-section')).toEqual(expected)
  expect(wrapper.find('.nav-lb,.mobile-drawer-label').exists()).toBe(false)
  expect(wrapper.get('.mobile-drawer-nav > .mobile-drawer-section').text()).not.toContain('礼包预算')
  expect(wrapper.get('.sidebar-more').attributes('open')).toBeUndefined()
  expect(wrapper.get('.mobile-more').attributes('open')).toBeUndefined()
})

it('更多收起时保留反馈未读，双端辅助区保持账号与通知可达', async () => {
  Object.assign(auth, { accessToken: 'test-only', userInfo: { id: 'user-a', user_name: '测试殿下' } })
  const wrapper = render()
  feedbackUnreadState.count = 108
  notificationUnreadState.count = 2
  await flushPromises()
  await wrapper.get('.mobile-menu-button').trigger('click')
  for (const selector of ['.sidebar-more > summary', '.mobile-more > summary']) {
    expect(wrapper.get(selector).attributes('aria-label')).toBe('更多，99+ 条反馈未读')
    expect(wrapper.get(selector).text()).toContain('99+')
  }
  expect(wrapper.get('.sidebar-notifications').attributes('aria-label')).toBe('通知，2 条未读')
  expect(wrapper.get('.sidebar-utilities').text()).toContain('账号与连接码')
  expect(wrapper.get('.mobile-drawer-foot').text()).toContain('账号与连接码')
  for (const selector of ['.sidebar-more', '.mobile-more']) {
    const detail = wrapper.get(selector)
    await detail.get('summary').trigger('click')
    expect(detail.attributes('open')).toBeDefined()
    const paths = detail.findAllComponents(RouterLinkStub).map(link => link.props('to'))
    expect(paths).toEqual(['/feedback', '/co-creation', '/changelog', '/beta', '/install'])
  }
  feedbackUnreadState.count = 0
  await flushPromises()
  expect(wrapper.findAll('.more-feedback-badge')).toHaveLength(0)
})

it('桌面更多可用 Escape 关闭并恢复焦点，点击外部和路由变化也关闭', async () => {
  const wrapper = render()
  const detail = wrapper.get('.sidebar-more')
  const summary = detail.get('summary')
  await summary.trigger('click')
  expect(detail.element.open).toBe(true)
  await detail.trigger('keydown', { key: 'Escape' })
  expect(detail.element.open).toBe(false)
  expect(document.activeElement).toBe(summary.element)
  await summary.trigger('click')
  document.body.click()
  expect(detail.element.open).toBe(false)
  await summary.trigger('click')
  Object.assign(currentRoute, { path: '/cart', fullPath: '/cart' })
  await flushPromises()
  expect(detail.element.open).toBe(false)
})

it('更多不再打开全局教程选择器；内测群保持原动作', async () => {
  Object.assign(auth, { accessToken: 'test-only', userInfo: { id: 'user-a' } })
  Object.assign(beta.mine, { canUseBetaFeatures: true, enrollmentStatus: 'ACTIVE' })
  const wrapper = render()
  const desktop = wrapper.get('.sidebar-more')
  expect(wrapper.get('.sidebar-more > summary').attributes('data-tour')).toBe('replay-entry')
  await desktop.get('summary').trigger('click')
  expect(desktop.text()).not.toContain('实操教程')
  await wrapper.get('.mobile-menu-button').trigger('click')
  await wrapper.get('.mobile-more > summary').trigger('click')
  await wrapper.get('.mobile-more').findAll('button').find(button => button.text() === '内测交流群').trigger('click')
  expect(betaCommunity.open).toHaveBeenCalledWith('manual')
  expect(wrapper.find('.mobile-drawer-layer').exists()).toBe(false)
})

it.each(['/manage', '/manage/', '/operator/admin', '/operator/admin/', '/calendar/admin', '/calendar/admin/', '/feedback/manage', '/feedback/admin', '/co-creation/admin', '/admin/changelog'])('%s 双端只归属管理，不高亮玩家入口或更多', async path => {
  Object.assign(auth, { accessToken: 'test-only', userInfo: { id: 'admin-a' }, isAdmin: true, adminAccess: { superAdmin: true }, adminAccessLoaded: true })
  Object.assign(currentRoute, { path, fullPath: path })
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  const selected = wrapper.findAllComponents(RouterLinkStub).filter(link => link.classes().includes('active'))
  expect(selected.map(link => link.props('to'))).toEqual(['/manage', '/manage'])
  expect(wrapper.get('.sidebar-more > summary').classes()).not.toContain('active')
  expect(wrapper.get('.mobile-more > summary').classes()).not.toContain('active')
})

it.each([
  ['/today', '/'], ['/operator/quick', '/operator'], ['/calendar/suggestions/new', '/calendar'],
])('%s 仍归属普通玩家入口 %s', async (path, target) => {
  Object.assign(auth, { accessToken: 'test-only', userInfo: { id: 'admin-a' }, isAdmin: true, adminAccess: { superAdmin: true }, adminAccessLoaded: true })
  Object.assign(currentRoute, { path, fullPath: path })
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  const selected = wrapper.findAllComponents(RouterLinkStub).filter(link => link.classes().includes('active'))
  expect(selected.map(link => link.props('to'))).toEqual([target, target])
})
