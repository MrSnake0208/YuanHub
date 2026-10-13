import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import TodaySubscriptionSummary from '../src/components/today/TodaySubscriptionSummary.vue'
import { calendarSubscriptionSummary } from '../src/api/activityCalendarSubscriptions.js'
import { auth } from '../src/store/auth.js'
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ calendarSubscriptionSummary: vi.fn() }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, isAdmin: false, userInfo: { id: 'user' } }) }))
const record = (id, patch = {}) => ({ event_id: id, completed: false, checklist: [], item: { id, title: id, start_date: '2026-10-01', end_date: '2026-10-05', ...patch } })
let wrapper
const render = props => { wrapper = mount(TodaySubscriptionSummary, { props, global: { stubs: { RouterLink: RouterLinkStub } } }); return wrapper }
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T04:00:00Z')); auth.isLoggedIn = true; auth.isAdmin = false; auth.userInfo = { id: 'user' }; calendarSubscriptionSummary.mockResolvedValue({ items: [], total_pending: 0, subscribed_count: 0 }) })
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })
it('summary updates only for the current identity and account and clears on logout', async () => {
  calendarSubscriptionSummary.mockResolvedValue({ items: [record('长期活动', { end_date: null })], total_pending: 2, subscribed_count: 2 })
  render({ accountId: 'a', game: '如鸢' }); await flushPromises()
  expect(wrapper.text()).toContain('长期活动')
  const link = wrapper.findAllComponents(RouterLinkStub)[0].props('to')
  expect(link.query).toMatchObject({ scope: 'mine', task: 'todo', event: '长期活动', date: '2026-10-05' })
  window.dispatchEvent(new CustomEvent('calendar-subscriptions-updated', { detail: { userId: 'other', accountId: 'a' } }))
  await flushPromises(); expect(calendarSubscriptionSummary).toHaveBeenCalledTimes(1)
  calendarSubscriptionSummary.mockResolvedValue({ items: [], total_pending: 1, subscribed_count: 2 })
  window.dispatchEvent(new CustomEvent('calendar-subscriptions-updated', { detail: { userId: 'user', accountId: 'a' } }))
  await flushPromises(); expect(calendarSubscriptionSummary).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain('1 项活动未完成')
  expect(wrapper.text()).not.toContain('长期活动')
  auth.isLoggedIn = false; await flushPromises()
  expect(wrapper.text()).toContain('登录并选择游戏账号')
  expect(wrapper.text()).not.toContain('1 项活动未完成')
})
it('no account makes no private request and subscribed empty state differs from no subscriptions', async () => {
  render({ accountId: '' }); await flushPromises(); expect(calendarSubscriptionSummary).not.toHaveBeenCalled()
  calendarSubscriptionSummary.mockResolvedValue({ items: [], total_pending: 0, subscribed_count: 4 })
  await wrapper.setProps({ accountId: 'a' }); await flushPromises()
  expect(wrapper.text()).toContain('订阅活动均已完成')
})
it('summary shows exact date plus remaining time with activity count and mine links', async () => {
  calendarSubscriptionSummary.mockResolvedValue({ items: [record('活动一'), record('活动二'), record('活动三')], total_pending: 5, subscribed_count: 8 })
  render({ accountId: 'a', game: '如鸢' }); await flushPromises()
  expect(wrapper.findAll('li')).toHaveLength(3)
  expect(wrapper.text()).toContain('另有 2 项未完成')
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

it('historical manual completion never changes rendered checklist progress', async () => {
  const pending = { ...record('整体未完成'), manual_completed: false, checklist: [{ id: 'old', title: '清单已完成', completed: true }] }
  calendarSubscriptionSummary.mockResolvedValue({ items: [pending], total_pending: 1, subscribed_count: 1 })
  render({ accountId: 'a', game: '如鸢' }); await flushPromises()
  expect(wrapper.get('li').text()).toContain('待办全部完成')
  expect(wrapper.get('li').text()).toContain('本期未完成')
})

it('empty subscriptions and partial checklists keep clear reminder text and activity totals', async () => {
  calendarSubscriptionSummary.mockResolvedValue({ items: [record('尚未建立'), { ...record('部分完成'), completed: false, manual_completed: false, checklist: [{ id: 'one', title: '项一', completed: true }, { id: 'two', title: '项二', completed: false }] }, { ...record('已完成勿提醒'), completed: true, manual_completed: true }], total_pending: 4, subscribed_count: 5 })
  render({ accountId: 'a' }); await flushPromises()
  expect(wrapper.text()).toContain('暂无待办')
  expect(wrapper.text()).toContain('已完成 1/2 项')
  expect(wrapper.text()).toContain('另有 2 项未完成')
  expect(wrapper.text()).not.toContain('已完成勿提醒')
})
