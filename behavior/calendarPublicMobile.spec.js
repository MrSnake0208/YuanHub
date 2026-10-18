import { beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import Month from '../src/components/calendar/CalendarMonthView.vue'
import ViewSwitcher from '../src/components/calendar/CalendarViewSwitcher.vue'
import AccountSwitcher from '../src/components/AccountSwitcher.vue'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { listCalendarSubscriptions, saveCalendarProgress } from '../src/api/activityCalendarSubscriptions.js'
import { listCalendarPrivateItems } from '../src/api/calendarPrivateItems.js'
import { dialog } from '../src/utils/dialog.js'
import { installViewport } from '../test-support/viewport.js'
import { timelineItemPosition, timelineRange } from '../src/data/activityCalendar.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, userInfo: { id: 'owner' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ listCalendarSubscriptions: vi.fn(), setCalendarCompletion: vi.fn(), saveCalendarProgress: vi.fn() }))
vi.mock('../src/api/calendarPrivateItems.js', () => ({ listCalendarPrivateItems: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
const today = '2026-10-16'
const activity = { id: 'activity', title: '真实跨日活动与较长标题', game: '如鸢', category: 'ACTIVITY', source_type: 'MANUAL', start_date: '2026-10-14', end_date: '2026-10-20', description: '完整说明仍在详情中', source_url: 'https://example.com/source' }
const pool = { ...activity, id: 'pool', title: '真实招募', category: 'RECRUITMENT', source_type: 'RECRUITMENT_POOL', pool_type: 'LIMITED', start_date: '2026-10-15', end_date: '2026-10-18', up_agent_names: ['测试密探甲', '测试密探乙'] }
const ongoing = { ...activity, id: 'ongoing', title: '持续开放活动', start_date: '2026-09-30', end_date: null }
let wrapper, items
async function render(width = 390, query = 'view=agenda&ref=keep') {
  const viewport = installViewport(width)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: Calendar }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/calendar?' + query); await router.isReady()
  wrapper = mount({ template: '<router-view />' }, { attachTo: document.body, global: { plugins: [router], stubs: { IslandSidebar: true, SiteFooter: true } } })
  await flushPromises()
  return { router, viewport }
}
const body = () => new DOMWrapper(document.body)
async function click(text, area = body()) {
  const button = area.findAll('button').find(node => node.text() === text)
  expect(button, `button: ${text}`).toBeTruthy()
  await button.trigger('click'); await flushPromises()
}
async function closeDetail() { await body().get('[aria-label="关闭日历详情"]').trigger('click'); await flushPromises() }
const reads = () => [listActivityCalendar.mock.calls.length, listAccounts.mock.calls.length, listCalendarSubscriptions.mock.calls.length]
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T04:00:00Z'))
  activeAccount.set('a'); items = [activity, pool, ongoing]
  listAccounts.mockResolvedValue([{ id: 'a', name: '当前账号的较长名字', game: '如鸢' }, { id: 'b', name: '另一个账号', game: '如鸢' }])
  listActivityCalendar.mockImplementation(async () => ({ items }))
  listCalendarSubscriptions.mockResolvedValue({ items: [{ event_id: activity.id, subscribed: true, completed: true, manual_completed: true, version: 0, checklist: [{ id: 'todo', title: '未完成清单', completed: false }], item: activity }], subscribed_count: 1 })
  listCalendarPrivateItems.mockResolvedValue({ items: [] }); dialog.confirm.mockResolvedValue(true)
})

it.each([320, 390, 430])('%ipx摘要保留真实活动/个人状态，完整信息与订阅通过原详情可达', async width => {
  await render(width)
  expect(wrapper.classes()).toContain('calendar-public-mobile')
  expect(wrapper.classes()).not.toContain('calendar-mine-mobile')
  expect(wrapper.findAllComponents(ViewSwitcher)).toHaveLength(1)
  expect(wrapper.get('.calendar-public-view-target .calendar-view-switcher').exists()).toBe(true)
  expect(wrapper.find('.calendar-private-add').exists()).toBe(false)
  const card = wrapper.get('[data-event-id="activity"]')
  expect(card.classes()).toContain('calendar-public-summary')
  expect(card.text()).toContain('2026-10-14')
  expect(card.get('[aria-label="活动时间状态"]').text()).toContain('进行中')
  expect(card.get('[aria-label="个人订阅状态"]').text()).toBe('已订阅 · 本期已完成')
  expect(card.find('.calendar-subscription').exists()).toBe(false)
  expect(card.text()).not.toContain(activity.description)
  expect(wrapper.get('[data-event-id="pool"]').text()).toContain('UP 密探：测试密探甲、测试密探乙')
  expect(wrapper.get('[data-event-id="pool"] [aria-label="个人订阅状态"]').text()).toBe('未订阅')
  const trigger = card.get('button'); await trigger.trigger('click'); await flushPromises()
  const detail = body().get('.calendar-detail-dialog')
  expect(detail.text()).toContain(activity.description)
  expect(detail.get('a').attributes('href')).toBe(activity.source_url)
  expect(detail.text()).toContain('撤销完成')
  expect(detail.find('.calendar-private-add').exists()).toBe(false)
  await closeDetail(); expect(document.activeElement).toBe(trigger.element)
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it.each([768, 1440])('%ipx保留原卡片、页头和月历跨日条', async width => {
  const { router } = await render(width)
  expect(wrapper.classes()).not.toContain('calendar-public-mobile')
  expect(wrapper.find('.calendar-public-summary').exists()).toBe(false)
  expect(wrapper.get('.calendar-header .calendar-view-switcher').exists()).toBe(true)
  expect(wrapper.get('[data-event-id="activity"] .calendar-subscription').exists()).toBe(true)
  await router.replace('/calendar?view=month'); await flushPromises()
  expect(wrapper.find('.calendar-month-bar').exists()).toBe(true)
  expect(wrapper.find('#calendar-public-day-list').exists()).toBe(false)
})

it.each(['error', 'no-account', 'other-game'])('摘要%s不冒充已知的未订阅状态', async state => {
  if (state === 'error') listCalendarSubscriptions.mockRejectedValue(new Error('读取失败'))
  if (state === 'no-account') listAccounts.mockResolvedValue([])
  if (state === 'other-game') listAccounts.mockResolvedValue([{ id: 'a', name: '另一游戏账号', game: '代号鸢' }])
  await render()
  const text = wrapper.get('[data-event-id="activity"] [aria-label="个人订阅状态"]').text()
  expect(text).toBe({ error: '订阅状态暂不可用', 'no-account': '选择账号后可订阅', 'other-game': '切换到如鸢账号后可订阅' }[state])
})

it('scope往返隔离三视图，保留同一工具与mine展示', async () => {
  const { router } = await render(); const switcher = wrapper.getComponent(ViewSwitcher).vm.$
  for (const view of ['agenda', 'timeline', 'month']) {
    await router.replace(`/calendar?view=${view}&scope=mine&task=all&ref=keep`); await flushPromises()
    expect(wrapper.classes()).toContain('calendar-mine-mobile')
    expect(wrapper.classes()).not.toContain('calendar-public-mobile')
    expect(wrapper.get('.calendar-mine-view-target .calendar-view-switcher').exists()).toBe(true)
    expect(wrapper.find('.calendar-public-summary').exists()).toBe(false)
    if (view === 'month') expect(wrapper.find('.calendar-month-bar').exists()).toBe(true)
    await click('全部活动', wrapper)
    expect(router.currentRoute.value.query.view).toBe(view)
    expect(router.currentRoute.value.query.ref).toBe('keep')
    expect(wrapper.classes()).toContain('calendar-public-mobile')
    expect(wrapper.find('.calendar-private-add').exists()).toBe(false)
    expect(wrapper.getComponent(ViewSwitcher).vm.$).toBe(switcher)
  }
})

it('月历跨日/持续日期保留真实数量，选日更新URL、下方清单和原详情', async () => {
  const { router } = await render(390, 'view=month&date=2026-10-16&game=如鸢&ref=keep')
  expect(wrapper.find('.calendar-month-bar').exists()).toBe(false)
  expect(wrapper.find('.calendar-month-overflow').exists()).toBe(false)
  for (const day of wrapper.findAll('.calendar-month-day')) {
    const date = day.attributes('aria-label').match(/2026年(\d+)月(\d+)日/)
    const key = `2026-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`
    const expected = items.filter(item => item.start_date <= key && (!item.end_date || item.end_date >= key)).length
    expect(day.attributes('aria-label')).toContain(`${expected}项活动`)
    expect(day.findAll('.calendar-month-density i')).toHaveLength(Math.min(3, expected))
    expect(day.find('.calendar-month-density small').exists()).toBe(expected > 0)
    if (expected) expect(day.get('.calendar-month-density small').text()).toBe(String(expected))
  }
  expect(wrapper.findAll('#calendar-public-day-list article')).toHaveLength(3)
  const count = reads()
  await wrapper.get('.calendar-month-day[aria-label^="2026年10月19日"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'month', date: '2026-10-19', game: '如鸢', ref: 'keep' })
  expect(reads()).toEqual(count)
  expect(document.querySelector('.calendar-detail-dialog')).toBeNull()
  expect(wrapper.findAll('#calendar-public-day-list article')).toHaveLength(2)
  await wrapper.get('#calendar-public-day-list [data-event-id="activity"] button').trigger('click'); await flushPromises()
  expect(body().get('.calendar-detail-dialog header h2').text()).toBe(activity.title)
  await closeDetail(); await click('查看全部', wrapper)
  expect(body().findAll('.calendar-detail-dialog article')).toHaveLength(2)
})

it('时间轴保留五周、今天线、跨度和详情，桌面不继承分类折叠', async () => {
  const { viewport } = await render(390, 'view=timeline')
  expect(wrapper.findAll('.calendar-axis-day')).toHaveLength(35)
  expect(wrapper.find('.calendar-today-line').exists()).toBe(true)
  const bar = wrapper.findAll('.calendar-timeline-bar').find(node => node.attributes('aria-label').startsWith(activity.title))
  const position = timelineItemPosition(activity, timelineRange(today))
  expect(bar.element.style.gridColumn).toBe(`${position.column} / span ${position.span}`)
  expect(bar.text()).toBe(activity.title)
  expect(bar.attributes('aria-label')).toContain('2026-10-14')
  const group = wrapper.get('.calendar-public-group-toggle'), tracks = wrapper.get('#' + group.attributes('aria-controls'))
  await group.trigger('click'); expect(group.attributes('aria-expanded')).toBe('false'); expect(tracks.isVisible()).toBe(false)
  viewport.resize(768); await flushPromises(); expect(tracks.isVisible()).toBe(true)
  expect(wrapper.find('.calendar-public-group-toggle').exists()).toBe(false)
  viewport.resize(390); await flushPromises(); await wrapper.get('.calendar-public-group-toggle').trigger('click')
  await bar.trigger('click'); await flushPromises()
  expect(body().get('.calendar-detail-dialog').text()).toContain(activity.description)
  expect(body().find('.calendar-detail-dialog .calendar-private-add').exists()).toBe(false)
})

it('摘要详情跨断点保留同一草稿与焦点，关闭遵守未保存确认', async () => {
  const { viewport } = await render()
  const switcher = wrapper.getComponent(ViewSwitcher).vm.$, account = wrapper.getComponent(AccountSwitcher).vm.$
  await wrapper.get('[data-event-id="activity"] button').trigger('click'); await flushPromises(); await click('编辑待办')
  const input = body().get('.calendar-check-row input[type=text]'); await input.setValue('未保存公开详情草稿'); input.element.focus()
  const panel = document.querySelector('.calendar-detail-dialog'), count = reads()
  for (const width of [768, 1440, 390, 320, 430]) {
    viewport.resize(width); await flushPromises()
    expect(document.querySelector('.calendar-detail-dialog')).toBe(panel)
    expect(input.element.value).toBe('未保存公开详情草稿'); expect(document.activeElement).toBe(input.element)
    expect(wrapper.getComponent(ViewSwitcher).vm.$).toBe(switcher); expect(wrapper.getComponent(AccountSwitcher).vm.$).toBe(account)
    expect(reads()).toEqual(count)
  }
  dialog.confirm.mockResolvedValue(false); await closeDetail()
  expect(document.querySelector('.calendar-detail-dialog')).toBe(panel); expect(input.element.value).toBe('未保存公开详情草稿')
  dialog.confirm.mockResolvedValue(true); await closeDetail()
  expect(document.querySelector('.calendar-detail-dialog')).toBeNull(); expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('桌面原卡片编辑中转手机不卸载草稿，筛选继续受未保存保护', async () => {
  const { router, viewport } = await render(1440); await click('编辑待办', wrapper)
  const input = wrapper.get('.calendar-check-row input[type=text]'); await input.setValue('桌面留下的草稿')
  viewport.resize(390); await flushPromises()
  expect(wrapper.get('.calendar-check-row input[type=text]').element).toBe(input.element)
  dialog.confirm.mockResolvedValue(false); await router.replace('/calendar?view=month'); await flushPromises()
  expect(router.currentRoute.value.query.view).toBe('agenda'); expect(input.element.value).toBe('桌面留下的草稿')
})

it.each(['loading', 'error', 'empty'])('月历%s不展示陈旧活动或虚假零统计', state => {
  installViewport(390)
  const month = mount(Month, { props: { items: state === 'empty' ? [] : [activity], today, anchorDate: today, compactPublic: true, loading: state === 'loading', error: state === 'error' } })
  expect(month.findAll('.calendar-month-day')).toHaveLength(35)
  expect(month.find('#calendar-public-day-list article').exists()).toBe(false)
  const text = month.get('#calendar-public-day-list').text()
  expect(text).toContain({ loading: '正在读取当日活动', error: '当日活动暂不可用', empty: '当天暂无活动' }[state])
  if (state !== 'empty') expect(text).not.toContain('0 项活动')
})

it('公开筛选、账号与今天沿用原路径，时间轴/月历统计可展开', async () => {
  const { router } = await render(390, 'view=month&date=2026-10-19&ref=keep')
  expect(wrapper.get('.calendar-public-statistics').attributes('open')).toBeUndefined()
  expect(wrapper.get('.calendar-public-statistics .calendar-today').text()).toContain('公开统计口径')
  await wrapper.get('.calendar-filter-trigger').trigger('click'); await flushPromises()
  expect(document.querySelector('.calendar-personal-filters')).toBeNull()
  await click('活动'); await click('完成'); expect(router.currentRoute.value.query.display_group).toBe('ACTIVITY')
  await wrapper.get('.account-switcher .context-selector').trigger('click'); await flushPromises()
  await body().get('[data-account-id="b"]').trigger('click'); await flushPromises(); expect(activeAccount.id).toBe('b')
  await wrapper.get('.calendar-today-action').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'month', display_group: 'ACTIVITY', ref: 'keep' })
  expect(wrapper.get('.calendar-month-day[aria-pressed=true]').attributes('aria-label')).toContain('2026年10月16日')
})
