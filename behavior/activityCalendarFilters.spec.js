import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import CalendarFilterControls from '../src/components/calendar/CalendarFilterControls.vue'
import { CALENDAR_CATEGORIES, CALENDAR_GAMES } from '../src/data/activityCalendar.js'
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
  vi.stubGlobal('matchMedia', vi.fn(() => desktopMedia))
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
const dialog = () => document.querySelector('#calendar-filter-sheet')
function sheetButton(text) { return Array.from(dialog().querySelectorAll('button')).find(button => button.textContent === text) }
async function clickSheet(text) { sheetButton(text).click(); await flushPromises() }
async function open(wrapper) { await wrapper.get('.calendar-filter-mobile-trigger').trigger('click'); await flushPromises() }

it('Controls完整展示选项，只发出单维度patch且不修改输入', async () => {
  const filters = { game: '如鸢', category: 'RECRUITMENT' }
  const wrapper = mount(CalendarFilterControls, { props: { filters, games: CALENDAR_GAMES, categories: CALENDAR_CATEGORIES } })
  expect(wrapper.findAll('fieldset')).toHaveLength(2)
  expect(wrapper.findAll('button').map(button => button.text())).toEqual(['全部游戏', ...CALENDAR_GAMES, '全部类型', ...Object.values(CALENDAR_CATEGORIES)])
  await wrapper.findAll('button').find(button => button.text() === '代号鸢').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '活动').trigger('click')
  expect(wrapper.emitted('change')).toEqual([[{ game: '代号鸢' }], [{ category: 'ACTIVITY' }]])
  expect(filters).toEqual({ game: '如鸢', category: 'RECRUITMENT' })
})

it.each([
  ['', '全部游戏 · 全部类型', 0],
  ['?game=如鸢', '如鸢 · 全部类型', 1],
  ['?category=RECRUITMENT', '全部游戏 · 招募', 1],
  ['?game=如鸢&category=RECRUITMENT', '如鸢 · 招募', 2],
  ['?game=未知&category=UNKNOWN', '全部游戏 · 全部类型', 0],
])('URL %s驱动摘要、可访问名称与0/1/2计数，默认不打开弹层', async (query, summary, count) => {
  const { wrapper } = await render(`/calendar${query}`)
  const trigger = wrapper.get('.calendar-filter-mobile-trigger')
  expect(wrapper.get('.calendar-filter-summary').text()).toBe(summary)
  expect(trigger.attributes('aria-label')).toBe(`筛选活动，当前：${summary}，已启用 ${count} 个筛选条件`)
  expect(trigger.attributes('aria-haspopup')).toBe('dialog')
  expect(trigger.attributes('aria-controls')).toBe('calendar-filter-sheet')
  expect(trigger.attributes('aria-expanded')).toBe('false')
  expect(wrapper.find('.calendar-filter-count').exists()).toBe(count > 0)
  if (count) expect(wrapper.get('.calendar-filter-count').text()).toBe(String(count))
  expect(dialog()).toBeNull()
})

it('Sheet即时应用并保持打开，桌面/手机选中态一致，重置保留view/date/其它query', async () => {
  const { wrapper, router } = await render('/calendar?view=month&date=2026-09-15&ref=share')
  await open(wrapper)
  await clickSheet('如鸢')
  await clickSheet('招募')
  expect(router.currentRoute.value.query).toEqual({ view: 'month', date: '2026-09-15', ref: 'share', game: '如鸢', category: 'RECRUITMENT' })
  expect(listActivityCalendar.mock.lastCall[0]).toMatchObject({ game: '如鸢', category: 'RECRUITMENT' })
  expect(wrapper.get('.calendar-filter-summary').text()).toBe('如鸢 · 招募')
  expect(wrapper.get('.calendar-filter-count').text()).toBe('2')
  expect(dialog()).not.toBeNull()
  expect(sheetButton('如鸢').getAttribute('aria-pressed')).toBe('true')
  expect(wrapper.findAll('.calendar-filter-inline button').find(button => button.text() === '招募').attributes('aria-pressed')).toBe('true')
  await clickSheet('重置筛选')
  expect(router.currentRoute.value.query).toEqual({ view: 'month', date: '2026-09-15', ref: 'share' })
  expect(wrapper.get('.calendar-filter-summary').text()).toBe('全部游戏 · 全部类型')
  expect(wrapper.find('.calendar-filter-count').exists()).toBe(false)
  expect(sheetButton('全部游戏').getAttribute('aria-pressed')).toBe('true')
  expect(sheetButton('全部类型').getAttribute('aria-pressed')).toBe('true')
  expect(dialog()).not.toBeNull()
})

it.each(['完成', '遮罩', 'Escape'])('%s关闭后恢复入口焦点、滚动样式并清理断点监听', async method => {
  document.body.style.overflow = 'scroll'
  document.documentElement.style.overflow = 'auto'
  document.body.style.paddingRight = '7px'
  const { wrapper } = await render()
  await open(wrapper)
  expect(wrapper.get('.calendar-filter-mobile-trigger').attributes('aria-expanded')).toBe('true')
  expect(dialog().getAttribute('aria-modal')).toBe('true')
  expect(document.activeElement.id).toBe('calendar-filter-sheet-title')
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.documentElement.style.overflow).toBe('hidden')
  if (method === '完成') await clickSheet('完成')
  else if (method === '遮罩') document.querySelector('.calendar-filter-mask').click()
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(dialog()).toBeNull()
  expect(wrapper.get('.calendar-filter-mobile-trigger').attributes('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(wrapper.get('.calendar-filter-mobile-trigger').element)
  expect(document.body.style.overflow).toBe('scroll')
  expect(document.documentElement.style.overflow).toBe('auto')
  expect(document.body.style.paddingRight).toBe('7px')
  expect(desktopMedia.removeEventListener).toHaveBeenCalledWith('change', desktopMedia.addEventListener.mock.calls[0][1])
})

it('复用焦点陷阱：Shift+Tab至末尾、Tab回到首个操作，背景焦点不能逃出', async () => {
  const { wrapper } = await render()
  await open(wrapper)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
  expect(document.activeElement).toBe(sheetButton('重置筛选'))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
  expect(document.activeElement).toBe(sheetButton('完成'))
  wrapper.get('.calendar-today-action').element.focus()
  expect(dialog().contains(document.activeElement)).toBe(true)
})

it('跨桌面断点自动关闭释放modal状态；再次变窄不自动重开，卸载清理锁与监听', async () => {
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
  expect(wrapper.get('.calendar-filter-mobile-trigger').attributes('aria-expanded')).toBe('false')
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
  expect(sheetButton('招募').disabled).toBe(false)
  reject(new Error('筛选读取失败'))
  await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('筛选读取失败')
  expect(dialog().textContent).not.toContain('筛选读取失败')
  expect(sheetButton('如鸢').getAttribute('aria-pressed')).toBe('true')
  await clickSheet('完成')
  expect(dialog()).toBeNull()
})
