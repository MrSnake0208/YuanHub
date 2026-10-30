import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import TodayTrainingDaily from '../src/components/today/TodayTrainingDaily.vue'
import { auth } from '../src/store/auth.js'
import * as api from '../src/api/operatorDailyTasks.js'
import { dialog } from '../src/utils/dialog.js'
import { dailyTrainingResponse, trainingItem } from '../test-support/todayTraining.js'

const events = vi.hoisted(() => new Set())
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: true, userInfo: { id: 'owner-a' } }) }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: listener => { events.add(listener); return () => events.delete(listener) } }))
vi.mock('../src/api/operatorDailyTasks.js', () => ({ getOperatorDailyTasks: vi.fn(), adoptOperatorDailyTasks: vi.fn(), completeOperatorDailyTask: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
let preview, todos, wrapper
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const publish = (event, data = {}) => events.forEach(listener => listener({ event, data: { account_id: 'a', plan_id: 'p', ...data } }))
const render = (props = {}) => (wrapper = mount(TodayTrainingDaily, { attachTo: document.body, props: { accountId: 'a', game: '如鸢', planId: 'p', planName: '自定义计划', previewTarget: preview, todosTarget: '#training-test-todos', ...props }, global: { stubs: { RouterLink: RouterLinkStub } } }))
const click = async element => { element.click(); await flushPromises() }
const source = dailyTrainingResponse().source
const adopted = overrides => dailyTrainingResponse({ version: 1, tasks: source.items, ...overrides })

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T00:00:00Z')); events.clear()
  auth.isLoggedIn = true; auth.userInfo = { id: 'owner-a' }
  api.getOperatorDailyTasks.mockImplementation(async (account, plan, date) => dailyTrainingResponse({ account, plan, date }))
  api.adoptOperatorDailyTasks.mockResolvedValue(adopted())
  dialog.confirm.mockResolvedValue(true)
  preview = document.createElement('div'); todos = document.createElement('div'); todos.id = 'training-test-todos'
  document.body.append(preview, todos)
})
afterEach(() => { wrapper?.unmount(); preview.remove(); todos.remove(); vi.useRealTimers() })

it('renders the saved rows and total, then adds once and collapses the source card', async () => {
  render(); await flushPromises()
  expect(preview.textContent).toContain('10 层'); expect(preview.textContent).toContain('12 层')
  expect(preview.querySelector('.daily-total').textContent).toContain('100')
  expect(todos.querySelector('section')).toBeNull()
  expect(api.adoptOperatorDailyTasks).not.toHaveBeenCalled()
  await click(preview.querySelector('.daily-adopt'))
  expect(api.adoptOperatorDailyTasks).toHaveBeenCalledWith('a', 'p', '2026-10-16', { expected_version: 0, expected_schedule_revision: 3 }, 'owner-a')
  expect(todos.querySelectorAll('input[type=checkbox]')).toHaveLength(2)
  expect(preview.querySelector('.daily-source-list')).toBeNull()
  expect(preview.querySelector('.daily-adopt').disabled).toBe(true)
  expect(preview.textContent).toContain('已加入 2 项历练待办')
  expect(document.activeElement).toBe(todos.querySelector('h2'))
  expect(wrapper.findComponent(RouterLinkStub).props('to')).toEqual({ path: '/operator', query: { tab: 'tracking' } })
})

it('checkbox waits for server confirmation and supports undo without touching source plans', async () => {
  api.getOperatorDailyTasks.mockResolvedValue(adopted())
  render(); await flushPromises()
  const feedback = preview.querySelector('.save-feedback-slot')
  expect(feedback).not.toBeNull()
  const pending = deferred()
  api.completeOperatorDailyTask.mockReturnValueOnce(pending.promise)
  await click(todos.querySelector('input'))
  expect(todos.querySelector('input').checked).toBe(false)
  expect(todos.querySelector('input').disabled).toBe(true)
  expect(preview.querySelector('.save-feedback-slot')).toBe(feedback)
  pending.resolve(adopted({ version: 2, tasks: [trainingItem(10, 1, 1), trainingItem(12, 4)] })); await flushPromises()
  expect(todos.querySelector('input').checked).toBe(true)
  expect(todos.querySelector('.daily-progress').textContent).toBe('1/2')
  expect(preview.querySelector('.save-feedback-slot')).toBe(feedback)
  api.completeOperatorDailyTask.mockResolvedValueOnce(adopted({ version: 3 }))
  await click(todos.querySelector('input'))
  expect(api.completeOperatorDailyTask).toHaveBeenLastCalledWith('a', 'p', '2026-10-16', 'ds-10', { expected_version: 2, completed: false }, 'owner-a')
  expect(todos.querySelector('input').checked).toBe(false)
  expect(api.adoptOperatorDailyTasks).not.toHaveBeenCalled()
})

it('explicit update preserves completed runs and displays only remaining runs', async () => {
  const items = [trainingItem(12, 4)]
  api.getOperatorDailyTasks.mockResolvedValue(adopted({ source: { ...source, revision: 4, items }, needs_update: true, tasks: [trainingItem(12, 1, 1)] }))
  api.adoptOperatorDailyTasks.mockResolvedValue(adopted({ version: 2, source: { ...source, revision: 4, items }, tasks: [trainingItem(12, 4, 1)] }))
  render(); await flushPromises()
  expect(preview.textContent).toContain('更新今日待办')
  await click(preview.querySelector('.daily-adopt'))
  expect(dialog.confirm).toHaveBeenCalledOnce()
  expect(todos.textContent).toContain('已完成 1 次，还需 3 次')
  expect(todos.textContent).toContain('60 体力')
  expect(todos.querySelector('input').checked).toBe(false)
})

it.each([409, 500])('a failed save (%s) blocks further changes until explicit reread', async status => {
  api.getOperatorDailyTasks.mockResolvedValue(adopted())
  api.completeOperatorDailyTask.mockRejectedValue(Object.assign(new Error('保存失败'), { status }))
  render(); await flushPromises(); await click(todos.querySelector('input'))
  expect(todos.textContent).toContain('保存失败')
  expect(todos.querySelector('input').checked).toBe(false)
  expect(todos.querySelector('input').disabled).toBe(true)
  publish('operator_training_tasks'); await vi.advanceTimersByTimeAsync(180)
  expect(api.getOperatorDailyTasks).toHaveBeenCalledTimes(1)
  await click(todos.querySelector('.daily-error button'))
  expect(todos.querySelector('input').disabled).toBe(false)
})

it.each(['no_schedule', 'no_day', 'invalid', 'needs_recalculation', 'unsupported'])('source %s has a clear non-actionable state', async status => {
  api.getOperatorDailyTasks.mockResolvedValue(dailyTrainingResponse({ source: { status, revision: 3, items: [] } }))
  render(); await flushPromises()
  expect(preview.querySelector('.daily-hint').textContent.length).toBeGreaterThan(5)
  expect(preview.querySelector('.daily-adopt')).toBeNull()
  expect(todos.querySelector('section')).toBeNull()
})

it('no training today is different from a missing or failed schedule', async () => {
  api.getOperatorDailyTasks.mockResolvedValue(dailyTrainingResponse({ source: { ...source, items: [] } }))
  render(); await flushPromises()
  expect(preview.textContent).toContain('今日无需刷取历练')
  expect(preview.querySelector('.daily-adopt')).toBeNull()
})

it('a new plan that exceeds the remaining daily attempts is visible but cannot be imported', async () => {
  api.getOperatorDailyTasks.mockResolvedValue(adopted({ needs_update: true, source: { ...source, status: 'daily_limit' } }))
  render(); await flushPromises()
  expect(preview.textContent).toContain('超过同类历练每日 6 次')
  expect(preview.querySelector('.daily-adopt').disabled).toBe(true)
  expect(todos.querySelector('input').disabled).toBe(false)
})

it('read errors never masquerade as empty or allow creation from stale data', async () => {
  api.getOperatorDailyTasks.mockRejectedValueOnce(new Error('网络错误'))
  render(); await flushPromises()
  expect(preview.textContent).toContain('网络错误')
  expect(preview.textContent).not.toContain('今日无需')
  await click(preview.querySelector('.daily-error button'))
  expect(preview.querySelector('.daily-adopt').disabled).toBe(false)
})

it('late A responses cannot overwrite B even when returning to A', async () => {
  const pending = deferred()
  api.getOperatorDailyTasks.mockReturnValueOnce(pending.promise)
  render(); await flushPromises()
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  await wrapper.setProps({ accountId: 'a' }); await flushPromises()
  pending.resolve(adopted()); await flushPromises()
  expect(preview.querySelector('.daily-adopt').textContent).toContain('加入今日待办')
  expect(preview.querySelector('.daily-adopt').disabled).toBe(false)
  expect(todos.querySelector('section')).toBeNull()
})

it.each(['account', 'plan', 'user', 'logout', 'unmount'])('late writes are discarded after changing %s', async change => {
  const pending = deferred()
  api.adoptOperatorDailyTasks.mockReturnValueOnce(pending.promise)
  render(); await flushPromises(); await click(preview.querySelector('.daily-adopt'))
  if (change === 'account') await wrapper.setProps({ accountId: 'b' })
  if (change === 'plan') await wrapper.setProps({ planId: 'other' })
  if (change === 'user') auth.userInfo = { id: 'owner-b' }
  if (change === 'logout') auth.isLoggedIn = false
  if (change === 'unmount') wrapper.unmount()
  await flushPromises(); pending.resolve(adopted()); await flushPromises()
  expect(todos.querySelector('section')).toBeNull()
  expect(preview.textContent).not.toContain('已加入 2 项')
})

it('a confirmation started on A cannot perform an import on B', async () => {
  const confirmation = deferred()
  api.getOperatorDailyTasks.mockResolvedValueOnce(adopted({ needs_update: true }))
  dialog.confirm.mockReturnValueOnce(confirmation.promise)
  render(); await flushPromises(); await click(preview.querySelector('.daily-adopt'))
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  confirmation.resolve(true); await flushPromises()
  expect(api.adoptOperatorDailyTasks).not.toHaveBeenCalled()
})

it('cross-device events refresh only the matching plan and changes during saves are reconciled', async () => {
  render(); await flushPromises()
  publish('operator_training_tasks', { account_id: 'other' }); publish('operator_training_tasks', { plan_id: 'other' })
  await vi.advanceTimersByTimeAsync(180)
  expect(api.getOperatorDailyTasks).toHaveBeenCalledOnce()
  api.getOperatorDailyTasks.mockResolvedValueOnce(adopted())
  publish('operator_training_tasks'); await vi.advanceTimersByTimeAsync(180); await flushPromises()
  expect(todos.querySelectorAll('input')).toHaveLength(2)
  const pending = deferred(); api.completeOperatorDailyTask.mockReturnValueOnce(pending.promise)
  await click(todos.querySelector('input'))
  publish('operator_stamina_schedule'); await vi.advanceTimersByTimeAsync(180)
  expect(api.getOperatorDailyTasks).toHaveBeenCalledTimes(2)
  pending.resolve(adopted({ version: 2, tasks: [trainingItem(10, 1, 1), trainingItem(12, 4)] }))
  api.getOperatorDailyTasks.mockResolvedValue(adopted({ version: 2, tasks: [trainingItem(10, 1, 1), trainingItem(12, 4)] }))
  await flushPromises(); await vi.advanceTimersByTimeAsync(180)
  expect(api.getOperatorDailyTasks).toHaveBeenCalledTimes(3)
})

it('Beijing 05:00 clears yesterday tasks and adopts nothing automatically', async () => {
  vi.setSystemTime(new Date('2026-10-15T20:59:59Z'))
  api.getOperatorDailyTasks.mockImplementation(async (account, plan, date) => date === '2026-10-15' ? adopted({ date }) : dailyTrainingResponse({ date }))
  render(); await flushPromises()
  expect(todos.querySelectorAll('input')).toHaveLength(2)
  await vi.advanceTimersByTimeAsync(1050); await flushPromises()
  expect(api.getOperatorDailyTasks).toHaveBeenLastCalledWith('a', 'p', '2026-10-16', 'owner-a')
  expect(todos.querySelector('section')).toBeNull()
  expect(api.adoptOperatorDailyTasks).not.toHaveBeenCalled()
})

it('preview and todo visibility are independent and permissions remove old data', async () => {
  api.getOperatorDailyTasks.mockResolvedValue(adopted())
  render(); await flushPromises()
  await wrapper.setProps({ previewTarget: null }); await flushPromises()
  expect(preview.textContent).toBe('')
  expect(todos.querySelectorAll('input')).toHaveLength(2)
  await wrapper.setProps({ previewTarget: preview, showTodos: false })
  expect(todos.querySelector('section')).toBeNull()
  expect(preview.textContent).toContain('首页待办已隐藏')
  api.getOperatorDailyTasks.mockRejectedValue(Object.assign(new Error('denied'), { status: 403 }))
  publish('account_stream_open'); await vi.advanceTimersByTimeAsync(180); await flushPromises()
  expect(preview.textContent).not.toContain('100')
  expect(preview.textContent).toContain('权限已失效')
})

it('rejects a response for the wrong account and blocks changes while the workspace refreshes', async () => {
  api.getOperatorDailyTasks.mockResolvedValueOnce(dailyTrainingResponse({ account: 'other' }))
  render(); await flushPromises()
  expect(preview.textContent).toContain('不匹配')
  await click(preview.querySelector('.daily-error button'))
  await wrapper.setProps({ contextReady: false })
  expect(preview.querySelector('.daily-adopt').disabled).toBe(true)
})

it('hidden training preview still exposes workspace errors and a retry in the todo region', async () => {
  api.getOperatorDailyTasks.mockResolvedValue(adopted())
  render(); await flushPromises()
  await wrapper.setProps({ previewTarget: null, contextReady: false, contextError: '清单暂时读取失败' })
  expect(todos.textContent).toContain('清单暂时读取失败')
  expect(todos.querySelector('input').disabled).toBe(true)
  await click(todos.querySelector('.daily-error button'))
  expect(wrapper.emitted('retry-context')).toHaveLength(1)
})

it('undoing the last retained completion restores focus to the planning link', async () => {
  const source = { status: 'ready', revision: 4, items: [] }
  api.getOperatorDailyTasks.mockResolvedValue(adopted({ source, tasks: [trainingItem(10, 0, 1)] }))
  api.completeOperatorDailyTask.mockResolvedValue(adopted({ version: 2, source, tasks: [] }))
  render(); await flushPromises()
  // RouterLinkStub omits the href that makes the real RouterLink focusable.
  preview.querySelector('.daily-details').href = '/operator?tab=tracking'
  const input = todos.querySelector('input'); input.focus(); await click(input)
  expect(todos.querySelector('section')).toBeNull()
  expect(document.activeElement).toBe(preview.querySelector('.daily-details'))
})


it('首次日程保存事件使未保存提示变为今日历练，不自动加入待办', async () => {
  api.getOperatorDailyTasks.mockResolvedValueOnce(dailyTrainingResponse({ source: { status: 'no_schedule', revision: 0, items: [] } }))
  render(); await flushPromises()
  expect(preview.textContent).toContain('尚未保存体力日程')
  publish('operator_stamina_schedule')
  await vi.advanceTimersByTimeAsync(180); await flushPromises()
  expect(api.getOperatorDailyTasks).toHaveBeenLastCalledWith('a', 'p', '2026-10-16', 'owner-a')
  expect(preview.textContent).not.toContain('尚未保存体力日程')
  expect(preview.querySelectorAll('.daily-source-row')).toHaveLength(2)
  expect(preview.querySelector('.daily-adopt').disabled).toBe(false)
  expect(api.adoptOperatorDailyTasks).not.toHaveBeenCalled()
})
