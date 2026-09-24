import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import TodayPage from '../src/pages/today/index.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { getOperatorCurrent } from '../src/api/operator.js'
import { getCurrent, listAgentFavorites } from '../src/api/inventory.js'
import { getUnreadNotificationCount } from '../src/api/notifications.js'
import { getCurrentStarState } from '../src/api/starState.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null, isLoggedIn: false }), logout: vi.fn() }
})
vi.mock('../src/components/IslandSidebar.vue', () => ({ default: { name: 'IslandSidebar', template: '<nav />' } }))
vi.mock('../src/components/SiteFooter.vue', () => ({ default: { name: 'SiteFooter', template: '<footer />' } }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn(), createAccount: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCurrent: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), listAgentFavorites: vi.fn() }))
vi.mock('../src/api/notifications.js', () => ({ getUnreadNotificationCount: vi.fn() }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))

const render = () => mount(TodayPage, { global: { stubs: { RouterLink: RouterLinkStub } } })

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
  getCurrent.mockResolvedValue({ entries: {} })
  listAgentFavorites.mockResolvedValue({ agent_ids: [] })
  getUnreadNotificationCount.mockResolvedValue({ count: 0 })
  getCurrentStarState.mockResolvedValue({ inventory: [] })
})

it('访客看到重做占位，01/02/03 三个板块不再渲染', async () => {
  const wrapper = render()
  await flushPromises()

  expect(wrapper.find('.today-coming-soon').exists()).toBe(true)
  expect(wrapper.text()).toContain('老鸢赶工中…')
  expect(wrapper.text()).toContain('WORK IN PROGRESS')

  expect(wrapper.find('.task-grid').exists()).toBe(false)
  expect(wrapper.find('.summary-grid').exists()).toBe(false)
  expect(wrapper.find('.tool-groups').exists()).toBe(false)
  expect(wrapper.findAll('.task-card')).toHaveLength(0)
  expect(wrapper.findAll('.summary-card')).toHaveLength(0)
  expect(wrapper.findAll('.tool-card')).toHaveLength(0)

  // 新手教程第 2 步依赖这个锚点，占位必须继续提供它。
  expect(wrapper.find('[data-tour="today-overview"]').exists()).toBe(true)
  // 占位不吞掉访客的演示状态标识与登录引导。
  expect(wrapper.text()).toContain('演示数据')
  expect(wrapper.text()).toContain('先登录，再开始建立今日一览')
})

it('登录且有子账号与数据时仍只渲染占位，账号上下文保持可用', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])
  getOperatorCurrent.mockResolvedValue({ entries: { '1001': { level: 1 } } })
  getCurrent.mockResolvedValue({ entries: { itemA: { count: 3 } } })
  listAgentFavorites.mockResolvedValue({ agent_ids: ['1001'] })
  getUnreadNotificationCount.mockResolvedValue({ count: 2 })
  getCurrentStarState.mockResolvedValue({ inventory: [{ id: 'star-1' }] })

  const wrapper = render()
  await flushPromises()

  expect(wrapper.find('.today-coming-soon').exists()).toBe(true)
  expect(wrapper.findAll('.task-card')).toHaveLength(0)
  expect(wrapper.findAll('.summary-card')).toHaveLength(0)
  expect(wrapper.findAll('.tool-card')).toHaveLength(0)

  expect(wrapper.find('.account-picker').exists()).toBe(true)
  expect(wrapper.text()).toContain('真实数据')
})

it('占位不切断建档数据链路：缺数据时建档检查仍按真实读取结果显示尚未录入', async () => {
  signIn()
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '测试大号', game: '代号鸢' }])

  const wrapper = render()
  await flushPromises()

  expect(getOperatorCurrent).toHaveBeenCalled()
  expect(getCurrentStarState).toHaveBeenCalled()
  expect(wrapper.find('.data-readiness-grid').exists()).toBe(true)
  expect(wrapper.text()).toContain('尚未录入')
  expect(wrapper.find('.today-coming-soon').exists()).toBe(true)
})
