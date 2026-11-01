import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Calendar from '../src/pages/calendar/index.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'
import { listCalendarSubscriptions, getCalendarSubscription, setCalendarSubscription, saveCalendarProgress } from '../src/api/activityCalendarSubscriptions.js'
import { createCalendarPrivateItem, deleteCalendarPrivateItem, getCalendarPrivateItem, listCalendarPrivateItems, updateCalendarPrivateItem } from '../src/api/calendarPrivateItems.js'
import { dialog } from '../src/utils/dialog.js'
import { installViewport } from '../test-support/viewport.js'
import { CALENDAR_PRIVATE_ITEMS_UPDATED } from '../src/data/calendarPrivateItems.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, isAdmin: false, userInfo: { id: 'owner' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
vi.mock('../src/api/activityCalendarSubscriptions.js', () => ({ listCalendarSubscriptions: vi.fn(), getCalendarSubscription: vi.fn(), setCalendarSubscription: vi.fn(), saveCalendarProgress: vi.fn() }))
vi.mock('../src/api/calendarPrivateItems.js', () => ({ createCalendarPrivateItem: vi.fn(), deleteCalendarPrivateItem: vi.fn(), getCalendarPrivateItem: vi.fn(), listCalendarPrivateItems: vi.fn(), updateCalendarPrivateItem: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn(), choose: vi.fn() } }))
const event = { id: 'official', source_type: 'MANUAL', game: '如鸢', title: '官方活动', category: 'ACTIVITY', start_date: '2026-10-10', end_date: '2026-10-20' }
const raw = (patch = {}) => ({ id: 'pci_00000000-0000-0000-0000-000000000001', account_id: 'a', game: '如鸢', title: '私人内容', date: '2026-10-15', time: null, note: '', version: 0, created_at: '2026-10-10T04:00:00Z', updated_at: '2026-10-10T04:00:00Z', ...patch })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
let wrapper, rows
const button = text => new DOMWrapper(document.body).findAll('button').find(node => node.text() === text)
const editor = () => document.querySelector('.calendar-private-dialog')
it.each([390, 1440])('真实日历私人事项跨布局保持未保存文本、日期及焦点：%ipx', async width => {
  const viewport = installViewport(width)
  await render(undefined, true, true); await button('添加私人事项').trigger('click'); await flushPromises()
  await field('title', '尚未保存的私人事项'); await field('start_date', '2026-10-16'); await field('note', '私密草稿')
  const instance = wrapper.getComponent({ name: 'CalendarPrivateItemEditor' }).vm.$
  const input = document.querySelector('#private-item-title-input'); input.focus()
  const reads = [listCalendarPrivateItems.mock.calls.length, listCalendarSubscriptions.mock.calls.length]
  for (const next of [767, 768, 1080, 1081, 320, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.getComponent({ name: 'CalendarPrivateItemEditor' }).vm.$).toBe(instance)
    expect(document.querySelectorAll('.calendar-private-dialog')).toHaveLength(1)
    expect(input.value).toBe('尚未保存的私人事项')
    expect(document.querySelector('#private-item-start_date').value).toBe('2026-10-16')
    expect(document.querySelector('#private-item-note').value).toBe('私密草稿')
    expect(document.activeElement).toBe(input)
    expect([listCalendarPrivateItems.mock.calls.length, listCalendarSubscriptions.mock.calls.length]).toEqual(reads)
    expect(createCalendarPrivateItem).not.toHaveBeenCalled()
    expect(updateCalendarPrivateItem).not.toHaveBeenCalled()
  }
})
async function field(name, value) {
  const input = document.querySelector(name === 'title' ? '#private-item-title-input' : '#private-item-' + name)
  input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises()
}
async function save() { editor().querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises() }
async function render(query = 'scope=mine&view=month&date=2026-10-15', openDetails = true, teleport = false) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: Calendar }, { path: '/away', component: { template: '<p>离开</p>' } }] })
  await router.push('/calendar?' + query); await router.isReady()
  wrapper = mount({ template: '<router-view />' }, { attachTo: document.body, global: { plugins: [router], stubs: { Teleport: !teleport, IslandSidebar: true, SiteFooter: true } } })
  await flushPromises()
  // Existing CRUD cases explicitly enter the day popup before exercising its controls.
  if (openDetails && wrapper.find('.calendar-month-day[aria-pressed=true]').exists()) await openSelectedDay()
  return router
}
async function openSelectedDay() { await wrapper.get('.calendar-month-day[aria-pressed=true]').trigger('click'); await flushPromises() }
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-10T04:00:00Z'))
  const media = new EventTarget(); media.matches = false; vi.stubGlobal('matchMedia', vi.fn(() => media))
  auth.isLoggedIn = true; auth.isAdmin = false; auth.userInfo = { id: 'owner' }; activeAccount.set('a')
  listAccounts.mockResolvedValue([{ id: 'a', name: '大号', game: '如鸢' }, { id: 'b', name: '小号', game: '代号鸢' }])
  listActivityCalendar.mockResolvedValue({ items: [event] })
  listCalendarSubscriptions.mockResolvedValue({ items: [{ event_id: event.id, subscribed: true, completed: false, version: 0, checklist: [], item: event }], unavailable_items: [], subscribed_count: 1 })
  rows = []
  listCalendarPrivateItems.mockImplementation(async ({ account_id }) => ({ items: rows.filter(row => row.account_id === account_id) }))
  createCalendarPrivateItem.mockImplementation(async body => { const result = raw(body); rows.push(result); return result })
  updateCalendarPrivateItem.mockImplementation(async (id, body) => { const result = raw({ ...body, id, version: body.expected_version + 1 }); rows = [result]; return result })
  deleteCalendarPrivateItem.mockImplementation(async id => { rows = rows.filter(row => row.id !== id); return true })
  getCalendarPrivateItem.mockImplementation(async id => rows.find(row => row.id === id))
  dialog.confirm.mockResolvedValue(true)
})
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; document.body.removeAttribute('style'); document.documentElement.removeAttribute('style'); vi.useRealTimers() })

it('selected date creation saves without navigation; single time persists and public counts exclude it', async () => {
  const router = await render()
  const path = router.currentRoute.value.fullPath
  expect(editor()).toBeNull()
  await button('记一件事').trigger('click'); await flushPromises()
  expect(document.querySelector('#private-item-start_date').value).toBe('2026-10-15')
  expect(document.activeElement).toBe(document.querySelector('#private-item-title-input'))
  await field('title', '  领取奖励  '); await field('time', '23:59'); await field('note', '纯文本\n说明')
  await save()
  expect(createCalendarPrivateItem).toHaveBeenCalledWith({ account_id: 'a', title: '领取奖励', start_date: '2026-10-15', end_date: '2026-10-15', time: '23:59', note: '纯文本\n说明', recurrence: 'NONE', reminder_on: 'START', reminder_days_before: 0 }, 'owner')
  expect(editor()).toBeNull()
  expect(wrapper.text()).toContain('领取奖励')
  expect(wrapper.text()).toContain('23:59（上海时间）')
  expect(wrapper.text()).toContain('仅自己可见')
  expect(router.currentRoute.value.fullPath).toBe(path)
  expect(wrapper.get('.calendar-today').text()).toContain('1')
  expect(setCalendarSubscription).not.toHaveBeenCalled(); expect(saveCalendarProgress).not.toHaveBeenCalled()
  wrapper.unmount(); await render()
  expect(wrapper.text()).toContain('领取奖励')
})

it.each(['agenda', 'timeline', 'month'])('private and official items coexist in %s with independent controls', async view => {
  rows = [raw()]
  await render(`scope=mine&view=${view}&date=2026-10-15&ref=keep`)
  expect(wrapper.text()).toContain('私人内容'); expect(wrapper.text()).toContain('官方活动')
  if (view === 'timeline') { await wrapper.get('.calendar-timeline-bar[aria-label^="私人内容"]').trigger('click'); await flushPromises() }
  const privateCard = wrapper.get(`.calendar-event[data-event-id="${rows[0].id}"]`)
  expect(privateCard.text()).toContain('仅自己可见')
  expect(privateCard.text()).not.toContain('手工整理')
  expect(privateCard.text()).not.toContain('编辑待办')
  expect(privateCard.text()).not.toContain('今天结束')
  expect(privateCard.findAll('button').map(node => node.text())).toEqual(['编辑事项', '删除事项'])
  if (view === 'month') expect(wrapper.get('.calendar-month-day[aria-pressed=true]').attributes('aria-label')).toContain('2项事项')
  if (view === 'timeline') expect(wrapper.findAll('.calendar-timeline-bar')).toHaveLength(2)
})

it.each(['month', 'timeline'])('%s reminder link opens only its item, closing clears intent and the same link opens again', async view => {
  vi.setSystemTime(new Date('2026-10-15T04:00:00Z'))
  rows = [raw()]
  const router = await render(`scope=mine&view=${view}&date=2026-10-15`, false)
  expect(wrapper.find('.calendar-detail-dialog').exists()).toBe(false)
  const link = async () => { await router.replace({ query: { ...router.currentRoute.value.query, event: rows[0].id } }); await flushPromises() }
  await link()
  expect(wrapper.findAll('.calendar-detail-dialog article')).toHaveLength(1)
  expect(wrapper.get('.calendar-detail-dialog article').attributes('data-event-id')).toBe(rows[0].id)
  expect(document.activeElement.id).toBe('calendar-detail-title')
  await wrapper.get('button[aria-label="关闭日历详情"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.event).toBeUndefined()
  expect(wrapper.find('.calendar-detail-dialog').exists()).toBe(false)
  await link(); expect(wrapper.find('.calendar-detail-dialog').exists()).toBe(true)
  await router.replace({ query: { ...router.currentRoute.value.query, ref: 'another-query' } }); await flushPromises()
  expect(wrapper.find('.calendar-detail-dialog').exists()).toBe(false)
  if (view === 'month') await openSelectedDay()
  else { await wrapper.get('.calendar-timeline-bar[aria-label^="私人内容"]').trigger('click'); await flushPromises() }
  if (view === 'month') expect(router.currentRoute.value.query.event).toBeUndefined()
  expect(wrapper.findAll('.calendar-detail-dialog article')).toHaveLength(view === 'month' ? 2 : 1)
  expect(wrapper.find('.calendar-day-detail').exists()).toBe(false)
})

it.each(['month', 'timeline'])('%s private editing hides detail, cancellation returns focus and save updates the same detail', async view => {
  rows = [raw()]; await render(`scope=mine&view=${view}&date=2026-10-15`, true, true)
  const page = new DOMWrapper(document.body)
  if (view === 'timeline') { await page.get('.calendar-timeline-bar[aria-label^="私人内容"]').trigger('click'); await flushPromises() }
  const trigger = button('编辑事项'); trigger.element.focus()
  await trigger.trigger('click'); await flushPromises()
  expect(page.get('.calendar-detail-mask').isVisible()).toBe(false)
  expect(page.get('.calendar-detail-mask').attributes('inert')).toBeDefined()
  expect(editor()).not.toBeNull()
  editor().querySelector('header button').click(); await flushPromises()
  expect(page.get('.calendar-detail-mask').isVisible()).toBe(true)
  expect(document.activeElement).toBe(trigger.element)
  await trigger.trigger('click'); await flushPromises(); await field('title', '更新后的事项'); await save()
  expect(page.get('.calendar-detail-dialog').text()).toContain('更新后的事项')
  expect(editor()).toBeNull()
  expect(document.body.style.overflow).toBe('hidden')
  await page.get('button[aria-label="关闭日历详情"]').trigger('click'); await flushPromises()
  expect(document.body.style.overflow).toBe('')
})

it('public scope never reads private items; completed/category/time filters explain private exclusion while todo retains them', async () => {
  rows = [raw()]
  const router = await render('view=month&date=2026-10-15')
  expect(listCalendarPrivateItems).not.toHaveBeenCalled(); expect(wrapper.text()).not.toContain('私人内容')
  expect(button('添加私人事项')).toBeUndefined()
  await button('我的日历').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.scope).toBe('mine'); expect(wrapper.text()).toContain('私人内容')
  for (const patch of [{ category: 'ACTIVITY' }, { status: 'ongoing' }, { task: 'completed' }]) {
    await router.replace({ query: { scope: 'mine', view: 'month', date: '2026-10-15', ...patch } }); await flushPromises()
    expect(wrapper.text()).not.toContain('私人内容'); expect(wrapper.text()).toContain('私人事项已隐藏')
  }
  await router.replace({ query: { scope: 'mine', view: 'month', date: '2026-10-15', pending: '1' } }); await flushPromises()
  expect(wrapper.text()).toContain('私人内容')
  await router.replace({ query: { scope: 'mine', view: 'month', date: '2026-10-15', exclude_recruitment: '1' } }); await flushPromises()
  expect(wrapper.text()).toContain('私人内容')
})

it('network/409 failures retain drafts; reload requires discard consent and update carries version', async () => {
  rows = [raw({ start_date: '2026-10-12', end_date: '2026-10-20' })]; await render()
  await button('编辑事项').trigger('click'); await flushPromises(); await field('title', '我的修改'); await field('end_date', '2026-10-21')
  updateCalendarPrivateItem.mockRejectedValueOnce(new Error('offline'))
  await save(); expect(editor().textContent).toContain('offline'); expect(document.querySelector('#private-item-title-input').value).toBe('我的修改')
  updateCalendarPrivateItem.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await save(); expect(editor().textContent).toContain('草稿仍保留')
  expect(document.querySelector('#private-item-end_date').value).toBe('2026-10-21')
  dialog.confirm.mockResolvedValueOnce(false)
  editor().querySelector('form > button').click(); await flushPromises()
  expect(getCalendarPrivateItem).not.toHaveBeenCalled()
  rows = [raw({ title: '服务器更新', start_date: '2026-10-12', end_date: '2026-10-22', version: 2 })]
  editor().querySelector('form > button').click(); await flushPromises()
  expect(document.querySelector('#private-item-title-input').value).toBe('服务器更新')
  expect(document.querySelector('#private-item-end_date').value).toBe('2026-10-22')
  await field('title', '重试成功'); await save()
  expect(updateCalendarPrivateItem.mock.lastCall[1].expected_version).toBe(2)
  expect(wrapper.text()).toContain('重试成功')
})

it('unsaved cancel preserves editing on close date view account and route changes; confirmed leave discards', async () => {
  const router = await render(); await button('添加私人事项').trigger('click'); await flushPromises(); await field('title', '未保存')
  dialog.confirm.mockResolvedValue(false)
  editor().querySelector('header button').click(); await flushPromises(); expect(editor()).not.toBeNull()
  const path = router.currentRoute.value.fullPath
  await router.replace('/calendar?scope=mine&view=agenda&date=2026-10-16'); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(path); expect(document.querySelector('#private-item-title-input').value).toBe('未保存')
  activeAccount.set('b'); await flushPromises(); expect(activeAccount.id).toBe('a')
  await router.push('/away'); await flushPromises(); expect(router.currentRoute.value.fullPath).toBe(path)
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true)
  dialog.confirm.mockResolvedValue(true)
  await router.replace('/calendar?scope=mine&view=agenda'); await flushPromises(); expect(editor()).toBeNull()
})

it('save is single flight; failed delete keeps contents and cancel sends no delete', async () => {
  await render(); await button('添加私人事项').trigger('click'); await flushPromises(); await field('title', '唯一提交')
  const write = deferred(); createCalendarPrivateItem.mockReturnValueOnce(write.promise)
  await save(); await save(); expect(createCalendarPrivateItem).toHaveBeenCalledTimes(1)
  expect(editor().querySelector('button[type=submit]').disabled).toBe(true)
  write.resolve(raw({ title: '唯一提交' })); await flushPromises()
  dialog.confirm.mockResolvedValueOnce(false); await button('删除事项').trigger('click'); await flushPromises()
  expect(deleteCalendarPrivateItem).not.toHaveBeenCalled()
  deleteCalendarPrivateItem.mockRejectedValueOnce(new Error('offline'))
  await button('删除事项').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('offline')
  await button('重试').trigger('click'); await flushPromises()
  rows = [raw()]; await vi.advanceTimersByTimeAsync(1100); await routerRefresh()
  await button('删除事项').trigger('click'); await flushPromises()
  expect(deleteCalendarPrivateItem).toHaveBeenCalledWith(raw().id, 'a', 0, 'owner', undefined)
  expect(wrapper.text()).toContain('私人事项已删除')
})
async function routerRefresh() { document.dispatchEvent(new Event('visibilitychange')); await flushPromises() }

it('A→B→A late reads and saves cannot populate another account or the new A context', async () => {
  const late = deferred(); listCalendarPrivateItems.mockReturnValueOnce(late.promise)
  await render()
  activeAccount.set('b'); await flushPromises(); activeAccount.set('a'); await flushPromises()
  late.resolve({ items: [raw({ title: '旧A内容' })] }); await flushPromises(); expect(wrapper.text()).not.toContain('旧A内容')
  await button('添加私人事项').trigger('click'); await flushPromises(); await field('title', '旧保存')
  const write = deferred(); createCalendarPrivateItem.mockReturnValueOnce(write.promise); await save()
  activeAccount.set('b'); await flushPromises(); activeAccount.set('a'); await flushPromises()
  write.resolve(raw({ title: '旧保存' })); await flushPromises()
  expect(wrapper.text()).not.toContain('旧保存'); expect(editor()).toBeNull()
})

it.each(['month', 'timeline'].flatMap(view => ['logout', 'identity', 'account'].map(reason => [view, reason])))('%s %s loss clears private data and draft immediately', async (view, reason) => {
  rows = [raw()]; await render(`scope=mine&view=${view}&date=2026-10-15`)
  if (view === 'timeline') { await wrapper.get('.calendar-timeline-bar[aria-label^="私人内容"]').trigger('click'); await flushPromises() }
  await button('编辑事项').trigger('click'); await flushPromises(); await field('title', '秘密草稿')
  if (reason === 'logout') { auth.isLoggedIn = false; auth.userInfo = null }
  else if (reason === 'identity') { listAccounts.mockResolvedValue([]); auth.userInfo = { id: 'other-owner' } }
  else activeAccount.set('missing')
  await flushPromises()
  expect(editor()).toBeNull(); expect(wrapper.text()).not.toContain('私人内容'); expect(wrapper.text()).not.toContain('秘密草稿')
  expect(wrapper.find('.calendar-detail-dialog').exists()).toBe(false)
})

it('empty account prevents requests and explicitly guides account creation', async () => {
  listAccounts.mockResolvedValue([]); await render()
  expect(listCalendarPrivateItems).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('选择或新建游戏账号')
  expect(button('添加私人事项').attributes('disabled')).toBeDefined()
})

it('403 during save clears confidential draft instead of retaining it under invalid permissions', async () => {
  await render(); await button('添加私人事项').trigger('click'); await flushPromises(); await field('title', '秘密草稿')
  createCalendarPrivateItem.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }))
  await save(); expect(editor()).toBeNull(); expect(wrapper.text()).toContain('已失效'); expect(wrapper.text()).not.toContain('秘密草稿')
})

it('saving outside the current month preserves URL and explicitly explains where to find the item', async () => {
  const router = await render(); const path = router.currentRoute.value.fullPath
  await button('添加私人事项').trigger('click'); await flushPromises()
  await field('title', '明年备忘'); await field('start_date', '2027-01-15'); await save()
  expect(router.currentRoute.value.fullPath).toBe(path)
  expect(wrapper.text()).toContain('2027-01-15')
  expect(wrapper.text()).toContain('该区间不在当前日期范围')
  expect(wrapper.findAll('.calendar-event').some(card => card.text().includes('明年备忘'))).toBe(false)
  await router.replace('/calendar?scope=mine&view=month&date=2027-01-15'); await flushPromises()
  expect(wrapper.text()).toContain('明年备忘')
})

it('invalid content focuses a linked error summary and does not send a write', async () => {
  await render(); await button('添加私人事项').trigger('click'); await flushPromises(); await save()
  expect(createCalendarPrivateItem).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(editor().querySelector('[tabindex="-1"][role="alert"]'))
  editor().querySelector('[role=alert] a').click(); await flushPromises()
  expect(document.activeElement).toBe(document.querySelector('#private-item-title-input'))
  await field('title', '文'.repeat(101)); await save()
  expect(createCalendarPrivateItem).not.toHaveBeenCalled()
})

it('delete confirmation from A cannot send a request after switching to B and back', async () => {
  rows = [raw()]; await render()
  const confirm = deferred(); dialog.confirm.mockReturnValueOnce(confirm.promise)
  await button('删除事项').trigger('click'); await flushPromises()
  activeAccount.set('b'); await flushPromises(); activeAccount.set('a'); await flushPromises()
  confirm.resolve(true); await flushPromises()
  expect(deleteCalendarPrivateItem).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('私人内容')
})


it('new defaults follow a later start until the user edits end; invalid combinations stay inline and unsaved', async () => {
  await render(); await button('添加私人事项').trigger('click'); await flushPromises()
  await field('title', '连续计划')
  expect(document.querySelector('#private-item-end_date').value).toBe('2026-10-15')
  await field('start_date', '2026-10-18')
  expect(document.querySelector('#private-item-end_date').value).toBe('2026-10-18')
  await field('end_date', '2026-10-20'); await field('start_date', '2026-10-21')
  expect(document.querySelector('#private-item-end_date').value).toBe('2026-10-20')
  expect(editor().textContent).toContain('结束日期不能早于开始日期')
  expect(editor().querySelector('button[type=submit]').disabled).toBe(true)
  await save(); expect(createCalendarPrivateItem).not.toHaveBeenCalled()
  await field('start_date', '2026-10-12'); await field('end_date', '2026-10-15'); await save()
  expect(createCalendarPrivateItem.mock.lastCall[0]).toMatchObject({ start_date: '2026-10-12', end_date: '2026-10-15' })
  expect(wrapper.text()).toContain('2026-10-12 — 2026-10-15')
})

it('legacy edit expands, adjusts, refreshes and collapses a range while retaining time and note', async () => {
  rows = [raw({ time: '23:59', note: '保留说明' })]
  await render()
  await button('编辑事项').trigger('click'); await flushPromises()
  expect(document.querySelector('#private-item-end_date').value).toBe('2026-10-15')
  await field('end_date', '2026-10-20'); await save()
  expect(updateCalendarPrivateItem.mock.lastCall[1]).toMatchObject({ start_date: '2026-10-15', end_date: '2026-10-20', time: '23:59', note: '保留说明', expected_version: 0 })
  wrapper.unmount(); await render()
  await button('编辑事项').trigger('click'); await flushPromises()
  expect(document.querySelector('#private-item-end_date').value).toBe('2026-10-20')
  await field('start_date', '2026-10-21')
  expect(document.querySelector('#private-item-end_date').value).toBe('2026-10-20')
  expect(editor().querySelector('button[type=submit]').disabled).toBe(true)
  await field('start_date', '2026-10-12'); await field('end_date', '2026-10-18'); await save()
  expect(updateCalendarPrivateItem.mock.lastCall[1]).toMatchObject({ start_date: '2026-10-12', end_date: '2026-10-18', expected_version: 1 })
  await button('编辑事项').trigger('click'); await flushPromises(); await field('end_date', '2026-10-12'); await save()
  expect(rows[0]).toMatchObject({ start_date: '2026-10-12', end_date: '2026-10-12', time: '23:59', note: '保留说明', version: 3 })
  // The selected date is now outside the saved single-day range.
  await wrapper.findComponent(Calendar).vm.$router.replace('/calendar?scope=mine&view=month&date=2026-10-12'); await flushPromises(); await openSelectedDay()
  await button('删除事项').trigger('click'); await flushPromises()
  expect(rows).toHaveLength(0); expect(wrapper.findAll('.calendar-event').some(card => card.text().includes('私人内容'))).toBe(false)
})

it('new reminders default today; target/advance persist and legacy editing does not auto-enable', async () => {
  const notification = vi.spyOn(window, 'dispatchEvent')
  await render(); await button('添加私人事项').trigger('click'); await flushPromises()
  expect(document.querySelector('#private-item-reminder_on').value).toBe('START')
  expect(document.querySelector('#private-item-reminder_days_before').value).toBe('0')
  await field('title', '截止前提醒')
  for (const [fieldName, value] of [['reminder_on', 'END'], ['reminder_days_before', '1']]) {
    const select = document.querySelector('#private-item-' + fieldName)
    select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await flushPromises()
  }
  await save()
  expect(createCalendarPrivateItem.mock.lastCall[0]).toMatchObject({ reminder_on: 'END', reminder_days_before: 1 })
  expect(notification.mock.calls.filter(([event]) => event.type === CALENDAR_PRIVATE_ITEMS_UPDATED).map(([event]) => event.detail)).toEqual([{ userId: 'owner', accountId: 'a' }])
  await button('编辑事项').trigger('click'); await flushPromises()
  expect(document.querySelector('#private-item-reminder_on').value).toBe('END')
  expect(document.querySelector('#private-item-reminder_days_before').value).toBe('1')
  const select = document.querySelector('#private-item-reminder_on')
  select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); await flushPromises()
  expect(document.querySelector('#private-item-reminder_days_before')).toBeNull()
  await save(); expect(updateCalendarPrivateItem.mock.lastCall[1].reminder_on).toBeNull()
  wrapper.unmount(); rows = [raw()]; await render()
  await button('编辑事项').trigger('click'); await flushPromises()
  expect(document.querySelector('#private-item-reminder_on').value).toBe('')
  await field('title', '旧事项改名'); await save()
  expect(updateCalendarPrivateItem.mock.lastCall[1]).toMatchObject({ reminder_on: null, reminder_days_before: 0 })
})

it('cross-month private range marks each covered day, clips a single bar, groups once and stays private', async () => {
  rows = [raw({ start_date: '2026-09-01', end_date: '2026-11-20', time: '09:00' })]
  const router = await render()
  for (const day of wrapper.findAll('.calendar-month-day')) {
    const date = day.attributes('aria-label')
    expect(date).toMatch(/[12]项事项/)
    expect(day.attributes('aria-label')).toContain('私人事项')
  }
  expect(wrapper.text()).toContain('开始日 09:00')
  await router.replace('/calendar?scope=mine&view=month&date=2026-11-15'); await flushPromises()
  expect(wrapper.text()).toContain('私人内容')
  expect(listCalendarPrivateItems.mock.lastCall[0]).toMatchObject({ from: '2026-10-26', to: '2026-12-06' })
  await router.replace('/calendar?scope=mine&view=timeline&date=2026-10-15'); await flushPromises()
  const bars = wrapper.findAll('.calendar-timeline-bar[aria-label^="私人内容"]')
  expect(bars).toHaveLength(1); expect(bars[0].attributes('style')).toContain('span 35')
  expect(bars[0].classes()).toContain('is-clipped-start'); expect(bars[0].classes()).toContain('is-clipped-end')
  expect(bars[0].classes()).not.toContain('is-single-day')
  await router.replace('/calendar?scope=mine&view=agenda'); await flushPromises()
  expect(wrapper.findAll('.calendar-event').filter(card => card.text().includes('私人内容'))).toHaveLength(1)
  expect(wrapper.text()).toContain('日期范围内'); expect(wrapper.text()).not.toContain('开始日 09:00（上海时间） · 还有')
  await router.replace('/calendar?view=agenda'); await flushPromises()
  expect(wrapper.text()).not.toContain('私人内容')
})

it('range starting outside the window remains visible immediately after save when its end overlaps', async () => {
  await render(); await button('添加私人事项').trigger('click'); await flushPromises()
  await field('title', '延续计划'); await field('start_date', '2026-09-01'); await field('end_date', '2026-11-20'); await save()
  expect(wrapper.findAll('.calendar-event').some(card => card.text().includes('延续计划'))).toBe(true)
  expect(wrapper.text()).not.toContain('该区间不在当前日期范围')
})

it('monthly shortcuts preserve custom text, save recurrence and edit the original series', async () => {
  await render()
  await button('记一件事').trigger('click'); await flushPromises()
  await field('title', '我的自定义内容')
  await button('招募商店').trigger('click'); await flushPromises()
  expect(document.querySelector('#private-item-title-input').value).toBe('我的自定义内容')
  await button('保留原文').trigger('click'); await flushPromises()
  await button('月度提醒').trigger('click'); await flushPromises()
  await field('start_date', '2026-10-31'); await field('end_date', '2026-11-02')
  expect(editor().textContent).toContain('当月最后一天')
  createCalendarPrivateItem.mockImplementationOnce(async body => {
    const result = raw({ ...body, series_start_date: body.start_date, series_end_date: body.end_date })
    rows.push({ ...result, occurrence_date: body.start_date })
    return result
  })
  await save()
  expect(createCalendarPrivateItem.mock.lastCall[0]).toMatchObject({ title: '我的自定义内容', recurrence: 'MONTHLY', start_date: '2026-10-31', end_date: '2026-11-02' })
  expect(editor()).toBeNull()
})

it('monthly instance deletion persists the occurrence date and series deletion requires confirmation', async () => {
  rows = [raw({ recurrence: 'MONTHLY', series_start_date: '2026-09-15', series_end_date: '2026-09-15', occurrence_date: '2026-10-15' })]
  await render()
  dialog.choose.mockResolvedValueOnce({ value: 'occurrence' })
  await button('删除事项').trigger('click'); await flushPromises()
  expect(deleteCalendarPrivateItem).toHaveBeenCalledWith(rows[0]?.id || raw().id, 'a', 0, 'owner', '2026-10-15')
  expect(dialog.confirm).not.toHaveBeenCalled()
})

it('editing a later monthly occurrence edits original dates and warns about the whole series', async () => {
  rows = [raw({ recurrence: 'MONTHLY', series_start_date: '2026-01-31', series_end_date: '2026-02-02', start_date: '2026-10-31', end_date: '2026-11-02', occurrence_date: '2026-10-31' })]
  await render('scope=mine&view=month&date=2026-10-31')
  await button('编辑事项').trigger('click'); await flushPromises()
  expect(document.querySelector('#private-item-start_date').value).toBe('2026-01-31')
  expect(document.querySelector('#private-item-end_date').value).toBe('2026-02-02')
  expect(editor().textContent).toContain('整个重复系列')
  updateCalendarPrivateItem.mockResolvedValueOnce(raw({ recurrence: 'MONTHLY', start_date: '2026-01-31', end_date: '2026-02-02', series_start_date: '2026-01-31', series_end_date: '2026-02-02', version: 1 }))
  await field('title', '修改所有月份'); await save()
  expect(updateCalendarPrivateItem.mock.lastCall).toEqual([raw().id, expect.objectContaining({ title: '修改所有月份', recurrence: 'MONTHLY', start_date: '2026-01-31', expected_version: 0 }), 'owner'])
  expect(editor()).toBeNull()
})

it('deleting a whole monthly series waits for explicit confirmation and sends no occurrence date', async () => {
  rows = [raw({ recurrence: 'MONTHLY', series_start_date: '2026-09-15', series_end_date: '2026-09-15', occurrence_date: '2026-10-15' })]
  await render()
  dialog.choose.mockResolvedValue({ value: 'series' })
  dialog.confirm.mockResolvedValueOnce(false)
  await button('删除事项').trigger('click'); await flushPromises()
  expect(deleteCalendarPrivateItem).not.toHaveBeenCalled()
  expect(dialog.confirm.mock.lastCall[0].message).toContain('所有月份')
  await button('删除事项').trigger('click'); await flushPromises()
  expect(deleteCalendarPrivateItem).toHaveBeenCalledWith(raw().id, 'a', 0, 'owner', undefined)
})

it('saved public game preference never overrides the current private account game', async () => {
  localStorage.setItem('yuanhub.activity-calendar.game.v1', '代号鸢')
  await render('scope=mine&game=代号鸢&view=month&date=2026-10-15')
  expect(listCalendarPrivateItems.mock.lastCall[0].account_id).toBe('a')
  expect(listCalendarSubscriptions.mock.lastCall[0].account_id).toBe('a')
  expect(wrapper.find('.calendar-game-memory').exists()).toBe(false)
  localStorage.removeItem('yuanhub.activity-calendar.game.v1')
})
