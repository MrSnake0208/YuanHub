import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { routeLocationKey } from 'vue-router'
import TodayPage from '../src/pages/today/index.vue'
import TodayActivitySummary from '../src/components/today/TodayActivitySummary.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { getOperatorCurrent } from '../src/api/operator.js'
import { getCurrent, listAgentFavorites } from '../src/api/inventory.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { refreshNotificationUnread } from '../src/store/notificationUnread.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { isFeatureEnabled } from '../src/config/features.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: false, accessToken: '', userInfo: null }) }
})
vi.mock('../src/components/IslandSidebar.vue', () => ({ default: { template: '<nav />' } }))
vi.mock('../src/components/SiteFooter.vue', () => ({ default: { template: '<footer />' } }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCurrent: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), listAgentFavorites: vi.fn() }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/store/notificationUnread.js', () => ({ refreshNotificationUnread: vi.fn() }))
vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/config/features.js', async importOriginal => ({ ...(await importOriginal()), isFeatureEnabled: vi.fn(() => true) }))

const today = '2026-10-03'
const item = (patch = {}) => ({ id: 'evt-a', game: '如鸢', title: '今日公开活动', category: 'ACTIVITY', start_date: today, end_date: today, ...patch })
const accounts = [
  { id: 'acc-a', name: '大号', game: '代号鸢' },
  { id: 'acc-b', name: '小号', game: '如鸢' },
  { id: 'acc-c', name: '同游戏账号', game: '如鸢' },
]
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function signIn(values = accounts) {
  auth.isLoggedIn = true
  auth.isAdmin = true
  auth.accessToken = 'test-only'
  auth.userInfo = { user_name: '测试殿下' }
  listAccounts.mockResolvedValue(values)
}
const render = (component = TodayPage, props = {}) => mount(component, { props, global: { provide: { [routeLocationKey]: { fullPath: '/today' } }, stubs: { RouterLink: RouterLinkStub } } })
const card = wrapper => wrapper.get('.today-activity-summary')
const link = wrapper => card(wrapper).getComponent(RouterLinkStub)

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T04:00:00Z'))
  auth.isLoggedIn = false
  auth.isAdmin = false
  auth.accessToken = ''
  auth.userInfo = null
  activeAccount.clear()
  activeAccount.games = {}
  isFeatureEnabled.mockReturnValue(true)
  listAccounts.mockResolvedValue([])
  getOperatorCurrent.mockResolvedValue({ entries: { '1001': { level: 1 } } })
  getCurrent.mockResolvedValue({ entries: { coin: { count: 3 } } })
  listAgentFavorites.mockResolvedValue({ agent_ids: [] })
  getCurrentStarState.mockResolvedValue({ inventory: [{ id: 'star-a' }] })
  refreshNotificationUnread.mockResolvedValue({ count: 0 })
  listActivityCalendar.mockResolvedValue({ items: [item()] })
})
afterEach(() => { delete document.visibilityState })

it('无子账号管理员读全部游戏当日摘要，保留工具与建档', async () => {
  // Even a persisted selection is not a valid current account for these users.
  activeAccount.set('acc-a')
  activeAccount.setGame('代号鸢', 'acc-a')
  signIn([])
  const wrapper = render()
  await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
  expect(listActivityCalendar).toHaveBeenCalledWith({ game: '', from: today, to: today })
  expect(card(wrapper).text()).toContain('今日活动 · 全部游戏')
  expect(card(wrapper).text()).toContain('今日公开活动')
  expect(link(wrapper).props('to')).toEqual({ path: '/calendar', query: {} })
  expect(wrapper.find('.today-alert').exists()).toBe(false)
  expect(wrapper.get('.today-coming-soon').text()).toContain('从现有工具继续')
  expect(wrapper.get('[data-tour="today-overview"]').exists()).toBe(true)
  expect(wrapper.get('.data-onboarding').text()).toContain('先建立你的游戏子账号')
  const sections = wrapper.findAll('.today-content section')
  expect(sections.findIndex(node => node.classes().includes('today-activity-summary'))).toBeLessThan(sections.findIndex(node => node.classes().includes('today-coming-soon')))
})

it('有效当前账号按game筛选并传给日历链接，换到同游戏账号不重复读取', async () => {
  signIn()
  activeAccount.set('acc-b')
  const wrapper = render()
  await flushPromises()
  expect(listActivityCalendar.mock.lastCall[0]).toEqual({ game: '如鸢', from: today, to: today })
  expect(card(wrapper).text()).toContain('今日活动 · 如鸢')
  expect(link(wrapper).props('to')).toEqual({ path: '/calendar', query: { game: '如鸢' } })
  expect(wrapper.get('.data-account-context-bar').text()).toContain('小号')
  const calls = listActivityCalendar.mock.calls.length
  activeAccount.set('acc-c')
  await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(calls)
  expect(wrapper.get('.data-account-context-bar').text()).toContain('同游戏账号')
})

it.each(['success', 'failure'])('账号/game切换立即重读，旧响应%s不覆盖新摘要', async outcome => {
  signIn()
  const late = deferred()
  listActivityCalendar.mockImplementation(({ game }) => game === '代号鸢'
    ? late.promise : Promise.resolve({ items: [item({ title: '如鸢新摘要' })] }))
  const wrapper = render()
  await flushPromises()
  expect(card(wrapper).text()).toContain('正在读取')
  activeAccount.set('acc-b')
  await flushPromises()
  expect(listActivityCalendar.mock.lastCall[0].game).toBe('如鸢')
  expect(card(wrapper).text()).toContain('如鸢新摘要')
  if (outcome === 'success') late.resolve({ items: [item({ game: '代号鸢', title: '旧账号结果' })] })
  else late.reject(new Error('旧账号失败'))
  await flushPromises()
  expect(card(wrapper).text()).toContain('如鸢新摘要')
  expect(card(wrapper).text()).not.toContain('旧账号')
  expect(card(wrapper).find('[role=alert]').exists()).toBe(false)
  expect(link(wrapper).props('to').query).toEqual({ game: '如鸢' })
})

it('当前账号game变化重读；失效账号、清空选择退回全部游戏，登出隐藏摘要', async () => {
  signIn()
  const wrapper = render()
  await flushPromises()
  activeAccount.setGame('如鸢', 'acc-a')
  await flushPromises()
  expect(listActivityCalendar.mock.lastCall[0].game).toBe('如鸢')
  activeAccount.set('not-in-account-list')
  await flushPromises()
  expect(listActivityCalendar.mock.lastCall[0].game).toBe('')
  expect(link(wrapper).props('to').query).toEqual({})
  activeAccount.set('acc-b')
  await flushPromises()
  activeAccount.clear()
  await flushPromises()
  expect(listActivityCalendar.mock.lastCall[0].game).toBe('')
  activeAccount.set('acc-b')
  await flushPromises()
  const calls = listActivityCalendar.mock.calls.length
  auth.isLoggedIn = false
  await flushPromises()
  expect(wrapper.find('.today-activity-summary').exists()).toBe(false)
  expect(listActivityCalendar).toHaveBeenCalledTimes(calls)
})

it('日历局部失败/重试不改变dashboard错误，也不重新请求dashboard', async () => {
  signIn()
  listActivityCalendar.mockRejectedValue(new Error('日历网络失败'))
  const wrapper = render()
  await flushPromises()
  expect(card(wrapper).get('[role=alert]').text()).toContain('活动日程暂时无法读取')
  expect(wrapper.find('.today-alert').exists()).toBe(false)
  expect(link(wrapper).props('to').query).toEqual({ game: '代号鸢' })
  const dashboardCalls = getOperatorCurrent.mock.calls.length
  listActivityCalendar.mockResolvedValue({ items: [item({ game: '代号鸢' })] })
  await card(wrapper).get('button').trigger('click')
  await flushPromises()
  expect(card(wrapper).find('[role=alert]').exists()).toBe(false)
  expect(card(wrapper).text()).toContain('今日公开活动')
  expect(getOperatorCurrent).toHaveBeenCalledTimes(dashboardCalls)
  expect(wrapper.find('.today-alert').exists()).toBe(false)
})

it('dashboard已有错误在日历失败和重试后保持原样', async () => {
  signIn()
  getOperatorCurrent.mockRejectedValue(new Error('密探读取失败'))
  listActivityCalendar.mockRejectedValue(new Error('日历失败'))
  const wrapper = render()
  await flushPromises()
  const dashboardError = wrapper.get('.today-alert').text()
  expect(dashboardError).toContain('部分状态暂时读取失败')
  listActivityCalendar.mockResolvedValue({ items: [] })
  await card(wrapper).get('button').trigger('click')
  await flushPromises()
  expect(wrapper.get('.today-alert').text()).toBe(dashboardError)
  expect(card(wrapper).text()).toContain('暂无公开活动')
})

it('flag=false不显示卡片、不请求API、不注册刷新，Today既有数据和工具继续可用', async () => {
  isFeatureEnabled.mockReturnValue(false)
  signIn()
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('.today-activity-summary').exists()).toBe(false)
  expect(listActivityCalendar).not.toHaveBeenCalled()
  expect(getOperatorCurrent).toHaveBeenCalled()
  expect(wrapper.get('.today-tool-links').findAllComponents(RouterLinkStub)).toHaveLength(3)
  // Drain jsdom's zero-delay storage events from the existing account persistence.
  await vi.advanceTimersByTimeAsync(0)
  expect(vi.getTimerCount()).toBe(0)
  const standalone = render(TodayActivitySummary)
  await flushPromises()
  window.dispatchEvent(new Event('pageshow'))
  expect(standalone.find('section').exists()).toBe(false)
  expect(listActivityCalendar).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it.each([true, false])('计数遵循同日开始+结束、严格ongoing和去重total，预览最多3项（仅同日=%s）', async sameDayOnly => {
  signIn([])
  const sameDay = item({ id: 'same', title: '同日活动' })
  listActivityCalendar.mockResolvedValue({ items: sameDayOnly ? [sameDay, { ...sameDay }] : [
    sameDay, item({ id: 'ongoing', start_date: '2026-10-02', end_date: '2026-10-04' }),
    item({ id: 'start', end_date: '2026-10-04' }),
    item({ id: 'end', start_date: '2026-10-02' }),
    item({ id: 'extra', start_date: '2026-10-01', end_date: '2026-10-04' }),
    { ...sameDay }, item({ id: 'past', title: '历史项', start_date: '2026-10-01', end_date: '2026-10-02' }),
    item({ id: 'future', title: '未来项', start_date: '2026-10-04', end_date: '2026-10-05' }),
    { id: 'invalid' },
  ] })
  const wrapper = render()
  await flushPromises()
  expect(card(wrapper).findAll('.activity-counts p').map(node => node.text())).toEqual(sameDayOnly
    ? ['进行中 0', '今日开始 1', '今日结束 1'] : ['进行中 2', '今日开始 2', '今日结束 2'])
  expect(card(wrapper).findAll('.activity-preview li')).toHaveLength(sameDayOnly ? 1 : 3)
  expect(card(wrapper).text()).toContain('今日结束 / 今日开始')
  expect(card(wrapper).text()).not.toContain('历史项')
  expect(card(wrapper).text()).not.toContain('未来项')
  if (sameDayOnly) expect(card(wrapper).text()).not.toContain('另有')
  else expect(card(wrapper).text()).toContain('另有 2 项')
})

it('服务器午夜只刷新当日摘要，卸载清理定时器与恢复事件', async () => {
  signIn([])
  vi.setSystemTime(new Date('2026-10-02T15:59:59Z'))
  listActivityCalendar.mockResolvedValueOnce({ items: [item({ title: '昨日活动', start_date: '2026-10-02', end_date: '2026-10-02' })] })
  const wrapper = render()
  await flushPromises()
  expect(card(wrapper).text()).toContain('昨日活动')
  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(1100)
  await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(2)
  expect(listActivityCalendar.mock.lastCall[0]).toEqual({ game: '', from: today, to: today })
  expect(card(wrapper).text()).not.toContain('昨日活动')
  expect(card(wrapper).text()).toContain('今日公开活动')
  expect(vi.getTimerCount()).toBe(1)
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
  window.dispatchEvent(new Event('pageshow'))
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(2)
})

it('visibility/pageshow同日不重读，翌日恢复只重读一次且不新增重复计时器', async () => {
  signIn([])
  const wrapper = render()
  await flushPromises()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('pageshow'))
  await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
  vi.setSystemTime(new Date('2026-10-04T04:00:00Z'))
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('pageshow'))
  await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(2)
  expect(listActivityCalendar.mock.lastCall[0]).toEqual({ game: '', from: '2026-10-04', to: '2026-10-04' })
  expect(vi.getTimerCount()).toBe(1)
})

it('卸载时尚未返回的请求不再处理，不遗留计时器', async () => {
  signIn([])
  const late = deferred()
  listActivityCalendar.mockReturnValue(late.promise)
  const wrapper = render()
  await flushPromises()
  expect(card(wrapper).text()).toContain('正在读取')
  wrapper.unmount()
  late.resolve({ items: [item()] })
  await flushPromises()
  expect(vi.getTimerCount()).toBe(0)
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
})


it.each(['guest', 'ordinary', 'permissions-pending'])('%s不显示今日活动、不请求日历，保留首页工具', async mode => {
  if (mode !== 'guest') { signIn([]); auth.isAdmin = mode === 'permissions-pending' ? undefined : false }
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('.today-activity-summary').exists()).toBe(false)
  expect(listActivityCalendar).not.toHaveBeenCalled()
  expect(wrapper.get('.today-coming-soon').text()).toContain('从现有工具继续')
  window.dispatchEvent(new Event('pageshow'))
  await flushPromises()
  expect(listActivityCalendar).not.toHaveBeenCalled()
})

it('权限加载后显示摘要，撤销时清理计时器并丢弃迟到响应', async () => {
  signIn([]); auth.isAdmin = false
  const late = deferred()
  listActivityCalendar.mockReturnValue(late.promise)
  const wrapper = render()
  await flushPromises()
  expect(listActivityCalendar).not.toHaveBeenCalled()
  auth.isAdmin = true
  await flushPromises()
  expect(card(wrapper).text()).toContain('正在读取')
  auth.isAdmin = false
  await flushPromises()
  late.resolve({ items: [item()] })
  await flushPromises()
  expect(wrapper.find('.today-activity-summary').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(0)
  expect(vi.getTimerCount()).toBe(0)
  window.dispatchEvent(new Event('pageshow'))
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
})
