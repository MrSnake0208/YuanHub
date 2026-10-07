import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import AccountSwitcher from '../src/components/AccountSwitcher.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { listCalendarSubscriptions, getCalendarSubscription, setCalendarSubscription, saveCalendarProgress } from '../src/api/activityCalendarSubscriptions.js'
import { dialog } from '../src/utils/dialog.js'
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, isAdmin: true, userInfo: { id: 'user' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ listCalendarSubscriptions: vi.fn(), getCalendarSubscription: vi.fn(), setCalendarSubscription: vi.fn(), saveCalendarProgress: vi.fn() }))
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
  auth.isLoggedIn = true; auth.isAdmin = true; auth.userInfo = { id: 'user' }; activeAccount.set('a')
  server = null
  listAccounts.mockResolvedValue([{ id: 'a', name: '大号', game: '如鸢' }])
  listActivityCalendar.mockResolvedValue({ items: [event] })
  listCalendarSubscriptions.mockImplementation(async () => ({ items: server?.subscribed ? [server] : [], unavailable_items: [], subscribed_count: server?.subscribed ? 1 : 0 }))
  getCalendarSubscription.mockImplementation(async () => { if (!server) throw Object.assign(new Error('missing'), { status: 404, code: 'subscription_not_found' }); return server })
  setCalendarSubscription.mockImplementation(async (id, body) => { server = { event_id: id, version: (server?.version ?? -1) + 1, completed: server?.completed ?? false, checklist: server?.checklist || [], item: event, subscribed: body.subscribed }; return server })
  saveCalendarProgress.mockImplementation(async (id, body) => { server = { ...server, ...body, completed: body.checklist.length ? body.checklist.every(entry => entry.completed) : body.completed, version: server.version + 1 }; return server })
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
  listCalendarSubscriptions.mockImplementation(async ({ account_id }) => ({ items: [{ event_id: account_id === 'a' ? event.id : nextEvent.id, version: 0, subscribed: true, completed: false, checklist: [], item: account_id === 'a' ? event : nextEvent }], subscribed_count: 1 }))
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
  expect(wrapper.get('.calendar-filter-summary').text()).toBe(`${game} · 全部类型`)
  expect(wrapper.findAll('.calendar-filter-inline legend').map(node => node.text())).toEqual(['类型'])
  await button('全部活动').trigger('click'); await flushPromises()
  expect(wrapper.get('.calendar-filter-summary').text()).toBe('如鸢 · 全部类型')
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
  await button('记录进度').trigger('click'); await button('添加关卡').trigger('click')
  await wrapper.get('input[type=text]').setValue('未保存关卡')
  dialog.confirm.mockResolvedValue(false)
  await switchAccount('b')
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '放弃未保存修改？', message: expect.stringContaining('活动关卡进度') }))
  expect(activeAccount.id).toBe('a')
  expect(wrapper.get('input[type=text]').element.value).toBe('未保存关卡')
  expect(document.activeElement).toBe(wrapper.get('.context-selector').element)
  expect(listCalendarSubscriptions.mock.calls.every(([params]) => params.account_id === 'a')).toBe(true)
  dialog.confirm.mockResolvedValue(true)
  await switchAccount('b')
  expect(activeAccount.id).toBe('b')
  expect(wrapper.find('input[type=text]').exists()).toBe(false)
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
it.each([false, true])('removing the last entry keeps its edited completion (initial %s)', async initial => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: initial, checklist: [{ id: 'one', title: '第一关', completed: initial }], item: event }
  await render()
  await button('记录进度').trigger('click')
  await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(!initial)
  await button('删除').trigger('click'); await flushPromises()
  expect(wrapper.get('.calendar-checklist input[type=checkbox]').element.checked).toBe(!initial)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).toMatchObject({ checklist: [], completed: !initial })
  expect(server.completed).toBe(!initial)
})
it('subscribe complete cancel restore reuse one activity and retain progress', async () => {
  await render()
  await button('订阅本期').trigger('click'); await flushPromises()
  expect(setCalendarSubscription.mock.lastCall[1]).toEqual({ account_id: 'a', expected_version: null, subscribed: true })
  await button('记录进度').trigger('click')
  await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('本期已完成')
  await button('取消订阅').trigger('click'); await flushPromises()
  await button('订阅本期').trigger('click'); await flushPromises()
  expect(server.completed).toBe(true)
  expect(wrapper.text()).toContain('本期已完成')
})
it('private checklist add rename and finish saves stable entries with version', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render('&scope=mine')
  await button('记录进度').trigger('click'); await button('添加关卡').trigger('click')
  await wrapper.get('input[type=text]').setValue('地下遗迹第四关')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1].checklist[0]).toMatchObject({ title: '地下遗迹第四关', completed: false })
  await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('本期已完成')
  expect(saveCalendarProgress.mock.lastCall[1].expected_version).toBe(1)
})
it('conflict preserves draft blocks save and requires reading latest before replacement', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render()
  await button('记录进度').trigger('click'); await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(true)
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.get('.calendar-checklist fieldset').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.calendar-checklist input[type=checkbox]').element.checked).toBe(true)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.get('.calendar-checklist input[type=checkbox]').element.checked).toBe(false)
  expect(dialog.confirm).toHaveBeenCalled()
})
it('mine retains view and date while ignoring foreign game query and filters completed', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: true, checklist: [], item: event }
  const router = await render('&scope=mine&pending=1&game=代号鸢&ref=test')
  expect(wrapper.text()).not.toContain('地下遗迹')
  expect(wrapper.getComponent(AccountSwitcher).props('accountId')).toBe('a')
  expect(wrapper.text()).toContain('订阅与关卡进度仅当前账号可见')
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
  await button('记录进度').trigger('click'); await button('添加关卡').trigger('click')
  await wrapper.get('input[type=text]').setValue('尚未保存')
  dialog.confirm.mockResolvedValue(false)
  await button('月历').trigger('click'); await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '放弃未保存修改？' }))
  expect(wrapper.get('input[type=text]').element.value).toBe('尚未保存')
  expect(router.currentRoute.value.query.view).toBeUndefined()
})
it('reading conflict result in pending-only scope does not discard draft before confirmation', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render('&scope=mine&pending=1')
  await button('记录进度').trigger('click'); await button('添加关卡').trigger('click')
  await wrapper.get('input[type=text]').setValue('保留草稿')
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  server = { ...server, completed: true, version: 1 }
  dialog.confirm.mockResolvedValue(false)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.get('input[type=text]').element.value).toBe('保留草稿')
  dialog.confirm.mockResolvedValue(true)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.find('input[type=text]').exists()).toBe(false)
})
it('midnight defers date and list replacement until dirty progress is saved', async () => {
  vi.setSystemTime(new Date('2026-10-05T15:59:59Z'))
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render()
  await button('记录进度').trigger('click'); await button('添加关卡').trigger('click')
  await wrapper.get('input[type=text]').setValue('跨日草稿')
  const reads = listActivityCalendar.mock.calls.length
  await vi.advanceTimersByTimeAsync(1200); await flushPromises()
  expect(wrapper.get('input[type=text]').element.value).toBe('跨日草稿')
  expect(listActivityCalendar).toHaveBeenCalledTimes(reads)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(listActivityCalendar.mock.lastCall[0].from).toBe('2026-10-06')
})
it('new checklist item may be deliberately completed before first save', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render()
  await button('记录进度').trigger('click'); await button('添加关卡').trigger('click')
  await wrapper.get('input[type=text]').setValue('已打关卡')
  await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1].checklist[0].completed).toBe(true)
  expect(wrapper.text()).toContain('本期已完成')
})
