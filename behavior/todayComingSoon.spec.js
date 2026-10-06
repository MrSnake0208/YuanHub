import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { routeLocationKey } from 'vue-router'
import TodayPage from '../src/pages/today/index.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { getOperatorCurrent } from '../src/api/operator.js'
import { getCurrent } from '../src/api/inventory.js'
import { getCurrentStarState } from '../src/api/starState.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null, isLoggedIn: false }), logout: vi.fn() }
})
vi.mock('../src/components/IslandSidebar.vue', () => ({ default: { name: 'IslandSidebar', template: '<nav />' } }))
vi.mock('../src/components/SiteFooter.vue', () => ({ default: { name: 'SiteFooter', template: '<footer />' } }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn(), createAccount: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCurrent: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn() }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn(async () => ({ items: [] })) }))

const render = () => mount(TodayPage, { global: { provide: { [routeLocationKey]: { fullPath: '/today' } }, stubs: { RouterLink: RouterLinkStub } } })

function signIn() {
  auth.isLoggedIn = true
  auth.accessToken = 'test-only'
  auth.userInfo = { user_name: '测试殿下' }
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.accessToken = ''
  auth.isLoggedIn = false
  auth.userInfo = null
  activeAccount.clear()
  listAccounts.mockResolvedValue([])
  getOperatorCurrent.mockResolvedValue({ entries: {} })
  getCurrent.mockResolvedValue([])
  getCurrentStarState.mockResolvedValue({ inventory: [] })
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
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  expect(getOperatorCurrent).not.toHaveBeenCalled()
  pending.resolve([]); await flushPromises()
  expect(wrapper.get('.data-onboarding').text()).toContain('创建游戏账号')
  expect(wrapper.find('.data-readiness-grid').exists()).toBe(false)
  expect(getOperatorCurrent).not.toHaveBeenCalled()
})

it('全部为空保留首次建档，读取全失败保留unknown而不宣称已准备', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'a', name: '账号', game: '如鸢' }])
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('section.data-onboarding').text()).toContain('第一次建档')
  expect(wrapper.findAll('.readiness-action')).toHaveLength(3)
  expect(wrapper.find('.account-data-summary').exists()).toBe(false)
  getOperatorCurrent.mockRejectedValue(new Error('失败'))
  getCurrent.mockRejectedValue(new Error('失败'))
  getCurrentStarState.mockRejectedValue(new Error('失败'))
  activeAccount.setGame('代号鸢', 'a'); await flushPromises()
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  expect(wrapper.get('.account-data-summary').text()).toContain('密探、库存、星石状态未确认')
  expect(wrapper.get('.account-data-summary').text()).not.toContain('已录入的数据可继续')
})

it('A→B立即清空旧摘要，迟到A不能覆盖B；清空与失效id不发账号请求', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'a', name: 'A', game: '如鸢' }, { id: 'b', name: 'B', game: '如鸢' }])
  const a = deferred(), b = deferred()
  getOperatorCurrent.mockImplementation(({ accountId }) => accountId === 'a' ? a.promise : b.promise)
  const wrapper = render(); await flushPromises()
  activeAccount.set('b'); await flushPromises()
  expect(wrapper.get('.account-data-summary').text()).toContain('正在读取当前账号')
  b.resolve({ entries: { one: {}, two: {} } }); await flushPromises()
  expect(wrapper.get('.account-data-summary').text()).toContain('已录入 2 位')
  a.resolve({ entries: { old: {} } }); await flushPromises()
  expect(wrapper.get('.account-data-summary').text()).toContain('已录入 2 位')
  const calls = getOperatorCurrent.mock.calls.length
  activeAccount.clear(); await flushPromises()
  expect(wrapper.get('.account-data-summary').text()).toContain('请选择游戏账号')
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
  getOperatorCurrent.mockResolvedValue({ entries: { one: {}, two: {} } })
  auth.userInfo = { id: 'owner-b' }; await flushPromises()
  late.resolve({ entries: { old: {} } }); await flushPromises()
  expect(wrapper.get('.data-account-context-bar').text()).toContain('B')
  expect(wrapper.get('.account-data-summary').text()).toContain('已录入 2 位')
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
  const toolLinks = wrapper.get('.today-tool-links').findAllComponents(RouterLinkStub)
  expect(toolLinks.map(link => link.props('to'))).toEqual(['/operator', '/inventory', '/star'])
  expect(wrapper.find('[data-tour="today-overview"]').exists()).toBe(true)
  expect(listAccounts).not.toHaveBeenCalled()
  expect(getOperatorCurrent).not.toHaveBeenCalled()
})

it('已有数据时展示账号状态，工具位于后部且初始化只请求一次摘要', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { '1001': { level: 1 } } })
  getCurrent.mockResolvedValue({ entries: { itemA: { count: 3 } } })
  getCurrentStarState.mockResolvedValue({ inventory: [{ id: 'star-1' }] })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.data-account-context-bar').text()).toContain('测试大号')
  expect(wrapper.get('.account-data-summary').text()).toContain('已录入 1 位')
  expect(wrapper.get('.account-data-summary').text()).toContain('已录入 1 颗')
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  expect(wrapper.find('.today-coming-soon').exists()).toBe(false)
  expect(getOperatorCurrent).toHaveBeenCalledTimes(1)
  expect(getCurrent).toHaveBeenCalledTimes(1)
  expect(getCurrentStarState).toHaveBeenCalledTimes(1)
  expect(getOperatorCurrent).toHaveBeenCalledWith({ accountId: 'acc-a', game: '代号鸢' })
  expect(getCurrent).toHaveBeenCalledWith({ accountId: 'acc-a', entityType: 'item' })
  expect(getCurrentStarState).toHaveBeenCalledWith('acc-a')
  const sections = wrapper.findAll('section')
  expect(sections.findIndex(node => node.classes().includes('account-data-summary'))).toBeLessThan(sections.findIndex(node => node.classes().includes('today-tools')))
})

it('部分已有数据时补齐为可选折叠区，已有项目没有重复录入入口', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { '1001': { level: 1 } } })

  const wrapper = render()
  await flushPromises()

  expect(getOperatorCurrent).toHaveBeenCalled()
  expect(getCurrentStarState).toHaveBeenCalled()
  expect(wrapper.find('.data-readiness-grid').exists()).toBe(true)
  expect(wrapper.text()).toContain('尚未录入')
  expect(wrapper.text()).toContain('密探数据已录入，可在密探名册查看和继续维护')
  expect(wrapper.get('details.data-onboarding').attributes('open')).toBeUndefined()
  expect(wrapper.get('.account-data-summary').text()).toContain('已录入 1 位')
  expect(wrapper.findAllComponents(RouterLinkStub).filter(link => link.classes().includes('readiness-action')).map(link => link.props('to'))).toEqual(['/inventory', '/star'])
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
    const card = wrapper.findAll('.data-readiness-card').find(card => card.get('h3').text() === '库存')
    expect(card.text()).toContain(label)
    expect(card.find('.readiness-action').exists()).toBe(false)
    if (label.startsWith('已有')) expect(card.text()).not.toContain('完整库存基准')
    wrapper.unmount()
  }
})

it('库存元信息不足与读取失败使用不同说明，均不要求重录', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])
  getCurrent.mockResolvedValue({ entries: {} })
  let wrapper = render(); await flushPromises()
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
