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
  setCalendarSubscription.mockImplementation(async (id, body) => { server = { ...server, event_id: id, version: (server?.version ?? -1) + 1, completed: server?.completed ?? false, checklist: server?.checklist || [], item: event, subscribed: body.subscribed }; return server })
  saveCalendarProgress.mockImplementation(async (id, body) => { server = { ...server, ...body, completed: body.manual_completed ?? server.manual_completed ?? (body.checklist.length ? body.checklist.every(entry => entry.completed) : body.completed), version: server.version + 1 }; return server })
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
  expect(wrapper.get('.calendar-filter-summary').text()).toBe('仅未完成')
  expect(wrapper.get('.calendar-account-scope').text()).toContain(`${game}（账号锁定）`)
  await wrapper.get('.calendar-filter-trigger').trigger('click'); await flushPromises()
  expect(Array.from(document.querySelectorAll('#calendar-filter-sheet legend')).map(node => node.textContent)).toEqual(['类型', '时间状态'])
  document.querySelector('.calendar-filter-sheet-header button').click(); await flushPromises()
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
  await button('编辑备忘').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('未保存关卡')
  dialog.confirm.mockResolvedValue(false)
  await switchAccount('b')
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '放弃未保存修改？', message: expect.stringContaining('活动备忘录') }))
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
it.each([false, true])('removing the last entry keeps its edited completion (initial %s)', async initial => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: initial, checklist: [{ id: 'one', title: '第一关', completed: initial }], item: event }
  await render()
  await button('编辑备忘').trigger('click')
  await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(!initial)
  await button('删除').trigger('click'); await flushPromises()
  expect(wrapper.get('.calendar-checklist input[type=checkbox]').element.checked).toBe(!initial)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).toMatchObject({ checklist: [], manual_completed: !initial })
  expect(server.completed).toBe(!initial)
})
it('subscribe complete cancel restore reuse one activity and retain progress', async () => {
  await render()
  await button('订阅本期').trigger('click'); await flushPromises()
  expect(setCalendarSubscription.mock.lastCall[1]).toEqual({ account_id: 'a', expected_version: null, subscribed: true })
  await button('编辑备忘').trigger('click')
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
  await button('编辑备忘').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('地下遗迹第四关')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1].checklist[0]).toMatchObject({ title: '地下遗迹第四关', completed: false })
  await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('本期已完成')
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
  await button('编辑备忘').trigger('click')
  await button('添加待办').trigger('click'); await flushPromises()
  const first = wrapper.get('.calendar-check-row input[type=text]')
  expect(first.element.value).toBe('')
  expect(document.activeElement).toBe(first.element)
  dialog.confirm.mockResolvedValue(false)
  await button('收起备忘').trigger('click'); await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '放弃未保存修改？' }))
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
  expect(wrapper.text()).toContain('备忘已保存')
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
  await button('编辑备忘').trigger('click')
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
  await button('编辑备忘').trigger('click'); await wrapper.get('.calendar-checklist input[type=checkbox]').setValue(true)
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
  expect(wrapper.text()).toContain('订阅与活动备忘录仅当前账号可见')
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
  await button('编辑备忘').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('尚未保存')
  dialog.confirm.mockResolvedValue(false)
  await button('月历').trigger('click'); await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '放弃未保存修改？' }))
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('尚未保存')
  expect(router.currentRoute.value.query.view).toBeUndefined()
})
it('reading conflict result in pending-only scope does not discard draft before confirmation', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render('&scope=mine&pending=1')
  await button('编辑备忘').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('保留草稿')
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  server = { ...server, completed: true, version: 1 }
  dialog.confirm.mockResolvedValue(false)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('保留草稿')
  dialog.confirm.mockResolvedValue(true)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.find('.calendar-check-row input[type=text]').exists()).toBe(false)
})
it('midnight defers date and list replacement until dirty progress is saved', async () => {
  vi.setSystemTime(new Date('2026-10-05T15:59:59Z'))
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render()
  await button('编辑备忘').trigger('click'); await button('添加待办').trigger('click')
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
  await button('编辑备忘').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('已打关卡')
  await wrapper.get('.calendar-check-target input[type=checkbox]').setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1].checklist[0].completed).toBe(true)
  expect(server.completed).toBe(false)
  expect(wrapper.get('.calendar-memo-summary').text()).toContain('本期未完成')
})

it('mine综合筛选与清除保持账号游戏、范围和原订阅，不将隐藏项误标为未订阅', async () => {
  const login = { ...event, id: 'login', title: '签到', category: 'LOGIN', end_at: '2026-10-06T04:00:00Z' }
  const pool = { ...event, id: 'pool', title: '招募池', category: 'RECRUITMENT' }
  const completed = { ...event, id: 'done', title: '完成的商店', category: 'SHOP' }
  const foreign = { ...event, id: 'foreign', title: '异游活动', game: '代号鸢' }
  const history = { ...event, id: 'history', title: '日期窗口之外', start_date: '2026-09-01', end_date: '2026-09-30' }
  const records = [login, pool, completed, foreign, history].map(item => ({ event_id: item.id, item, subscribed: true, version: 0, completed: item.id === 'done', checklist: [] }))
  listCalendarSubscriptions.mockResolvedValue({ items: records, unavailable_items: [{ event_id: 'old', checklist: [] }], subscribed_count: 5 })
  const router = await render('&scope=mine&pending=1&game=代号鸢&exclude_recruitment=1&status=ending&date=2026-10-05&ref=keep')
  expect(wrapper.findComponent({ name: 'CalendarAgendaView' }).props('items').map(item => item.id)).toEqual(['login'])
  expect(wrapper.get('.calendar-account-scope').text()).toContain('如鸢（账号锁定）')
  const reads = listCalendarSubscriptions.mock.calls.length
  await wrapper.get('.calendar-filter-clear').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda', scope: 'mine', game: '代号鸢', date: '2026-10-05', ref: 'keep' })
  expect(activeAccount.id).toBe('a')
  expect(wrapper.findComponent({ name: 'CalendarAgendaView' }).props('items').map(item => item.id)).toEqual(['login', 'pool', 'done'])
  expect(wrapper.find('.calendar-filter-clear').exists()).toBe(false)
  expect(wrapper.find('.calendar-filter-state').exists()).toBe(false)
  expect(wrapper.text()).toContain('个人记录仍保留')
  expect(records.map(record => record.subscribed)).toEqual([true, true, true, true, true])
  expect(listCalendarSubscriptions).toHaveBeenCalledTimes(reads)
  expect(setCalendarSubscription).not.toHaveBeenCalled()
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('mine逐项取消仅未完成和时间状态，不改变账号或公开游戏query', async () => {
  const router = await render('&scope=mine&pending=1&status=ending&game=代号鸢&ref=keep')
  expect(wrapper.get('.calendar-account-scope').text()).toContain('如鸢（账号锁定）')
  expect(wrapper.find('[aria-label="取消筛选：如鸢"]').exists()).toBe(false)
  await wrapper.get('[aria-label="取消筛选：仅未完成"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda', scope: 'mine', status: 'ending', game: '代号鸢', ref: 'keep' })
  await wrapper.get('[aria-label="取消筛选：近 3 天结束"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ view: 'agenda', scope: 'mine', game: '代号鸢', ref: 'keep' })
  expect(activeAccount.id).toBe('a')
  expect(wrapper.find('.calendar-filter-state').exists()).toBe(false)
  expect(setCalendarSubscription).not.toHaveBeenCalled()
})

it('mine边界更新不隐藏未保存草稿，保存后再应用时间筛选', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: { ...event, end_at: '2026-10-05T04:00:01Z' } }
  await render('&scope=mine&status=ongoing')
  await button('编辑备忘').trigger('click'); await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('边界草稿')
  await vi.advanceTimersByTimeAsync(1500); await flushPromises()
  expect(wrapper.get('.calendar-check-row input[type=text]').element.value).toBe('边界草稿')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.find('.calendar-check-row input[type=text]').exists()).toBe(false)
  expect(wrapper.get('.calendar-filter-empty').text()).toContain('当前条件下无活动')
  expect(saveCalendarProgress.mock.lastCall[1].checklist[0].title).toBe('边界草稿')
})

it('memo title and note persist with multiple stable TODOs through reload and cancel-restore', async () => {
  server = { event_id: 'evt', version: 3, subscribed: true, completed: false, checklist: [{ id: 'legacy', title: '旧关卡', completed: true }], item: event }
  await render('&scope=mine')
  expect(wrapper.find('.calendar-checklist').exists()).toBe(false)
  expect(wrapper.get('.calendar-memo-summary').text()).toContain('本期备忘')
  await button('编辑备忘').trigger('click')
  expect(document.activeElement).toBe(wrapper.get('[aria-label="备忘标题"]').element)
  await wrapper.get('[aria-label="备忘标题"]').setValue('本期已完成')
  await wrapper.get('[aria-label="文字备注（可选）"]').setValue('兑换提醒\n<script>不要执行</script>')
  await button('添加待办').trigger('click')
  const inputs = wrapper.findAll('.calendar-check-row input[type=text]')
  expect(document.activeElement).toBe(inputs[1].element)
  await inputs[0].setValue('旧待办改名')
  await inputs[1].setValue('兑换清单')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server).toMatchObject({ memo_title: '本期已完成', memo_note: '兑换提醒\n<script>不要执行</script>', completed: true, manual_completed: true, version: 4 })
  expect(server.checklist).toEqual([{ id: 'legacy', title: '旧待办改名', completed: true }, { id: expect.any(String), title: '兑换清单', completed: false }])
  expect(wrapper.get('.calendar-memo-summary').text()).toContain('已完成 1/2 项')
  await button('收起备忘').trigger('click')
  expect(document.activeElement).toBe(button('编辑备忘').element)
  await button('取消订阅').trigger('click'); await flushPromises()
  await button('全部活动').trigger('click'); await flushPromises()
  await button('订阅本期').trigger('click'); await flushPromises()
  wrapper.unmount(); await render('&scope=mine')
  expect(wrapper.text()).toContain('地下遗迹')
  await button('编辑备忘').trigger('click')
  expect(wrapper.get('[aria-label="备忘标题"]').element.value).toBe('本期已完成')
  expect(wrapper.get('[aria-label="文字备注（可选）"]').element.value).toContain('<script>不要执行</script>')
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.findAll('.calendar-check-row input[type=text]').map(input => input.element.value)).toEqual(['旧待办改名', '兑换清单'])
})

it('memo-only edits protect close view account unload and route leave', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  const router = await render()
  await button('编辑备忘').trigger('click')
  await wrapper.get('[aria-label="文字备注（可选）"]').setValue('只改备注也要保护')
  dialog.confirm.mockResolvedValue(false)
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  await button('收起备忘').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="文字备注（可选）"]').element.value).toBe('只改备注也要保护')
  await button('月历').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.view).toBe('agenda')
  await router.push('/user/profile'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/calendar')
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it.each([409, 500, 422])('memo save error %s preserves title and note including declined conflict refresh', async status => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render()
  await button('编辑备忘').trigger('click')
  await wrapper.get('[aria-label="备忘标题"]').setValue('兑换清单')
  await wrapper.get('[aria-label="文字备注（可选）"]').setValue('本地草稿')
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('保存失败'), { status }))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.get('[aria-label="备忘标题"]').element.value).toBe('兑换清单')
  expect(wrapper.get('[aria-label="文字备注（可选）"]').element.value).toBe('本地草稿')
  if (status === 422) {
    await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
    expect(server.memo_note).toBe('本地草稿')
    return
  }
  server = { ...server, version: 1, memo_title: '服务器标题', memo_note: '服务器备注' }
  dialog.confirm.mockResolvedValue(false)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="文字备注（可选）"]').element.value).toBe('本地草稿')
  dialog.confirm.mockResolvedValue(true)
  await button('读取最新状态').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="备忘标题"]').element.value).toBe('服务器标题')
  expect(wrapper.get('[aria-label="文字备注（可选）"]').element.value).toBe('服务器备注')
})

it('memo validates whitespace title and limits and can explicitly clear note', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event, memo_note: '原备注' }
  await render()
  await button('编辑备忘').trigger('click')
  expect(wrapper.get('[aria-label="备忘标题"]').attributes('maxlength')).toBe('60')
  expect(wrapper.get('textarea').attributes('maxlength')).toBe('1000')
  await wrapper.get('[aria-label="备忘标题"]').setValue('   ')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('不能仅含空格')
  expect(saveCalendarProgress).not.toHaveBeenCalled()
  await wrapper.get('[aria-label="备忘标题"]').setValue('有效标题')
  await wrapper.get('textarea').setValue('文'.repeat(1001))
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress).not.toHaveBeenCalled()
  await wrapper.get('textarea').setValue('')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server.memo_note).toBe('')
})

it('unavailable memo stays compact and offers safe read-only TODO and multiline note', async () => {
  const gone = { event_id: 'gone', version: 2, subscribed: true, completed: false, checklist: [{ id: 'old', title: '<b>旧关卡</b>', completed: true }], memo_title: '本期目标', memo_note: '提示\n<img src=x onerror=alert(1)>' }
  listCalendarSubscriptions.mockResolvedValue({ items: [], unavailable_items: [gone], subscribed_count: 1 })
  await render('&scope=mine')
  expect(wrapper.find('.calendar-memo-readonly').exists()).toBe(false)
  expect(wrapper.text()).toContain('本期目标')
  await button('查看备忘').trigger('click')
  expect(wrapper.get('.calendar-memo-readonly').text()).toContain('<b>旧关卡</b>')
  expect(wrapper.get('.calendar-memo-note').text()).toContain('<img src=x onerror=alert(1)>')
  expect(wrapper.find('.calendar-memo-readonly img').exists()).toBe(false)
  expect(wrapper.find('.calendar-checklist').exists()).toBe(false)
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('memo scope isolates another event and another account after title and note save', async () => {
  listAccounts.mockResolvedValue(twoAccounts('如鸢'))
  const otherEvent = { ...event, id: 'evt-y', title: '活动 Y' }
  listActivityCalendar.mockResolvedValue({ items: [event, otherEvent] })
  const stores = { a: [event, otherEvent].map(item => ({ event_id: item.id, item, version: 0, subscribed: true, completed: false, checklist: [] })), b: [{ event_id: event.id, item: event, version: 0, subscribed: true, completed: false, checklist: [], memo_title: '账号 B', memo_note: 'B 的备注' }] }
  listCalendarSubscriptions.mockImplementation(async ({ account_id }) => ({ items: stores[account_id], subscribed_count: stores[account_id].length }))
  saveCalendarProgress.mockImplementation(async (id, body) => {
    const row = stores[body.account_id].find(row => row.event_id === id)
    Object.assign(row, body, { version: row.version + 1 }); return { ...row }
  })
  await render('&scope=mine')
  await button('编辑备忘').trigger('click')
  await wrapper.get('[aria-label="备忘标题"]').setValue('账号 A 的 X')
  await wrapper.get('textarea').setValue('A 的备注')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(stores.a[1]).not.toHaveProperty('memo_title')
  expect(stores.b[0].memo_title).toBe('账号 B')
  await switchAccount('b')
  expect(wrapper.text()).toContain('账号 B')
  await button('编辑备忘').trigger('click')
  expect(wrapper.get('textarea').element.value).toBe('B 的备注')
  await button('收起备忘').trigger('click')
  await switchAccount('a')
  expect(wrapper.text()).toContain('账号 A 的 X')
})

it.each(['日程', '时间轴', '月历'])('%s reuses memo editor and keeps saved title note and progress', async view => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: true, manual_completed: true, checklist: [{ id: 'old', title: '旧待办', completed: false }], item: event, memo_title: '兑换清单', memo_note: '留存提醒' }
  await render('&scope=mine')
  if (view !== '日程') { await button(view).trigger('click'); await flushPromises() }
  if (view === '时间轴') { await wrapper.get('.calendar-timeline-bar').trigger('click'); await flushPromises() }
  expect(wrapper.get('.calendar-memo-summary').text()).toContain('兑换清单')
  expect(wrapper.get('.calendar-memo-summary').text()).toContain('已完成 0/1 项')
  expect(wrapper.get('.calendar-memo-summary').text()).toContain('本期已完成')
  await button('编辑备忘').trigger('click')
  expect(wrapper.get('textarea').element.value).toBe('留存提醒')
  expect(completion().element.checked).toBe(true)
  await wrapper.get('textarea').setValue('更新提醒')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).toMatchObject({ account_id: 'a', expected_version: 0, manual_completed: true, memo_title: '兑换清单', memo_note: '更新提醒', checklist: [{ id: 'old', title: '旧待办', completed: false }] })
})

it('50 TODO limit and canceling deletion preserve current activity data', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: Array.from({ length: 50 }, (_, index) => ({ id: 'item-' + index, title: '待办' + index, completed: false })), item: event }
  await render()
  await button('编辑备忘').trigger('click')
  expect(button('添加待办').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('已达 50 条待办上限，删除一条后可继续添加。')
  await button('添加待办').trigger('click')
  expect(wrapper.findAll('.calendar-check-row input[type=text]')).toHaveLength(50)
  dialog.confirm.mockResolvedValue(false)
  await button('删除').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.calendar-check-row input[type=text]')).toHaveLength(50)
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '删除待办？', message: expect.stringContaining('当前账号、本期活动') }))
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

const completion = () => wrapper.get('.calendar-completion-row input[type=checkbox]')
const todoCheckboxes = () => wrapper.findAll('.calendar-check-target input[type=checkbox]')
it.each([true, false])('manual %s stays independent through additions, 2/2, rename, delete all and reload', async manual => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render('&scope=mine&pending=1')
  await button('编辑备忘').trigger('click')
  expect(completion().element.checked).toBe(false)
  if (manual) await completion().setValue(true)
  for (const title of ['第一项', '第二项']) {
    await button('添加待办').trigger('click')
    const inputs = wrapper.findAll('.calendar-check-row input[type=text]')
    await inputs[inputs.length - 1].setValue(title)
    expect(completion().element.checked).toBe(manual)
  }
  expect(wrapper.get('.calendar-todo-summary').text()).toContain('已完成 0/2 项')
  for (const input of todoCheckboxes()) await input.setValue(true)
  expect(completion().element.checked).toBe(manual)
  expect(wrapper.get('.calendar-todo-summary').text()).toContain('已完成 2/2 项')
  await todoCheckboxes()[0].setValue(false)
  await wrapper.get('.calendar-check-row input[type=text]').setValue('重命名')
  await wrapper.get('textarea').setValue('备注')
  expect(completion().element.checked).toBe(manual)
  while (button('删除')) { await button('删除').trigger('click'); await flushPromises(); expect(completion().element.checked).toBe(manual) }
  await button('添加待办').trigger('click')
  await wrapper.get('.calendar-check-row input[type=text]').setValue('再新增')
  expect(completion().element.checked).toBe(manual)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server).toMatchObject({ completed: manual, manual_completed: manual })
  if (manual) expect(wrapper.find('.calendar-checklist').exists()).toBe(false)
  wrapper.unmount(); await render('&scope=mine')
  await button('编辑备忘').trigger('click')
  expect(completion().element.checked).toBe(manual)
  expect(wrapper.get('.calendar-todo-summary').text()).toContain('已完成 0/1 项')
})
it.each([
  [true, []], [false, []],
  [true, [{ id: 'old', title: '旧项目', completed: true }]],
  [false, [{ id: 'old', title: '旧项目', completed: false }]],
])('legacy effective %s freezes only on TODO edits with checklist %j', async (effective, checklist) => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: effective, checklist, item: event }
  await render(); await button('编辑备忘').trigger('click')
  expect(completion().element.checked).toBe(effective)
  expect(button('保存备忘').element.disabled).toBe(true)
  await wrapper.get('[aria-label="备忘标题"]').setValue('本期已完成')
  await wrapper.get('textarea').setValue('只改备注')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).not.toHaveProperty('manual_completed')
  if (checklist.length) {
    await wrapper.get('.calendar-check-row input[type=text]').setValue('旧项目重命名')
    await todoCheckboxes()[0].setValue(!checklist[0].completed)
  } else {
    await button('添加待办').trigger('click'); await wrapper.get('.calendar-check-row input[type=text]').setValue('新项目')
  }
  expect(completion().element.checked).toBe(effective)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1].manual_completed).toBe(effective)
  expect(server.completed).toBe(effective)
})
it('false with every TODO complete stays pending and status toggle has independent dirty state', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, manual_completed: false, checklist: [{ id: 'one', title: '第一项', completed: true }, { id: 'two', title: '第二项', completed: true }], item: event }
  await render('&scope=mine&pending=1'); await button('编辑备忘').trigger('click')
  expect(wrapper.get('.calendar-todo-summary').text()).toContain('已完成 2/2 项')
  expect(completion().element.checked).toBe(false)
  await completion().setValue(true)
  expect(button('保存备忘').element.disabled).toBe(false)
  await completion().setValue(false)
  expect(button('保存备忘').element.disabled).toBe(true)
  await todoCheckboxes()[0].setValue(false)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server.completed).toBe(false)
  expect(wrapper.find('.calendar-checklist').exists()).toBe(true)
})

it.each(['rename', 'check', 'delete'])('legacy completed checklist freezes before first %s', async action => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: true, checklist: [{ id: 'old', title: '原待办', completed: true }], item: event }
  await render(); await button('编辑备忘').trigger('click')
  if (action === 'rename') await wrapper.get('.calendar-check-row input[type=text]').setValue('改名')
  if (action === 'check') await todoCheckboxes()[0].setValue(false)
  if (action === 'delete') { await button('删除').trigger('click'); await flushPromises() }
  expect(completion().element.checked).toBe(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server.manual_completed).toBe(true)
  expect(server.completed).toBe(true)
})

it('Chinese IME TODO rename preserves composition and freezes legacy completion before the final input', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: true, checklist: [{ id: 'old', title: '旧待办', completed: true }], item: event }
  await render(); await button('编辑备忘').trigger('click')
  const title = wrapper.get('.calendar-check-row input[type=text]')
  await title.trigger('compositionstart')
  title.element.value = 'zhong'
  await title.trigger('input')
  // Vue keeps the draft unchanged until composition commits.
  expect(title.element.composing).toBe(true)
  await completion().setValue(false)
  expect(title.element.value).toBe('zhong')
  title.element.value = '中文待办'
  await title.trigger('compositionend')
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(saveCalendarProgress.mock.lastCall[1]).toMatchObject({ manual_completed: false, checklist: [{ id: 'old', title: '中文待办', completed: true }] })
})

it('new false overall saves 2 of 2 TODOs as pending until the user explicitly completes the activity', async () => {
  server = { event_id: 'evt', version: 0, subscribed: true, completed: false, checklist: [], item: event }
  await render('&scope=mine&pending=1'); await button('编辑备忘').trigger('click')
  for (const title of ['第一项', '第二项']) {
    await button('添加待办').trigger('click')
    const names = wrapper.findAll('.calendar-check-row input[type=text]')
    await names[names.length - 1].setValue(title)
  }
  for (const input of todoCheckboxes()) await input.setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server.completed).toBe(false)
  expect(server.manual_completed).toBe(false)
  expect(server.checklist.map(entry => entry.completed)).toEqual([true, true])
  expect(wrapper.get('.calendar-memo-summary').text()).toContain('本期未完成')
  expect(wrapper.get('.calendar-memo-summary').text()).toContain('已完成 2/2 项')
  await completion().setValue(true)
  await wrapper.get('.calendar-checklist').trigger('submit'); await flushPromises()
  expect(server.completed).toBe(true)
  expect(wrapper.find('.calendar-checklist').exists()).toBe(false)
})
