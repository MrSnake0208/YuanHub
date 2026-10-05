import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import TodaySubscriptionSummary from '../src/components/today/TodaySubscriptionSummary.vue'
import { calendarSubscriptionSummary } from '../src/api/activityCalendarSubscriptions.js'
import { auth } from '../src/store/auth.js'
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ calendarSubscriptionSummary: vi.fn() }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, isAdmin: true, userInfo: { id: 'user' } }) }))
const record = (id, patch = {}) => ({ event_id: id, completed: false, checklist: [], item: { id, title: id, start_date: '2026-10-01', end_date: '2026-10-05', ...patch } })
let wrapper
const render = props => { wrapper = mount(TodaySubscriptionSummary, { props, global: { stubs: { RouterLink: RouterLinkStub } } }); return wrapper }
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T04:00:00Z')); auth.isLoggedIn = true; auth.isAdmin = true; auth.userInfo = { id: 'user' }; calendarSubscriptionSummary.mockResolvedValue({ items: [], total_pending: 0, subscribed_count: 0 }) })
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })
it('no account makes no private request and subscribed empty state differs from no subscriptions', async () => {
  render({ accountId: '' }); await flushPromises(); expect(calendarSubscriptionSummary).not.toHaveBeenCalled()
  calendarSubscriptionSummary.mockResolvedValue({ items: [], total_pending: 0, subscribed_count: 4 })
  await wrapper.setProps({ accountId: 'a' }); await flushPromises()
  expect(wrapper.text()).toContain('近期没有尚未完成')
})
it('summary shows exact date plus remaining time with activity count and mine links', async () => {
  calendarSubscriptionSummary.mockResolvedValue({ items: [record('活动一'), record('活动二'), record('活动三')], total_pending: 5, subscribed_count: 8 })
  render({ accountId: 'a', game: '如鸢' }); await flushPromises()
  expect(wrapper.findAll('li')).toHaveLength(3)
  expect(wrapper.text()).toContain('另有 2 项即将截止')
  expect(wrapper.text()).toContain('2026-10-05')
  expect(wrapper.findAllComponents(RouterLinkStub).every(link => link.props('to').query.scope === 'mine')).toBe(true)
  expect(wrapper.findAllComponents(RouterLinkStub).every(link => link.props('to').query.game === '如鸢')).toBe(true)
})
it('same-game A to B ignores late A summary and failure is not an empty-state success', async () => {
  let resolveA; calendarSubscriptionSummary.mockImplementation(id => id === 'a' ? new Promise(resolve => { resolveA = resolve }) : Promise.resolve({ items: [record('B')], subscribed_count: 1, total_pending: 1 }))
  render({ accountId: 'a', game: '如鸢' }); await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  resolveA({ items: [record('A')], subscribed_count: 1, total_pending: 1 }); await flushPromises()
  expect(wrapper.text()).toContain('B'); expect(wrapper.text()).not.toContain('A')
  calendarSubscriptionSummary.mockRejectedValue(new Error('网络失败'))
  await wrapper.setProps({ accountId: 'c' }); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('网络失败')
})
it('known exact cutoff refreshes once and unmount releases timers', async () => {
  calendarSubscriptionSummary.mockResolvedValueOnce({ items: [record('即将截止', { end_at: '2026-10-05T04:00:01Z' })], subscribed_count: 1, total_pending: 1 }).mockResolvedValue({ items: [], subscribed_count: 1, total_pending: 0 })
  render({ accountId: 'a' }); await flushPromises()
  await vi.advanceTimersByTimeAsync(1100); await flushPromises()
  expect(calendarSubscriptionSummary).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).not.toContain('本期未完成')
  wrapper.unmount(); expect(vi.getTimerCount()).toBe(0)
})
