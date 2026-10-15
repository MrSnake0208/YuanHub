import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import AccountSwitcher from '../src/components/AccountSwitcher.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { listCalendarSubscriptions, getCalendarSubscription, setCalendarSubscription, saveCalendarProgress, setCalendarCompletion } from '../src/api/activityCalendarSubscriptions.js'
import { dialog } from '../src/utils/dialog.js'
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, isAdmin: false, userInfo: { id: 'user' } }) }))
vi.mock('../src/api/calendarPrivateItems.js', () => ({ listCalendarPrivateItems: vi.fn(async () => ({ items: [] })) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ listCalendarSubscriptions: vi.fn(), getCalendarSubscription: vi.fn(), setCalendarSubscription: vi.fn(), saveCalendarProgress: vi.fn(), setCalendarCompletion: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
const event = { id: 'evt', game: '如鸢', title: '地下遗迹', category: 'ACTIVITY', start_date: '2026-10-01', end_date: '2026-10-10' }
let server, wrapper
const button = (text) => wrapper.findAll('button').find(node => node.text() === text)
async function render(query = '') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: Calendar }, { path: '/user/profile', component: { template: '<div />' } }] })
  await router.push('/calendar?view=agenda' + query); await router.isReady()
  wrapper = mount({ template: '<router-view />' }, { attachTo: document.body, global: { plugins: [router], stubs: { IslandSidebar: true, SiteFooter: true } } })
  await flushPromises(); return router
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T04:00:00Z'))
  const media = new EventTarget(); media.matches = false
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  auth.isLoggedIn = true; auth.isAdmin = false; auth.userInfo = { id: 'user' }; activeAccount.set('a')
  server = null
  listAccounts.mockResolvedValue([{ id: 'a', name: '大号', game: '如鸢' }])
  listActivityCalendar.mockResolvedValue({ items: [event] })
  listCalendarSubscriptions.mockImplementation(async () => ({ items: server?.subscribed ? [server] : [], unavailable_items: [], subscribed_count: server?.subscribed ? 1 : 0 }))
  getCalendarSubscription.mockImplementation(async () => { if (!server) throw Object.assign(new Error('missing'), { status: 404, code: 'subscription_not_found' }); return server })
  setCalendarSubscription.mockImplementation(async (id, body) => { server = { ...server, event_id: id, version: (server?.version ?? -1) + 1, completed: server?.completed ?? false, checklist: server?.checklist || [], item: event, subscribed: body.subscribed }; return server })
  saveCalendarProgress.mockImplementation(async (id, body) => { server = { ...server, ...body, completed: server?.manual_completed === true, version: server.version + 1 }; return server })
  setCalendarCompletion.mockImplementation(async (id, body) => { server = { ...server, manual_completed: body.completed, completed: body.completed, version: server.version + 1 }; return server })
  dialog.confirm.mockResolvedValue(true)
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })
async function switchAccount(id) {
  await wrapper.getComponent(AccountSwitcher).get('.context-selector').trigger('click')
  await flushPromises()
  document.querySelector(`[data-account-id="${id}"]`).click()
  await flushPromises()
}
const twoAccounts = game => [{ id: 'a', name: '大号', game: '如鸢' }, { id: 'b', name: '小号', game }]

it.each(['如鸢', '代号鸢'])('mine switches in place to %s and locks filters to the selected account', async game => {
  listAccounts.mockResolvedValue(twoAccounts(game))
  const nextEvent = { ...event, id: 'b-event', game, title: '小号活动' }
  listActivityCalendar.mockResolvedValue({ items: [event, nextEvent] })
  listCalendarSubscriptions.mockImplementation(async ({ account_id }) => ({ items: [{ event_id: account_id === 'a' ? event.id : nextEvent.id, version: 0, subscribed: true, completed: false, checklist: [{ id: 'todo', title: '未完成', completed: false }], item: account_id === 'a' ? event : nextEvent }], subscribed_count: 1 }))
  const router = await render('&scope=mine&pending=1&game=如鸢&date=2026-10-05&ref=keep')
  const path = router.currentRoute.value.fullPath
  await switchAccount('b')
  expect(activeAccount.id).toBe('b')
  expect(router.currentRoute.value.fullPath).toBe(path)
  expect(wrapper.get('.context-selector').text()).toContain('小号')
  expect(wrapper.text()).toContain('小号活动')
  expect(wrapper.text()).not.toContain('地下遗迹')
  expect(listCalendarSubscriptions.mock.lastCall[0]).toMatchObject({ account_id: 'b' })
  expect(listActivityCalendar.mock.lastCall[0]).toMatchObject({ game })
  expect(wrapper.get('[aria-label="个人活动状态"]').element.value).toBe('todo')
  expect(wrapper.get('.calendar-account-scope').text()).toContain(`${game}（账号锁定）`)
  await wrapper.get('.calendar-filter-trigger').trigger('click'); await flushPromises()
  expect(Array.from(document.querySelectorAll('#calendar-filter-sheet legend')).map(node => node.textContent)).toEqual(['类型', '时间状态'])
  document.querySelector('.calendar-filter-sheet-footer .calendar-primary').click(); await flushPromises()
  await button('全部活动').trigger('click'); await flushPromises()
  expect(wrapper.get('.calendar-filter-summary').text()).toBe('如鸢')
  expect(router.currentRoute.value.query).toMatchObject({ view: 'agenda', date: '2026-10-05', game: '如鸢', ref: 'keep' })
})
it('public browsing keeps its game filter while switching the subscription account', async () => {
  listAccounts.mockResolvedValue(twoAccounts('代号鸢'))
  const router = await render('&game=如鸢&category=ACTIVITY&ref=public')
  const path = router.currentRoute.value.fullPath
  await switchAccount('b')
  expect(router.currentRoute.value.fullPath).toBe(path)
  expect(wrapper.get('.calendar-filter-summary').text()).toBe('如鸢 · 活动')
  expect(wrapper.text()).toContain('地下遗迹')
  expect(wrapper.text()).toContain('请切换到如鸢账号后订阅')
  expect(listCalendarSubscriptions.mock.lastCall[0]).toMatchObject({ account_id: 'b', category: 'ACTIVITY' })
  expect(listActivityCalendar.mock.lastCall[0]).toMatchObject({ game: '如鸢', category: 'ACTIVITY' })
  expect(setCalendarSubscription).not.toHaveBeenCalled()
})
it('canceling the shared switcher preserves unsaved progress; confirming discards only after switching', async () => {
  listAccounts.mockResolvedValue(twoAccounts('如鸢'))
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  const router = await render('&scope=mine')
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('未保存关卡')
  dialog.confirm.mockResolvedValue(false)
  await switchAccount('b')
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '还有未保存的日历修改', message: expect.stringContaining('日历内容') }))
  expect(activeAccount.id).toBe('a')
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('未保存关卡')
  expect(document.activeElement).toBe(wrapper.get('.context-selector').element)
  expect(listCalendarSubscriptions.mock.calls.every(([params]) => params.account_id === 'a')).toBe(true)
  dialog.confirm.mockResolvedValue(true)
  await switchAccount('b')
  expect(activeAccount.id).toBe('b')
  expect(wrapper.find('.calendar-check-row input[type=text]').exists()).toBe(false)
  expect(router.currentRoute.value.query.scope).toBe('mine')
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})
it.each(['response', 'error'])('late A subscription %s cannot replace B after switching through the shared entry', async result => {
  listAccounts.mockResolvedValue(twoAccounts('如鸢'))
  let resolve, reject
  const late = new Promise((done, fail) => { resolve = done; reject = fail })
  const nextEvent = { ...event, id: 'b-event', title: '小号活动' }
  listCalendarSubscriptions.mockImplementation(({ account_id }) => account_id === 'a' ? late : Promise.resolve({ items: [{ event_id: nextEvent.id, subscribed: true, version: 0, completed: false, checklist: [], item: nextEvent }], subscribed_count: 1 }))
  await render('&scope=mine')
  await switchAccount('b')
  if (result === 'response') resolve({ items: [{ event_id: event.id, subscribed: true, version: 0, completed: false, checklist: [], item: event }], subscribed_count: 1 })
  else reject(new Error('旧账号读取失败'))
  await flushPromises()
  expect(wrapper.text()).toContain('小号活动')
  expect(wrapper.text()).not.toContain('地下遗迹')
  expect(wrapper.text()).not.toContain('旧账号读取失败')
  expect(wrapper.get('.calendar-view-content').attributes('aria-busy')).toBe('false')
})
it.each(['empty', 'error'])('account %s retains its existing recovery entry without private requests', async state => {
  if (state === 'empty') listAccounts.mockResolvedValue([])
  else listAccounts.mockRejectedValueOnce(new Error('游戏账号读取失败'))
  await render('&scope=mine')
  expect(listCalendarSubscriptions).not.toHaveBeenCalled()
  if (state === 'empty') expect(wrapper.getComponent(AccountSwitcher).props('accounts')).toEqual([])
  else {
    expect(wrapper.text()).toContain('游戏账号读取失败')
    await button('重试').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(AccountSwitcher).props('accountId')).toBe('a')
  }
})
it.each([false, true])('removing the final TODO becomes empty regardless of legacy state %s', async initial => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: initial, manual_completed: initial, checklist: [{ id: 'one', title: '第一关', completed: initial }], item: event }
  await render(); await button('编辑待办').trigger('click')
  await wrapper.get('.calendar-check-target input').setValue(!initial)
  await button('删除').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('暂无待办')
  expect(wrapper.text()).not.toContain('待办全部完成')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).toEqual({ account_id: 'a', expected_version: 0, completed: false, progress_mode: 'checklist', checklist: [] })
  expect(server.completed).toBe(initial)
  expect(server.manual_completed).toBe(initial)
})
it('subscribe complete cancel restore reuse one activity and retain progress', async () => {
  await render(); await button('订阅本期').trigger('click'); await flushPromises()
  expect(setCalendarSubscription.mock.lastCall[1]).toEqual({ account_id: 'a', expected_version: null, subscribed: true })
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('完成的事项')
  await wrapper.get('.calendar-check-target input').setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('待办全部完成')
  await button('取消订阅').trigger('click'); await flushPromises()
  await button('订阅本期').trigger('click'); await flushPromises()
  expect(server.checklist[0]).toMatchObject({ title: '完成的事项', completed: true })
  expect(wrapper.text()).toContain('待办全部完成')
})
it('private checklist add rename and finish saves stable entries with version', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render('&scope=mine')
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('地下遗迹第四关')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1].checklist[0]).toMatchObject({ title: '地下遗迹第四关', completed: false })
  await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('待办全部完成')
  expect(saveCalendarProgress.mock.lastCall[1].expected_version).toBe(1)
})
it.each(['randomUUID', 'getRandomValues', 'fallback', 'no crypto'])('adding TODOs with %s creates editable focused rows and saves unique stable IDs', async capability => {
  const randomUUID = vi.fn(() => '12345678-1234-4234-8234-123456789abc')
  const getRandomValues = vi.fn(bytes => bytes.fill(7))
  vi.stubGlobal('crypto', capability === 'no crypto' ? undefined : {
    randomUUID: capability === 'randomUUID' ? randomUUID : undefined,
    getRandomValues: ['randomUUID', 'getRandomValues'].includes(capability) ? getRandomValues : undefined,
  })
  vi.spyOn(Math, 'random').mockReturnValue(0.25)
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render('&scope=mine')
  await button('编辑待办').trigger('click')
  await button('添加待办').trigger('click'); await flushPromises()
  const first = wrapper.get('.calendar-check-row input[type=text]')
  expect(first.element.value).toBe('')
  expect(document.activeElement).toBe(first.element)
  dialog.confirm.mockResolvedValue(false)
  await button('收起待办').trigger('click'); await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '还有未保存的日历修改' }))
  expect(wrapper.find('.calendar-check-row input[type=text]').exists()).toBe(true)
  await first.setValue('第一项')
  await button('添加待办').trigger('click'); await flushPromises()
  const inputs = wrapper.findAll('.calendar-check-row input[type=text]')
  expect(inputs).toHaveLength(2)
  expect(inputs[1].element.value).toBe('')
  expect(document.activeElement).toBe(inputs[1].element)
  await inputs[1].setValue('第二项')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  const payload = saveCalendarProgress.mock.lastCall[1]
  expect(payload).toMatchObject({ account_id: 'a', expected_version: 0, checklist: [
    { title: '第一项', completed: false }, { title: '第二项', completed: false },
  ] })
  const ids = payload.checklist.map(entry => entry.id)
  expect(new Set(ids).size).toBe(2)
  ids.forEach(id => expect(id).toMatch(/^[A-Za-z0-9_-]{1,80}$/))
  if (capability === 'randomUUID') {
    expect(ids[0]).toBe('12345678-1234-4234-8234-123456789abc')
    expect(randomUUID).toHaveBeenCalledTimes(2)
    expect(getRandomValues).not.toHaveBeenCalled()
  } else if (capability === 'getRandomValues') expect(getRandomValues).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain('待办已保存')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('第一项改名')
  await button('添加待办').trigger('click'); await flushPromises()
  await wrapper.findAll('.calendar-check-row input[type=text]')[2].setValue('第三项')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server.checklist.slice(0, 2).map(entry => entry.id)).toEqual(ids)
  expect(new Set(server.checklist.map(entry => entry.id)).size).toBe(3)
  expect(server.checklist[0].title).toBe('第一项改名')
})

it('adding a TODO focuses the new row without Array.prototype.at', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render()
  await button('编辑待办').trigger('click')
  const at = Object.getOwnPropertyDescriptor(Array.prototype, 'at')
  Object.defineProperty(Array.prototype, 'at', { ...at, value: undefined })
  try {
    await button('添加待办').trigger('click'); await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.calendar-check-row input[type=text]').element)
  } finally { Object.defineProperty(Array.prototype, 'at', at) }
})
it('conflict preserves draft blocks save and requires reading latest before replacement', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render()
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click'); await wrapper.get('.calendar-check-row input[type=text]').setValue('草稿'); await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(true)
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.get('.calendar-checklist fieldset').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.calendar-checklist input[type=checkbox]').element.checked).toBe(true)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.find('.calendar-checklist input[type=checkbox]').exists()).toBe(false)
  expect(dialog.confirm).toHaveBeenCalled()
})
it('mine retains view and date while ignoring foreign game query and filters completed', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: true, manual_completed: true, checklist: [], item: event }
  const router = await render('&scope=mine&pending=1&game=代号鸢&ref=test')
  expect(wrapper.text()).not.toContain('地下遗迹')
  expect(wrapper.getComponent(AccountSwitcher).props('accountId')).toBe('a')
  expect(wrapper.text()).toContain('订阅即本期待办，截止不会自动完成')
  await button('全部活动').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda', game: '代号鸢', ref: 'test' })
})
it('private read failure does not pretend the public activity is unsubscribed', async () => {
  listCalendarSubscriptions.mockRejectedValue(new Error('offline'))
  await render()
  expect(wrapper.text()).toContain('个人订阅状态读取失败')
  expect(button('订阅本期').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('地下遗迹')
})

it('canceling view change preserves unsaved editor when view comes from preference', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  localStorage.setItem('yuanhub.activity-calendar.view.v1', 'agenda')
  const router = await render()
  await router.replace('/calendar'); await flushPromises()
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('尚未保存')
  dialog.confirm.mockResolvedValue(false)
  await button('月历').trigger('click'); await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '还有未保存的日历修改' }))
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('尚未保存')
  expect(router.currentRoute.value.query.view).toBeUndefined()
})
it('reading conflict result in pending-only scope does not discard draft before confirmation', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [{ id: 'old', title: '旧待办', completed: false }], item: event }
  await render('&scope=mine&pending=1')
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.findAll('.calendar-check-row input[type=text]')[1].setValue('保留草稿')
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  server = { ...server, completed: true, manual_completed: true, checklist: [{ id: 'old', title: '服务器待办', completed: true }], version: 1 }
  dialog.confirm.mockResolvedValue(false)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.calendar-check-row input[type=text]')[1].element.value).toBe('保留草稿')
  dialog.confirm.mockResolvedValue(true)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.find('.calendar-check-row input[type=text]').exists()).toBe(false)
})
it('midnight defers date and list replacement until dirty progress is saved', async () => {
  vi.setSystemTime(new Date('2026-10-05T15:59:59Z'))
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render()
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('跨日草稿')
  const reads = listActivityCalendar.mock.calls.length
  await vi.advanceTimersByTimeAsync(1200); await flushPromises()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('跨日草稿')
  expect(listActivityCalendar).toHaveBeenCalledTimes(reads)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(listActivityCalendar.mock.lastCall[0].from).toBe('2026-10-06')
})
it('new checklist item may be deliberately completed before first save', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render()
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('已打关卡')
  await wrapper.get('.calendar-check-target input[type=checkbox]').setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1].checklist[0].completed).toBe(true)
  expect(server.completed).toBe(false)
  expect(wrapper.get('.calendar-todo-summary').text()).toContain('待办全部完成')
})

it.each(['日程', '时间轴', '月历'])('%s supports subscribe todo complete public history and undo independently of checklist', async view => {
  const router = await render()
  await button('订阅本期').trigger('click'); await flushPromises()
  expect(server.completed).toBe(false)
  server = { ...server, checklist: [{ id: 'stable', title: '未完成子项', completed: false }], memo_note: '保留历史备注' }
  await button('我的日历').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="个人活动状态"]').element.value).toBe('todo')
  if (view !== '日程') { await button(view).trigger('click'); await flushPromises() }
  if (view === '时间轴') { await wrapper.get('.calendar-timeline-bar').trigger('click'); await flushPromises() }
  await button('标记本期完成').trigger('click'); await flushPromises()
  expect(setCalendarCompletion.mock.lastCall[1]).toEqual({ account_id: 'a', expected_version: 0, completed: true })
  expect(wrapper.find('.calendar-subscription').exists()).toBe(false)
  expect(wrapper.get('.calendar-subscription-toolbar [role="status"]').text()).toContain('本期已完成')
  expect(document.activeElement).toBe(wrapper.get('[aria-label="个人活动状态"]').element)
  expect(saveCalendarProgress).not.toHaveBeenCalled()
  await wrapper.get('[aria-label="个人活动状态"]').setValue('completed'); await flushPromises()
  if (view === '时间轴') { await wrapper.get('.calendar-timeline-bar').trigger('click'); await flushPromises() }
  expect(wrapper.text()).toContain('本期已完成')
  expect(server.memo_note).toBe('保留历史备注')
  expect(server.checklist[0].completed).toBe(false)
  await button('全部活动').trigger('click'); await flushPromises()
  if (view === '时间轴') { await wrapper.get('.calendar-timeline-bar').trigger('click'); await flushPromises() }
  expect(wrapper.text()).toContain('地下遗迹')
  expect(wrapper.text()).toContain('本期已完成')
  await button('撤销完成').trigger('click'); await flushPromises()
  expect(server.manual_completed).toBe(false)
  expect(server.checklist[0].id).toBe('stable')
  expect(router.currentRoute.value.query.view).toBe(view === '日程' ? 'agenda' : view === '时间轴' ? 'timeline' : 'month')
})

it('completion never writes over an unsaved checklist and conflict requires explicit refresh', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render('&scope=mine')
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('保留草稿')
  expect(button('标记本期完成').element.disabled).toBe(true)
  await button('标记本期完成').trigger('click'); await flushPromises()
  expect(setCalendarCompletion).not.toHaveBeenCalled()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('保留草稿')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  setCalendarCompletion.mockRejectedValueOnce(Object.assign(new Error('version conflict'), { status: 409 }))
  await button('标记本期完成').trigger('click'); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('读取最新状态')
  expect(button('标记本期完成').element.disabled).toBe(true)
  expect(server.completed).toBe(false)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('保留草稿')
})

it('a late completion response for A never applies to account B', async () => {
  listAccounts.mockResolvedValue(twoAccounts('如鸢'))
  const rows = Object.fromEntries(['a', 'b'].map(id => [id, { event_id: 'evt', version: 0, subscribed: true, completed: false, manual_completed: false, checklist: [], item: event }]))
  listCalendarSubscriptions.mockImplementation(async ({ account_id }) => ({ items: [rows[account_id]], subscribed_count: 1 }))
  let resolveA
  setCalendarCompletion.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve }))
  await render('&scope=mine')
  await button('标记本期完成').trigger('click'); await flushPromises()
  await switchAccount('b')
  resolveA({ ...rows.a, version: 1, manual_completed: true, completed: true }); await flushPromises()
  expect(activeAccount.id).toBe('b')
  expect(wrapper.text()).toContain('本期待办')
  expect(button('撤销完成')).toBeUndefined()
  expect(rows.b.manual_completed).toBe(false)
  expect(setCalendarCompletion.mock.lastCall[1].account_id).toBe('a')
})

it('task URL composes with time filters, preserves explicit history and never completes expired subscriptions', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [{ id: 'done', title: '全勾子项', completed: true }], item: { ...event, end_date: '2026-10-04' } }
  const router = await render('&scope=mine&task=all&date=2026-10-04&status=ongoing')
  expect(wrapper.find('.calendar-subscription').exists()).toBe(false)
  await router.push('/calendar?view=month&scope=mine&task=todo&date=2026-10-04'); await flushPromises()
  expect(wrapper.text()).toContain('已过期 · 本期未完成')
  await router.push('/calendar?view=month&scope=mine&task=completed&date=2026-10-04'); await flushPromises()
  expect(wrapper.find('.calendar-subscription').exists()).toBe(false)
  router.back(); await flushPromises()
  expect(wrapper.get('[aria-label="个人活动状态"]').element.value).toBe('todo')
  expect(setCalendarCompletion).not.toHaveBeenCalled()
})

it('resetting time filters preserves legacy explicit all-subscriptions preference', async () => {
  const router = await render('&scope=mine&pending=0&status=ongoing')
  await wrapper.get('.calendar-filter-clear').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toMatchObject({ scope: 'mine', task: 'all', view: 'agenda' })
  expect(router.currentRoute.value.query.status).toBeUndefined()
  expect(router.currentRoute.value.query.pending).toBeUndefined()
  expect(wrapper.get('[aria-label="个人活动状态"]').element.value).toBe('all')
})

it('mine综合筛选与清除保持账号游戏、范围和原订阅，不将隐藏项误标为未订阅', async () => {
  const login = { ...event, id: 'login', title: '签到', category: 'LOGIN', end_at: '2026-10-06T04:00:00Z' }
  const pool = { ...event, id: 'pool', title: '招募池', category: 'RECRUITMENT' }
  const completed = { ...event, id: 'done', title: '完成的商店', category: 'SHOP' }
  const foreign = { ...event, id: 'foreign', title: '异游活动', game: '代号鸢' }
  const history = { ...event, id: 'history', title: '日期窗口之外', start_date: '2026-09-01', end_date: '2026-09-30' }
  const records = [login, pool, completed, foreign, history].map(item => ({ event_id: item.id, item, subscribed: true, version: 0, completed: item.id === 'done', manual_completed: item.id === 'done', checklist: [{ id: 'todo', title: '事项', completed: item.id === 'done' }] }))
  listCalendarSubscriptions.mockResolvedValue({ items: records, unavailable_items: [{ event_id: 'old', subscribed: true, version: 0, checklist: [] }], subscribed_count: 5 })
  const router = await render('&scope=mine&pending=1&game=代号鸢&exclude_recruitment=1&status=ending&date=2026-10-05&ref=keep')
  expect(wrapper.findComponent({ name: 'CalendarAgendaView' }).props('items').map(item => item.id)).toEqual(['login'])
  expect(wrapper.get('.calendar-account-scope').text()).toContain('如鸢（账号锁定）')
  const reads = listCalendarSubscriptions.mock.calls.length
  await wrapper.get('.calendar-filter-clear').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda', scope: 'mine', game: '代号鸢', date: '2026-10-05', ref: 'keep' })
  expect(activeAccount.id).toBe('a')
  expect(wrapper.findComponent({ name: 'CalendarAgendaView' }).props('items').map(item => item.id)).toEqual(['login', 'pool'])
  expect(wrapper.find('.calendar-filter-clear').exists()).toBe(false)
  expect(wrapper.find('.calendar-filter-state').exists()).toBe(false)
  expect(wrapper.text()).toContain('个人记录仍保留')
  expect(records.map(record => record.subscribed)).toEqual([true, true, true, true, true])
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(reads)
  expect(setCalendarSubscription).not.toHaveBeenCalled()
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('mine切换个人状态与取消时间筛选互不影响账号或公开游戏query', async () => {
  const router = await render('&scope=mine&pending=1&status=ending&game=代号鸢&ref=keep')
  expect(wrapper.get('.calendar-account-scope').text()).toContain('如鸢（账号锁定）')
  expect(wrapper.find('[aria-label="取消筛选：如鸢"]').exists()).toBe(false)
  await wrapper.get('[aria-label="个人活动状态"]').setValue('all'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda', scope: 'mine', task: 'all', status: 'ending', game: '代号鸢', ref: 'keep' })
  await wrapper.get('[aria-label="取消筛选：近 3 天结束"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda', scope: 'mine', task: 'all', game: '代号鸢', ref: 'keep' })
  expect(activeAccount.id).toBe('a')
  expect(wrapper.find('.calendar-filter-state').exists()).toBe(false)
  expect(setCalendarSubscription).not.toHaveBeenCalled()
})

it('mine边界更新不隐藏未保存草稿，保存后再应用时间筛选', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: { ...event, end_at: '2026-10-05T04:00:01Z' } }
  await render('&scope=mine&status=ongoing')
  await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('边界草稿')
  await vi.advanceTimersByTimeAsync(1500); await flushPromises()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('边界草稿')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.find('.calendar-check-row input[type=text]').exists()).toBe(false)
  expect(wrapper.get('.calendar-filter-empty').text()).toContain('当前条件下无事项')
  expect(saveCalendarProgress.mock.lastCall[1].checklist[0].title).toBe('边界草稿')
})

it.each(['日程', '时间轴', '月历'])('%s shares the TODO editor and readonly escaped history', async view => {
  server = { event_id: 'evt', version: 3, subscribed: true, completed: true, manual_completed: true, legacy_completed: true, checklist: [{ id: 'legacy', title: '旧关卡', completed: false }], item: event, memo_title: '历史自定义标题', memo_note: '兑换提醒\n<script>不要执行</script>' }
  await render('&scope=mine&task=all')
  if (view !== '日程') { await button(view).trigger('click'); await flushPromises() }
  if (view === '时间轴') { await wrapper.get('.calendar-timeline-bar').trigger('click'); await flushPromises() }
  expect(wrapper.get('.calendar-todo-card-summary').text()).toContain('已完成 0/1 项')
  await button('编辑待办').trigger('click')
  expect(wrapper.find('textarea').exists()).toBe(false)
  expect(wrapper.find('[aria-label="备忘标题"]').exists()).toBe(false)
  expect(wrapper.find('.calendar-completion-row').exists()).toBe(false)
  const history = wrapper.get('.calendar-todo-history')
  expect(history.attributes('open')).toBeUndefined()
  expect(history.get('summary').text()).toBe('查看旧备忘内容（历史数据）')
  expect(history.text()).toContain('历史自定义标题')
  expect(history.text()).toContain('<script>不要执行</script>')
  expect(history.find('script').exists()).toBe(false)
  expect(history.text()).toContain('不影响待办状态')
  await wrapper.get('.calendar-check-target input').setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).toEqual({ account_id: 'a', expected_version: 3, completed: false, progress_mode: 'checklist', checklist: [{ id: 'legacy', title: '旧关卡', completed: true }] })
  expect(server.memo_title).toBe('历史自定义标题')
  expect(server.memo_note).toContain('<script>不要执行</script>')
  expect(server.manual_completed).toBe(true)
  expect(wrapper.get('.calendar-todo-summary').text()).toContain('待办全部完成')
})
it('default history is hidden and empty TODO drafts protect collapse, filter, route, unsubscribe and unload', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, manual_completed: false, checklist: [], item: event, memo_title: '本期备忘', memo_note: '' }
  const router = await render('&scope=mine')
  await button('编辑待办').trigger('click')
  expect(wrapper.find('.calendar-todo-history').exists()).toBe(false)
  expect(button('保存待办').element.disabled).toBe(true)
  await button('添加待办').trigger('click')
  expect(button('保存待办').element.disabled).toBe(false)
  dialog.confirm.mockResolvedValue(false)
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  await button('收起待办').trigger('click'); await flushPromises()
  await button('取消订阅').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="个人活动状态"]').setValue('completed'); await flushPromises()
  await router.push('/user/profile'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/calendar')
  expect(router.currentRoute.value.query.task).toBeUndefined()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('')
  expect(setCalendarSubscription).not.toHaveBeenCalled()
})
it.each([409, 500, 422, undefined])('save error %s retains TODO input and safe recovery', async status => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render(); await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('本地草稿')
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('保存失败'), { status }))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('本地草稿')
  expect(wrapper.get('.calendar-todo-status').text()).toContain('保存失败')
  if (status === 422) {
    await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
    expect(server.checklist[0].title).toBe('本地草稿'); return
  }
  server = { ...server, version: 1, checklist: [{ id: 'remote', title: '服务器待办', completed: false }] }
  dialog.confirm.mockResolvedValue(false)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('本地草稿')
  dialog.confirm.mockResolvedValue(true)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('服务器待办')
})
it('blank and overlong TODOs are rejected; saving disables duplicate submits', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render(); await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  const title = wrapper.get('.calendar-check-row input[type=text]')
  expect(title.attributes('maxlength')).toBe('80')
  for (const invalid of ['   ', '字'.repeat(81)]) {
    await title.setValue(invalid); await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('1–80 字')
    expect(saveCalendarProgress).not.toHaveBeenCalled()
  }
  await title.setValue('字'.repeat(80))
  let resolve; saveCalendarProgress.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.get('.calendar-checklist fieldset').element.disabled).toBe(true)
  expect(wrapper.get('.calendar-todo-status').text()).toBe('保存中…')
  await wrapper.get('.calendar-checklist').trigger('submit')
  expect(saveCalendarProgress).toHaveBeenCalledTimes(1)
  resolve({ ...server, version: 1, checklist: [{ id: 'saved', title: '字'.repeat(80), completed: false }] }); await flushPromises()
  expect(wrapper.get('.calendar-todo-status').text()).toBe('已保存')
})
it('unavailable TODO and history are readonly and escaped', async () => {
  const gone = { event_id: 'gone', version: 2, subscribed: true, completed: true, manual_completed: true, checklist: [{ id: 'old', title: '<b>旧关卡</b>', completed: false }], memo_title: '旧标题', memo_note: '提示\n<img src=x onerror=alert(1)>' }
  listCalendarSubscriptions.mockResolvedValue({ items: [], unavailable_items: [gone], subscribed_count: 1 })
  await render('&scope=mine&task=all'); await button('查看待办').trigger('click')
  expect(wrapper.get('.calendar-todo-readonly').text()).toContain('<b>旧关卡</b>')
  expect(wrapper.get('.calendar-todo-history').text()).toContain('<img src=x onerror=alert(1)>')
  expect(wrapper.find('.calendar-todo-history img').exists()).toBe(false)
  expect(wrapper.find('.calendar-checklist').exists()).toBe(false)
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})
it('50 TODO limit and declined deletion preserve the activity', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: Array.from({ length: 50 }, (_, index) => ({ id: 'item-' + index, title: '待办' + index, completed: false })), item: event }
  await render(); await button('编辑待办').trigger('click')
  expect(button('添加待办').element.disabled).toBe(true)
  expect(wrapper.text()).toContain('已达 50 条待办上限')
  dialog.confirm.mockResolvedValue(false)
  await button('删除').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.calendar-check-row input[type=text]')).toHaveLength(50)
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '删除待办？', message: expect.stringContaining('当前账号、本期活动') }))
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})
it.each([true, false])('manual activity state %s survives 1/3, 3/3, unchecking, additions or deletion', async manual => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: manual, manual_completed: manual, item: event, checklist: [true, false, false].map((completed, index) => ({ id: 'old-' + index, title: '待办' + index, completed })) }
  await render('&scope=mine&task=all'); await button('编辑待办').trigger('click')
  expect(wrapper.get('.calendar-todo-summary').text()).toContain('已完成 1/3 项')
  for (const input of wrapper.findAll('.calendar-check-target input')) await input.setValue(true)
  expect(wrapper.get('.calendar-todo-summary').text()).toContain('待办全部完成')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server.completed).toBe(manual)
  await wrapper.get('.calendar-check-target input').setValue(false)
  await button('添加待办').trigger('click')
  await wrapper.findAll('.calendar-check-row input[type=text]')[3].setValue('新待办')
  expect(wrapper.get('.calendar-todo-summary').text()).toContain('已完成 2/4 项')
  while (button('删除')) { await button('删除').trigger('click'); await flushPromises() }
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server.completed).toBe(manual); expect(server.manual_completed).toBe(manual)
  wrapper.unmount(); await render('&scope=mine&pending=1')
  expect(wrapper.find('.calendar-subscription').exists()).toBe(!manual)
  wrapper.unmount(); await render('&scope=mine&task=all')
  expect(wrapper.text()).toContain('暂无待办')
})
it('Chinese IME keeps composing TODO title until compositionend', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: true, manual_completed: true, item: event, checklist: [{ id: 'old', title: '旧待办', completed: true }] }
  await render(); await button('编辑待办').trigger('click')
  const title = wrapper.get('.calendar-check-row input[type=text]')
  await title.trigger('compositionstart'); title.element.value = 'zhong'; await title.trigger('input')
  await wrapper.get('.calendar-check-target input').setValue(false)
  expect(title.element.composing).toBe(true); expect(title.element.value).toBe('zhong')
  title.element.value = '中文待办'; await title.trigger('compositionend')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1].checklist).toEqual([{ id: 'old', title: '中文待办', completed: false }])
  expect(saveCalendarProgress.mock.lastCall[1]).not.toHaveProperty('manual_completed')
})
it('todo includes empty subscriptions and unavailable sources while all retains completed activities', async () => {
  const records = ['empty', 'pending', 'done'].map(id => ({ event_id: id, version: 0, subscribed: true, completed: id !== 'pending', manual_completed: id === 'done', item: { ...event, id, title: id }, checklist: id === 'empty' ? [] : [{ id: 'old', title: '事项', completed: id === 'done' }] }))
  listCalendarSubscriptions.mockResolvedValue({ items: records, subscribed_count: 5, unavailable_items: [{ ...records[0], event_id: 'gone-empty', item: null }, { ...records[1], event_id: 'gone-pending', item: null }] })
  const router = await render('&scope=mine&pending=1')
  expect(wrapper.findComponent({ name: 'CalendarAgendaView' }).props('items').map(item => item.id)).toEqual(['empty', 'pending'])
  expect(wrapper.findAll('.calendar-todo-card-summary')).toHaveLength(4)
  await router.replace('/calendar?view=agenda&scope=mine&task=all'); await flushPromises()
  expect(wrapper.findComponent({ name: 'CalendarAgendaView' }).props('items')).toHaveLength(3)
  expect(wrapper.findAll('.calendar-todo-card-summary')).toHaveLength(5)
})
it('saving one event preserves another event and account history through switching and reload', async () => {
  listAccounts.mockResolvedValue(twoAccounts('如鸢'))
  const other = { ...event, id: 'other', title: '另一活动' }
  listActivityCalendar.mockResolvedValue({ items: [event, other] })
  const stores = { a: [event, other].map(item => ({ event_id: item.id, item, version: 0, subscribed: true, completed: false, checklist: [{ id: 'stable-' + item.id, title: '账号A事项', completed: false }], memo_title: '账号A旧标题', memo_note: '账号A历史' })), b: [{ event_id: event.id, item: event, version: 0, subscribed: true, completed: false, checklist: [{ id: 'b', title: '账号B事项', completed: false }], memo_title: '账号B旧标题', memo_note: '账号B历史' }] }
  const untouched = JSON.stringify([stores.a[1], stores.b[0]])
  listCalendarSubscriptions.mockImplementation(async ({ account_id }) => ({ items: stores[account_id], subscribed_count: stores[account_id].length }))
  saveCalendarProgress.mockImplementation(async (id, body) => {
    const row = stores[body.account_id].find(row => row.event_id === id)
    Object.assign(row, { checklist: body.checklist, completed: row.manual_completed === true, version: row.version + 1 }); return { ...row }
  })
  await render('&scope=mine'); await button('编辑待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('当前活动改名')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(JSON.stringify([stores.a[1], stores.b[0]])).toBe(untouched)
  await switchAccount('b'); await button('编辑待办').trigger('click')
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('账号B事项')
  expect(wrapper.get('.calendar-todo-history').text()).toContain('账号B历史')
  await button('收起待办').trigger('click'); await switchAccount('a')
  wrapper.unmount(); await render('&scope=mine'); await button('编辑待办').trigger('click')
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('当前活动改名')
  expect(wrapper.get('.calendar-todo-history').text()).toContain('账号A历史')
})
it('unsupported backend rejects checklist protocol visibly and retains the draft', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render(); await button('编辑待办').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('保留的输入')
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('请求字段不正确'), { status: 422 }))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('服务端尚不支持待办保存协议')
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('保留的输入')
  expect(saveCalendarProgress).toHaveBeenCalledTimes(1)
  expect(saveCalendarProgress.mock.lastCall[1].progress_mode).toBe('checklist')
})

it.each(['如鸢', '代号鸢'])('public and subscribed bars keep the same confirmed UP names for %s', async game => {
  const pool = { ...event, id: 'recruitment:confirmed', source_type: 'RECRUITMENT_POOL', category: 'RECRUITMENT', game, title: '正式招募池', up_agent_names: ['甲', '乙', '丙'], source_up_agent_names: ['未知候选'] }
  listAccounts.mockResolvedValue([{ id: 'a', name: '测试账号', game }])
  listActivityCalendar.mockResolvedValue({ items: [pool] })
  listCalendarSubscriptions.mockResolvedValue({ items: [{ event_id: pool.id, version: 0, subscribed: true, completed: false, checklist: [], item: pool }], unavailable_items: [], subscribed_count: 1 })
  await render(`&game=${game}`)
  for (const scope of ['全部活动', '我的日历']) {
    await button(scope).trigger('click'); await flushPromises()
    for (const view of ['月历', '时间轴']) {
      await button(view).trigger('click'); await flushPromises()
      const bars = wrapper.findAll('.calendar-month-bar, .calendar-timeline-bar')
      expect(bars.length).toBeGreaterThan(0)
      expect(bars[0].get('.calendar-month-bar-up, .calendar-timeline-bar-up').text()).toBe('UP · 甲 / 乙 +1')
      expect(bars[0].attributes('aria-label')).toContain('UP 密探：甲、乙、丙')
      expect(wrapper.text()).not.toContain('未知候选')
    }
  }
  expect(setCalendarSubscription).not.toHaveBeenCalled()
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})
