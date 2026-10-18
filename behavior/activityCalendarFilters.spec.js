import { CALENDAR_DISPLAY_GROUPS } from '../src/data/activityCalendarTypes.js'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import CalendarFilterControls from '../src/components/calendar/CalendarFilterControls.vue'
import { CALENDAR_CATEGORIES, CALENDAR_GAMES, CALENDAR_TIME_FILTERS, serverToday, addCalendarDays } from '../src/data/activityCalendar.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { isFeatureEnabled } from '../src/config/features.js'

vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/config/features.js', async importOriginal => ({ ...(await importOriginal()), isFeatureEnabled: vi.fn(() => true) }))

let desktopMedia
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('innerWidth', 390)
  const target = new EventTarget()
  desktopMedia = {
    matches: false,
    addEventListener: vi.fn(target.addEventListener.bind(target)),
    removeEventListener: vi.fn(target.removeEventListener.bind(target)),
    dispatchEvent: target.dispatchEvent.bind(target),
  }
  vi.stubGlobal('matchMedia', vi.fn(query => query === '(min-width: 1024px)' ? desktopMedia : Object.assign(new EventTarget(), { matches: false })))
  isFeatureEnabled.mockReturnValue(true)
  listActivityCalendar.mockResolvedValue({ items: [] })
})
afterEach(async () => {
  await flushPromises()
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
})

async function render(path = '/calendar') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: Calendar }] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Calendar, { attachTo: document.body, global: { plugins: [router], stubs: { IslandSidebar: true, SiteFooter: true } } })
  await flushPromises()
  return { wrapper, router }
}
const summaryText = wrapper => wrapper.find('.calendar-filter-summary').exists() ? wrapper.get('.calendar-filter-summary').text() : '未启用筛选'
const dialog = () => document.querySelector('#calendar-filter-sheet')
function sheetButton(text) { return Array.from(dialog().querySelectorAll('button')).find(button => button.textContent === text) }
async function clickSheet(text) { sheetButton(text).click(); await flushPromises() }
async function open(wrapper) { await wrapper.get('.calendar-filter-trigger').trigger('click'); await flushPromises() }

it('Controls完整展示选项，只发出单维度patch且不修改输入', async () => {
  const filters = { game: '如鸢', category: 'RECRUITMENT' }
  const wrapper = mount(CalendarFilterControls, { props: { filters, games: CALENDAR_GAMES, categories: CALENDAR_CATEGORIES } })
  expect(wrapper.findAll('fieldset')).toHaveLength(3)
  expect(wrapper.findAll('button').map(button => button.text())).toEqual(['全部游戏', ...CALENDAR_GAMES, '全部类型', ...Object.values(CALENDAR_DISPLAY_GROUPS), ...Object.values(CALENDAR_TIME_FILTERS)])
  await wrapper.findAll('button').find(button => button.text() === '代号鸢').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '活动').trigger('click')
  expect(wrapper.emitted('change')).toEqual([[{ game: '代号鸢' }], [{ display_group: 'ACTIVITY' }]])
  expect(filters).toEqual({ game: '如鸢', category: 'RECRUITMENT' })
})

it.each([
  ['', '未启用筛选', 0],
  ['?game=如鸢', '如鸢', 1],
  ['?category=RECRUITMENT', '卡池', 1],
  ['?game=如鸢&category=RECRUITMENT', '如鸢 · 卡池', 2],
  ['?game=未知&category=UNKNOWN', '未启用筛选', 0],
])('URL %s驱动摘要、可访问名称与0/1/2计数，默认不打开弹层', async (query, summary, count) => {
  const { wrapper } = await render(`/calendar${query}`)
  const trigger = wrapper.get('.calendar-filter-trigger')
  expect(summaryText(wrapper)).toBe(summary)
  expect(trigger.attributes('aria-label')).toBe(`筛选活动，当前：${summary}，已启用 ${count} 个筛选条件`)
  expect(trigger.attributes('aria-haspopup')).toBe('dialog')
  expect(trigger.attributes('aria-controls')).toBe('calendar-filter-sheet')
  expect(trigger.attributes('aria-expanded')).toBe('false')
  expect(wrapper.find('.calendar-filter-count').exists()).toBe(count > 0)
  if (count) expect(wrapper.get('.calendar-filter-count').text()).toBe(String(count))
  expect(dialog()).toBeNull()
  expect(wrapper.find('.calendar-filter-state').exists()).toBe(count > 0)
  expect(wrapper.findComponent(CalendarFilterControls).exists()).toBe(false)
  expect(wrapper.text()).not.toContain('全部游戏 · 全部类型')
})

it('桌面入口打开同一浮层，完整控件可操作，Escape恢复焦点', async () => {
  vi.stubGlobal('innerWidth', 1440)
  desktopMedia.matches = true
  const { wrapper, router } = await render('/calendar?view=timeline&ref=keep')
  await open(wrapper)
  expect(dialog()).not.toBeNull()
  expect(document.querySelectorAll('.calendar-filters')).toHaveLength(1)
  expect(document.activeElement.id).toBe('calendar-filter-sheet-title')
  await clickSheet('如鸢')
  await clickSheet('近 3 天结束')
  expect(router.currentRoute.value.query).toEqual({ view: 'timeline', ref: 'keep', game: '如鸢', status: 'ending' })
  expect(sheetButton('近 3 天结束').getAttribute('aria-pressed')).toBe('true')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(dialog()).toBeNull()
  expect(document.activeElement).toBe(wrapper.get('.calendar-filter-trigger').element)
})

it.each([
  [1440, 900, 280, 120, 164, '280px', '172px', 'auto', '640px'],
  [1100, 800, 950, 120, 164, '644px', '172px', 'auto', '612px'],
  [1440, 700, 280, 580, 624, '280px', 'auto', '128px', '556px'],
  [1440, 400, 280, 120, 164, '280px', '172px', 'auto', '212px'],
])('桌面锚定与边界避让：视口%s×%s，按钮位于%s/%s–%s', async (width, height, left, top, bottom, expectedLeft, expectedTop, expectedBottom, expectedHeight) => {
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('innerHeight', height)
  desktopMedia.matches = true
  const { wrapper } = await render()
  vi.spyOn(wrapper.get('.calendar-filter-trigger').element, 'getBoundingClientRect').mockReturnValue({ left, top, bottom })
  await open(wrapper)
  const style = dialog().style
  expect(style.getPropertyValue('--filter-left')).toBe(expectedLeft)
  expect(style.getPropertyValue('--filter-top')).toBe(expectedTop)
  expect(style.getPropertyValue('--filter-bottom')).toBe(expectedBottom)
  expect(style.getPropertyValue('--filter-max-height')).toBe(expectedHeight)
})

it('打开期间随缩放与滚动更新锚点，关闭和卸载后停止定位', async () => {
  vi.stubGlobal('innerWidth', 1440)
  vi.stubGlobal('innerHeight', 900)
  desktopMedia.matches = true
  const { wrapper } = await render()
  const bounds = vi.spyOn(wrapper.get('.calendar-filter-trigger').element, 'getBoundingClientRect')
    .mockReturnValue({ left: 280, top: 120, bottom: 164 })
  await open(wrapper)
  bounds.mockReturnValue({ left: 340, top: 140, bottom: 184 })
  window.dispatchEvent(new Event('resize'))
  await flushPromises()
  expect(dialog().style.getPropertyValue('--filter-left')).toBe('340px')
  expect(dialog().style.getPropertyValue('--filter-top')).toBe('192px')
  bounds.mockReturnValue({ left: 340, top: 100, bottom: 144 })
  window.dispatchEvent(new Event('scroll'))
  await flushPromises()
  expect(dialog().style.getPropertyValue('--filter-top')).toBe('152px')
  await clickSheet('完成')
  bounds.mockClear()
  window.dispatchEvent(new Event('resize'))
  window.dispatchEvent(new Event('scroll'))
  expect(bounds).not.toHaveBeenCalled()
  await open(wrapper)
  wrapper.unmount()
  bounds.mockClear()
  window.dispatchEvent(new Event('resize'))
  window.dispatchEvent(new Event('scroll'))
  expect(bounds).not.toHaveBeenCalled()
})

it('手机底部弹层不应用桌面锚点定位', async () => {
  const { wrapper } = await render()
  const bounds = vi.spyOn(wrapper.get('.calendar-filter-trigger').element, 'getBoundingClientRect')
  await open(wrapper)
  expect(bounds).not.toHaveBeenCalled()
  expect(dialog().style.getPropertyValue('--filter-left')).toBe('')
  expect(dialog().style.getPropertyValue('--filter-top')).toBe('')
})

it.each(['agenda', 'timeline', 'month'])('%s逐项取消仅移除对应条件，保留视图/日期/账号与其它条件', async view => {
  const { wrapper, router } = await render(`/calendar?view=${view}&date=2026-10-09&game=如鸢&category=LOGIN&exclude_recruitment=1&status=ending&ref=keep`)
  expect(wrapper.findAll('.calendar-active-filters button').map(node => node.text())).toEqual(['如鸢', '签到', '不含招募', '近 3 天结束'])
  for (const [label, key] of [['不含招募', 'exclude_recruitment'], ['签到', 'category'], ['近 3 天结束', 'status'], ['如鸢', 'game']]) {
    const before = { ...router.currentRoute.value.query }
    await wrapper.get(`[aria-label="取消筛选：${label}"]`).trigger('click'); await flushPromises()
    delete before[key]
    expect(router.currentRoute.value.query).toEqual(before)
    expect(wrapper.find(`[aria-label="取消筛选：${label}"]`).exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.calendar-filter-trigger').element)
  }
  expect(wrapper.find('.calendar-filter-state').exists()).toBe(false)
})

it('Sheet即时应用并保持打开，只有一组筛选控件，重置保留view/date/其它query', async () => {
  const { wrapper, router } = await render('/calendar?view=month&date=2026-09-15&ref=share')
  await open(wrapper)
  await clickSheet('如鸢')
  await clickSheet('卡池')
  expect(router.currentRoute.value.query).toEqual({ view: 'month', date: '2026-09-15', ref: 'share', game: '如鸢', display_group: 'RECRUITMENT' })
  expect(listActivityCalendar.mock.lastCall[0]).toMatchObject({ game: '如鸢', category: '' })
  expect(summaryText(wrapper)).toBe('如鸢 · 卡池')
  expect(wrapper.get('.calendar-filter-count').text()).toBe('2')
  expect(dialog()).not.toBeNull()
  expect(sheetButton('如鸢').getAttribute('aria-pressed')).toBe('true')
  expect(document.querySelectorAll('.calendar-filters')).toHaveLength(1)
  expect(dialog().querySelector('header button')).toBe(sheetButton('重置筛选'))
  await clickSheet('重置筛选')
  expect(router.currentRoute.value.query).toEqual({ view: 'month', date: '2026-09-15', ref: 'share' })
  expect(summaryText(wrapper)).toBe('未启用筛选')
  expect(wrapper.find('.calendar-filter-count').exists()).toBe(false)
  expect(sheetButton('全部游戏').getAttribute('aria-pressed')).toBe('true')
  expect(sheetButton('全部类型').getAttribute('aria-pressed')).toBe('true')
  expect(dialog()).not.toBeNull()
})

it('底部完成关闭弹层并保留已选筛选，顶部提供重置', async () => {
  const { wrapper, router } = await render('/calendar?game=如鸢&category=LOGIN&ref=keep')
  await open(wrapper)
  expect(dialog().querySelector('header button').textContent).toBe('重置筛选')
  const done = dialog().querySelector('footer button')
  expect(done.textContent).toBe('完成')
  const query = { ...router.currentRoute.value.query }
  const requestCount = listActivityCalendar.mock.calls.length
  done.click()
  await flushPromises()
  expect(dialog()).toBeNull()
  expect(router.currentRoute.value.query).toEqual(query)
  expect(listActivityCalendar).toHaveBeenCalledTimes(requestCount)
})

it.each(['完成', '遮罩', 'Escape'])('%s关闭后恢复入口焦点、滚动样式并清理断点监听', async method => {
  document.body.style.overflow = 'scroll'
  document.documentElement.style.overflow = 'auto'
  document.body.style.paddingRight = '7px'
  const { wrapper } = await render()
  await open(wrapper)
  expect(wrapper.get('.calendar-filter-trigger').attributes('aria-expanded')).toBe('true')
  expect(dialog().getAttribute('aria-modal')).toBe('true')
  expect(document.activeElement.id).toBe('calendar-filter-sheet-title')
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.documentElement.style.overflow).toBe('hidden')
  if (method === '完成') await clickSheet('完成')
  else if (method === '遮罩') document.querySelector('.calendar-filter-mask').click()
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(dialog()).toBeNull()
  expect(wrapper.get('.calendar-filter-trigger').attributes('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(wrapper.get('.calendar-filter-trigger').element)
  expect(document.body.style.overflow).toBe('scroll')
  expect(document.documentElement.style.overflow).toBe('auto')
  expect(document.body.style.paddingRight).toBe('7px')
  expect(desktopMedia.removeEventListener).toHaveBeenCalledWith('change', desktopMedia.addEventListener.mock.calls[0][1])
})

it('复用焦点陷阱：Shift+Tab至末尾、Tab回到首个操作，背景焦点不能逃出', async () => {
  const { wrapper } = await render()
  await open(wrapper)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
  expect(document.activeElement).toBe(sheetButton('完成'))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
  expect(document.activeElement).toBe(sheetButton('重置筛选'))
  wrapper.get('.calendar-today-action').element.focus()
  expect(dialog().contains(document.activeElement)).toBe(true)
})

it('跨1024px桌面断点自动关闭释放modal状态；再次变窄不自动重开，卸载清理锁与监听', async () => {
  const { wrapper } = await render()
  await open(wrapper)
  desktopMedia.matches = true
  const event = new Event('change')
  Object.defineProperty(event, 'matches', { value: true })
  desktopMedia.dispatchEvent(event)
  await flushPromises()
  expect(dialog()).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.documentElement.style.overflow).toBe('')
  expect(wrapper.get('.calendar-filter-trigger').attributes('aria-expanded')).toBe('false')
  desktopMedia.matches = false
  const narrow = new Event('change')
  Object.defineProperty(narrow, 'matches', { value: false })
  desktopMedia.dispatchEvent(narrow)
  await flushPromises()
  expect(dialog()).toBeNull()
  await open(wrapper)
  wrapper.unmount()
  await flushPromises()
  expect(dialog()).toBeNull()
  expect(document.body.style.overflow).toBe('')
  expect(document.documentElement.style.overflow).toBe('')
  expect(desktopMedia.removeEventListener).toHaveBeenCalledTimes(2)
})

it('请求加载/失败仍可筛选与关闭，错误仅出现在主页面', async () => {
  const { wrapper } = await render()
  await open(wrapper)
  let reject
  listActivityCalendar.mockImplementationOnce(() => new Promise((resolve, fail) => { reject = fail }))
  await clickSheet('如鸢')
  expect(wrapper.get('.calendar-view-content').attributes('aria-busy')).toBe('true')
  expect(sheetButton('完成').disabled).toBe(false)
  expect(sheetButton('卡池').disabled).toBe(false)
  reject(new Error('筛选读取失败'))
  await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('筛选读取失败')
  expect(dialog().textContent).not.toContain('筛选读取失败')
  expect(sheetButton('如鸢').getAttribute('aria-pressed')).toBe('true')
  await clickSheet('完成')
  expect(dialog()).toBeNull()
})

const calendarItem = (patch = {}) => ({ id: 'evt', title: '活动', game: '如鸢', category: 'ACTIVITY', start_date: serverToday(), end_date: addCalendarDays(serverToday(), 10), ...patch })

it('不含招募与类型招募最后操作生效，URL/Sheet/摘要同步且本地过滤不重查', async () => {
  listActivityCalendar.mockResolvedValue({ items: Object.keys(CALENDAR_CATEGORIES).map(category => calendarItem({ id: category, title: category, category })) })
  const { wrapper, router } = await render('/calendar?view=agenda&category=RECRUITMENT')
  await open(wrapper)
  const reads = listActivityCalendar.mock.calls.length
  dialog().querySelector('input[type=checkbox]').click(); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda', exclude_recruitment: '1' })
  expect(summaryText(wrapper)).toContain('不含招募')
  expect(wrapper.findAll('.calendar-event h4').map(node => node.text())).toEqual(expect.arrayContaining(['ACTIVITY', 'LOGIN', 'SHOP', 'MAINTENANCE', 'OTHER']))
  expect(wrapper.findAll('.calendar-event h4').map(node => node.text())).not.toContain('RECRUITMENT')
  expect(listActivityCalendar).toHaveBeenCalledTimes(reads + 1) // Clearing category widens the API scope once.
  await clickSheet('卡池')
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda', display_group: 'RECRUITMENT' })
  expect(dialog().querySelector('input[type=checkbox]').checked).toBe(false)
  expect(wrapper.findAll('.calendar-event h4').map(node => node.text())).toEqual(['RECRUITMENT'])
  await clickSheet('全部类型')
  const allReads = listActivityCalendar.mock.calls.length
  dialog().querySelector('input[type=checkbox]').click(); await flushPromises()
  await clickSheet('进行中')
  expect(listActivityCalendar).toHaveBeenCalledTimes(allReads)
  expect(router.currentRoute.value.query).toMatchObject({ exclude_recruitment: '1', status: 'ongoing' })
  await clickSheet('重置筛选')
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda' })
  expect(dialog().querySelector('input[type=checkbox]').checked).toBe(false)
  expect(sheetButton('全部').getAttribute('aria-pressed')).toBe('true')
})

it.each(['agenda', 'timeline', 'month'])('%s共享非招募/游戏/时间状态过滤，统计不冒充时间快捷结果', async view => {
  const date = serverToday(), now = Date.now()
  listActivityCalendar.mockResolvedValue({ items: [
    calendarItem({ id: 'login', title: '保留签到', category: 'LOGIN', start_date: addCalendarDays(date, -1), end_at: new Date(now + 3600000).toISOString() }),
    calendarItem({ id: 'shop', title: '较晚结束', category: 'SHOP' }),
    calendarItem({ id: 'pool', category: 'RECRUITMENT' }),
    calendarItem({ id: 'foreign', game: '代号鸢' }),
  ] })
  const { wrapper, router } = await render(`/calendar?view=${view}&date=${date}&game=如鸢&exclude_recruitment=1&status=ending`)
  const component = wrapper.findComponent({ name: view === 'agenda' ? 'CalendarAgendaView' : view === 'timeline' ? 'CalendarTimelineView' : 'CalendarMonthView' })
  expect(component.props('items').map(item => item.id)).toEqual(['login'])
  expect(summaryText(wrapper)).toBe('如鸢 · 不含招募 · 近 3 天结束')
  expect(wrapper.findAll('.calendar-counts strong').map(node => node.text())).toEqual(['1', '0', '1'])
  expect(wrapper.get('.calendar-summary-scope').text()).toContain('不按时间状态')
  const path = router.currentRoute.value.fullPath
  wrapper.unmount()
  const refreshed = await render(path)
  expect(summaryText(refreshed.wrapper)).toBe('如鸢 · 不含招募 · 近 3 天结束')
})

it('前进后退恢复所有条件，入口外清除只移除筛选保留视图/日期/无关Query', async () => {
  const { wrapper, router } = await render('/calendar?view=month&date=2026-09-15&ref=share')
  await router.push('/calendar?view=month&date=2026-09-15&ref=share&game=如鸢&exclude_recruitment=1&status=ending'); await flushPromises()
  expect(summaryText(wrapper)).toContain('近 3 天结束')
  router.back(); await flushPromises()
  expect(summaryText(wrapper)).toBe('未启用筛选')
  router.forward(); await flushPromises()
  expect(summaryText(wrapper)).toContain('不含招募')
  await wrapper.get('.calendar-filter-clear').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'month', date: '2026-09-15', ref: 'share' })
  expect(wrapper.find('.calendar-filter-clear').exists()).toBe(false)
  expect(dialog()).toBeNull()
  expect(document.activeElement).toBe(wrapper.get('.calendar-filter-trigger').element)
})

it('无效新参数降级；条件空结果可清除，加载错误保留重试且不伪装为空', async () => {
  listActivityCalendar.mockResolvedValue({ items: [calendarItem({ category: 'RECRUITMENT' })] })
  const { wrapper, router } = await render('/calendar?exclude_recruitment=bad&status=toString')
  expect(wrapper.find('.calendar-filter-clear').exists()).toBe(false)
  expect(wrapper.find('.calendar-event').exists()).toBe(true)
  await router.replace('/calendar?exclude_recruitment=1'); await flushPromises()
  expect(wrapper.get('.calendar-filter-empty').text()).toContain('当前条件下无活动')
  expect(wrapper.get('.calendar-filter-empty button').text()).toBe('清除筛选')
  await wrapper.get('.calendar-filter-empty button').trigger('click'); await flushPromises()
  expect(wrapper.find('.calendar-filter-empty').exists()).toBe(false)
  listActivityCalendar.mockRejectedValueOnce(new Error('读取失败'))
  await open(wrapper); await clickSheet('如鸢'); await clickSheet('完成')
  expect(wrapper.find('.calendar-filter-empty').exists()).toBe(false)
  expect(wrapper.get('[role=alert]').text()).toContain('读取失败')
})

it('开始/72小时/结束边界即时更新，无额外公共API请求，卸载释放计时器', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T04:00:00Z'))
  const now = Date.now()
  listActivityCalendar.mockResolvedValue({ items: [
    calendarItem({ id: 'start', start_at: new Date(now + 1000).toISOString(), end_at: new Date(now + 5000).toISOString() }),
    calendarItem({ id: 'near', end_at: new Date(now + 72 * 3600000 + 2000).toISOString() }),
  ] })
  const { wrapper } = await render('/calendar?view=agenda&status=ending')
  const ids = () => wrapper.findComponent({ name: 'CalendarAgendaView' }).props('items').map(item => item.id)
  const reads = listActivityCalendar.mock.calls.length
  expect(ids()).toEqual([])
  await vi.advanceTimersByTimeAsync(1050); await flushPromises()
  expect(ids()).toEqual(['start'])
  await vi.advanceTimersByTimeAsync(1000); await flushPromises()
  expect(ids()).toEqual(['start', 'near'])
  await vi.advanceTimersByTimeAsync(3000); await flushPromises()
  expect(ids()).toEqual(['near'])
  expect(listActivityCalendar).toHaveBeenCalledTimes(reads)
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('慢响应抵达时用当前时间判断状态，不等待下一分钟刷新', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T04:00:00Z'))
  const now = Date.now()
  let resolve
  listActivityCalendar.mockReturnValue(new Promise(done => { resolve = done }))
  const { wrapper } = await render('/calendar?view=agenda&status=ongoing')
  await vi.advanceTimersByTimeAsync(1500)
  resolve({ items: [calendarItem({ id: 'started-while-loading', start_at: new Date(now + 1000).toISOString(), end_at: new Date(now + 5000).toISOString() })] })
  await flushPromises()
  expect(wrapper.findComponent({ name: 'CalendarAgendaView' }).props('items').map(item => item.id)).toEqual(['started-while-loading'])
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
})
