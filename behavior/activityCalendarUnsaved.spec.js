import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import AppDialog from '../src/components/AppDialog.vue'
import AccountSwitcher from '../src/components/AccountSwitcher.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { publishAccountList } from '../src/store/accountList.js'
import { listAccounts } from '../src/api/accounts.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { listCalendarSubscriptions, getCalendarSubscription, setCalendarSubscription, saveCalendarProgress } from '../src/api/activityCalendarSubscriptions.js'
import { dialog } from '../src/utils/dialog.js'
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, isAdmin: true, userInfo: { id: 'user' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ listCalendarSubscriptions: vi.fn(), getCalendarSubscription: vi.fn(), setCalendarSubscription: vi.fn(), saveCalendarProgress: vi.fn() }))
const event = { id: 'evt', game: '如鸢', title: '地下遗迹', category: 'ACTIVITY', start_date: '2026-10-01', end_date: '2026-10-10' }
const accounts = [{ id: 'a', name: '大号', game: '如鸢' }, { id: 'b', name: '小号', game: '如鸢' }]
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
let wrapper, router, server
const button = text => wrapper.findAll('button').find(node => node.text() === text)
const title = () => wrapper.get('[aria-label="备忘标题"]')
const status = () => wrapper.get('.calendar-memo-status').text()
async function settle(discard = false) { dialog[discard ? '_confirm' : '_cancel'](); await flushPromises() }
async function render(query = '') {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: Calendar }, { path: '/:pathMatch(.*)*', component: { template: '<div>other</div>' } }] })
  await router.push('/calendar?view=agenda' + query); await router.isReady()
  wrapper = mount({ components: { AppDialog }, template: '<router-view /><AppDialog />' }, { attachTo: document.body, global: { plugins: [router], stubs: { IslandSidebar: true, SiteFooter: true } } })
  await flushPromises()
}
async function edit() { await button('编辑备忘').trigger('click'); await title().setValue('草稿标题') }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T04:00:00Z'))
  const media = new EventTarget(); media.matches = false; vi.stubGlobal('matchMedia', vi.fn(() => media))
  auth.isLoggedIn = true; auth.isAdmin = true; auth.userInfo = { id: 'user' }; activeAccount.set('a')
  server = { event_id: 'evt', version: 1, subscribed: true, completed: false, checklist: [{ id: 'one', title: '第一项', completed: false }], memo_title: '原始标题', memo_note: '原始备注', item: event }
  listAccounts.mockResolvedValue(accounts)
  listActivityCalendar.mockResolvedValue({ items: [event] })
  listCalendarSubscriptions.mockImplementation(async ({ account_id }) => ({ items: [{ ...server, memo_title: account_id === 'a' ? server.memo_title : 'B的备忘' }], subscribed_count: 1 }))
  getCalendarSubscription.mockImplementation(async () => server)
  setCalendarSubscription.mockImplementation(async (id, body) => ({ ...server, subscribed: body.subscribed, version: server.version + 1 }))
  saveCalendarProgress.mockImplementation(async (id, body) => { server = { ...server, ...body, version: server.version + 1 }; return server })
})
afterEach(() => { if (dialog._state.visible) dialog._cancel(); wrapper?.unmount(); vi.useRealTimers() })

it.each(['title', 'note', 'completion', 'TODO name', 'TODO check', 'blank TODO', 'delete TODO'])('%s shows unsaved immediately and reverting restores the semantic baseline', async field => {
  // Missing manual_completed is a real legacy record, not just a property order change.
  await render(); await button('编辑备忘').trigger('click')
  expect(status()).toBe('已保存')
  if (field === 'title') await title().setValue('改名')
  if (field === 'note') await wrapper.get('textarea').setValue('新备注')
  if (field === 'completion') await wrapper.get('.calendar-completion-row input').setValue(true)
  if (field === 'TODO name') await wrapper.get('.calendar-check-row input[type=text]').setValue('新待办')
  if (field === 'TODO check') await wrapper.get('.calendar-check-target input').setValue(true)
  if (field === 'blank TODO') await button('添加待办').trigger('click')
  if (field === 'delete TODO') { await button('删除').trigger('click'); await settle(true) }
  expect(status()).toBe('有未保存修改')
  expect(button('保存备忘').element.disabled).toBe(false)
  if (field === 'title') await title().setValue('原始标题')
  if (field === 'note') await wrapper.get('textarea').setValue('原始备注')
  if (field === 'completion') await wrapper.get('.calendar-completion-row input').setValue(false)
  if (field === 'TODO name') await wrapper.get('.calendar-check-row input[type=text]').setValue('第一项')
  if (field === 'TODO check') await wrapper.get('.calendar-check-target input').setValue(false)
  if (field === 'blank TODO') { await wrapper.findAll('.calendar-check-row button')[1].trigger('click'); await settle(true) }
  if (field !== 'delete TODO') {
    expect(status()).toBe('已保存'); expect(button('保存备忘').element.disabled).toBe(true)
    await button('收起备忘').trigger('click'); expect(dialog._state.visible).toBe(false)
  }
})

const queries = [
  { scope: 'mine' }, { view: 'timeline' }, { view: 'month' }, { date: '2026-11-01' },
  { game: '代号鸢' }, { category: 'SHOP' }, { status: 'upcoming' }, { exclude_recruitment: '1' },
  { scope: 'mine', pending: '1' },
]
it.each(queries)('route %j cancels before URL/filter/editor change, then confirmed navigation proceeds once', async patch => {
  await render(); await edit()
  const before = router.currentRoute.value.fullPath
  title().element.focus()
  const navigation = router.replace({ query: { ...router.currentRoute.value.query, ...patch } })
  await flushPromises()
  expect(dialog._state.title).toBe('还有未保存的备忘修改')
  expect(document.activeElement.textContent).toBe('继续编辑')
  expect(router.currentRoute.value.fullPath).toBe(before)
  await settle(); await navigation
  expect(router.currentRoute.value.fullPath).toBe(before)
  expect(title().element.value).toBe('草稿标题')
  expect(document.activeElement).toBe(title().element)
  const confirmed = router.replace({ query: { ...router.currentRoute.value.query, ...patch } }); await flushPromises(); await settle(true); await confirmed
  expect(router.currentRoute.value.query).toMatchObject(patch)
  expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('clean close, view/filter changes and leaving have no prompt; opening filters while dirty is harmless', async () => {
  await render(); await button('编辑备忘').trigger('click'); await button('收起备忘').trigger('click')
  await button('月历').trigger('click'); await flushPromises()
  await router.replace({ query: { ...router.currentRoute.value.query, status: 'ongoing' } }); await flushPromises()
  expect(dialog._state.visible).toBe(false)
  await edit(); await wrapper.get('.calendar-filter-trigger').trigger('click'); await flushPromises()
  expect(dialog._state.visible).toBe(false); expect(title().element.value).toBe('草稿标题')
  document.querySelector('.calendar-filter-sheet-header button').click(); await flushPromises()
  const leave = router.push('/other'); await flushPromises(); await settle(); await leave
  expect(router.currentRoute.value.path).toBe('/calendar')
  const leaveAgain = router.push('/other'); await flushPromises(); await settle(true); await leaveAgain
  expect(router.currentRoute.value.path).toBe('/other')
})

it('collapse cancellation via Esc returns focus; discard collapses without server writes', async () => {
  await render(); await edit()
  const trigger = button('收起备忘'); trigger.element.focus(); await trigger.trigger('click'); await flushPromises()
  expect(document.activeElement.textContent).toBe('继续编辑')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(document.activeElement).toBe(trigger.element); expect(title().element.value).toBe('草稿标题')
  await trigger.trigger('click'); await flushPromises(); await settle(true)
  expect(wrapper.find('.calendar-checklist').exists()).toBe(false)
  expect(server.memo_title).toBe('原始标题'); expect(saveCalendarProgress).not.toHaveBeenCalled()
})

it('global account changes are held before resetting drafts; normal switcher does not prompt twice', async () => {
  await render('&scope=mine'); await edit()
  activeAccount.set('b'); await flushPromises()
  expect(activeAccount.id).toBe('a'); expect(title().element.value).toBe('草稿标题')
  await settle(); expect(activeAccount.id).toBe('a')
  activeAccount.set('b'); await flushPromises(); await settle(true)
  expect(activeAccount.id).toBe('b'); expect(wrapper.text()).toContain('B的备忘')
  await edit()
  await wrapper.getComponent(AccountSwitcher).get('.context-selector').trigger('click'); await flushPromises()
  document.querySelector('[data-account-id="a"]').click(); await flushPromises()
  expect(dialog._state.visible).toBe(true); await settle(true)
  expect(activeAccount.id).toBe('a'); expect(dialog._state.visible).toBe(false)
})

it.each(['logout', 'permission', 'identity', 'account removed', 'account game changed'])('%s bypasses discard confirmation and clears private drafts', async change => {
  await render('&scope=mine'); await edit()
  if (change === 'logout') auth.isLoggedIn = false
  if (change === 'permission') auth.isAdmin = false
  if (change === 'identity') auth.userInfo = { id: 'other-user' }
  if (change === 'account removed') publishAccountList([accounts[1]])
  if (change === 'account game changed') publishAccountList([{ ...accounts[0], game: '代号鸢' }, accounts[1]])
  await flushPromises()
  expect(dialog._state.visible).toBe(false)
  expect(wrapper.find('.calendar-checklist').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('草稿标题')
  expect(wrapper.text()).toContain('未保存的备忘已清除')
})

it('account metadata refresh preserves editing; inactive pending consent cannot switch a new identity', async () => {
  await render('&scope=mine'); await edit()
  publishAccountList(accounts.map(account => ({ ...account, name: account.name + '更新' }))); await flushPromises()
  expect(title().element.value).toBe('草稿标题'); expect(dialog._state.visible).toBe(false)
  activeAccount.set('b'); await flushPromises()
  auth.userInfo = { id: 'new-user' }; await flushPromises(); await settle(true)
  expect(activeAccount.id).toBe('a'); expect(wrapper.text()).not.toContain('草稿标题')
})

it.each([409, 500, 400, undefined])('save failure %s retains draft and warns until explicit refresh acceptance', async code => {
  await render(); await edit()
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('失败'), { status: code }))
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(status()).toBe('未保存，修改仍在此页面'); expect(title().element.value).toBe('草稿标题')
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true)
  if (code !== 400) {
    await button('读取最新状态').trigger('click'); await flushPromises(); await settle()
    expect(title().element.value).toBe('草稿标题')
    await button('读取最新状态').trigger('click'); await flushPromises(); await settle(true)
    expect(title().element.value).toBe('原始标题'); expect(status()).toBe('已保存')
  }
})

it('pending save stays unsaved, ignores double submit, then server success removes unload protection', async () => {
  await render(); await edit()
  const late = deferred(); saveCalendarProgress.mockReturnValueOnce(late.promise)
  await wrapper.get('form').trigger('submit'); await wrapper.get('form').trigger('submit')
  expect(status()).toBe('保存中…'); expect(saveCalendarProgress).toHaveBeenCalledTimes(1)
  late.resolve({ ...server, memo_title: '草稿标题', version: 2 }); await flushPromises()
  expect(status()).toBe('已保存')
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(false)
  await router.push('/other'); await flushPromises(); expect(dialog._state.visible).toBe(false)
})

it.each(['月历', '时间轴', '日程'])('late public refresh cannot unmount the dirty %s editor', async view => {
  await render(); await button(view).trigger('click'); await flushPromises()
  if (view === '时间轴') { await wrapper.get('.calendar-timeline-bar').trigger('click'); await flushPromises() }
  const late = deferred(); listActivityCalendar.mockReturnValueOnce(late.promise)
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  await edit(); late.resolve({ items: [] }); await flushPromises()
  expect(title().element.value).toBe('草稿标题'); expect(status()).toBe('有未保存修改')
  const reads = listActivityCalendar.mock.calls.length
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledTimes(reads + 1)
  expect(wrapper.find('.calendar-checklist').exists()).toBe(true)
})

it('rapid competing leave actions use one dialog and cannot also unsubscribe', async () => {
  await render(); await edit()
  await button('收起备忘').trigger('click'); await flushPromises()
  await button('取消订阅').trigger('click'); await button('收起备忘').trigger('click'); await flushPromises()
  expect(dialog._state.visible).toBe(true)
  await settle(true)
  expect(wrapper.find('form').exists()).toBe(false); expect(setCalendarSubscription).not.toHaveBeenCalled()
})

it.each(['取消订阅', '收起备忘'])('%s cancellation preserves current memo; consent only affects this activity', async action => {
  await render('&scope=mine'); await edit()
  await button(action).trigger('click'); await flushPromises(); await settle()
  expect(title().element.value).toBe('草稿标题'); expect(setCalendarSubscription).not.toHaveBeenCalled()
  await button(action).trigger('click'); await flushPromises(); await settle(true)
  expect(wrapper.find('form').exists()).toBe(false)
  expect(server.memo_title).toBe('原始标题')
  if (action === '取消订阅') expect(setCalendarSubscription).toHaveBeenCalledTimes(1)
})

it('back/forward cancellation and clearing filters keep exact URL and draft until consent', async () => {
  await render('&category=ACTIVITY')
  await router.push({ query: { view: 'agenda', status: 'ongoing', category: 'ACTIVITY' } }); await flushPromises(); await edit()
  const original = router.currentRoute.value.fullPath
  router.back(); await flushPromises(); await settle()
  expect(router.currentRoute.value.fullPath).toBe(original); expect(title().element.value).toBe('草稿标题')
  await wrapper.get('.calendar-filter-clear').trigger('click'); await flushPromises(); await settle()
  expect(router.currentRoute.value.fullPath).toBe(original); expect(title().element.value).toBe('草稿标题')
  router.back(); await flushPromises(); await settle(true)
  expect(router.currentRoute.value.query.status).toBeUndefined()
  await edit(); const backUrl = router.currentRoute.value.fullPath
  router.forward(); await flushPromises(); await settle()
  expect(router.currentRoute.value.fullPath).toBe(backUrl); expect(title().element.value).toBe('草稿标题')
})

it('timeline detail switching and closing wait for explicit discard', async () => {
  const other = { ...event, id: 'other', title: '另一期活动' }
  listActivityCalendar.mockResolvedValue({ items: [event, other] })
  await render(); await button('时间轴').trigger('click'); await flushPromises()
  await wrapper.findAll('.calendar-timeline-bar')[0].trigger('click'); await flushPromises(); await edit()
  await wrapper.findAll('.calendar-timeline-bar')[1].trigger('click'); await flushPromises(); await settle()
  expect(title().element.value).toBe('草稿标题')
  await button('关闭详情').trigger('click'); await flushPromises(); await settle()
  expect(title().element.value).toBe('草稿标题')
  await wrapper.findAll('.calendar-timeline-bar')[1].trigger('click'); await flushPromises(); await settle(true)
  expect(wrapper.get('#calendar-timeline-detail').text()).toContain('另一期活动'); expect(wrapper.find('form').exists()).toBe(false)
})

it('a late refresh read never replaces an already open leave confirmation', async () => {
  await render(); await edit()
  saveCalendarProgress.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await wrapper.get('form').trigger('submit'); await flushPromises()
  const late = deferred(); getCalendarSubscription.mockReturnValueOnce(late.promise)
  await button('读取最新状态').trigger('click'); await flushPromises()
  const leave = router.push('/other'); await flushPromises()
  late.resolve(server); await flushPromises()
  expect(dialog._state.title).toBe('还有未保存的备忘修改')
  await settle(); await leave
  expect(router.currentRoute.value.path).toBe('/calendar'); expect(title().element.value).toBe('草稿标题')
})

it('saving one activity does not overwrite a different dirty activity or its completion', async () => {
  const other = { ...event, id: 'second', title: '另一活动' }
  const otherRecord = { ...server, event_id: 'second', item: other, manual_completed: true, memo_title: '另一备忘' }
  listActivityCalendar.mockResolvedValue({ items: [event, other] })
  listCalendarSubscriptions.mockImplementation(async () => ({ items: [server, otherRecord], subscribed_count: 2 }))
  await render()
  for (const toggle of wrapper.findAll('button').filter(node => node.text() === '编辑备忘')) await toggle.trigger('click')
  const titles = wrapper.findAll('[aria-label="备忘标题"]')
  await titles[0].setValue('第一个草稿'); await titles[1].setValue('第二个草稿')
  await wrapper.findAll('textarea')[1].setValue('第二个备注')
  await wrapper.findAll('form')[0].trigger('submit'); await flushPromises()
  expect(wrapper.findAll('[aria-label="备忘标题"]')[1].element.value).toBe('第二个草稿')
  expect(wrapper.findAll('textarea')[1].element.value).toBe('第二个备注')
  expect(wrapper.findAll('.calendar-completion-row input')[1].element.checked).toBe(true)
  expect(wrapper.findAll('.calendar-memo-status')[1].text()).toBe('有未保存修改')
})

it('an invalid initial selection can choose its first valid account without a discard prompt', async () => {
  activeAccount.set('missing'); await render('&scope=mine')
  expect(listCalendarSubscriptions).not.toHaveBeenCalled()
  await wrapper.getComponent(AccountSwitcher).get('.context-selector').trigger('click'); await flushPromises()
  document.querySelector('[data-account-id="a"]').click(); await flushPromises()
  expect(activeAccount.id).toBe('a'); expect(dialog._state.visible).toBe(false)
  expect(button('编辑备忘')).toBeDefined()
})

it('account re-read preserves the editor and cannot resurrect an account removed by a newer list update', async () => {
  await render('&scope=mine'); await edit()
  const state = wrapper.findComponent(Calendar).vm.$.setupState.subscriptions
  const late = deferred(); listAccounts.mockReturnValueOnce(late.promise)
  const reread = state.loadAccounts(); await flushPromises()
  expect(title().element.value).toBe('草稿标题')
  publishAccountList([accounts[1]]); await flushPromises()
  late.resolve(accounts); await reread; await flushPromises()
  expect(state.account.value).toBeNull()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).toContain('未保存的备忘已清除')
})

it('canceling the pending-only checkbox restores its DOM state as well as the URL', async () => {
  await render('&scope=mine'); await edit()
  const pending = wrapper.get('.calendar-subscription-toolbar input[type=checkbox]')
  await pending.setValue(true); await flushPromises(); await settle()
  expect(router.currentRoute.value.query.pending).toBeUndefined()
  expect(pending.element.checked).toBe(false)
  expect(title().element.value).toBe('草稿标题')
  await pending.setValue(true); await flushPromises(); await settle(true)
  expect(router.currentRoute.value.query.pending).toBe('1')
  expect(pending.element.checked).toBe(true)
  expect(wrapper.find('form').exists()).toBe(false)
})
