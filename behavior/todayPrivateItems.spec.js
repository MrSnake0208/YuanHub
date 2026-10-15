import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import TodayPrivateItems from '../src/components/today/TodayPrivateItems.vue'
import { auth } from '../src/store/auth.js'
import { listCalendarPrivateItems } from '../src/api/calendarPrivateItems.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, userInfo: { id: 'owner-a' } }) }))
vi.mock('../src/api/calendarPrivateItems.js', () => ({ listCalendarPrivateItems: vi.fn() }))
const record = (patch = {}) => ({ id: 'pci_00000000-0000-0000-0000-000000000001', account_id: 'a', game: '如鸢', title: '我的计划', date: '2026-10-15', time: null, note: '自己的备注', version: 0, ...patch })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const render = (props = { accountId: 'a', game: '如鸢' }) => mount(TodayPrivateItems, { attachTo: document.body, props, global: { stubs: { RouterLink: RouterLinkStub } } })
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T04:00:00Z'))
  auth.isLoggedIn = true; auth.userInfo = { id: 'owner-a' }
  listCalendarPrivateItems.mockResolvedValue({ items: [] })
})

it('shows complete plain-text notes, multi-day ranges and chronological links to my calendar', async () => {
  const note = '<img src=x onerror=alert(1)>\n' + '长备注'.repeat(250)
  listCalendarPrivateItems.mockResolvedValue({ items: [
    record({ id: 'pci_00000000-0000-0000-0000-000000000002', title: '未来事项', date: '2026-10-20' }),
    record({ title: '进行中', start_date: '2026-10-14', end_date: '2026-10-16', time: '08:30', note }),
    record({ id: 'pci_00000000-0000-0000-0000-000000000003', title: '已过期', date: '2026-10-14' }),
    record({ id: 'pci_00000000-0000-0000-0000-000000000004', title: '范围外', date: '2027-02-01' }),
  ] })
  const wrapper = render(); await flushPromises()
  expect(listCalendarPrivateItems).toHaveBeenCalledExactlyOnceWith({ account_id: 'a', from: '2026-10-15', to: '2027-01-13' }, 'owner-a')
  expect(wrapper.findAll('.private-title').map(node => node.text())).toEqual(['进行中', '未来事项'])
  expect(wrapper.get('.private-note').element.textContent).toBe(note)
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toContain('2026-10-14 — 2026-10-16 · 开始日 08:30（上海时间）')
  expect(wrapper.findAllComponents(RouterLinkStub)[1].props('to')).toEqual({ path: '/calendar', query: { scope: 'mine', task: 'todo', game: '如鸢', view: 'list', date: '2026-10-15', event: record().id } })
})

it('does not request private data without login or a selected account', async () => {
  const wrapper = render({ accountId: '', game: '如鸢' }); await flushPromises()
  expect(listCalendarPrivateItems).not.toHaveBeenCalled()
  auth.isLoggedIn = false
  await wrapper.setProps({ accountId: 'a' }); await flushPromises()
  expect(listCalendarPrivateItems).not.toHaveBeenCalled()
})

it('distinguishes failed reads from an empty list and allows retry', async () => {
  listCalendarPrivateItems.mockRejectedValueOnce(new Error('离线'))
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('离线')
  expect(wrapper.text()).not.toContain('还没有私人事项')
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(wrapper.find('[role=alert]').exists()).toBe(false)
  expect(wrapper.text()).toContain('还没有私人事项')
})

it.each(['account', 'identity', 'game', 'clear', 'logout', 'unmount'])('ignores late notes after %s changes', async change => {
  const pending = deferred()
  listCalendarPrivateItems.mockReturnValueOnce(pending.promise)
  const wrapper = render(); await flushPromises()
  listCalendarPrivateItems.mockResolvedValue({ items: [record({ account_id: change === 'account' ? 'b' : 'a', game: change === 'game' ? '代号鸢' : '如鸢', note: '新上下文备注' })] })
  if (change === 'account') await wrapper.setProps({ accountId: 'b' })
  if (change === 'identity') auth.userInfo = { id: 'owner-b' }
  if (change === 'game') await wrapper.setProps({ game: '代号鸢' })
  if (change === 'clear') await wrapper.setProps({ accountId: '' })
  if (change === 'logout') auth.isLoggedIn = false
  if (change === 'unmount') wrapper.unmount()
  await flushPromises()
  pending.resolve({ items: [record({ note: '旧账号秘密' })] }); await flushPromises()
  expect(document.body.textContent).not.toContain('旧账号秘密')
  if (['account', 'identity', 'game'].includes(change)) {
    expect(wrapper.text()).toContain('新上下文备注')
    expect(listCalendarPrivateItems.mock.lastCall[0].account_id).toBe(change === 'account' ? 'b' : 'a')
    expect(listCalendarPrivateItems.mock.lastCall[1]).toBe(change === 'identity' ? 'owner-b' : 'owner-a')
  }
  else expect(vi.getTimerCount()).toBe(0)
})

it('clears already visible notes immediately and ignores the old A request after A to B to A', async () => {
  listCalendarPrivateItems.mockResolvedValueOnce({ items: [record({ note: '旧备注' })] })
  const wrapper = render(); await flushPromises()
  const pending = deferred()
  listCalendarPrivateItems.mockReturnValueOnce(pending.promise)
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  await wrapper.setProps({ accountId: 'b' })
  expect(wrapper.text()).not.toContain('旧备注')
  listCalendarPrivateItems.mockResolvedValueOnce({ items: [record({ note: '最新A备注' })] })
  await wrapper.setProps({ accountId: 'a' }); await flushPromises()
  pending.resolve({ items: [record({ note: '过时A备注' })] }); await flushPromises()
  expect(wrapper.text()).toContain('最新A备注')
  expect(wrapper.text()).not.toContain('过时A备注')
})

it.each([{ account_id: 'b' }, { game: '代号鸢' }, { note: null }])('rejects invalid or foreign-account response %j', async patch => {
  listCalendarPrivateItems.mockResolvedValue({ items: [record(patch)] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('读取结果不完整')
  expect(wrapper.find('.private-list').exists()).toBe(false)
})

it.each([{}, { items: {} }])('rejects an incomplete private-item list %j', async response => {
  listCalendarPrivateItems.mockResolvedValue(response)
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('读取结果不完整')
  expect(wrapper.text()).not.toContain('还没有私人事项')
})

it.each([401, 403, 404])('clears cached private data on security failure %i and stops refreshing', async status => {
  listCalendarPrivateItems.mockResolvedValueOnce({ items: [record()] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain('自己的备注')
  listCalendarPrivateItems.mockRejectedValueOnce({ status, code: 'account_not_found' })
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('身份、权限或账号已失效')
  expect(wrapper.text()).not.toContain('自己的备注')
  expect(wrapper.find('button').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(1001)
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps last-read notes on ordinary refresh failure and labels them as stale', async () => {
  listCalendarPrivateItems.mockResolvedValueOnce({ items: [record()] })
  const wrapper = render(); await flushPromises()
  listCalendarPrivateItems.mockRejectedValueOnce(new Error('读取离线'))
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(wrapper.get('[role=alert]').text()).toContain('下方保留上次读取内容')
  expect(wrapper.get('.private-note').text()).toBe('自己的备注')
})

it('refreshes the date range at Shanghai midnight and releases timer and listeners on unmount', async () => {
  vi.setSystemTime(new Date('2026-10-15T15:59:59Z'))
  const wrapper = render(); await flushPromises()
  await vi.advanceTimersByTimeAsync(1150); await flushPromises()
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(2)
  expect(listCalendarPrivateItems.mock.lastCall[0].from).toBe('2026-10-16')
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
  window.dispatchEvent(new Event('pageshow')); await flushPromises()
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(2)
})

it('refreshes immediately if a slow read finishes after Shanghai midnight', async () => {
  vi.setSystemTime(new Date('2026-10-15T15:59:59Z'))
  const pending = deferred()
  listCalendarPrivateItems.mockReturnValueOnce(pending.promise)
  render(); await flushPromises()
  vi.setSystemTime(new Date('2026-10-15T16:00:01Z'))
  pending.resolve({ items: [] }); await flushPromises()
  await vi.advanceTimersByTimeAsync(1); await flushPromises()
  expect(listCalendarPrivateItems).toHaveBeenCalledTimes(2)
  expect(listCalendarPrivateItems.mock.lastCall[0].from).toBe('2026-10-16')
})
