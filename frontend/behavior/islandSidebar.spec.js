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
import { modalFocusState } from '../src/composables/useModalFocus.js'
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
  subscribeFeedbackUnread.mockReset()
  logout.mockReset(); dialog.confirm.mockReset()
})
const render = () => mount(Sidebar, { attachTo: document.body, global: { stubs: { RouterLink: RouterLinkStub, MobileHeader: { template: '<header><slot /></header>' } }, mocks: { $route: currentRoute } } })
const routes = wrapper => wrapper.findAllComponents(RouterLinkStub).map(node => node.props('to'))

it.each([['/star', '星石背包'], ['/cart', '礼包计算器'], ['/feedback', '我的反馈']])('手机 %s 使用简洁页面标题，保留原路由元信息', (path, title) => {
  Object.assign(currentRoute, { path, meta: { title: '原有完整标题 — YuanHub' } })
  const wrapper = render()
  expect(wrapper.get('.mobile-page-title').text()).toBe(title)
  expect(currentRoute.meta.title).toBe('原有完整标题 — YuanHub')
})

function dispatchTouch(target, type, x, y, count = 1) {
  const point = { identifier: 7, clientX: x, clientY: y }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, {
    touches: type === 'touchend' || type === 'touchcancel' ? [] : Array(count).fill(point),
    changedTouches: [point],
  })
  target.dispatchEvent(event)
  return event
}

function swipeSurface(markup = '<main><p>页面正文</p></main>') {
  vi.stubGlobal('innerWidth', 390)
  const surface = document.createElement('div')
  surface.innerHTML = markup
  document.body.append(surface)
  return surface.firstElementChild
}

it('手机正文右滑打开同一目录，保留原生事件和关闭后菜单焦点', async () => {
  const wrapper = render()
  const surface = swipeSurface()
  dispatchTouch(surface, 'touchstart', 60, 200)
  const end = dispatchTouch(surface, 'touchend', 180, 210)
  await flushPromises()
  expect(end.defaultPrevented).toBe(false)
  expect(wrapper.get('.mobile-menu-button').attributes('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(wrapper.get('#mobile-main-nav').element)
  expect(document.body.classList.contains('mobile-nav-open')).toBe(true)
  await wrapper.get('.mobile-drawer-close').trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('.mobile-menu-button').element)
  expect(document.body.classList.contains('mobile-nav-open')).toBe(false)
})

it.each([
  ['左滑', 160, 200, 60, 200],
  ['短滑', 60, 200, 90, 200],
  ['竖滑', 60, 200, 70, 330],
  ['斜滑', 60, 200, 180, 260],
  ['浏览器左边缘', 10, 200, 180, 200],
  ['浏览器右边缘', 380, 200, 490, 200],
])('%s 不打开目录', async (_, x, y, toX, toY) => {
  const wrapper = render()
  const surface = swipeSurface()
  dispatchTouch(surface, 'touchstart', x, y)
  dispatchTouch(surface, 'touchend', toX, toY)
  await flushPromises()
  expect(wrapper.find('.mobile-drawer-layer').exists()).toBe(false)
})

it.each(['<input type="date">', '<textarea></textarea>', '<select></select>', '<button>操作</button>', '<a href="#">链接</a>', '<div contenteditable="true"><span>编辑</span></div>', '<div role="tablist"><span>页签</span></div>'])('控件 %s 保留自己的手势', async markup => {
  const wrapper = render()
  const surface = swipeSurface(markup)
  const target = surface.firstElementChild || surface
  dispatchTouch(target, 'touchstart', 60, 200)
  dispatchTouch(target, 'touchend', 180, 200)
  await flushPromises()
  expect(wrapper.find('.mobile-drawer-layer').exists()).toBe(false)
})

it('横向滚动容器内的正文不触发目录', async () => {
  const wrapper = render()
  const surface = swipeSurface('<div style="overflow-x:auto"><p>横向表格</p></div>')
  Object.defineProperties(surface, { scrollWidth: { value: 800 }, clientWidth: { value: 300 } })
  dispatchTouch(surface.firstElementChild, 'touchstart', 60, 200)
  dispatchTouch(surface.firstElementChild, 'touchend', 180, 200)
  await flushPromises()
  expect(wrapper.find('.mobile-drawer-layer').exists()).toBe(false)
})

it.each(['竖向滚动', '多指', '取消', '慢拖', '路由切换', '切换桌面'])('%s 中断后不把后续移动当作右滑', async action => {
  const wrapper = render()
  const surface = swipeSurface()
  dispatchTouch(surface, 'touchstart', 60, 200)
  if (action === '竖向滚动') dispatchTouch(surface, 'touchmove', 65, 250)
  if (action === '多指') dispatchTouch(surface, 'touchmove', 65, 200, 2)
  if (action === '取消') dispatchTouch(surface, 'touchcancel', 65, 200)
  if (action === '慢拖') vi.advanceTimersByTime(700)
  if (action === '路由切换') {
    Object.assign(currentRoute, { path: '/inventory', fullPath: '/inventory' })
    await flushPromises()
  }
  if (action === '切换桌面') vi.stubGlobal('innerWidth', 1440)
  dispatchTouch(surface, 'touchend', 180, 200)
  await flushPromises()
  expect(wrapper.find('.mobile-drawer-layer').exists()).toBe(false)
})

it('桌面触控及现有弹窗期间不打开目录，卸载清理触控监听', async () => {
  const wrapper = render()
  const surface = swipeSurface()
  vi.stubGlobal('innerWidth', 1440)
  dispatchTouch(surface, 'touchstart', 60, 200)
  vi.stubGlobal('innerWidth', 390)
  dispatchTouch(surface, 'touchend', 180, 200)
  await flushPromises()
  expect(wrapper.find('.mobile-drawer-layer').exists()).toBe(false)
  modalFocusState.active = true
  try {
    dispatchTouch(surface, 'touchstart', 60, 200)
    dispatchTouch(surface, 'touchend', 180, 200)
    await flushPromises()
    expect(wrapper.find('.mobile-drawer-layer').exists()).toBe(false)
  } finally {
    modalFocusState.active = false
  }
  const remove = vi.spyOn(document, 'removeEventListener')
  wrapper.unmount()
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) expect(remove).toHaveBeenCalledWith(type, expect.any(Function))
})

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
  await wrapper.get('.mobile-menu-button').trigger('click')
  const feedbackLinks = wrapper.findAllComponents(RouterLinkStub).filter(link => link.props('to') === '/feedback/plaza')
  expect(feedbackLinks).toHaveLength(2)
  for (const link of feedbackLinks) expect(link.element.closest('details')).toBeNull()
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
it('招募入口对访客和普通用户公开，不再读取独立招募授权', async () => {
  const wrapper = render(); await flushPromises()
  expect(routes(wrapper)).toContain('/recruitment')
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'user-a' }
  await flushPromises()
  expect(routes(wrapper)).toContain('/recruitment')
  expect(recruitmentAccess.setIdentity).not.toHaveBeenCalled()
  expect(recruitmentAccess.refresh).not.toHaveBeenCalled()
})
it('导航不订阅管理员反馈未读，也不自行维护通知轮询', async () => {
  auth.accessToken = 'test-only'; auth.userInfo = { user_name: '测试殿下' }
  const wrapper = render(); await flushPromises()
  wrapper.unmount()
  expect(subscribeFeedbackUnread).not.toHaveBeenCalled()
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


it('双端按确认方案分组排序，常用入口直达并使用相同图标', async () => {
  isFeatureEnabled.mockReturnValue(true)
  Object.assign(auth, { accessToken: 'fixture', userInfo: { id: 'navigation-groups' }, adminAccessLoaded: true, adminAccess: { superAdmin: true, permissions: ['archive:access'] } })
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  const expected = ['/', '/operator', '/recruitment', '/inventory', '/star', '/cart', '/calendar', '/achievement', '/bonds', '/feedback', '/manage', '/developers', '/changelog', '/roadmap', '/beta', '/install']
  const linksIn = selector => wrapper.get(selector).findAllComponents(RouterLinkStub)
  expect(linksIn('.nav').map(link => link.props('to'))).toEqual(expected)
  expect(linksIn('.mobile-drawer-nav').map(link => link.props('to'))).toEqual(expected)
  for (const selector of ['.nav', '.mobile-drawer-nav']) {
    expect(wrapper.get(selector).findAll('.nav-group-label').map(label => label.text())).toEqual(['玩家工具', '资料与记录', '管理'])
    for (const link of linksIn(selector).slice(0, 11)) {
      expect(link.element.closest('details')).toBeNull()
      expect(link.find('svg').exists()).toBe(true)
    }
  }
  for (let i = 0; i < expected.length; i++) expect(linksIn('.nav')[i].get('svg').attributes('class')).toBe(linksIn('.mobile-drawer-nav')[i].get('svg').attributes('class'))
  expect(wrapper.find('.no').exists()).toBe(false)
  expect(wrapper.findAll('.sidebar-more')).toHaveLength(1)
  expect(wrapper.get('.sidebar-more').element.closest('.nav')).not.toBeNull()
  expect(wrapper.find('.island-foot .sidebar-more').exists()).toBe(false)
  expect(wrapper.find('.island-foot .sidebar-account-menu').exists()).toBe(true)
  expect(wrapper.find('.admin-pins-label').exists()).toBe(false)
})
it('关闭活动flag时两处导航都没有入口', async () => {
  isFeatureEnabled.mockImplementation(key => key !== FEATURE_KEYS.ACTIVITY_CALENDAR)
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'admin-a' }; auth.isAdmin = true
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  expect(routes(wrapper)).not.toContain('/calendar')
})


it('日历双端入口公开，普通用户不需要管理权限；访问资格由路由校验', async () => {
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  expect(routes(wrapper).filter(path => path === '/calendar')).toHaveLength(2)
  auth.accessToken = 'test-only'; auth.userInfo = { id: 'user-a' }; auth.isAdmin = false
  await flushPromises()
  expect(routes(wrapper).filter(path => path === '/calendar')).toHaveLength(2)
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
  expect(wrapper.findAll('.nav-group-label').filter(label => label.text() === '管理')).toHaveLength(2)
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

it('普通功能保持直达，更多默认收起且版本信息不重复跳转', async () => {
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  const expected = ['/', '/operator', '/recruitment', '/inventory', '/star', '/cart', '/calendar', '/feedback/plaza']
  for (const selector of ['.nav', '.mobile-drawer-nav']) {
    const links = wrapper.get(selector).findAllComponents(RouterLinkStub).filter(link => !link.element.closest('details'))
    expect(links.map(link => link.props('to'))).toEqual(expected)
    expect(wrapper.get(selector).findAll('.nav-group-label').map(label => label.text())).toEqual(['玩家工具', '资料与记录'])
  }
  expect(wrapper.get('.sidebar-more').attributes('open')).toBeUndefined()
  expect(wrapper.get('.mobile-more').attributes('open')).toBeUndefined()
  expect(wrapper.findAll('.foot-version')).toHaveLength(2)
  for (const version of wrapper.findAll('.foot-version')) {
    expect(version.element.tagName).toBe('SPAN')
    expect(version.text()).toMatch(/^YuanHub v/)
  }
})

it.each([false, true])('软下线后游客/管理员双端均无大饼入口（管理员=%s）', async admin => {
  if (admin) Object.assign(auth, { accessToken: 'test-only', userInfo: { id: 'admin-a' }, adminAccess: { superAdmin: true }, adminAccessLoaded: true })
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  expect(routes(wrapper).some(path => typeof path === 'string' && path.startsWith('/co-creation'))).toBe(false)
  expect(wrapper.text()).not.toContain('大饼中心')
  for (const selector of ['.sidebar-more', '.mobile-more']) {
    const detail = wrapper.get(selector)
    await detail.get('summary').trigger('click')
    expect(detail.findAllComponents(RouterLinkStub).map(link => link.props('to'))).toEqual(['/developers', '/changelog', '/roadmap', '/beta', '/install'])
  }
  wrapper.unmount()
})

it('访客可从双端更多进入发展规划，当前位置有明确标识', async () => {
  Object.assign(currentRoute, { path: '/roadmap', fullPath: '/roadmap', meta: { title: '发展规划 — YuanHub' } })
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  for (const selector of ['.sidebar-more', '.mobile-more']) {
    const detail = wrapper.get(selector)
    expect(detail.get('summary').classes()).toContain('in-current-section')
    expect(detail.get('summary').classes()).not.toContain('active')
    expect(detail.attributes('open')).toBeDefined()
    const link = detail.findAllComponents(RouterLinkStub).find(link => link.props('to') === '/roadmap')
    expect(link.text()).toBe('发展规划')
    expect(link.attributes('aria-current')).toBe('page')
  }
  wrapper.unmount()
})

it('反馈直达入口不显示管理员未读，更多不重复展示反馈，双端账号与通知可达', async () => {
  Object.assign(auth, { accessToken: 'test-only', userInfo: { id: 'user-a', user_name: '测试殿下' } })
  const wrapper = render()
  feedbackUnreadState.count = 108
  notificationUnreadState.count = 2
  await flushPromises()
  await wrapper.get('.mobile-menu-button').trigger('click')
  const feedbackLinks = wrapper.findAllComponents(RouterLinkStub).filter(link => link.props('to') === '/feedback')
  expect(feedbackLinks).toHaveLength(2)
  for (const link of feedbackLinks) {
    expect(link.element.closest('details')).toBeNull()
    expect(link.text()).toBe('反馈中心')
    expect(link.find('.more-feedback-badge').exists()).toBe(false)
  }
  for (const selector of ['.sidebar-more > summary', '.mobile-more > summary']) {
    expect(wrapper.get(selector).attributes('aria-label')).toBe('更多')
    expect(wrapper.get(selector).find('.more-feedback-badge').exists()).toBe(false)
  }
  expect(wrapper.get('.sidebar-notifications').attributes('aria-label')).toBe('通知，2 条未读')
  expect(wrapper.get('.sidebar-utilities').text()).toContain('账号与连接码')
  expect(wrapper.get('.mobile-drawer-foot').text()).toContain('账号与连接码')
  for (const selector of ['.sidebar-more', '.mobile-more']) {
    const detail = wrapper.get(selector)
    await detail.get('summary').trigger('click')
    expect(detail.attributes('open')).toBeDefined()
    const paths = detail.findAllComponents(RouterLinkStub).map(link => link.props('to'))
    expect(paths).toEqual(['/developers', '/changelog', '/roadmap', '/beta', '/install'])
  }
  feedbackUnreadState.count = 0
  await flushPromises()
  expect(wrapper.findAll('.more-feedback-badge')).toHaveLength(0)
})

it.each([3, 108])('管理员有 %i 条待阅反馈时，双端反馈中心仍不显示管理角标', async count => {
  Object.assign(auth, {
    accessToken: 'test-only', userInfo: { id: 'admin-a' },
    adminAccessLoaded: true, adminAccess: { superAdmin: true }
  })
  feedbackUnreadState.count = count
  notificationUnreadState.count = 2
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  const feedbackLinks = wrapper.findAllComponents(RouterLinkStub).filter(link => link.props('to') === '/feedback')
  expect(feedbackLinks).toHaveLength(2)
  for (const link of feedbackLinks) expect(link.text()).toBe('反馈中心')
  expect(routes(wrapper).filter(path => path === '/manage')).toHaveLength(2)
  expect(wrapper.find('.more-feedback-badge').exists()).toBe(false)
  expect(subscribeFeedbackUnread).not.toHaveBeenCalled()
  expect(wrapper.get('.sidebar-notifications').attributes('aria-label')).toBe('通知，2 条未读')
  expect(wrapper.get('.mobile-header-badge').text()).toBe('2')
})

it.each([[false, '/feedback/plaza'], [true, '/feedback']])('反馈页只高亮独立入口，登录状态：%s', async (loggedIn, path) => {
  if (loggedIn) Object.assign(auth, { accessToken: 'test-only', userInfo: { id: 'user-a' } })
  Object.assign(currentRoute, { path, fullPath: path })
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  const selected = wrapper.findAllComponents(RouterLinkStub).filter(link => link.classes().includes('active'))
  expect(selected.map(link => link.props('to'))).toEqual([path, path])
  expect(wrapper.get('.sidebar-more > summary').classes()).not.toContain('active')
  expect(wrapper.get('.mobile-more > summary').classes()).not.toContain('active')
})

it('桌面流内更多可用 Escape 关闭并恢复焦点，点击外部保留展开，普通路由变化关闭', async () => {
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
  expect(detail.element.open).toBe(true)
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

it.each(['/manage', '/manage/', '/operator/admin', '/operator/admin/', '/calendar/admin', '/calendar/admin/', '/feedback/manage', '/feedback/admin', '/admin/changelog'])('%s 双端只归属管理，不高亮玩家入口或更多', async path => {
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


it('普通登录用户可见成就，羁绊仍需授权，退出后隐藏成就', async () => {
  isFeatureEnabled.mockReturnValue(true)
  auth.accessToken = 'fixture'; auth.userInfo = { id: 'member' }
  auth.adminAccess = { permissions: ['achievement_catalog:write', 'bond_catalog:write'] }
  const wrapper = render()
  expect(routes(wrapper)).toContain('/achievement')
  expect(routes(wrapper)).not.toContain('/bonds')
  auth.adminAccess = { permissions: ['archive:access'] }; await flushPromises()
  expect(routes(wrapper)).toContain('/achievement')
  expect(routes(wrapper)).toContain('/bonds')
  auth.adminAccess = { permissions: [] }; await flushPromises()
  expect(routes(wrapper)).toContain('/achievement')
  expect(routes(wrapper)).not.toContain('/bonds')
  auth.adminAccess = { permissions: ['archive:access'] }; auth.accessToken = ''; await flushPromises()
  expect(routes(wrapper)).not.toContain('/achievement')
  wrapper.unmount()
})


it('固定的管理入口双端直达且单独高亮，撤权和切换账号后隐藏', async () => {
  localStorage.setItem('yh_admin_nav_pins:sidebar-pins-user', JSON.stringify(['feedback-manage', 'feedback-access', 'unknown']))
  Object.assign(auth, { accessToken: 'fixture', userInfo: { id: 'sidebar-pins-user' }, adminAccessLoaded: true, adminAccess: { operatorAreas: ['UI'] } })
  Object.assign(currentRoute, { path: '/feedback/manage/', fullPath: '/feedback/manage/' })
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  expect(routes(wrapper).filter(path => path === '/feedback/manage')).toHaveLength(2)
  expect(routes(wrapper)).not.toContain('/feedback/admin')
  expect(wrapper.findAllComponents(RouterLinkStub).filter(link => link.classes().includes('active')).map(link => link.props('to'))).toEqual(['/feedback/manage', '/feedback/manage'])
  expect(routes(wrapper).filter(path => path === '/manage')).toHaveLength(2)
  auth.adminAccessLoading = true; await flushPromises()
  expect(routes(wrapper)).not.toContain('/feedback/manage')
  auth.adminAccessLoading = false; await flushPromises()
  expect(routes(wrapper).filter(path => path === '/feedback/manage')).toHaveLength(2)
  auth.userInfo = { id: 'sidebar-other-user' }; await flushPromises()
  expect(routes(wrapper)).not.toContain('/feedback/manage')
  auth.userInfo = { id: 'sidebar-pins-user' }; auth.adminAccess = { permissions: [] }; await flushPromises()
  expect(routes(wrapper)).not.toContain('/feedback/manage')
  wrapper.unmount()
})


it('更多随当前位置展开，允许收起；路由跳转恢复当前位置并关闭手机抽屉', async () => {
  const wrapper = render()
  const details = wrapper.get('.sidebar-more')
  Object.assign(currentRoute, { path: '/developers/api/operator', fullPath: '/developers/api/operator' })
  await flushPromises()
  expect(details.element.open).toBe(true)
  expect(details.get('a.active').text()).toBe('开发者中心')
  expect(details.get('a.active').attributes('aria-current')).toBe('page')
  await details.get('summary').trigger('click')
  expect(details.element.open).toBe(false)
  await wrapper.get('.mobile-menu-button').trigger('click')
  expect(wrapper.get('.mobile-more').element.open).toBe(true)
  Object.assign(currentRoute, { path: '/changelog', fullPath: '/changelog' })
  await flushPromises()
  expect(details.element.open).toBe(true)
  expect(wrapper.find('.mobile-drawer-layer').exists()).toBe(false)
  details.get('a.active').element.focus()
  await details.trigger('keydown', { key: 'Escape' })
  expect(details.element.open).toBe(false)
  expect(document.activeElement).toBe(details.get('summary').element)
  Object.assign(currentRoute, { path: '/achievement', fullPath: '/achievement' })
  await flushPromises()
  expect(details.element.open).toBe(false)
})

it('成就页双端只有成就入口高亮，首页无第二个选中态', async () => {
  isFeatureEnabled.mockReturnValue(true)
  Object.assign(auth, { accessToken: 'fixture', userInfo: { id: 'archive-navigation' }, adminAccess: { permissions: ['archive:access'] } })
  Object.assign(currentRoute, { path: '/achievement', fullPath: '/achievement' })
  const wrapper = render()
  await wrapper.get('.mobile-menu-button').trigger('click')
  for (const selector of ['.nav', '.mobile-drawer-nav']) {
    const selected = wrapper.get(selector).findAllComponents(RouterLinkStub).filter(link => link.classes().includes('active'))
    expect(selected.map(link => link.props('to'))).toEqual(['/achievement'])
    expect(selected[0].attributes('aria-current')).toBe('page')
  }
})


it('桌面账号菜单保留主题与账号入口，Esc 关闭并恢复焦点', async () => {
  auth.accessToken = 'fixture'; auth.userInfo = { id: 'account-menu', user_name: '测试殿下' }
  const wrapper = render()
  const menu = wrapper.get('.sidebar-account-menu')
  const trigger = menu.get('summary')
  await trigger.trigger('click')
  expect(menu.element.open).toBe(true)
  expect(menu.findAllComponents(RouterLinkStub).map(link => link.props('to'))).toContain('/user/profile')
  expect(menu.get('.theme-selector').findAll('button').map(button => button.text())).toEqual(['浅色', '深色', '跟随系统'])
  const themeButton = menu.get('.theme-selector button')
  themeButton.element.focus()
  expect(menu.element.open).toBe(true)
  await themeButton.trigger('keydown', { key: 'Escape' })
  expect(menu.element.open).toBe(false)
  expect(document.activeElement).toBe(trigger.element)
})

it('账号菜单在点击外部、焦点离开、切换路由或身份时收起', async () => {
  const wrapper = render()
  const menu = wrapper.get('.sidebar-account-menu')
  const trigger = menu.get('summary')
  await trigger.trigger('click')
  await wrapper.get('.brand').trigger('pointerdown')
  expect(menu.element.open).toBe(false)
  await trigger.trigger('click')
  trigger.element.focus()
  wrapper.get('.brand').element.setAttribute('tabindex', '0')
  wrapper.get('.brand').element.focus()
  expect(menu.element.open).toBe(false)
  await trigger.trigger('click')
  Object.assign(currentRoute, { path: '/inventory', fullPath: '/inventory' })
  await flushPromises()
  expect(menu.element.open).toBe(false)
  await trigger.trigger('click')
  auth.accessToken = 'fixture'; auth.userInfo = { id: 'other-account' }
  await flushPromises()
  expect(menu.element.open).toBe(false)
  const remove = vi.spyOn(document, 'removeEventListener')
  wrapper.unmount()
  expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function))
})

it('桌面菜单退出仍先确认，取消后保留账号并回到菜单入口', async () => {
  auth.accessToken = 'fixture'; auth.userInfo = { id: 'logout-menu' }
  const wrapper = render()
  const menu = wrapper.get('.sidebar-account-menu')
  dialog.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  await menu.get('summary').trigger('click')
  await menu.get('.foot-logout').trigger('click')
  await flushPromises()
  expect(menu.element.open).toBe(false)
  expect(document.activeElement).toBe(menu.get('summary').element)
  expect(logout).not.toHaveBeenCalled()
  await menu.get('summary').trigger('click')
  await menu.get('.foot-logout').trigger('click')
  await flushPromises()
  expect(logout).toHaveBeenCalledWith('/login?loggedOut=1')
})
