import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import TodaySubscriptionSummary from '../src/components/today/TodaySubscriptionSummary.vue'
import { calendarSubscriptionSummary, getCalendarSubscription, listCalendarSubscriptions, saveCalendarProgress, setCalendarCompletion, setCalendarSubscription } from '../src/api/activityCalendarSubscriptions.js'
import { auth } from '../src/store/auth.js'

vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ calendarSubscriptionSummary: vi.fn(), listCalendarSubscriptions: vi.fn(), getCalendarSubscription: vi.fn(), saveCalendarProgress: vi.fn(), setCalendarCompletion: vi.fn(), setCalendarSubscription: vi.fn() }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, userInfo: { id: 'user' } }) }))

const entry = (id, title, completed = false) => ({ id, title, completed })
const record = (id, patch = {}, itemPatch = {}) => ({
  event_id: id, version: 4, subscribed: true, completed: false, manual_completed: false,
  checklist: [entry('one', '明天开始打')],
  memo_title: '原有备忘', memo_note: '保留备注', legacy_completed: true,
  item: { id, title: id, start_date: '2026-10-01', end_date: '2026-10-05', ...itemPatch }, ...patch
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let wrapper
const render = (props = { accountId: 'a', game: '如鸢' }) => {
  wrapper = mount(TodaySubscriptionSummary, { attachTo: document.body, props, global: { stubs: { RouterLink: RouterLinkStub } } })
  return wrapper
}
function feed(items, { summaryItems = items.slice(0, 3), total = items.filter(value => !value.manual_completed).length, count = items.length, unavailable = [] } = {}) {
  listCalendarSubscriptions.mockResolvedValue({ items: structuredClone(items), unavailable_items: unavailable, subscribed_count: count })
  calendarSubscriptionSummary.mockResolvedValue({ items: structuredClone(summaryItems), total_pending: total, subscribed_count: count })
  saveCalendarProgress.mockImplementation(async (id, body) => ({ ...structuredClone(items.find(value => value.event_id === id)), version: body.expected_version + 1, checklist: structuredClone(body.checklist) }))
}
const checks = () => wrapper.findAll('input[type=checkbox]')
const notify = (userId = 'user', accountId = 'a') => window.dispatchEvent(new CustomEvent('calendar-subscriptions-updated', { detail: { userId, accountId } }))

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T04:00:00Z'))
  auth.isLoggedIn = true; auth.userInfo = { id: 'user' }; feed([])
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.useRealTimers(); delete document.visibilityState })

it('shows real titles and checked states, prioritizes pending, and separates activity counts', async () => {
  feed([record('活动一', { checklist: [entry('done', '领取奖励', true), entry('todo', '明天开始打')] })], { total: 7, count: 8 })
  render(); await flushPromises()
  expect(wrapper.get('h2').text()).toBe('我的待办')
  expect(checks().map(input => input.element.checked)).toEqual([false, true])
  expect(checks()[0].attributes('aria-label')).toBe('完成 明天开始打（活动一）')
  expect(wrapper.get('.todo-scope').text()).toContain('1 项待办未完成')
  expect(wrapper.text()).toContain('7 项活动尚未标记本期完成')
  expect(wrapper.text()).not.toMatch(/Asia\/Shanghai|本期未完成|待办全部完成/)
  expect(listCalendarSubscriptions).toHaveBeenCalledWith({ account_id: 'a', from: '2026-10-05', to: '2027-01-03' }, 'user')
})

it('does not truncate the real checklist to the three-activity summary', async () => {
  const items = [1, 2, 3].map(id => record('无清单' + id, { checklist: [] }))
  items.push(record('第四个活动'))
  feed(items)
  render(); await flushPromises()
  expect(checks()).toHaveLength(1)
  expect(wrapper.get('.todo-list').text()).toContain('明天开始打')
  expect(wrapper.get('.todo-list').text()).toContain('第四个活动')
  expect(wrapper.get('.todo-scope').text()).toContain('1 项待办未完成')
  expect(wrapper.text()).not.toContain('另有 3 项未完成')
})

it('renders reminders in the sidebar with one subscription instance and removes them on unmount', async () => {
  const target = document.createElement('div')
  target.id = 'today-reminders'
  document.body.append(target)
  feed([record('即将截止')])
  render({ accountId: 'a', game: '如鸢', remindersTarget: '#today-reminders' })
  await flushPromises()
  expect(wrapper.get('.todo-list').text()).toContain('即将截止')
  expect(wrapper.find('.todo-reminders').exists()).toBe(false)
  const reminders = new DOMWrapper(target).get('.todo-reminders')
  expect(reminders.classes()).toContain('is-sidebar')
  expect(reminders.get('.reminder-list').text()).toContain('即将截止')
  reminders.element.open = false
  await reminders.trigger('toggle')
  expect(reminders.element.open).toBe(false)
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(1)
  expect(calendarSubscriptionSummary).toHaveBeenCalledTimes(1)
  wrapper.unmount(); wrapper = null
  expect(target.children).toHaveLength(0)
  // Drain the details toggle notification queued by jsdom.
  await vi.advanceTimersByTimeAsync(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('shows at most six tasks initially and allows completed and long tasks to be inspected', async () => {
  feed([record('密集清单', { checklist: Array.from({ length: 9 }, (_, i) => entry('e' + i, ('很长的待办文字' + i).repeat(5), i >= 7)) })])
  render(); await flushPromises()
  expect(checks()).toHaveLength(6)
  const more = wrapper.get('.todo-more')
  expect(more.attributes('aria-expanded')).toBe('false')
  expect(more.text()).toContain('3 项')
  await more.trigger('click')
  expect(checks()).toHaveLength(9)
  expect(checks().filter(input => input.element.checked)).toHaveLength(2)
  expect(wrapper.findAll('.is-complete')).toHaveLength(2)
  await more.trigger('click'); expect(checks()).toHaveLength(6)
})

it('saves the target flag with the exact version and all other entries/order unchanged', async () => {
  const original = record('活动一', { checklist: [entry('z', '  原有文字  ', true), entry('target', '明天开始打'), entry('a', '相同标题')] })
  feed([original]); render(); await flushPromises()
  const updated = vi.fn(); window.addEventListener('calendar-subscriptions-updated', updated)
  await checks()[0].setValue(true); await flushPromises()
  expect(saveCalendarProgress).toHaveBeenCalledExactlyOnceWith('活动一', {
    account_id: 'a', expected_version: 4, completed: false, progress_mode: 'checklist',
    checklist: [entry('z', '  原有文字  ', true), entry('target', '明天开始打', true), entry('a', '相同标题')]
  }, 'user')
  expect(checks()[0].element.checked).toBe(true)
  expect(original.checklist[1].completed).toBe(false)
  expect(setCalendarCompletion).not.toHaveBeenCalled(); expect(setCalendarSubscription).not.toHaveBeenCalled()
  expect(updated).toHaveBeenCalledTimes(1)
  expect(updated.mock.calls[0][0].detail).toEqual({ userId: 'user', accountId: 'a' })
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(1)
  window.removeEventListener('calendar-subscriptions-updated', updated)
})

it('keeps the confirmed state during saving, ignores rapid repeated clicks, and uses the next version', async () => {
  const original = record('活动一', { checklist: [entry('one', '事项一'), entry('two', '事项二')] })
  feed([original]); const write = deferred(); saveCalendarProgress.mockImplementationOnce(() => write.promise)
  render(); await flushPromises()
  checks()[0].element.focus()
  await checks()[0].setValue(true)
  expect(checks()[0].element.checked).toBe(false)
  expect(checks()[0].attributes('aria-disabled')).toBe('true')
  expect(wrapper.text()).toContain('保存中…')
  await checks()[0].setValue(true); await checks()[1].setValue(true)
  expect(saveCalendarProgress).toHaveBeenCalledTimes(1)
  write.resolve({ ...original, version: 5, checklist: [entry('one', '事项一', true), entry('two', '事项二')] }); await flushPromises()
  expect(checks()[0].element.checked).toBe(true)
  expect(document.activeElement === checks()[0].element).toBe(true)
  await checks()[1].setValue(true); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).toMatchObject({ expected_version: 5, checklist: [entry('one', '事项一', true), entry('two', '事项二', true)] })
  expect(wrapper.text()).toContain('当前范围的清单已全部勾选')
  expect(wrapper.text()).not.toContain('活动均已标记本期完成')
})

it('can undo a completed checklist item without changing the period completion flag', async () => {
  feed([record('活动一', { checklist: [entry('one', '明天开始打', true)] })]); render(); await flushPromises()
  expect(checks()[0].attributes('aria-label')).toContain('取消完成')
  await checks()[0].setValue(false); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).toMatchObject({ completed: false, progress_mode: 'checklist', checklist: [entry('one', '明天开始打')] })
  expect(checks()[0].element.checked).toBe(false)
  expect(setCalendarCompletion).not.toHaveBeenCalled()
})

it.each([409, 422, 500, undefined])('blocks stale retries after save failure %s and keeps the intended change visible', async status => {
  feed([record('活动一')]); saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('保存失败'), { status }))
  render(); await flushPromises(); await checks()[0].setValue(true); await flushPromises()
  expect(checks()[0].element.checked).toBe(false)
  expect(checks()[0].attributes('aria-disabled')).toBe('true')
  expect(wrapper.get('[role=alert]').text()).toContain('「明天开始打」完成尚未确认')
  expect(wrapper.get('[role=alert]').text()).toContain('读取最新状态')
  await checks()[0].setValue(true); expect(saveCalendarProgress).toHaveBeenCalledTimes(1)
})

it('reads a conflict version and new remote entries before the user retries, preserving the remote edit', async () => {
  feed([record('活动一')]); saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('版本冲突'), { status: 409 }))
  render(); await flushPromises(); await checks()[0].setValue(true); await flushPromises()
  const latest = record('活动一', { version: 9, checklist: [entry('remote', '另一页面新加的事项', true), entry('one', '改过名字的事项')] })
  getCalendarSubscription.mockResolvedValue(latest)
  wrapper.get('[role=alert] button').element.focus()
  await wrapper.get('[role=alert] button').trigger('click'); await flushPromises()
  expect(getCalendarSubscription).toHaveBeenCalledExactlyOnceWith('活动一', 'a', 'user')
  expect(wrapper.text()).toContain('另一页面新加的事项')
  expect(wrapper.text()).toContain('改过名字的事项')
  expect(wrapper.find('[role=alert]').exists()).toBe(false)
  expect(document.activeElement.dataset.todoKey).toBe(JSON.stringify(['活动一', 'one']))
  await checks()[0].setValue(true); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).toMatchObject({ expected_version: 9, checklist: [entry('remote', '另一页面新加的事项', true), entry('one', '改过名字的事项', true)] })
})

it('reconciles a save with unknown outcome by reading the already saved value, without replaying it', async () => {
  feed([record('活动一')]); saveCalendarProgress.mockRejectedValueOnce(new Error('连接中断'))
  render(); await flushPromises(); await checks()[0].setValue(true); await flushPromises()
  getCalendarSubscription.mockResolvedValue(record('活动一', { version: 5, checklist: [entry('one', '明天开始打', true)] }))
  await wrapper.get('[role=alert] button').trigger('click'); await flushPromises()
  expect(checks()[0].element.checked).toBe(true)
  expect(saveCalendarProgress).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('已读取最新状态')
})

it.each(['network', 'old version'])('keeps the attempted task and lock when recovery fails: %s', async failure => {
  feed([record('活动一')]); saveCalendarProgress.mockRejectedValueOnce(new Error('冲突'))
  render(); await flushPromises(); await checks()[0].setValue(true); await flushPromises()
  if (failure === 'network') getCalendarSubscription.mockRejectedValueOnce(new Error('离线'))
  else getCalendarSubscription.mockResolvedValueOnce(record('活动一', { version: 3 }))
  await wrapper.get('[role=alert] button').trigger('click'); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('明天开始打')
  expect(wrapper.get('[role=alert]').text()).toContain('读取失败')
  expect(checks()[0].attributes('aria-disabled')).toBe('true')
})

it.each(['version', 'event', 'checklist', 'period', 'unsubscribed'])('rejects an unconfirmed save response: %s', async mismatch => {
  const original = record('活动一'); feed([original])
  const response = { ...original, version: 5, checklist: [entry('one', '明天开始打', true)] }
  if (mismatch === 'version') response.version = 4
  if (mismatch === 'event') response.event_id = 'another'
  if (mismatch === 'checklist') response.checklist.push(entry('unexpected', '不应覆盖'))
  if (mismatch === 'period') { response.manual_completed = true; response.completed = true }
  if (mismatch === 'unsubscribed') response.subscribed = false
  saveCalendarProgress.mockResolvedValueOnce(response)
  render(); await flushPromises(); await checks()[0].setValue(true); await flushPromises()
  expect(checks()[0].element.checked).toBe(false)
  expect(wrapper.get('[role=alert]').text()).toContain('保存结果需要确认')
})

it('allows different activities to save independently without mixing their versions or flags', async () => {
  const a = record('活动A'), b = record('活动B', { version: 12 }); feed([a, b])
  const write = deferred(); saveCalendarProgress.mockImplementationOnce(() => write.promise)
  render(); await flushPromises(); await checks()[0].setValue(true); await checks()[1].setValue(true); await flushPromises()
  expect(saveCalendarProgress.mock.calls.map(call => [call[0], call[1].expected_version])).toEqual([['活动A', 4], ['活动B', 12]])
  expect(checks().map(input => input.element.checked)).toEqual([false, true])
  write.resolve({ ...a, version: 5, checklist: [entry('one', '明天开始打', true)] }); await flushPromises()
  expect(checks().every(input => input.element.checked)).toBe(true)
})

it('defers cross-page refresh while saving and applies fresh content once the write finishes', async () => {
  const original = record('活动一'); feed([original]); const write = deferred(); saveCalendarProgress.mockReturnValueOnce(write.promise)
  render(); await flushPromises(); await checks()[0].setValue(true)
  const latest = { ...original, version: 5, checklist: [entry('one', '明天开始打', true), entry('remote', '最新事项')] }
  listCalendarSubscriptions.mockResolvedValue({ items: [latest], unavailable_items: [] })
  notify(); await flushPromises(); expect(listCalendarSubscriptions).toHaveBeenCalledTimes(1)
  write.resolve({ ...original, version: 5, checklist: [entry('one', '明天开始打', true)] }); await flushPromises()
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain('最新事项')
})

it('ignores updates for other users/accounts and refreshes only the matching scope', async () => {
  feed([record('活动一')]); render(); await flushPromises()
  notify('other', 'a'); notify('user', 'b'); await flushPromises()
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(1)
  feed([record('新活动')]); notify(); await flushPromises()
  expect(wrapper.get('.todo-list').text()).toContain('新活动')
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(2)
})

it.each(['account', 'identity', 'game', 'logout', 'unmount'])('ignores late read responses after %s change', async change => {
  const old = deferred(); listCalendarSubscriptions.mockReturnValueOnce(old.promise)
  render(); await flushPromises()
  if (change === 'account') await wrapper.setProps({ accountId: 'b' })
  if (change === 'identity') auth.userInfo = { id: 'new-user' }
  if (change === 'game') await wrapper.setProps({ game: '代号鸢' })
  if (change === 'logout') auth.isLoggedIn = false
  if (change === 'unmount') wrapper.unmount()
  await flushPromises(); old.resolve({ items: [record('旧账号秘密')], unavailable_items: [] }); await flushPromises()
  if (change !== 'unmount') expect(wrapper.text()).not.toContain('旧账号秘密')
  if (change === 'logout') expect(wrapper.text()).toContain('登录并选择游戏账号')
  if (change === 'unmount') expect(vi.getTimerCount()).toBe(0)
})

it.each(['account', 'identity', 'logout', 'unmount'])('does not apply or notify a late save after %s change', async change => {
  const original = record('旧活动'); feed([original]); const write = deferred(); saveCalendarProgress.mockReturnValueOnce(write.promise)
  render(); await flushPromises(); await checks()[0].setValue(true)
  const updated = vi.fn(); window.addEventListener('calendar-subscriptions-updated', updated)
  feed([record('新活动')])
  if (change === 'account') await wrapper.setProps({ accountId: 'b' })
  if (change === 'identity') auth.userInfo = { id: 'new-user' }
  if (change === 'logout') auth.isLoggedIn = false
  if (change === 'unmount') wrapper.unmount()
  await flushPromises(); write.resolve({ ...original, version: 5, checklist: [entry('one', '明天开始打', true)] }); await flushPromises()
  expect(updated).not.toHaveBeenCalled()
  if (change !== 'unmount') expect(wrapper.text()).not.toContain('已保存')
  if (change === 'account' || change === 'identity') {
    expect(wrapper.get('.todo-list').text()).toContain('新活动')
    expect(checks()[0].element.checked).toBe(false)
    await checks()[0].setValue(true); await flushPromises()
    expect(saveCalendarProgress.mock.lastCall[1].account_id).toBe(change === 'account' ? 'b' : 'a')
    expect(saveCalendarProgress.mock.lastCall[2]).toBe(change === 'identity' ? 'new-user' : 'user')
  }
  window.removeEventListener('calendar-subscriptions-updated', updated)
})

it('ignores a late conflict recovery after changing account', async () => {
  feed([record('旧活动')]); saveCalendarProgress.mockRejectedValueOnce(new Error('冲突'))
  render(); await flushPromises(); await checks()[0].setValue(true); await flushPromises()
  const read = deferred(); getCalendarSubscription.mockReturnValueOnce(read.promise)
  await wrapper.get('[role=alert] button').trigger('click')
  feed([record('新活动')]); await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  read.resolve(record('旧活动', { version: 7, checklist: [entry('one', '旧读取秘密')] })); await flushPromises()
  expect(wrapper.text()).not.toContain('旧读取秘密')
  expect(wrapper.get('.todo-list').text()).toContain('新活动')
  expect(wrapper.find('[role=alert]').exists()).toBe(false)
})

it.each(['save', 'recovery'])('ignores the previous A session after A to B to A during %s', async operation => {
  const original = record('活动一'); feed([original]); const old = deferred()
  if (operation === 'save') saveCalendarProgress.mockReturnValueOnce(old.promise)
  else saveCalendarProgress.mockRejectedValueOnce(new Error('版本冲突'))
  render(); await flushPromises(); await checks()[0].setValue(true); await flushPromises()
  if (operation === 'recovery') {
    getCalendarSubscription.mockReturnValueOnce(old.promise)
    await wrapper.get('[role=alert] button').trigger('click')
  }
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  feed([record('活动一', { version: 9, checklist: [entry('one', '回到A后的最新事项')] })])
  await wrapper.setProps({ accountId: 'a' }); await flushPromises()
  old.resolve({ ...original, version: 5, checklist: [entry('one', '明天开始打', true)] }); await flushPromises()
  expect(wrapper.get('.todo-list').text()).toContain('回到A后的最新事项')
  expect(checks()[0].element.checked).toBe(false)
  expect(wrapper.text()).not.toContain('已保存「明天开始打」')
})

it('makes no private request without login/account and distinguishes subscription empty states', async () => {
  auth.isLoggedIn = false; render(); await flushPromises()
  expect(listCalendarSubscriptions).not.toHaveBeenCalled(); expect(calendarSubscriptionSummary).not.toHaveBeenCalled()
  await wrapper.setProps({ accountId: '' }); auth.isLoggedIn = true; await flushPromises()
  expect(wrapper.text()).toContain('选择游戏账号后')
  expect(listCalendarSubscriptions).not.toHaveBeenCalled()
  await wrapper.setProps({ accountId: 'a' }); await flushPromises()
  expect(wrapper.text()).toContain('还没有订阅活动')
  feed([record('空清单活动', { checklist: [] })]); notify(); await flushPromises()
  expect(wrapper.text()).toContain('当前范围暂无待办')
  expect(wrapper.get('.todo-add').text()).toBe('去添加待办')
  expect(checks()).toHaveLength(0)
  feed([record('本期已完成', { manual_completed: true, completed: true })], { total: 0 }); notify(); await flushPromises()
  expect(wrapper.text()).toContain('活动均已标记本期完成')
  expect(checks()).toHaveLength(0)
})

it('keeps historical/unavailable totals traceable instead of pretending their tasks were completed', async () => {
  feed([], { count: 4, total: 3, unavailable: [record('不可用', { item: null })] })
  render(); await flushPromises()
  expect(wrapper.text()).toContain('当前范围暂无待办')
  expect(wrapper.text()).toContain('3 项活动尚未标记本期完成')
  expect(wrapper.text()).toContain('1 项订阅活动不可用')
  const all = wrapper.findAllComponents(RouterLinkStub).find(link => link.text().includes('查看全部'))
  expect(all.props('to').query).toMatchObject({ scope: 'mine', task: 'all', game: '如鸢' })
})

it('does not turn a failed load into an empty state and preserves existing rows but locks writes on refresh failure', async () => {
  listCalendarSubscriptions.mockRejectedValueOnce(new Error('读取离线'))
  render(); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('读取离线')
  expect(wrapper.text()).not.toContain('还没有订阅活动')
  feed([record('活动一')]); await wrapper.get('[role=alert] button').trigger('click'); await flushPromises()
  listCalendarSubscriptions.mockRejectedValueOnce(new Error('刷新失败')); notify(); await flushPromises()
  expect(wrapper.get('.todo-list').text()).toContain('明天开始打')
  expect(wrapper.get('[role=alert]').text()).toContain('刷新失败')
  await checks()[0].setValue(true); expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('rejects incomplete list records rather than allowing an unversioned write', async () => {
  feed([record('坏记录', { version: undefined })]); render(); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('读取结果不完整')
  expect(checks()).toHaveLength(0)
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('separates near deadlines from future/long/expired/unavailable activities and allows collapsing', async () => {
  const near = record('72小时内', {}, { end_at: '2026-10-08T04:00:00Z', end_date: '2026-10-08' })
  const future = record('远期活动', {}, { end_date: '2026-11-01' })
  const long = record('长期活动', {}, { end_date: null })
  const expired = record('已过期', {}, { end_at: '2026-10-05T04:00:00Z' })
  const unavailable = record('已停用', { item: null })
  const outside = record('超过72小时', {}, { end_at: '2026-10-08T04:00:00.001Z', end_date: '2026-10-08' })
  feed([near, future, long, expired, outside], { summaryItems: [future, long, expired, unavailable, outside, near] })
  render(); await flushPromises()
  expect(wrapper.get('.reminder-list').text()).toContain('72小时内')
  expect(wrapper.get('.reminder-list').text()).not.toMatch(/远期活动|长期活动|已过期|已停用|超过72小时/)
  expect(wrapper.get('.todo-list').text()).toContain('远期活动')
  expect(wrapper.get('.todo-list').text()).toContain('长期活动')
  expect(wrapper.get('.todo-list').text()).not.toContain('已过期')
  const details = wrapper.get('details')
  details.element.open = false; await details.trigger('toggle')
  expect(details.element.open).toBe(false)
  details.element.open = true; await details.trigger('toggle')
  expect(details.element.open).toBe(true)
})

it('uses Shanghai day-end for date-only deadlines and converts exact timestamps without a raw time-zone name', async () => {
  const dateOnly = record('日期截止', {}, { end_date: '2026-10-07' })
  const laterDate = record('日期远期', {}, { end_date: '2026-10-08' })
  const exact = record('跨时区', {}, { end_date: '2026-10-05', end_at: '2026-10-05T23:30:00-07:00', time_zone: 'America/Los_Angeles' })
  feed([dateOnly, laterDate, exact], { summaryItems: [dateOnly, laterDate, exact] }); render(); await flushPromises()
  expect(wrapper.get('.reminder-list').text()).not.toContain('日期远期')
  expect(wrapper.get('.reminder-list').text()).toContain('10月6日 14:30截止')
  expect(wrapper.get('.todo-reminders').text()).toContain('北京时间')
  expect(wrapper.get('time').attributes('title')).toContain('仅提供日期')
  expect(wrapper.text()).not.toMatch(/Asia\/Shanghai|America\/Los_Angeles/)
})

it.each(['cutoff', 'midnight'])('refreshes once at the exact %s boundary and releases timers on unmount', async boundary => {
  if (boundary === 'midnight') vi.setSystemTime(new Date('2026-10-05T15:59:59Z'))
  feed([record('即将截止', {}, boundary === 'cutoff' ? { end_at: '2026-10-05T04:00:01Z' } : {})])
  render(); await flushPromises(); await vi.advanceTimersByTimeAsync(1150); await flushPromises()
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(2)
  expect(calendarSubscriptionSummary).toHaveBeenCalledTimes(2)
  expect(checks()).toHaveLength(0)
  if (boundary === 'midnight') expect(listCalendarSubscriptions.mock.lastCall[0].from).toBe('2026-10-06')
  wrapper.unmount(); expect(vi.getTimerCount()).toBe(0)
})

it('refreshes on visibility/pageshow, preserves a focused checkbox during reordering, and keeps links separately accessible', async () => {
  const original = record('未来活动', {}, { start_date: '2026-10-06', end_date: '2026-10-09' })
  feed([original]); render(); await flushPromises()
  const link = wrapper.findAllComponents(RouterLinkStub).find(value => value.attributes('aria-label') === '查看活动 未来活动')
  expect(Object.keys(link.props('to').query).sort()).toEqual(['date', 'event', 'game', 'scope', 'task', 'view'])
  expect(link.props('to')).toEqual({ path: '/calendar', query: { scope: 'mine', task: 'todo', game: '如鸢', view: 'month', event: '未来活动', date: '2026-10-06' } })
  const input = checks()[0].element; input.focus()
  expect(input.tabIndex).toBe(0)
  expect(input.disabled).toBe(false)
  // jsdom does not perform Space's browser default; only the native change event saves.
  await checks()[0].trigger('keydown', { key: ' ' })
  expect(saveCalendarProgress).not.toHaveBeenCalled()
  feed([record('新活动', { checklist: Array.from({ length: 6 }, (_, i) => entry('new' + i, '新事项' + i)) }), { ...original, checklist: [entry('one', '明天开始打', true)] }])
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(2)
  expect(checks()).toHaveLength(7)
  expect(document.activeElement.dataset.todoKey).toBe(JSON.stringify(['未来活动', 'one']))
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(2)
})
