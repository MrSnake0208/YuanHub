import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { isFeatureEnabled } from '../src/config/features.js'
import { serverToday, addCalendarDays } from '../src/data/activityCalendar.js'

vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/config/features.js', async importOriginal => ({ ...(await importOriginal()), isFeatureEnabled: vi.fn(() => true) }))
const today = () => serverToday()
const item = (patch = {}) => ({ id: 'evt-a', title: '今日活动', game: '如鸢', category: 'ACTIVITY', source_type: 'MANUAL', start_date: today(), end_date: today(), ...patch })
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function render(path = '/calendar') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: Calendar }] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Calendar, { global: { plugins: [router], stubs: { IslandSidebar: true, SiteFooter: true } } })
  return { wrapper, router }
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('innerWidth', 390); isFeatureEnabled.mockReturnValue(true); listActivityCalendar.mockResolvedValue({ items: [item()] }) })

it('访客默认读取全部游戏和服务器90天范围；双来源统一展示且历史排除', async () => {
  listActivityCalendar.mockResolvedValue({ items: [item(), item({ id: 'pool', title: '招募项', game: '代号鸢', category: 'RECRUITMENT', source_type: 'RECRUITMENT_POOL' }), item({ id: 'past', title: '已结束项', start_date: '2020-01-01', end_date: '2020-01-02' })] })
  const { wrapper } = await render()
  await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledWith({ game: '', category: '', from: today(), to: addCalendarDays(today(), 90) })
  expect(wrapper.text()).toContain('招募项')
  expect(wrapper.text()).toContain('来自招募卡池')
  expect(wrapper.text()).toContain('今日结束')
  expect(wrapper.text()).toContain('今日开始')
  expect(wrapper.text()).not.toContain('已结束项')
})
it('URL筛选、分享、返回更新请求，不出现循环watch或无关query重查', async () => {
  const { wrapper, router } = await render('/calendar?game=如鸢&category=ACTIVITY&ref=share')
  await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
  const button = wrapper.findAll('button').find(node => node.text() === '代号鸢')
  await button.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ game: '代号鸢', category: 'ACTIVITY', ref: 'share' })
  expect(listActivityCalendar).toHaveBeenCalledTimes(2)
  await router.push('/calendar?game=如鸢&category=ACTIVITY&ref=other'); await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(3)
  await router.replace('/calendar?game=如鸢&category=ACTIVITY&ref=another'); await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(3)
  router.back(); await flushPromises()
  expect(listActivityCalendar.mock.lastCall[0].game).toBe('代号鸢')
})
it.each([false, true])('今日摘要仅统计严格跨越今天的进行中活动（仅同日活动：%s）', async sameDayOnly => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-03T04:00:00Z'))
  const sameDay = item({ id: 'same-day' })
  listActivityCalendar.mockResolvedValue({ items: sameDayOnly ? [sameDay] : [
    sameDay,
    item({ id: 'starts', end_date: addCalendarDays(today(), 1) }),
    item({ id: 'ends', start_date: addCalendarDays(today(), -1) }),
    item({ id: 'ongoing', start_date: addCalendarDays(today(), -1), end_date: addCalendarDays(today(), 1) }),
    item({ id: 'future', start_date: addCalendarDays(today(), 1), end_date: addCalendarDays(today(), 2) }),
    item({ id: 'past', start_date: addCalendarDays(today(), -2), end_date: addCalendarDays(today(), -1) }),
  ] })
  const { wrapper } = await render()
  await flushPromises()
  expect(wrapper.findAll('.calendar-counts p').map(node => node.text())).toEqual(sameDayOnly
    ? ['今日开始 1', '今日结束 1', '进行中 0']
    : ['今日开始 2', '今日结束 2', '进行中 1'])
  wrapper.unmount()
})
it('快速筛选时旧响应不能覆盖新结果；卸载后不再处理返回', async () => {
  const late = deferred()
  listActivityCalendar.mockReturnValueOnce(late.promise).mockResolvedValue({ items: [item({ title: '新筛选结果', game: '代号鸢' })] })
  const { wrapper, router } = await render()
  expect(wrapper.text()).toContain('正在读取')
  await router.replace('/calendar?game=代号鸢'); await flushPromises()
  late.resolve({ items: [item({ title: '旧结果' })] }); await flushPromises()
  expect(wrapper.text()).toContain('新筛选结果')
  expect(wrapper.text()).not.toContain('旧结果')
  wrapper.unmount()
})
it('失败可重试，空状态不伪造日程，flag关闭不初始化API', async () => {
  listActivityCalendar.mockRejectedValueOnce(new Error('网络失败')).mockResolvedValue({ items: [] })
  const { wrapper } = await render(); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('网络失败')
  await wrapper.get('[role=alert] button').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('暂无近期活动')
  wrapper.unmount()
  listActivityCalendar.mockClear(); isFeatureEnabled.mockReturnValue(false)
  const disabled = await render(); await flushPromises()
  expect(listActivityCalendar).not.toHaveBeenCalled()
  expect(disabled.wrapper.find('.calendar-filters').exists()).toBe(false)
})

it('服务器午夜刷新今天和过期活动，卸载清理定时器', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-02T15:59:59Z'))
  listActivityCalendar.mockResolvedValueOnce({ items: [item({ title: '昨日结束', start_date: '2026-10-02', end_date: '2026-10-02' })] }).mockResolvedValue({ items: [item({ title: '新一天', start_date: '2026-10-03', end_date: '2026-10-04' })] })
  const { wrapper } = await render(); await flushPromises()
  expect(wrapper.text()).toContain('昨日结束')
  await vi.advanceTimersByTimeAsync(1100); await flushPromises()
  expect(listActivityCalendar.mock.lastCall[0].from).toBe('2026-10-03')
  expect(wrapper.text()).toContain('新一天')
  expect(wrapper.text()).not.toContain('昨日结束')
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it('后台翌日恢复时重新读日程，同一天恢复不重复请求', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'))
  const { wrapper } = await render(); await flushPromises()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(1)
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(2)
  expect(listActivityCalendar.mock.lastCall[0].from).toBe('2026-10-03')
  wrapper.unmount()
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(2)
  delete document.visibilityState
})
