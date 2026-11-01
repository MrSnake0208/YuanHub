import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import CalendarViewSwitcher from '../src/components/calendar/CalendarViewSwitcher.vue'
import AccountSwitcher from '../src/components/AccountSwitcher.vue'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { listCalendarSubscriptions, setCalendarCompletion, saveCalendarProgress } from '../src/api/activityCalendarSubscriptions.js'
import { listCalendarPrivateItems, createCalendarPrivateItem } from '../src/api/calendarPrivateItems.js'
import { dialog } from '../src/utils/dialog.js'
import { installViewport } from '../test-support/viewport.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, userInfo: { id: 'owner' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ listCalendarSubscriptions: vi.fn(), setCalendarCompletion: vi.fn(), saveCalendarProgress: vi.fn() }))
vi.mock('../src/api/calendarPrivateItems.js', () => ({ listCalendarPrivateItems: vi.fn(), createCalendarPrivateItem: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const event = { id: 'evt', game: '如鸢', title: '真实订阅活动', category: 'ACTIVITY', source_type: 'MANUAL', start_date: '2026-10-14', end_date: '2026-10-20' }
const personal = { id: 'pci_00000000-0000-0000-0000-000000000001', account_id: 'a', game: '如鸢', title: '真实私人事项', date: '2026-10-16', time: '20:00', note: '保留备注', version: 0 }
let wrapper, records
const button = text => {
  if (text === '筛选') return wrapper.get('.calendar-filter-trigger')
  const panel = document.querySelector('#calendar-filter-sheet') || document.body
  return new DOMWrapper(panel).findAll('button').find(node => node.text() === text)
}
async function click(text) { await button(text).trigger('click'); await flushPromises() }
async function render(width = 390, query = 'scope=mine&view=agenda&ref=keep') {
  const viewport = installViewport(width)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: Calendar }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/calendar?' + query); await router.isReady()
  wrapper = mount({ template: '<router-view />' }, { attachTo: document.body, global: { plugins: [router], stubs: { IslandSidebar: true, SiteFooter: true } } })
  await flushPromises()
  return { router, viewport }
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T04:00:00Z'))
  activeAccount.set('a')
  listAccounts.mockResolvedValue([{ id: 'a', name: '当前账号', game: '如鸢' }, { id: 'b', name: '另一个账号', game: '如鸢' }])
  records = [
    { event_id: 'evt', subscribed: true, completed: false, version: 0, checklist: [], item: event },
    { event_id: 'done', subscribed: true, completed: true, manual_completed: true, version: 0, checklist: [{ id: 'unfinished', title: '清单仍未完成', completed: false }], item: { ...event, id: 'done', title: '本期已完成活动' } },
  ]
  listActivityCalendar.mockResolvedValue({ items: records.map(record => record.item) })
  listCalendarSubscriptions.mockImplementation(async () => ({ items: records, subscribed_count: records.length }))
  listCalendarPrivateItems.mockImplementation(async ({ account_id }) => ({ items: account_id === 'a' ? [personal] : [] }))
  setCalendarCompletion.mockImplementation(async (id, body) => ({ ...records.find(record => record.event_id === id), completed: body.completed, manual_completed: body.completed, version: 1 }))
  dialog.confirm.mockResolvedValue(true)
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })

it.each([320, 390, 430])('%ipx 我的日历只挂载一套视图工具，并用个人内容替换公开统计和重复日期', async width => {
  await render(width)
  expect(wrapper.find('.calendar-mine-mobile').exists()).toBe(true)
  expect(wrapper.findAllComponents(CalendarViewSwitcher)).toHaveLength(1)
  expect(wrapper.get('.calendar-mine-view-target .calendar-view-switcher').exists()).toBe(true)
  expect(wrapper.find('.calendar-today').exists()).toBe(false)
  expect(wrapper.find('.calendar-task-filter').exists()).toBe(false)
  expect(wrapper.find('.calendar-account-scope').exists()).toBe(false)
  expect(wrapper.get('.calendar-personal-today > h2').text()).toContain('2 项')
  expect(wrapper.find('.calendar-personal-today .calendar-date-group > h3').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('TODAY')
  expect(wrapper.get('[data-event-id="evt"]').text()).toContain('2026-10-14')
  expect(wrapper.get('[data-event-id="evt"] .calendar-event-title').element.tagName).toBe('H3')
  expect(wrapper.get('[data-event-id="evt"]').text()).toContain('暂无待办')
  expect(wrapper.get('[data-event-id="evt"]').text()).not.toMatch(/0\/\d/)
  expect(wrapper.get('[data-event-id="' + personal.id + '"]').text()).toContain('私人事项')
  expect(wrapper.get('[data-event-id="' + personal.id + '"]').find('.calendar-subscription').exists()).toBe(false)
  await click('全部活动')
  expect(wrapper.find('.calendar-mine-mobile').exists()).toBe(false)
  expect(wrapper.get('.calendar-public-view-target .calendar-view-switcher').exists()).toBe(true)
  expect(wrapper.get('.calendar-today').text()).toContain('公开统计口径')
  expect(wrapper.find('.is-personal').exists()).toBe(false)
  expect(wrapper.get('[data-event-id="evt"] .calendar-event-title').element.tagName).toBe('H4')
})

it.each([768, 1080, 1440])('%ipx 保持原我的日历页头、订阅状态选择与公开摘要展示', async width => {
  await render(width)
  expect(wrapper.find('.calendar-mine-mobile').exists()).toBe(false)
  expect(wrapper.get('.calendar-header .calendar-view-switcher').exists()).toBe(true)
  expect(wrapper.get('[aria-label="个人活动状态"]').element.value).toBe('todo')
  expect(wrapper.get('.calendar-account-scope').text()).toContain('私人事项仅当前账号可见')
  expect(wrapper.find('.calendar-today').exists()).toBe(true)
  await click('筛选')
  expect(document.querySelector('.calendar-personal-filters')).toBeNull()
})

it('筛选面板沿用 task/pending 语义与分享参数，明确私人事项隐藏及恢复条件', async () => {
  const { router } = await render(390, 'scope=mine&view=agenda&pending=0&ref=keep')
  await click('筛选')
  expect(button('全部订阅').attributes('aria-pressed')).toBe('true')
  await click('已完成')
  expect(router.currentRoute.value.query).toEqual({ scope: 'mine', view: 'agenda', task: 'completed', ref: 'keep' })
  expect(wrapper.text()).toContain('本期已完成活动')
  expect(wrapper.get('[data-event-id="done"]').text()).toContain('进行中')
  expect(wrapper.get('[data-event-id="done"]').text()).toContain('待办事项 · 已完成 0/1 项')
  expect(wrapper.text()).not.toContain('真实私人事项')
  expect(document.querySelector('.calendar-personal-filters').textContent).toContain('私人事项已隐藏')
  expect(document.querySelector('.calendar-personal-filters').textContent).toContain('订阅即本期待办，截止不会自动完成')
  await click('我的待办')
  expect(wrapper.text()).toContain('真实私人事项')
  await click('活动')
  expect(wrapper.text()).not.toContain('真实私人事项')
  await click('全部订阅')
  await click('重置类型/时间')
  expect(router.currentRoute.value.query.task).toBe('all')
  expect(router.currentRoute.value.query.category).toBeUndefined()
  expect(wrapper.text()).toContain('真实私人事项')
  await click('完成')
  await wrapper.get('[aria-label="取消筛选：全部订阅"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.task).toBe('todo')
  expect(wrapper.find('[data-event-id="done"]').exists()).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('.calendar-filter-trigger').element)
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('本期完成后仍独立于清单，消失的卡片将焦点交回手机筛选入口', async () => {
  await render()
  await click('标记本期完成')
  expect(setCalendarCompletion).toHaveBeenCalledWith('evt', { account_id: 'a', expected_version: 0, completed: true }, 'owner')
  expect(wrapper.find('[data-event-id="evt"]').exists()).toBe(false)
  expect(wrapper.find('[data-event-id="' + personal.id + '"]').exists()).toBe(true)
  expect(document.activeElement).toBe(wrapper.get('.calendar-filter-trigger').element)
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('跨断点移动同一工具实例，不重置视图、重复请求或丢失私人事项草稿', async () => {
  const { router, viewport } = await render()
  const switcher = wrapper.getComponent(CalendarViewSwitcher).vm.$
  const account = wrapper.getComponent(AccountSwitcher).vm.$
  await click('添加私人事项')
  const input = document.querySelector('#private-item-title-input')
  input.value = '未保存草稿'; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus()
  await flushPromises()
  const editor = document.querySelector('.calendar-private-dialog')
  const reads = [listCalendarPrivateItems.mock.calls.length, listCalendarSubscriptions.mock.calls.length, listActivityCalendar.mock.calls.length]
  for (const width of [768, 1081, 767, 320, 430, 1440, 390]) {
    viewport.resize(width); await flushPromises()
    expect(wrapper.getComponent(CalendarViewSwitcher).vm.$).toBe(switcher)
    expect(wrapper.getComponent(AccountSwitcher).vm.$).toBe(account)
    expect(document.querySelector('.calendar-private-dialog')).toBe(editor)
    expect(input.value).toBe('未保存草稿')
    expect(document.activeElement).toBe(input)
    expect(router.currentRoute.value.query.view).toBe('agenda')
    expect([listCalendarPrivateItems.mock.calls.length, listCalendarSubscriptions.mock.calls.length, listActivityCalendar.mock.calls.length]).toEqual(reads)
  }
  dialog.confirm.mockResolvedValue(false)
  await click('筛选'); await click('已完成')
  expect(router.currentRoute.value.query.task).toBeUndefined()
  expect(input.value).toBe('未保存草稿')
  expect(createCalendarPrivateItem).not.toHaveBeenCalled()
})

it('手机筛选中的订阅状态随浏览器返回恢复，且清单草稿阻止未确认的筛选变化', async () => {
  const { router } = await render()
  await router.push('/calendar?scope=mine&view=agenda&task=completed&ref=keep'); await flushPromises()
  await click('筛选')
  expect(button('已完成').attributes('aria-pressed')).toBe('true')
  router.back(); await flushPromises()
  expect(button('我的待办').attributes('aria-pressed')).toBe('true')
  await click('完成')
  await click('编辑待办'); await click('添加待办')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('未保存清单')
  dialog.confirm.mockResolvedValue(false)
  await click('筛选'); await click('已完成')
  expect(router.currentRoute.value.query.task).toBeUndefined()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('未保存清单')
  expect(dialog.confirm).toHaveBeenCalled()
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('今日无事项时不虚构卡片，继续显示真实的后续分组；空日历不重复空状态', async () => {
  records = [{ ...records[0], item: { ...event, start_date: '2026-10-18', end_date: '2026-10-20' } }]
  listCalendarPrivateItems.mockResolvedValue({ items: [] })
  await render()
  expect(wrapper.get('.calendar-personal-today > h2').text()).toContain('0 项')
  expect(wrapper.get('.calendar-personal-today').text()).toContain('今天暂无个人事项')
  expect(wrapper.get('[data-event-id="evt"]').text()).toContain('2026-10-18')
  expect(wrapper.text()).toContain('接下来 7 天')
  wrapper.unmount()
  records = []
  await render()
  expect(wrapper.get('.calendar-filter-empty').text()).toContain('我的日历还是空的')
  expect(wrapper.find('.calendar-personal-today').exists()).toBe(false)
  expect(wrapper.find('.calendar-today').exists()).toBe(false)
})
