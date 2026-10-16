import { createPinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { routeLocationKey } from 'vue-router'
import TodayPage from '../src/pages/today/index.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { createAccount, listAccounts } from '../src/api/accounts.js'
import { getOperatorCurrent } from '../src/api/operator.js'
import { getCurrent } from '../src/api/inventory.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { installViewport } from '../test-support/viewport.js'
import TodayLobby from '../src/components/today/TodayLobby.vue'
import TodayActivitySummary from '../src/components/today/TodayActivitySummary.vue'
import TodaySubscriptionSummary from '../src/components/today/TodaySubscriptionSummary.vue'
import TodayPrivateItems from '../src/components/today/TodayPrivateItems.vue'
import TodayTrainingPlans from '../src/components/today/TodayTrainingPlans.vue'
import { getTrainingWorkspace } from '../src/api/operatorPlanner.js'
import { listCalendarPrivateItems } from '../src/api/calendarPrivateItems.js'
import { addCalendarDays, serverToday } from '../src/data/activityCalendar.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { calendarSubscriptionSummary, listCalendarSubscriptions } from '../src/api/activityCalendarSubscriptions.js'
import { dialog } from '../src/utils/dialog.js'
import { getTodayPreferences, saveTodayPreferences } from '../src/api/todayPreferences.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null, isLoggedIn: false }), logout: vi.fn() }
})
vi.mock('../src/components/IslandSidebar.vue', () => ({ default: { name: 'IslandSidebar', template: '<nav />' } }))
vi.mock('../src/api/todayPreferences.js', () => ({ getTodayPreferences: vi.fn(async mode => ({ layout_mode: mode, schema_version: 1, version: 0, hidden_modules: [] })), saveTodayPreferences: vi.fn() }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn(), createAccount: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCurrent: vi.fn(), getOperatorCatalog: vi.fn(async () => ({ operators: [] })), getOperatorAnnotations: vi.fn(async account => ({ account_id: account, items: [] })), getOperatorGrowthTargets: vi.fn(async account => ({ account_id: account, items: [] })) }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), listAgentFavorites: vi.fn(async account => ({ account_id: account, agent_ids: [] })) }))
vi.mock('../src/api/operatorPlanner.js', () => ({ getTrainingWorkspace: vi.fn(async account => ({ schema_version: 1, account_id: account, revision: 0, plans: [], active_plan_id: null })) }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn(async () => ({ items: [] })) }))
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ calendarSubscriptionSummary: vi.fn(async () => ({ items: [], subscribed_count: 0, total_pending: 0 })), listCalendarSubscriptions: vi.fn(async () => ({ items: [], unavailable_items: [] })), getCalendarSubscription: vi.fn(), saveCalendarProgress: vi.fn() }))
vi.mock('../src/api/calendarPrivateItems.js', () => ({ listCalendarPrivateItems: vi.fn() }))

const render = () => mount(TodayPage, { attachTo: document.body, global: { plugins: [createPinia()], provide: { [routeLocationKey]: { fullPath: '/today' } }, stubs: { OnboardingGuide: true, RouterLink: RouterLinkStub } } })

function signIn() {
  auth.isLoggedIn = true
  auth.accessToken = 'test-only'
  auth.userInfo = { id: 'synthetic-owner', user_name: '测试殿下' }
}

beforeEach(() => {
  vi.clearAllMocks()
  getTodayPreferences.mockImplementation(async mode => ({ layout_mode: mode, schema_version: 1, version: 0, hidden_modules: [] }))
  saveTodayPreferences.mockImplementation(async (mode, body) => ({ layout_mode: mode, schema_version: 1, version: body.expected_version + 1, hidden_modules: body.hidden_modules }))
  auth.accessToken = ''
  auth.isLoggedIn = false
  auth.isAdmin = false
  auth.userInfo = null
  activeAccount.clear()
  listAccounts.mockResolvedValue([])
  getOperatorCurrent.mockResolvedValue({ entries: {} })
  getCurrent.mockResolvedValue([])
  getCurrentStarState.mockResolvedValue({ inventory: [] })
  listCalendarPrivateItems.mockResolvedValue({ items: [] })
})

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

it('账号加载不显示建账号或缺数据提示；无账号时只显示创建流程', async () => {
  signIn()
  const pending = deferred()
  listAccounts.mockReturnValue(pending.promise)
  const wrapper = render()
  expect(wrapper.text()).toContain('正在读取游戏账号')
  expect(wrapper.get('.lobby-status').text()).toContain('正在为你整理')
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  expect(getOperatorCurrent).not.toHaveBeenCalled()
  pending.resolve([]); await flushPromises()
  expect(wrapper.get('.data-onboarding').text()).toContain('创建游戏账号')
  expect(wrapper.get('.lobby-status').text()).toContain('先建一个游戏账号')
  expect(wrapper.find('.data-readiness-grid').exists()).toBe(false)
  expect(getOperatorCurrent).not.toHaveBeenCalled()
})

it('全部为空保留首次建档，读取全失败保留unknown而不宣称已准备', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'a', name: '账号', game: '如鸢' }])
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('section.data-onboarding').text()).toContain('第一次建档')
  expect(wrapper.get('.lobby-status').text()).toBe('当前账号尚未建档，先从第一份资料开始吧。')
  expect(wrapper.findAll('.readiness-action')).toHaveLength(3)
  expect(wrapper.find('.account-data-summary').exists()).toBe(false)
  expect(wrapper.find('footer').exists()).toBe(false)
  getOperatorCurrent.mockRejectedValue(new Error('失败'))
  getCurrent.mockRejectedValue(new Error('失败'))
  getCurrentStarState.mockRejectedValue(new Error('失败'))
  activeAccount.setGame('代号鸢', 'a'); await flushPromises()
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  expect(wrapper.vm.dataReadiness).toEqual({ operator: 'unknown', inventory: 'unknown', star: 'unknown' })
  expect(wrapper.get('.lobby-status').text()).toContain('密探、库存、星石状态待确认')
  expect(wrapper.find('.account-data-summary').exists()).toBe(false)
})

it('全新账号先展示紧凑引导，确认读取为空后隐藏业务空卡但保留读取实例', async () => {
  signIn(); auth.userInfo = { id: 'owner-a' }
  listAccounts.mockResolvedValue([{ id: 'a', name: '新账号', game: '如鸢' }])
  const wrapper = render(); await flushPromises()
  const onboarding = wrapper.get('.data-onboarding')
  const overview = wrapper.get('.today-overview')
  expect(onboarding.element.compareDocumentPosition(overview.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(onboarding.get('h2').text()).toBe('从一份资料开始')
  expect(wrapper.findAll('.readiness-action')).toHaveLength(3)
  expect(wrapper.findAllComponents(RouterLinkStub).filter(link => link.classes().includes('readiness-action')).map(link => link.props('to')))
    .toEqual(['/operator?tab=current', '/inventory', '/star'])
  expect(wrapper.get('.sync-recommendation').getComponent(RouterLinkStub).props('to')).toEqual({
    path: '/user/profile', query: { connect: 'maayuan', from: 'today' }, hash: '#maayuan-app-title'
  })
  expect(wrapper.find('.today-subscriptions').exists()).toBe(false)
  expect(wrapper.find('.today-training').exists()).toBe(false)
  expect(wrapper.find('.today-private-items').exists()).toBe(false)
  expect(wrapper.find('.todo-reminders').exists()).toBe(false)
  expect(wrapper.get('.today-workspace').get('.today-activity-summary').exists()).toBe(true)
  expect(wrapper.find('.today-training').exists()).toBe(false)
  expect(wrapper.findComponent(TodaySubscriptionSummary).exists()).toBe(true)
  expect(wrapper.findComponent(TodayTrainingPlans).exists()).toBe(true)
  expect(wrapper.findComponent(TodayPrivateItems).exists()).toBe(true)
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(1)
  expect(getTrainingWorkspace).toHaveBeenCalledTimes(1)
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(1)
  expect(wrapper.find('.today-activity-summary').exists()).toBe(true)
})

it('新账号的业务读取失败仍显示错误和重试入口，不隐藏为无内容', async () => {
  signIn(); auth.userInfo = { id: 'owner-a' }
  listAccounts.mockResolvedValue([{ id: 'a', name: '新账号', game: '如鸢' }])
  listCalendarSubscriptions.mockRejectedValueOnce(new Error('待办离线'))
  getTrainingWorkspace.mockRejectedValueOnce(new Error('养成离线'))
  listCalendarPrivateItems.mockRejectedValueOnce(new Error('事项离线'))
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('.data-onboarding').exists()).toBe(true)
  for (const [selector, message] of [['.today-subscriptions', '待办离线'], ['.today-training', '养成离线'], ['.today-private-items', '事项离线']]) {
    const card = wrapper.get(selector)
    expect(card.get('[role=alert]').text()).toContain(message)
    expect(card.get('[role=alert] button').text()).toContain('重试')
  }
})

it('全新账号已有订阅清单时继续显示真实待办，不被资料引导隐藏', async () => {
  signIn(); auth.userInfo = { id: 'owner-a' }
  listAccounts.mockResolvedValue([{ id: 'a', name: '新账号', game: '如鸢' }])
  listCalendarSubscriptions.mockResolvedValueOnce({ items: [{
    event_id: 'event-a', subscribed: true, completed: false, manual_completed: false, version: 1,
    checklist: [{ id: 'todo-a', title: '先领取奖励', completed: false }],
    item: { id: 'event-a', title: '今日活动', start_date: serverToday(), end_date: serverToday() }
  }], unavailable_items: [] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('.data-onboarding').exists()).toBe(true)
  expect(wrapper.get('.today-subscriptions').text()).toContain('先领取奖励')
  expect(wrapper.get('.today-subscriptions input').element.checked).toBe(false)
})

it('A→B立即清空旧摘要，迟到A不能覆盖B；清空与失效id不发账号请求', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'a', name: 'A', game: '如鸢' }, { id: 'b', name: 'B', game: '如鸢' }])
  const a = deferred(), b = deferred()
  getOperatorCurrent.mockImplementation(({ accountId }) => accountId === 'a' ? a.promise : b.promise)
  const wrapper = render(); await flushPromises()
  activeAccount.set('b'); await flushPromises()
  expect(wrapper.get('.lobby-status').text()).toContain('正在为你整理')
  expect(wrapper.vm.realSummary.operatorCount).toBeNull()
  b.resolve({ entries: { one: { star_level: 1 }, two: { star_level: 1 } } }); await flushPromises()
  expect(wrapper.vm.realSummary.operatorCount).toBe(2)
  expect(wrapper.find('.lobby-status').exists()).toBe(false)
  a.resolve({ entries: { old: {} } }); await flushPromises()
  expect(wrapper.vm.realSummary.operatorCount).toBe(2)
  const calls = getOperatorCurrent.mock.calls.length
  activeAccount.clear(); await flushPromises()
  expect(wrapper.get('.lobby-status').text()).toContain('选一个游戏账号')
  expect(wrapper.vm.realSummary.operatorCount).toBeNull()
  activeAccount.set('not-owned'); await flushPromises()
  expect(getOperatorCurrent).toHaveBeenCalledTimes(calls)
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
})

it('账号读取失败不会伪装成无账号，重试后恢复且卸载不应用迟到列表', async () => {
  signIn()
  listAccounts.mockRejectedValue(new Error('账号网络失败'))
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.today-alert').text()).toContain('账号网络失败')
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  const late = deferred()
  listAccounts.mockReturnValue(late.promise)
  await wrapper.get('.today-alert button').trigger('click')
  wrapper.unmount()
  late.resolve([{ id: 'late', name: '迟到', game: '如鸢' }]); await flushPromises()
  expect(activeAccount.id).not.toBe('late')
})

it('卸载时仍在读取的摘要不会更新页面状态', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'a', name: 'A', game: '如鸢' }])
  const late = deferred()
  getOperatorCurrent.mockReturnValue(late.promise)
  const wrapper = render(); await flushPromises()
  const vm = wrapper.vm
  wrapper.unmount()
  late.resolve({ entries: { old: {} } }); await flushPromises()
  expect(vm.realSummary.operatorCount).toBeNull()
})

it('切换登录身份时旧列表与旧摘要失效，不把上个用户数据带入新首页', async () => {
  signIn(); auth.userInfo = { id: 'owner-a' }
  listAccounts.mockResolvedValue([{ id: 'a', name: 'A', game: '如鸢' }])
  const late = deferred()
  getOperatorCurrent.mockReturnValue(late.promise)
  const wrapper = render(); await flushPromises()
  listAccounts.mockResolvedValue([{ id: 'b', name: 'B', game: '如鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { one: { star_level: 1 }, two: { star_level: 1 } } })
  auth.userInfo = { id: 'owner-b' }; await flushPromises()
  late.resolve({ entries: { old: {} } }); await flushPromises()
  expect(wrapper.get('.data-account-context-bar').text()).toContain('B')
  expect(wrapper.vm.realSummary.operatorCount).toBe(2)
  auth.isLoggedIn = false; await flushPromises()
  expect(wrapper.find('.account-data-summary').exists()).toBe(false)
  expect(wrapper.get('.data-onboarding').text()).toContain('登录并继续')
})

it('访客只在建档区登录，不使用假演示标签或欢迎Hero', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('h1').text()).toBe('今日一览')
  expect(wrapper.text()).toContain('先登录，再开始建立今日一览')
  expect(wrapper.text()).not.toContain('演示数据')
  expect(wrapper.text()).not.toContain('今天也来啦')
  expect(wrapper.find('.hero-actions').exists()).toBe(false)
  expect(wrapper.find('.data-account-context-bar').exists()).toBe(false)
  expect(wrapper.find('.today-tools').exists()).toBe(false)
  expect(wrapper.find('nav[aria-label="今日一览的工具入口"]').exists()).toBe(false)
  expect(wrapper.find('[data-tour="today-overview"]').exists()).toBe(true)
  expect(listAccounts).not.toHaveBeenCalled()
  expect(getOperatorCurrent).not.toHaveBeenCalled()
})

it('已有数据时展示账号状态，不显示常用工具且初始化只请求一次摘要', async () => {
  signIn()
  auth.userInfo = { id: 'owner-a', user_name: '测试殿下' }
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { '1001': { star_level: 1, level: 1 } } })
  getCurrent.mockResolvedValue({ entries: { itemA: { count: 3 } } })
  getCurrentStarState.mockResolvedValue({ inventory: [{ instance_id: 'star-1' }] })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.data-account-context-bar').text()).toContain('测试大号')
  expect(wrapper.get('.lobby-header .account-switcher').text()).toContain('测试大号')
  expect(wrapper.findAll('.account-switcher')).toHaveLength(1)
  expect(wrapper.get('.lobby-scene').find('.account-switcher').exists()).toBe(false)
  expect(wrapper.get('.lobby-status').text()).toBe('当前账号资料已就绪，今天也辛苦了。')
  expect(wrapper.vm.realSummary.operatorCount).toBe(1)
  expect(wrapper.vm.realSummary.starCount).toBe(1)
  expect(wrapper.find('.account-data-summary').exists()).toBe(false)
  expect(wrapper.get('.today-primary > .today-subscriptions h2').text()).toBe('活动待办')
  expect(wrapper.find('.today-private-items').exists()).toBe(false)
  expect(wrapper.get('.today-primary > .today-training h2').text()).toBe('我的养成计划')
  const aside = wrapper.get('.today-secondary')
  expect(aside.find('.today-private-items').exists()).toBe(false)
  expect(wrapper.get('#today-reminders').element.children).toHaveLength(0)
  expect(wrapper.get('.todo-subscription-status').text()).toContain('暂无临期活动。')
  expect(wrapper.get('.today-primary').find('.today-training').exists()).toBe(true)
  expect(wrapper.findAll('.today-activity-summary')).toHaveLength(1)
  expect(aside.text()).not.toContain('账号详情')
  expect(wrapper.find('.today-subscriptions .todo-reminders').exists()).toBe(false)
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  expect(wrapper.find('.today-coming-soon').exists()).toBe(false)
  expect(getOperatorCurrent).toHaveBeenCalledTimes(1)
  expect(getCurrent).toHaveBeenCalledTimes(1)
  expect(getCurrentStarState).toHaveBeenCalledTimes(1)
  expect(getOperatorCurrent).toHaveBeenCalledWith({ accountId: 'acc-a', game: '代号鸢' })
  expect(getCurrent).toHaveBeenCalledWith({ accountId: 'acc-a', entityType: 'item' })
  expect(getCurrentStarState).toHaveBeenCalledWith('acc-a')
  expect(wrapper.find('.today-tools').exists()).toBe(false)
  expect(wrapper.find('nav[aria-label="今日一览的工具入口"]').exists()).toBe(false)
})

it('无账号时只挂载公开区，有账号时待办与独立养成区可用', async () => {
  signIn(); auth.isAdmin = true
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('.today-activity-summary').exists()).toBe(true)
  expect(wrapper.find('.today-account-overview').exists()).toBe(false)
  expect(wrapper.find('.today-subscriptions').exists()).toBe(false)
  expect(wrapper.find('.today-private-items').exists()).toBe(false)
  listAccounts.mockResolvedValue([{ id: 'a', name: '大号', game: '如鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { one: { star_level: 1 } } })
  auth.userInfo = { id: 'owner-b' }; await flushPromises()
  expect(wrapper.find('.today-workspace').exists()).toBe(true)
  expect(wrapper.find('.today-account-overview').exists()).toBe(false)
  expect(wrapper.get('.today-workspace .today-subscriptions').exists()).toBe(true)
  expect(wrapper.get('.today-primary .today-training').exists()).toBe(true)
})

it('尚未录入游戏数据也展示私人备注，私人事项慢请求不阻塞活动待办', async () => {
  signIn(); auth.userInfo = { id: 'owner-a' }
  listAccounts.mockResolvedValue([{ id: 'a', name: '账号', game: '如鸢' }])
  const pending = deferred()
  listCalendarPrivateItems.mockReturnValueOnce(pending.promise)
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('.today-primary > .today-subscriptions').exists()).toBe(false)
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.today-private-items').text()).toContain('正在读取私人事项')
  expect(wrapper.find('section.data-onboarding').exists()).toBe(true)
  pending.resolve({ items: [{ id: 'pci_00000000-0000-0000-0000-000000000001', account_id: 'a', game: '如鸢', title: '我的计划', date: serverToday(), time: null, note: '先整理备注', version: 0 }] })
  await flushPromises()
  expect(wrapper.get('.today-private-items').text()).toContain('先整理备注')
  expect(wrapper.find('.today-subscriptions').exists()).toBe(false)
})

it('尚未录入游戏数据也展示养成清单，慢请求不阻塞其他个人内容', async () => {
  signIn(); auth.userInfo = { id: 'owner-a' }
  listAccounts.mockResolvedValue([{ id: 'a', name: '账号', game: '如鸢' }])
  const pending = deferred()
  getTrainingWorkspace.mockReturnValueOnce(pending.promise)
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.today-primary > .today-training').text()).toContain('正在读取养成计划')
  expect(wrapper.find('.today-primary > .today-subscriptions').exists()).toBe(false)
  expect(wrapper.find('.today-secondary > .today-private-items').exists()).toBe(false)
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(1)
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(1)
  pending.resolve({ schema_version: 1, account_id: 'a', revision: 1, active_plan_id: 'main', plans: [
    { id: 'main', name: '培养主队', source: 'custom', operator_ids: ['char_001_yangxiu'], excluded_operator_ids: [], targets: {} }
  ] })
  await flushPromises()
  expect(wrapper.get('.today-primary > .today-training').text()).toContain('培养主队')
  expect(wrapper.get('.today-primary > .today-training').text()).toContain('杨修')
  expect(wrapper.get('.today-activity-summary').text()).not.toContain('培养主队')
})

it('已有部分数据时不展示补齐区、缺项提醒或账号详情，保留真实录入状态', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { '1001': { star_level: 1, level: 1 } } })

  const wrapper = render()
  await flushPromises()

  expect(getOperatorCurrent).toHaveBeenCalled()
  expect(getCurrentStarState).toHaveBeenCalled()
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  expect(wrapper.find('.lobby-status').exists()).toBe(false)
  expect(wrapper.find('.account-data-summary').exists()).toBe(false)
  expect(wrapper.vm.realSummary.operatorCount).toBe(1)
  expect(wrapper.vm.dataReadiness.star).toBe('empty')
  expect(wrapper.find('.readiness-action').exists()).toBe(false)
})

it('只缺星石数据时也不展示缺项提醒或可选补齐入口', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { one: { star_level: 1 } } })
  getCurrent.mockResolvedValue({ entries: { coin: { count: 3 } } })
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  expect(wrapper.find('.lobby-status').exists()).toBe(false)
  expect(wrapper.vm.realSummary.operatorCount).toBe(1)
  expect(wrapper.vm.realSummary.inventoryKindCount).toBe(1)
  expect(wrapper.vm.dataReadiness.star).toBe('empty')
  expect(wrapper.find('.account-data-summary').exists()).toBe(false)
})

it('完整零库存基准不被引导重新录入，部分零录入不宣称完整盘点', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])
  for (const [inventory, label] of [
    [[{ full_baseline_at: '2026-10-04T08:00:00Z', entries: {} }], '已盘点，当前库存为零'],
    [[{ entries: { coin: { count: 0, listed_baseline_at: '2026-10-04T08:00:00Z' } } }], '已有录入，当前库存为零']
  ]) {
    getCurrent.mockResolvedValue(inventory)
    const wrapper = render(); await flushPromises()
    const item = wrapper.vm.dataSetupItems.find(item => item.key === 'inventory')
    expect(item.statusLabel).toBe(label)
    expect(item.status).toBe('ready')
    expect(wrapper.find('.readiness-action').exists()).toBe(false)
    expect(wrapper.find('.data-onboarding').exists()).toBe(false)
    if (label.startsWith('已有')) expect(item.description).not.toContain('完整库存基准')
    wrapper.unmount()
  }
})

it('库存元信息不足与读取失败使用不同说明，均不要求重录', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])
  getCurrent.mockResolvedValue({ entries: {} })
  let wrapper = render(); await flushPromises()
  expect(wrapper.get('.onboarding-kicker').text()).toBe('数据状态待确认')
  expect(wrapper.vm.isFreshAccount).toBe(false)
  let card = wrapper.findAll('.data-readiness-card').find(card => card.get('h3').text() === '库存')
  expect(card.text()).toContain('录入状态待确认')
  expect(card.text()).not.toContain('读取失败')
  expect(card.find('.readiness-action').exists()).toBe(false)
  wrapper.unmount()
  getCurrent.mockRejectedValue(new Error('synthetic failure'))
  wrapper = render(); await flushPromises()
  card = wrapper.findAll('.data-readiness-card').find(card => card.get('h3').text() === '库存')
  expect(card.text()).toContain('暂时无法读取')
  expect(card.text()).toContain('不会要求你重新录入')
  expect(card.find('.readiness-action').exists()).toBe(false)
  wrapper.unmount()
})

it.each([390, 1440])('%ipx 起步跨断点保留值守搜索、焦点及唯一功能实例，不恢复补齐区', async width => {
  const viewport = installViewport(width)
  signIn(); auth.isAdmin = true; auth.userInfo = { id: 'synthetic-owner' }
  listAccounts.mockResolvedValue([{ id: 'a', name: '合成账号', game: '如鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { one: { star_level: 1 } } })
  listActivityCalendar.mockResolvedValueOnce({ items: [{ id: 'upcoming', title: '即将开始的招募', game: '如鸢', category: 'RECRUITMENT', start_date: addCalendarDays(serverToday(), 1), end_date: addCalendarDays(serverToday(), 7) }] })
  listCalendarPrivateItems.mockResolvedValueOnce({ items: [{ id: 'pci_00000000-0000-0000-0000-000000000001', account_id: 'a', game: '如鸢', title: '私人日期事项', date: serverToday(), time: null, note: '', version: 0 }] })
  const wrapper = render(); await flushPromises()
  const instances = [TodayLobby, TodayActivitySummary, TodaySubscriptionSummary, TodayPrivateItems, TodayTrainingPlans].map(type => wrapper.getComponent(type).vm.$)
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  await wrapper.findAll('.activity-counts button')[2].trigger('click')
  await wrapper.get('.lobby-duty button').trigger('click'); await flushPromises()
  const search = document.querySelector('.duty-search input')
  search.value = '阿蝉'; search.dispatchEvent(new Event('input', { bubbles: true })); search.focus()
  await flushPromises()
  const calls = [listAccounts, getOperatorCurrent, getCurrent, getCurrentStarState, listActivityCalendar, listCalendarSubscriptions, listCalendarPrivateItems, getTrainingWorkspace].map(fn => fn.mock.calls.length)
  for (const next of [width, 768, 767, 980, 981, 1080, 1081, 390, 1440, width]) {
    viewport.resize(next); await flushPromises()
    expect(document.querySelector('.duty-search input')).toBe(search)
    expect(search.value).toBe('阿蝉')
    expect(document.activeElement).toBe(search)
    expect(wrapper.find('.data-onboarding').exists()).toBe(false)
    expect(wrapper.find('.lobby-status').exists()).toBe(false)
    expect(wrapper.findAll('.activity-counts button')[2].attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('.activity-title').text()).toBe('即将开始的招募')
    expect(wrapper.get('.today-activity-summary').element.parentElement.className).toBe(next >= 768 ? 'today-column today-secondary' : 'today-activities-target')
    expect(wrapper.findAll('.today-workspace section').map(section => section.classes()[0])).toEqual(next >= 768
      ? ['today-subscriptions', 'today-training', 'today-activity-summary', 'today-private-items']
      : ['today-subscriptions', 'today-activity-summary', 'today-training', 'today-private-items'])
    ;[TodayLobby, TodayActivitySummary, TodaySubscriptionSummary, TodayPrivateItems, TodayTrainingPlans].forEach((type, index) => expect(wrapper.getComponent(type).vm.$).toBe(instances[index]))
    expect([listAccounts, getOperatorCurrent, getCurrent, getCurrentStarState, listActivityCalendar, listCalendarSubscriptions, listCalendarPrivateItems, getTrainingWorkspace].map(fn => fn.mock.calls.length)).toEqual(calls)
    expect(wrapper.findAll('.account-switcher')).toHaveLength(1)
  }
  document.querySelector('[aria-label="关闭值守选择"]').click(); await flushPromises()
  const segment = wrapper.findAll('.activity-counts button')[2].element
  segment.focus()
  for (const next of [767, 768, 1440, 390]) {
    viewport.resize(next); await flushPromises()
    expect(document.activeElement).toBe(segment)
    expect(wrapper.findAll('.activity-counts button')[2].element).toBe(segment)
    expect(wrapper.getComponent(TodayActivitySummary).vm.$).toBe(instances[1])
    expect([listAccounts, getOperatorCurrent, getCurrent, getCurrentStarState, listActivityCalendar, listCalendarSubscriptions, listCalendarPrivateItems, getTrainingWorkspace].map(fn => fn.mock.calls.length)).toEqual(calls)
  }
  const layoutMedia = viewport.queries.find(({ media }) => media.addEventListener.mock.calls.some(([, listener]) => listener.name === 'syncLayout')).media
  wrapper.unmount()
  expect(layoutMedia.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  expect(document.querySelector('.today-activities-target')).toBeNull()
  expect(document.querySelector('.duty-picker')).toBeNull()
})

it.each([390, 1440])('%ipx 创建入口仍连接真实账号管理，跨断点保留未保存名称并关闭恢复焦点', async width => {
  const viewport = installViewport(width)
  signIn()
  const wrapper = render(); await flushPromises()
  const opener = wrapper.get('.account-management-action')
  await opener.trigger('click'); await flushPromises()
  const input = document.querySelector('input[placeholder="例如：大鸟大号"]')
  expect(input).not.toBeNull()
  input.value = '未保存的合成账号'
  input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); await flushPromises()
  for (const next of [768, 767, 1440, 390]) {
    viewport.resize(next); await flushPromises()
    expect(document.querySelector('input[placeholder="例如：大鸟大号"]')).toBe(input)
    expect(input.value).toBe('未保存的合成账号')
    expect(document.activeElement).toBe(input)
  }
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValueOnce(true)
  document.querySelector('[aria-label="关闭账号面板"]').click(); await flushPromises()
  expect(confirm).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(opener.element)
  expect(createAccount).not.toHaveBeenCalled()
  expect(listAccounts).toHaveBeenCalledTimes(1)
  expect(getOperatorCurrent).not.toHaveBeenCalled()
})

it('临期提醒先于主工作区；跨断点保留展开状态、焦点和唯一订阅实例', async () => {
  const viewport = installViewport(390)
  signIn(); auth.userInfo = { id: 'synthetic-owner' }
  listAccounts.mockResolvedValue([{ id: 'a', name: '合成账号', game: '如鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { one: { star_level: 1 } } })
  const record = { event_id: 'near', subscribed: true, version: 1, completed: false, manual_completed: false,
    checklist: [{ id: 'one', title: '领取奖励', completed: false }],
    item: { id: 'near', title: '即将截止', start_date: serverToday(), end_date: serverToday() } }
  listCalendarSubscriptions.mockResolvedValueOnce({ items: [record], unavailable_items: [] })
  calendarSubscriptionSummary.mockResolvedValueOnce({ items: [record], subscribed_count: 1, total_pending: 1 })
  const wrapper = render(); await flushPromises()
  const target = wrapper.get('#today-reminders')
  const workspace = wrapper.get('.today-workspace')
  expect(target.element.compareDocumentPosition(workspace.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(target.get('.todo-reminders').text()).toContain('即将截止')
  expect(wrapper.find('.today-subscriptions .todo-reminders').exists()).toBe(false)
  const details = target.get('details')
  details.element.open = false; await details.trigger('toggle')
  const status = wrapper.get('.todo-subscription-status').element; status.open = true
  const summary = details.get('summary').element; summary.focus()
  const instance = wrapper.getComponent(TodaySubscriptionSummary).vm.$
  const calls = [listCalendarSubscriptions, calendarSubscriptionSummary].map(fn => fn.mock.calls.length)
  for (const width of [768, 981, 1024, 1081, 1440, 390]) {
    viewport.resize(width); await flushPromises()
    expect(wrapper.getComponent(TodaySubscriptionSummary).vm.$).toBe(instance)
    expect(target.get('details').element).toBe(details.element)
    expect(details.element.open).toBe(false)
    expect(wrapper.get('.todo-subscription-status').element).toBe(status)
    expect(status.open).toBe(true)
    expect(document.activeElement).toBe(summary)
    expect([listCalendarSubscriptions, calendarSubscriptionSummary].map(fn => fn.mock.calls.length)).toEqual(calls)
  }
})

it.each([
  { name: '多个订阅无Checklist', subscriptions: 4, tasks: 0, privateItems: 0, members: 0, activities: 3 },
  { name: '多条未完成待办', subscriptions: 2, tasks: 7, privateItems: 0, members: 0, activities: 3 },
  { name: '全勾选但本期未完成', subscriptions: 2, tasks: 4, checked: true, privateItems: 0, members: 0, activities: 2 },
  { name: '仅有私人安排', subscriptions: 0, tasks: 0, privateItems: 1, members: 0, activities: 0 },
  { name: '有养成没有游戏活动', subscriptions: 0, tasks: 0, privateItems: 0, members: 2, activities: 0 },
  { name: '各模块大量真实格式数据', subscriptions: 8, tasks: 5, privateItems: 6, members: 8, activities: 8 },
])('$name：业务对象独立，摘要有界且完整入口保留', async scenario => {
  signIn(); auth.userInfo = { id: 'synthetic-owner' }
  listAccounts.mockResolvedValue([{ id: 'a', name: '合成账号', game: '如鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { one: { star_level: 1 } } })
  const today = serverToday(), tomorrow = addCalendarDays(today, 1)
  const events = Array.from({ length: scenario.subscriptions }, (_, index) => ({
    event_id: 'sub-' + index, version: 1, subscribed: true, completed: false, manual_completed: false,
    checklist: Array.from({ length: scenario.tasks }, (_, task) => ({ id: 'task-' + task, title: '活动任务' + task, completed: !!scenario.checked })),
    item: { id: 'sub-' + index, title: '订阅活动' + index, start_date: today, end_date: tomorrow }
  }))
  listCalendarSubscriptions.mockResolvedValueOnce({ items: events, unavailable_items: [] })
  calendarSubscriptionSummary.mockResolvedValueOnce({ items: events.slice(0, 3), subscribed_count: events.length, total_pending: events.length })
  listActivityCalendar.mockResolvedValueOnce({ items: Array.from({ length: scenario.activities }, (_, index) => ({
    id: 'public-' + index, game: '如鸢', category: 'ACTIVITY', title: '公开游戏活动' + index, start_date: today, end_date: tomorrow
  })) })
  listCalendarPrivateItems.mockResolvedValueOnce({ items: Array.from({ length: scenario.privateItems }, (_, index) => ({
    id: 'pci_00000000-0000-0000-0000-' + String(index + 1).padStart(12, '0'), account_id: 'a', game: '如鸢',
    title: '私人安排' + index, start_date: today, end_date: today, time: null, note: '独立的私人备注', version: 0
  })) })
  getTrainingWorkspace.mockResolvedValueOnce({ schema_version: 1, account_id: 'a', revision: 0, active_plan_id: 'main', plans: scenario.members ? [{
    id: 'main', name: '真实格式培养清单', source: 'custom', operator_ids: Array.from({ length: scenario.members }, (_, index) => 'synthetic-operator-' + index), excluded_operator_ids: [], targets: {}
  }] : [] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.findAll('.todo-list input[type=checkbox]')).toHaveLength(scenario.checked ? 0 : Math.min(3, scenario.tasks * scenario.subscriptions))
  expect(wrapper.findAll('.activity-preview li')).toHaveLength(Math.min(3, scenario.activities))
  expect(wrapper.findAll('.private-list li')).toHaveLength(Math.min(2, scenario.privateItems))
  expect(wrapper.findAll('.training-member')).toHaveLength(Math.min(5, scenario.members))
  expect(wrapper.find('.today-private-items').exists()).toBe(scenario.privateItems > 0)
  expect(wrapper.findAll('.today-training input[type=checkbox], .today-private-items input[type=checkbox]')).toHaveLength(0)
  expect(wrapper.find('.todo-reminders').exists()).toBe(scenario.subscriptions > 0)
  if (scenario.tasks && !scenario.checked) expect(wrapper.get('.todo-scope').text()).toContain(`${scenario.tasks * scenario.subscriptions} 项待办未完成`)
  if (!scenario.tasks && scenario.subscriptions) expect(wrapper.get('.todo-empty').text()).toContain('订阅活动不会自动创建 Checklist')
  if (scenario.checked) {
    expect(wrapper.get('.todo-empty').text()).toContain('清单已全部勾选')
    expect(wrapper.text()).not.toContain('活动均已标记本期完成')
    expect(wrapper.find('.todo-more').exists()).toBe(true)
  }
  expect(wrapper.get('.today-primary').find('.today-training').exists()).toBe(true)
  expect(wrapper.find('.today-secondary .today-training').exists()).toBe(false)
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(1)
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(1)
})


it('偏好隐藏全部仍保留导航、账号、自定义与建档；恢复默认即时展示且resize不重挂业务', async () => {
  const viewport = installViewport(1440)
  signIn(); auth.userInfo = { id: 'owner' }
  listAccounts.mockResolvedValue([{ id: 'a', name: '新账号', game: '如鸢' }])
  getTodayPreferences.mockImplementation(async mode => ({ layout_mode: mode, schema_version: 1, version: 2, hidden_modules: mode === 'desktop' ? ['highlights', 'checklist', 'activities', 'training', 'private_items'] : [] }))
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('nav').exists()).toBe(true)
  expect(wrapper.find('.lobby-context').exists()).toBe(true)
  expect(wrapper.find('.today-customize').exists()).toBe(true)
  expect(wrapper.find('.data-onboarding').exists()).toBe(true)
  expect(wrapper.find('.today-activity-summary').exists()).toBe(false)
  expect(wrapper.text()).toContain('首页模块已全部隐藏')
  const instance = wrapper.getComponent(TodayActivitySummary).vm.$
  viewport.resize(390); await flushPromises()
  expect(wrapper.find('.today-activity-summary').exists()).toBe(true)
  expect(wrapper.getComponent(TodayActivitySummary).vm.$).toBe(instance)
  expect(getTodayPreferences).toHaveBeenCalledTimes(2)
  viewport.resize(1440); await flushPromises()
  await wrapper.get('.today-customize').trigger('click'); await flushPromises()
  const panel = document.querySelector('.today-preferences')
  const button = text => [...panel.querySelectorAll('button')].find(item => item.textContent.includes(text))
  button('恢复默认').click(); await flushPromises(); button('保存设置').click(); await flushPromises()
  expect(wrapper.find('.today-activity-summary').exists()).toBe(true)
  expect(wrapper.getComponent(TodayActivitySummary).vm.$).toBe(instance)
  expect(wrapper.text()).not.toContain('首页模块已全部隐藏')
})
