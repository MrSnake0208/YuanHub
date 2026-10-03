import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import Summary from '../src/components/calendar/CalendarTodaySummary.vue'
import Month from '../src/components/calendar/CalendarMonthView.vue'
import Timeline from '../src/components/calendar/CalendarTimelineView.vue'
import Agenda from '../src/components/calendar/CalendarAgendaView.vue'
import EventCard from '../src/components/calendar/CalendarEventCard.vue'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { isFeatureEnabled } from '../src/config/features.js'
import { CALENDAR_VIEW_STORAGE_KEY, monthGridRange, timelineRange } from '../src/data/activityCalendar.js'

vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/config/features.js', async importOriginal => ({ ...(await importOriginal()), isFeatureEnabled: vi.fn(() => true) }))
const today = '2026-10-03'
const event = (patch = {}) => ({ id: 'evt-a', title: '跨月活动', game: '如鸢', category: 'ACTIVITY', source_type: 'MANUAL', start_date: '2026-09-30', end_date: '2026-10-04', ...patch })
const viewProps = (patch = {}) => ({ items: [event()], today, anchorDate: today, locateRequest: 0, ...patch })
const button = (wrapper, label) => wrapper.findAll('button').find(node => node.text() === label)
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function render(path = '/calendar') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: Calendar }] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Calendar, { attachTo: document.body, global: { plugins: [router], stubs: { IslandSidebar: true, SiteFooter: true } } })
  await flushPromises()
  return { wrapper, router }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T04:00:00Z'))
  vi.stubGlobal('innerWidth', 390)
  isFeatureEnabled.mockReturnValue(true)
  listActivityCalendar.mockResolvedValue({ items: [event()] })
})

it.each([[320, 'agenda'], [390, 'agenda'], [430, 'agenda'], [768, 'agenda'], [1024, 'timeline'], [1440, 'timeline']])('首次%dpx选择%s，resize不会强制改视图', async (width, view) => {
  vi.stubGlobal('innerWidth', width)
  const { wrapper } = await render()
  expect(wrapper.get('.calendar-view-switcher [aria-pressed=true]').text()).toBe(view === 'timeline' ? '时间轴' : '日程')
  vi.stubGlobal('innerWidth', width >= 1024 ? 390 : 1440)
  window.dispatchEvent(new Event('resize'))
  await flushPromises()
  expect(wrapper.get('.calendar-view-switcher [aria-pressed=true]').text()).toBe(view === 'timeline' ? '时间轴' : '日程')
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
})

it('URL优先于本地偏好，分享view/date可恢复；同月日期不会重查', async () => {
  localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, 'timeline')
  const { wrapper, router } = await render('/calendar?view=month&date=2026-10-07&game=如鸢&category=ACTIVITY&ref=share')
  expect(wrapper.get('.calendar-view-switcher [aria-pressed=true]').text()).toBe('月历')
  expect(listActivityCalendar).toHaveBeenCalledWith({ game: '如鸢', category: 'ACTIVITY', ...monthGridRange('2026-10-07') })
  expect(wrapper.get('.calendar-month-day[aria-pressed=true]').attributes('aria-label')).toContain('2026年10月7日')
  await wrapper.get('.calendar-month-day[aria-label^="2026年10月3日"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'month', game: '如鸢', category: 'ACTIVITY', ref: 'share' })
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
})

it('无效URL忽略、本地偏好恢复；手动视图持久化但日期不持久化', async () => {
  localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, 'month')
  const { wrapper, router } = await render('/calendar?view=invalid&date=2026-02-30&game=如鸢')
  expect(wrapper.get('.calendar-view-switcher [aria-pressed=true]').text()).toBe('月历')
  expect(wrapper.get('.calendar-month-day[aria-pressed=true]').attributes('aria-label')).toContain('2026年10月3日')
  await button(wrapper, '时间轴').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.game).toBe('如鸢')
  expect(router.currentRoute.value.query.view).toBe('timeline')
  expect(localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe('timeline')
  expect(localStorage.length).toBe(1)
  wrapper.unmount()
  const reopened = await render()
  expect(reopened.wrapper.get('.calendar-view-switcher [aria-pressed=true]').text()).toBe('时间轴')
  expect(reopened.wrapper.findComponent(Timeline).props('anchorDate')).toBe(today)
})

it('Storage读写异常仍可切换与定位', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  const { wrapper, router } = await render()
  expect(wrapper.findComponent(Agenda).exists()).toBe(true)
  await button(wrapper, '月历').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.view).toBe('month')
  expect(wrapper.findComponent(Month).exists()).toBe(true)
})

it('切换view/date保留筛选与无关query，无新增组件请求；返回恢复URL', async () => {
  const { wrapper, router } = await render('/calendar?view=agenda&game=如鸢&category=ACTIVITY&ref=share')
  await button(wrapper, '时间轴').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'timeline', game: '如鸢', category: 'ACTIVITY', ref: 'share' })
  expect(listActivityCalendar).toHaveBeenCalledTimes(2)
  await wrapper.get('button[aria-label="后五周"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.date).toBe('2026-11-07')
  expect(router.currentRoute.value.query.category).toBe('ACTIVITY')
  await router.push('/calendar?view=month&date=2026-12-07&game=代号鸢'); await flushPromises()
  router.back(); await flushPromises()
  expect(router.currentRoute.value.query.view).toBe('timeline')
  expect(router.currentRoute.value.query.date).toBe('2026-11-07')
  expect(wrapper.findComponent(Timeline).exists()).toBe(true)
})

it.each(['agenda', 'timeline', 'month'])('%s的今天动作清理日期，保留筛选并更新锚点', async view => {
  const { wrapper, router } = await render(`/calendar?view=${view}&date=2026-12-07&game=如鸢&category=ACTIVITY`)
  await wrapper.get('.calendar-today-action').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view, game: '如鸢', category: 'ACTIVITY' })
  const component = { agenda: Agenda, timeline: Timeline, month: Month }[view]
  expect(wrapper.findComponent(component).props('anchorDate')).toBe(today)
})

it('历史月份仍有正确今日摘要；历史项保留在月历且不污染今天统计', async () => {
  listActivityCalendar.mockImplementation(async query => ({ items: query.from === today && query.to === today
    ? [event({ start_date: today, end_date: today })]
    : [event({ title: '历史活动', start_date: '2026-08-01', end_date: '2026-08-31' })] }))
  const { wrapper } = await render('/calendar?view=month&date=2026-08-03')
  expect(listActivityCalendar).toHaveBeenCalledTimes(2)
  expect(wrapper.findAll('.calendar-counts p').map(node => node.text())).toEqual(['今日开始 1', '今日结束 1', '进行中 0'])
  expect(wrapper.get('.calendar-day-detail').text()).toContain('历史活动')
  expect(wrapper.get('.calendar-day-detail').text()).toContain('已结束')
})

it('快速视图切换旧成功/失败响应不覆盖新视图，卸载响应不再提交', async () => {
  const old = deferred(), stale = deferred(), last = deferred()
  listActivityCalendar.mockReturnValueOnce(old.promise).mockReturnValueOnce(stale.promise).mockResolvedValue({ items: [event({ title: '最新月历活动' })] })
  const { wrapper } = await render('/calendar?view=agenda')
  await button(wrapper, '时间轴').trigger('click'); await flushPromises()
  await button(wrapper, '月历').trigger('click'); await flushPromises()
  old.resolve({ items: [event({ title: '过期日程' })] })
  stale.reject(new Error('过期错误')); await flushPromises()
  expect(wrapper.get('.calendar-day-detail').text()).toContain('最新月历活动')
  expect(wrapper.text()).not.toContain('过期日程')
  expect(wrapper.find('[role=alert]').exists()).toBe(false)
  listActivityCalendar.mockReturnValue(last.promise)
  await button(wrapper, '日程').trigger('click'); await flushPromises()
  wrapper.unmount()
  last.resolve({ items: [event()] }); await flushPromises()
  expect(vi.getTimerCount()).toBe(0)
})

it('切换到月份过程中今日补查晚到不污染当前筛选', async () => {
  const summary = deferred()
  listActivityCalendar.mockImplementation(query => {
    if (query.game === '如鸢' && query.from === today && query.to === today) return summary.promise
    return Promise.resolve({ items: query.game === '代号鸢' ? [event({ game: '代号鸢', start_date: today, end_date: today })] : [] })
  })
  const { wrapper, router } = await render('/calendar?view=month&date=2026-08-03&game=如鸢')
  await router.replace('/calendar?view=month&date=2026-08-03&game=代号鸢'); await flushPromises()
  summary.resolve({ items: [] }); await flushPromises()
  expect(wrapper.findAll('.calendar-counts p').map(node => node.text())).toEqual(['今日开始 1', '今日结束 1', '进行中 0'])
})

it.each(['agenda', 'timeline', 'month'])('%s加载/错误/重试/空状态仍可操作视图控件', async view => {
  const pending = deferred()
  listActivityCalendar.mockReturnValueOnce(pending.promise).mockResolvedValue({ items: [] })
  const { wrapper } = await render(`/calendar?view=${view}`)
  expect(wrapper.text()).toContain('正在读取活动日程')
  expect(wrapper.find('.calendar-view-switcher').exists()).toBe(true)
  pending.reject(new Error('网络失败')); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('网络失败')
  await wrapper.get('[role=alert] button').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('暂无')
  if (view === 'month') expect(wrapper.findAll('.calendar-month-day')).toHaveLength(35)
})

it('Month浏览历史时午夜与pageshow刷新今天，保留筛选和显式日期，只重读一次', async () => {
  vi.setSystemTime(new Date('2026-10-02T15:59:59Z'))
  const { wrapper, router } = await render('/calendar?view=month&date=2026-08-03&game=如鸢&category=ACTIVITY')
  expect(listActivityCalendar).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1100); await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(4)
  expect(listActivityCalendar.mock.lastCall[0]).toEqual({ game: '如鸢', category: 'ACTIVITY', from: today, to: today })
  expect(router.currentRoute.value.query.date).toBe('2026-08-03')
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(4)
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('flag关闭不读偏好、不请求、不设置计时器及刷新监听', async () => {
  isFeatureEnabled.mockReturnValue(false)
  const storage = vi.spyOn(Storage.prototype, 'getItem')
  const documentListener = vi.spyOn(document, 'addEventListener')
  const windowListener = vi.spyOn(window, 'addEventListener')
  const { wrapper } = await render('/calendar?view=month')
  expect(storage).not.toHaveBeenCalledWith(CALENDAR_VIEW_STORAGE_KEY)
  expect(listActivityCalendar).not.toHaveBeenCalled()
  expect(documentListener.mock.calls.some(([name]) => name === 'visibilitychange')).toBe(false)
  expect(windowListener.mock.calls.some(([name]) => name === 'pageshow')).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
  expect(wrapper.find('.calendar-view-tools').exists()).toBe(false)
})

it('Month每天计数跨月活动，按钮完整命名，选中日详情复用卡片', async () => {
  const wrapper = mount(Month, { props: viewProps({ items: [event(), event({ id: 'single', title: '今日限时', start_date: today, end_date: today })] }) })
  expect(wrapper.findAll('.calendar-month-day')).toHaveLength(35)
  const selected = wrapper.get('.calendar-month-day[aria-pressed=true]')
  expect(selected.attributes('aria-current')).toBe('date')
  expect(selected.attributes('aria-label')).toBe('2026年10月3日，2项活动，今天，已选中')
  expect(wrapper.get('.calendar-detail-heading > span').text()).toBe('2 项活动')
  expect(wrapper.findAllComponents(EventCard)).toHaveLength(2)
  await wrapper.get('.calendar-month-day[aria-label^="2026年10月5日"]').trigger('click')
  expect(wrapper.emitted('select-date').at(-1)).toEqual(['2026-10-05'])
  await wrapper.setProps({ anchorDate: '2026-10-05' })
  expect(wrapper.get('.calendar-detail-heading h3').text()).toContain('10月5日')
  expect(wrapper.get('.calendar-day-detail').text()).toContain('暂无活动')
  expect(wrapper.get('.calendar-day-detail').text()).not.toContain('0 项活动')
  await wrapper.setProps({ anchorDate: '2026-08-01' })
  expect(wrapper.findAll('.calendar-month-day')).toHaveLength(42)
})

it('Month月末导航钳制日号，点相邻月份格同步展示月份和请求范围', async () => {
  const { wrapper, router } = await render('/calendar?view=month&date=2026-01-31&game=如鸢')
  await wrapper.get('button[aria-label="下个月"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.date).toBe('2026-02-28')
  expect(listActivityCalendar).toHaveBeenCalledWith({ game: '如鸢', category: '', ...monthGridRange('2026-02-28') })
  await wrapper.get('.calendar-month-day[aria-label^="2026年3月1日"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.date).toBe('2026-03-01')
  expect(wrapper.findComponent(Month).props('anchorDate')).toBe('2026-03-01')
})

it.each([['month', '下个月'], ['timeline', '后五周']])('%s加载时保留日期导航按钮和键盘焦点', async (view, label) => {
  const { wrapper } = await render(`/calendar?view=${view}`)
  const pending = deferred()
  listActivityCalendar.mockReturnValue(pending.promise)
  const nav = wrapper.get(`button[aria-label="${label}"]`)
  nav.element.focus()
  await nav.trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('正在读取活动日程')
  expect(document.activeElement).toBe(nav.element)
  pending.resolve({ items: [] }); await flushPromises()
  expect(document.activeElement).toBe(nav.element)
  expect(wrapper.get(`button[aria-label="${label}"]`).element).toBe(nav.element)
})

it('Timeline单日与跨窗口截断，文字状态/完整名称/今天标记，可展开详情', async () => {
  const range = timelineRange(today)
  const wrapper = mount(Timeline, { props: viewProps({ items: [
    event({ id: 'single', title: '单日活动', start_date: today, end_date: today }),
    event({ id: 'long', title: '很长的活动标题'.repeat(12), start_date: '2026-09-01', end_date: '2026-11-30', description: '完整说明', start_time: '09:00', end_time: '12:00', time_zone: 'Asia/Shanghai' }),
    event({ id: 'invisible', title: '窗口之外', start_date: '2026-12-01', end_date: '2026-12-02' }),
  ] }) })
  expect(wrapper.findAll('.calendar-axis-day')).toHaveLength(35)
  expect(wrapper.get('.calendar-axis-day.is-today time').attributes('datetime')).toBe(today)
  expect(wrapper.find('.calendar-today-line').exists()).toBe(true)
  expect(wrapper.findAll('.calendar-timeline-bar')).toHaveLength(2)
  const single = wrapper.get('.calendar-timeline-bar[aria-label^="单日活动"]')
  expect(single.attributes('style')).toContain('span 1')
  expect(single.attributes('aria-label')).toContain('今日结束')
  const long = wrapper.get('.calendar-timeline-bar.is-clipped-start.is-clipped-end')
  expect(long.attributes('style')).toContain('span 35')
  expect(long.attributes('aria-label')).toContain('2026-09-01 09:00 — 2026-11-30 12:00')
  expect(long.attributes('aria-label')).toContain('Asia/Shanghai')
  await long.trigger('click'); await flushPromises()
  expect(wrapper.get('#calendar-timeline-detail').text()).toContain('完整说明')
  expect(long.attributes('aria-expanded')).toBe('true')
  await wrapper.setProps({ anchorDate: '2026-12-03' })
  expect(wrapper.find('.calendar-today-line').exists()).toBe(false)
  expect(range.from).toBe('2026-09-26')
})

it('Timeline今天重复定位恢复内部scrollLeft而不移动页面；window导航emit日期', async () => {
  const wrapper = mount(Timeline, { props: viewProps() })
  const viewport = wrapper.get('.calendar-timeline-scroll').element
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 252 })
  vi.spyOn(wrapper.get('.calendar-axis-day').element, 'getBoundingClientRect').mockReturnValue({ width: 44 })
  viewport.scrollLeft = 999
  await wrapper.setProps({ locateRequest: 1 })
  expect(viewport.scrollLeft).toBe(224)
  await wrapper.get('button[aria-label="后五周"]').trigger('click')
  expect(wrapper.emitted('select-date').at(-1)).toEqual(['2026-11-07'])
})

it('Timeline跨年窗口标题同时说明两端年份', () => {
  const wrapper = mount(Timeline, { props: viewProps({ anchorDate: '2027-01-01' }) })
  expect(wrapper.get('.calendar-window-heading h2').text()).toBe('2026年12月25日 — 2027年1月28日')
})

it('Agenda不重复跨日活动，按锚点定位；卡片即将结束提示优先且保留来源安全语义', async () => {
  const wrapper = mount(Agenda, { props: viewProps({ items: [event({ source_url: 'https://example.com/notice' }), event({ id: 'future', title: '未来活动', start_date: '2026-10-07', end_date: '2026-10-09' })] }) })
  expect(wrapper.findAllComponents(EventCard)).toHaveLength(2)
  expect(wrapper.get('.calendar-event.is-ending').text()).toContain('明天结束')
  expect(wrapper.get('.calendar-event-foot a').attributes('rel')).toBe('noopener noreferrer')
  const target = wrapper.get('[data-date="2026-10-07"]').element
  target.scrollIntoView = vi.fn()
  await wrapper.setProps({ anchorDate: '2026-10-07' })
  expect(target.scrollIntoView).toHaveBeenCalled()
})

it('今日信息带空态隐藏零计数，有活动保留三类统计并能恢复空态', async () => {
  const wrapper = mount(Summary, { props: { today, counts: { total: 0, starts: 0, ends: 0, ongoing: 0 } } })
  expect(wrapper.get('time').attributes('datetime')).toBe(today)
  expect(wrapper.get('time').text()).toBe('10月3日 周六')
  expect(wrapper.text()).toContain('当前筛选暂无活动')
  expect(wrapper.find('.calendar-counts').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('可以看看接下来的日程')
  await wrapper.setProps({ counts: { total: 9, starts: 2, ends: 1, ongoing: 6 } })
  expect(wrapper.findAll('.calendar-counts p').map(node => node.text())).toEqual(['今日开始 2', '今日结束 1', '进行中 6'])
  expect(wrapper.text()).not.toContain('暂无活动')
  await wrapper.setProps({ counts: { total: 0, starts: 0, ends: 0, ongoing: 0 } })
  expect(wrapper.find('.calendar-counts').exists()).toBe(false)
  expect(wrapper.text()).toContain('当前筛选暂无活动')
})

it('今日信息带加载和失败不误报空态或残留活动统计', async () => {
  const wrapper = mount(Summary, { props: { today, counts: { total: 1, starts: 1, ends: 0, ongoing: 0 }, loading: true } })
  expect(wrapper.get('[role=status]').text()).toContain('正在读取今日摘要')
  expect(wrapper.find('.calendar-counts').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('暂无活动')
  await wrapper.setProps({ loading: false, error: '读取失败' })
  expect(wrapper.text()).toContain('今日摘要暂时无法读取')
  expect(wrapper.find('.calendar-counts').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('暂无活动')
  await wrapper.setProps({ error: '' })
  expect(wrapper.get('.calendar-counts').text()).toContain('今日开始 1')
})
