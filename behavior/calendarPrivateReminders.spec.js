import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import CalendarReminderDialog from '../src/components/calendar/CalendarReminderDialog.vue'
import { modalFocusState, useModalFocus } from '../src/composables/useModalFocus.js'
import { auth } from '../src/store/auth.js'
import { beta } from '../src/store/beta.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { publishAccountList } from '../src/store/accountList.js'
import { listAccounts } from '../src/api/accounts.js'
import { listCalendarPrivateItems } from '../src/api/calendarPrivateItems.js'
import { CALENDAR_PRIVATE_ITEMS_UPDATED } from '../src/data/calendarPrivateItems.js'
import { reminderStorageKey } from '../src/data/calendarPrivateReminders.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, userInfo: { id: '' } }) }))
vi.mock('../src/store/beta.js', async () => ({ beta: (await import('vue')).reactive({ canUseBetaFeatures: true, userId: '' }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/calendarPrivateItems.js', () => ({ listCalendarPrivateItems: vi.fn() }))

let wrapper, owner, sequence = 0, rows
const raw = (patch = {}) => ({
  id: 'pci_00000000-0000-0000-0000-000000000001', account_id: 'a', game: '如鸢', title: '私人计划',
  start_date: '2026-10-15', end_date: '2026-10-15', time: '23:59', note: '', version: 0,
  reminder_on: 'START', reminder_days_before: 0, ...patch,
})
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const updated = (detail = { userId: owner, accountId: 'a' }) => window.dispatchEvent(new CustomEvent(CALENDAR_PRIVATE_ITEMS_UPDATED, { detail }))
async function render(teleport = false) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: { template: '<p>日历</p>' } }, { path: '/other', component: { template: '<p>其他页面</p>' } }] })
  await router.push('/other'); await router.isReady()
  wrapper = mount(CalendarReminderDialog, { attachTo: document.body, global: { plugins: [router], stubs: { Teleport: !teleport } } })
  await flushPromises()
  return router
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T04:00:00Z'))
  owner = `reminder-owner-${++sequence}`
  auth.isLoggedIn = true; auth.userInfo = { id: owner }; beta.userId = owner; beta.canUseBetaFeatures = true
  activeAccount.set('a'); rows = [raw()]
  listAccounts.mockResolvedValue([{ id: 'a', game: '如鸢', name: '大号' }, { id: 'b', game: '代号鸢', name: '小号' }])
  listCalendarPrivateItems.mockImplementation(async ({ account_id }) => ({ items: rows.filter(item => item.account_id === account_id) }))
})
afterEach(() => { wrapper?.unmount(); wrapper = null })

it('groups every due item into linked cards and acknowledges only the current batch', async () => {
  rows = Array.from({ length: 4 }, (_, index) => raw({ id: `pci_00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`, title: `计划${index + 1}` }))
  Object.assign(rows[0], { end_date: '2026-10-16', reminder_on: 'END', reminder_days_before: 1 })
  Object.assign(rows[1], { reminder_on: 'END' })
  Object.assign(rows[2], { start_date: '2026-10-16', end_date: '2026-10-16', reminder_days_before: 1 })
  rows[3].title = 'https://example.com/' + 'long-title/'.repeat(7)
  rows.push(raw({ id: 'pci_00000000-0000-0000-0000-000000000005', title: '关闭的提醒', reminder_on: null }))
  await render()
  expect(listAccounts).toHaveBeenCalledWith(owner)
  expect(listCalendarPrivateItems).toHaveBeenCalledWith({ account_id: 'a', from: '2026-10-15', to: '2026-10-16' }, owner)
  expect(wrapper.get('h2').text()).toBe('今天有 4 项提醒')
  expect(wrapper.get('.calendar-reminder-account').text()).toBe('如鸢 · 大号')
  expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
  expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  expect(wrapper.findAll('li')).toHaveLength(4)
  expect(wrapper.findAll('.calendar-reminder-group').map(node => node.attributes('aria-label'))).toEqual(['今天开始', '今天截止', '明天开始', '明天截止'])
  expect(wrapper.get('.calendar-reminder-card-title').attributes('title')).toBe(rows[3].title)
  expect(wrapper.get('a').attributes('aria-label')).toContain(rows[3].title)
  expect(wrapper.text()).not.toContain('关闭的提醒')
  expect(wrapper.get('a').attributes('href')).toContain('view=month')
  expect(wrapper.get('a').attributes('href')).toContain('scope=mine')
  expect(wrapper.get('a').attributes('href')).toContain('date=2026-10-15')
  expect(wrapper.get('a').attributes('href')).toContain('event=pci_')
  await wrapper.findAll('button').find(node => node.text() === '今天已知悉').trigger('click')
  expect(wrapper.find('section').exists()).toBe(false)
  const state = JSON.parse(localStorage.getItem(reminderStorageKey(owner, 'a')))
  expect(state.day).toBe('2026-10-15'); expect(state.keys).toHaveLength(4)
  expect(JSON.stringify(state)).not.toContain('计划')
  wrapper.unmount(); await render()
  expect(wrapper.find('section').exists()).toBe(false)
  rows.push(raw({ id: 'pci_00000000-0000-0000-0000-000000000006', title: '新事项' }))
  updated(); await flushPromises()
  expect(wrapper.text()).toContain('新事项'); expect(wrapper.text()).not.toContain('计划1')
})

it.each(['logout', 'beta', 'identity', 'account'])('%s does not read personal APIs and clears existing reminders synchronously', async reason => {
  await render(); expect(wrapper.text()).toContain('私人计划')
  const calls = listCalendarPrivateItems.mock.calls.length
  if (reason === 'logout') auth.isLoggedIn = false
  if (reason === 'beta') beta.canUseBetaFeatures = false
  if (reason === 'identity') auth.userInfo = { id: 'different-user' }
  if (reason === 'account') activeAccount.set('')
  await flushPromises()
  expect(wrapper.text()).not.toContain('私人计划')
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(calls)
  wrapper.unmount(); await render()
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(calls)
})

it('deleted or missing accounts never read private data; canonical game comes from the account response', async () => {
  listAccounts.mockResolvedValueOnce([])
  await render(); expect(listCalendarPrivateItems).not.toHaveBeenCalled()
  activeAccount.setGame('代号鸢', 'a')
  publishAccountList([{ id: 'a', game: '如鸢', name: '大号' }]); await flushPromises()
  expect(wrapper.text()).toContain('如鸢 · 大号')
})

it('late A reads cannot populate B or a new A session, including logout and unmount', async () => {
  const late = deferred(); listCalendarPrivateItems.mockReturnValueOnce(late.promise)
  await render()
  activeAccount.set('b'); await flushPromises()
  activeAccount.set('a'); await flushPromises()
  late.resolve({ items: [raw({ title: '过时A内容' })] }); await flushPromises()
  expect(wrapper.text()).toContain('私人计划'); expect(wrapper.text()).not.toContain('过时A内容')
  const lateAccounts = deferred(); listAccounts.mockReturnValueOnce(lateAccounts.promise)
  updated(); await flushPromises(); auth.isLoggedIn = false; await flushPromises()
  const calls = listCalendarPrivateItems.mock.calls.length
  lateAccounts.resolve([{ id: 'a', game: '如鸢' }]); await flushPromises()
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(calls)
  auth.isLoggedIn = true; await flushPromises()
  const final = deferred(); listCalendarPrivateItems.mockReturnValueOnce(final.promise)
  updated(); await flushPromises(); wrapper.unmount()
  final.resolve({ items: [raw()] }); await flushPromises()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['稍后提醒', '今天已知悉'])('%s on the day before does not suppress day-of reminders; midnight refreshes without interval polling', async action => {
  rows = [raw({ start_date: '2026-10-01', end_date: '2026-10-16', reminder_on: 'END', reminder_days_before: 1 })]
  await render(); expect(wrapper.text()).toContain('明天截止')
  expect(wrapper.get('a').attributes('href')).toContain('date=2026-10-16')
  await wrapper.findAll('button').find(node => node.text() === action).trigger('click')
  const calls = listCalendarPrivateItems.mock.calls.length
  await vi.advanceTimersByTimeAsync(60000); expect(listCalendarPrivateItems).toHaveBeenCalledTimes(calls)
  vi.setSystemTime(new Date('2026-10-15T15:59:59Z'))
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  await vi.advanceTimersByTimeAsync(1100); await flushPromises()
  expect(wrapper.text()).toContain('今天截止')
  expect(listCalendarPrivateItems.mock.lastCall[0]).toMatchObject({ from: '2026-10-16', to: '2026-10-17' })
})

it('visibility/pageshow coalesce, foreign updates are ignored and listeners stop after unmount', async () => {
  await render()
  let calls = listAccounts.mock.calls.length
  updated({ userId: 'other', accountId: 'a' }); updated({ userId: owner, accountId: 'b' }); await flushPromises()
  expect(listAccounts).toHaveBeenCalledTimes(calls)
  document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(listAccounts).toHaveBeenCalledTimes(++calls)
  wrapper.unmount()
  await vi.advanceTimersByTimeAsync(1100)
  document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); updated(); await flushPromises()
  expect(listAccounts).toHaveBeenCalledTimes(calls); expect(vi.getTimerCount()).toBe(0)
})

it('network/malformed failures clear stale content and offer retry; permission loss clears silently', async () => {
  await render()
  listCalendarPrivateItems.mockRejectedValueOnce(new Error('offline'))
  updated(); await flushPromises()
  expect(wrapper.text()).not.toContain('私人计划'); expect(wrapper.text()).toContain('暂时无法读取')
  await wrapper.findAll('button').find(node => node.text() === '重试读取提醒').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('私人计划')
  listCalendarPrivateItems.mockResolvedValueOnce({ items: [raw({ account_id: 'other' })] })
  updated(); await flushPromises(); expect(wrapper.text()).toContain('暂时无法读取')
  listCalendarPrivateItems.mockRejectedValueOnce(Object.assign(new Error('denied'), { status: 403 }))
  await wrapper.findAll('button').find(node => node.text() === '重试读取提醒').trigger('click'); await flushPromises()
  expect(wrapper.find('section').exists()).toBe(false)
  const calls = listCalendarPrivateItems.mock.calls.length
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(calls)
})

it('an in-flight read crossing Shanghai midnight cannot show yesterday reminders', async () => {
  const late = deferred(); listCalendarPrivateItems.mockReturnValueOnce(late.promise)
  await render()
  vi.setSystemTime(new Date('2026-10-15T16:01:00Z'))
  rows = [raw({ start_date: '2026-10-16', end_date: '2026-10-16', title: '新日事项' })]
  late.resolve({ items: [raw({ title: '昨日事项' })] }); await flushPromises()
  expect(wrapper.text()).not.toContain('昨日事项'); expect(wrapper.text()).toContain('新日事项')
  expect(listCalendarPrivateItems.mock.lastCall[0]).toMatchObject({ from: '2026-10-16', to: '2026-10-17' })
})

it('a noncritical reminder read error can be closed without marking any item dismissed', async () => {
  listCalendarPrivateItems.mockRejectedValueOnce(new Error('offline'))
  await render()
  expect(wrapper.findAll('button').some(node => node.text() === '今天已知悉')).toBe(false)
  await wrapper.get('button[aria-label="关闭私人日历提醒"]').trigger('click')
  expect(wrapper.find('section').exists()).toBe(false)
  expect(localStorage.getItem(reminderStorageKey(owner, 'a'))).toBeNull()
  expect(sessionStorage.getItem(reminderStorageKey(owner, 'a'))).toBeNull()
})

it.each(['稍后提醒', '今天已知悉'])('same-browser tabs share daily acknowledgement, and %s survives storage failure and remount', async action => {
  await render()
  const key = reminderStorageKey(owner, 'a')
  const reminderKey = JSON.stringify([rows[0].id, 'START', '2026-10-15', 0])
  localStorage.setItem(key, JSON.stringify({ day: '2026-10-15', keys: [reminderKey] }))
  window.dispatchEvent(new StorageEvent('storage', { key })); await flushPromises()
  expect(wrapper.find('section').exists()).toBe(false)
  rows = [raw({ id: 'pci_00000000-0000-0000-0000-000000000002' })]
  updated(); await flushPromises()
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  await wrapper.findAll('button').find(node => node.text() === action).trigger('click')
  wrapper.unmount(); await render()
  expect(wrapper.find('section').exists()).toBe(false)
  write.mockRestore()
})

it.each(['close', 'snooze', 'escape', 'backdrop', 'link'])('%s snoozes this batch for the tab session, including remount, without acknowledging or completing items', async action => {
  await render()
  if (action === 'close') await wrapper.get('button[aria-label="关闭私人日历提醒"]').trigger('click')
  if (action === 'snooze') await wrapper.findAll('button').find(node => node.text() === '稍后提醒').trigger('click')
  if (action === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  if (action === 'backdrop') await wrapper.get('.calendar-reminder-mask').trigger('click')
  if (action === 'link') await wrapper.get('a').trigger('click')
  await flushPromises()
  const key = reminderStorageKey(owner, 'a')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(localStorage.getItem(key)).toBeNull()
  expect(JSON.parse(sessionStorage.getItem(key))).toEqual({ day: '2026-10-15', keys: [JSON.stringify([rows[0].id, 'START', '2026-10-15', 0])] })
  expect(rows).toEqual([raw()])
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  wrapper.unmount(); await render()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})

it('acknowledgement keeps title edits hidden, but changed schedules and new reminders still appear', async () => {
  await render()
  await wrapper.findAll('button').find(node => node.text() === '今天已知悉').trigger('click')
  const key = reminderStorageKey(owner, 'a')
  expect(JSON.parse(localStorage.getItem(key)).keys).toHaveLength(1)
  expect(sessionStorage.getItem(key)).toBeNull()
  rows[0].title = '修改标题'; rows[0].version++
  updated(); await flushPromises()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  rows[0].reminder_on = 'END'
  updated(); await flushPromises()
  expect(wrapper.text()).toContain('今天截止')
  expect(wrapper.text()).toContain('修改标题')
  await wrapper.findAll('button').find(node => node.text() === '今天已知悉').trigger('click')
  expect(JSON.parse(localStorage.getItem(key)).keys).toHaveLength(2)
  wrapper.unmount(); await render()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})

it('legacy implicit close state is ignored and snoozing A does not hide B or a new A reminder', async () => {
  const key = reminderStorageKey(owner, 'a')
  localStorage.setItem(key.replace('.v2:', '.v1:'), JSON.stringify({ day: '2026-10-15', keys: [JSON.stringify([rows[0].id, 'START', '2026-10-15', 0])] }))
  rows.push(raw({ account_id: 'b', game: '代号鸢', title: 'B事项' }))
  await render(); expect(wrapper.text()).toContain('私人计划')
  await wrapper.get('button[aria-label="关闭私人日历提醒"]').trigger('click')
  expect(localStorage.getItem(key)).toBeNull()
  activeAccount.set('b'); await flushPromises()
  expect(wrapper.text()).toContain('B事项'); expect(wrapper.text()).not.toContain('私人计划')
  activeAccount.set('a'); await flushPromises()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  rows.push(raw({ id: 'pci_00000000-0000-0000-0000-000000000002', title: '新增提醒' }))
  updated(); await flushPromises()
  expect(wrapper.text()).toContain('今天有 1 项提醒')
  expect(wrapper.text()).toContain('新增提醒'); expect(wrapper.text()).not.toContain('私人计划')
})

it('refresh preserves focused actions, and an in-flight result cannot reopen a just-closed dialog', async () => {
  await render()
  const snooze = wrapper.findAll('button').find(node => node.text() === '稍后提醒').element
  snooze.focus(); updated(); await flushPromises()
  expect(wrapper.findAll('button').find(node => node.text() === '稍后提醒').element).toBe(snooze)
  expect(document.activeElement).toBe(snooze)
  const late = deferred(); listCalendarPrivateItems.mockReturnValueOnce(late.promise)
  updated(); await flushPromises()
  await wrapper.get('button[aria-label="关闭私人日历提醒"]').trigger('click')
  rows = [raw({ id: 'pci_00000000-0000-0000-0000-000000000002', title: '迟到的新事项' })]
  late.resolve({ items: rows }); await flushPromises()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(localStorage.getItem(reminderStorageKey(owner, 'a'))).toBeNull()
  await vi.advanceTimersByTimeAsync(1100)
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(wrapper.text()).toContain('迟到的新事项')
})

it('real Teleport dialog traps Tab, Escape restores focus and body scrolling, and unmount cleans up', async () => {
  const opener = document.createElement('button'); opener.textContent = '原入口'; document.body.append(opener); opener.focus()
  const restoreFocus = vi.spyOn(opener, 'focus')
  const previous = document.body.style.overflow
  await render(true)
  const panel = document.querySelector('[role="dialog"]')
  expect(panel.closest('.calendar-reminder-mask').parentElement).toBe(document.body)
  expect(document.activeElement.textContent).toBe('稍后提醒')
  expect(document.body.style.overflow).toBe('hidden')
  panel.querySelector('.calendar-reminder-primary').focus()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement.getAttribute('aria-label')).toBe('关闭私人日历提醒')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  expect(document.activeElement.textContent).toBe('今天已知悉')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(opener); expect(document.body.style.overflow).toBe(previous)
  expect(restoreFocus).toHaveBeenLastCalledWith({ preventScroll: true })
  rows.push(raw({ id: 'pci_00000000-0000-0000-0000-000000000002', title: '第二批提醒' }))
  updated(); await flushPromises()
  expect(document.body.style.overflow).toBe('hidden')
  wrapper.unmount(); await flushPromises()
  expect(document.body.style.overflow).toBe(previous); expect(modalFocusState.active).toBe(false)
})

it('opening a reminder item restores the previous focus without scrolling during calendar navigation', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus()
  const restoreFocus = vi.spyOn(opener, 'focus')
  const router = await render()
  await wrapper.get('a').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.event).toBe(rows[0].id)
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(document.activeElement).toBe(opener)
  expect(restoreFocus).toHaveBeenLastCalledWith({ preventScroll: true })
  expect(localStorage.getItem(reminderStorageKey(owner, 'a'))).toBeNull()
})

it('automatic reminders wait for an existing business modal and keep account changes read-only', async () => {
  const { ref } = await import('vue')
  const businessOpen = ref(true)
  const business = mount({
    setup() {
      const panel = ref(null)
      useModalFocus(businessOpen, panel, { initialFocus: () => panel.value, onEscape: () => { businessOpen.value = false } })
      return { businessOpen, panel }
    }, template: '<section v-if="businessOpen" ref="panel" tabindex="-1">编辑中的业务弹窗</section>',
  }, { attachTo: document.body })
  try {
    await flushPromises(); const focused = document.activeElement
    await render()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(focused)
    businessOpen.value = false; await flushPromises()
    expect(wrapper.text()).toContain('私人计划')
    activeAccount.set('b'); await flushPromises(); activeAccount.set('a'); await flushPromises()
    expect(wrapper.text()).toContain('私人计划')
    expect(sessionStorage.getItem(reminderStorageKey(owner, 'a'))).toBeNull()
    expect(localStorage.getItem(reminderStorageKey(owner, 'a'))).toBeNull()
  } finally { business.unmount() }
})
