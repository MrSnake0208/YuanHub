import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import Controls from '../src/components/calendar/CalendarSubscriptionControls.vue'
import { CALENDAR_SUBSCRIPTIONS } from '../src/data/activityCalendarSubscriptions.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn(), _state: { visible: false } } }))

const item = { id: 'event', title: '本期活动', game: '如鸢', start_date: '2026-10-01', end_date: '2026-10-30' }
let wrapper, record, context
const button = label => wrapper.findAll('button').find(node => node.text() === label)
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function render(variant = 'detail') {
  wrapper = mount(Controls, { props: { item, variant }, attachTo: document.body, global: { provide: { [CALENDAR_SUBSCRIPTIONS]: context } } })
  return wrapper
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T04:00:00Z'))
  dialog._state.visible = false; dialog.confirm.mockResolvedValue(true)
  record = ref({ event_id: item.id, subscribed: true, version: 0, completed: false, manual_completed: false, checklist: [] })
  context = {
    permitted: ref(true), account: ref({ id: 'a', game: '如鸢' }), key: ref('owner:a'), epoch: ref(0),
    now: ref(Date.now()), byId: computed(() => ({ [item.id]: record.value })), dirty: ref(false), loading: ref(false), error: ref(''),
    setDirty: vi.fn((id, value) => { context.dirty.value = value }), confirmDiscard: vi.fn(async () => false),
    subscribe: vi.fn(async (id, subscribed) => { record.value = { ...record.value, subscribed, version: record.value.version + 1 }; return record.value }),
    complete: vi.fn(async (id, version, completed) => { record.value = { ...record.value, completed, manual_completed: completed, version: version + 1 }; return record.value }),
    progress: vi.fn(async (id, version, draft) => { record.value = { ...record.value, checklist: draft.checklist, version: version + 1 }; return record.value }),
  }
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.useRealTimers() })

it('separates completion and todos; empty add focuses a new draft, saving checklist does not complete the activity', async () => {
  render()
  expect(wrapper.findAll('h3').map(node => node.text())).toEqual(['本期完成状态', '个人待办'])
  expect(wrapper.get('.calendar-completion-section').text()).not.toContain('暂无待办')
  expect(wrapper.get('.calendar-personal-todos').text()).toContain('暂无待办')
  expect(button('标记本期完成').classes()).toContain('calendar-completion-primary')
  expect(button('编辑待办')).toBeUndefined()
  await button('添加待办').trigger('click'); await flushPromises()
  const input = wrapper.get('.calendar-check-row input[type="text"]')
  expect(wrapper.findAll('.calendar-check-row')).toHaveLength(1)
  expect(document.activeElement).toBe(input.element)
  expect(context.dirty.value).toBe(true)
  expect(button('标记本期完成').element.disabled).toBe(true)
  expect(context.progress).not.toHaveBeenCalled()
  await input.setValue('完成任务')
  await wrapper.get('input[type="checkbox"]').setValue(true)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(context.progress).toHaveBeenCalledWith(item.id, 0, { checklist: [expect.objectContaining({ title: '完成任务', completed: true })] })
  expect(record.value.manual_completed).toBe(false)
  expect(wrapper.text()).toContain('待办全部完成')
  expect(context.complete).not.toHaveBeenCalled()
  await button('标记本期完成').trigger('click'); await flushPromises()
  expect(context.complete).toHaveBeenCalledWith(item.id, 1, true)
  expect(record.value.checklist[0]).toMatchObject({ title: '完成任务', completed: true })
})

it('editing existing todos does not create another row, and completed activities can still have pending todos', async () => {
  record.value = { ...record.value, completed: true, manual_completed: true, checklist: [{ id: 'todo', title: '尚未完成', completed: false }] }
  render()
  expect(wrapper.get('.calendar-completion-section').text()).toContain('本期已完成')
  expect(wrapper.get('.calendar-personal-todos').text()).toContain('已完成 0/1 项')
  await button('编辑待办').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.calendar-check-row')).toHaveLength(1)
  expect(wrapper.get('input[type="text"]').element.value).toBe('尚未完成')
  await button('撤销完成').trigger('click'); await flushPromises()
  expect(context.complete).toHaveBeenCalledWith(item.id, 0, false)
  expect(record.value.checklist).toEqual([{ id: 'todo', title: '尚未完成', completed: false }])
})

it('empty drafts retain collapse and unsubscribe protection without a second confirmation', async () => {
  render(); await button('添加待办').trigger('click'); await flushPromises()
  await button('收起待办').trigger('click'); await flushPromises()
  expect(wrapper.find('form').exists()).toBe(true)
  await button('取消订阅').trigger('click'); await flushPromises()
  expect(context.subscribe).not.toHaveBeenCalled()
  expect(wrapper.get('input[type="text"]').element.value).toBe('')
  expect(dialog.confirm).not.toHaveBeenCalled()
  context.confirmDiscard.mockResolvedValueOnce(true)
  await button('取消订阅').trigger('click'); await flushPromises()
  expect(context.subscribe).toHaveBeenCalledWith(item.id, false)
  expect(record.value.checklist).toEqual([])
  expect(wrapper.find('form').exists()).toBe(false)
  expect(dialog.confirm).not.toHaveBeenCalled()
})

it('clean unsubscribe requires consent and retains the saved checklist and completion', async () => {
  record.value = { ...record.value, completed: true, manual_completed: true, checklist: [{ id: 'one', title: '保留内容', completed: false }] }
  render()
  dialog.confirm.mockResolvedValueOnce(false)
  await button('取消订阅').trigger('click'); await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '取消订阅本期活动？', message: expect.stringContaining('已保存的待办与完成记录会保留') }))
  expect(dialog.confirm.mock.lastCall[0].message).toContain(item.title)
  expect(context.subscribe).not.toHaveBeenCalled()
  await button('取消订阅').trigger('click'); await flushPromises()
  expect(context.subscribe).toHaveBeenCalledTimes(1)
  expect(context.subscribe).toHaveBeenCalledWith(item.id, false)
  expect(record.value.manual_completed).toBe(true)
  expect(record.value.checklist).toEqual([{ id: 'one', title: '保留内容', completed: false }])
})

it.each(['account', 'epoch', 'item', 'unmount'])('late unsubscribe consent cannot act after %s changes', async change => {
  render()
  const pending = deferred(); dialog.confirm.mockReturnValueOnce(pending.promise)
  await button('取消订阅').trigger('click')
  if (change === 'account') context.key.value = 'owner:b'
  if (change === 'epoch') context.epoch.value++
  if (change === 'item') await wrapper.setProps({ item: { ...item, id: 'other' } })
  if (change === 'unmount') wrapper.unmount()
  pending.resolve(true); await flushPromises()
  expect(context.subscribe).not.toHaveBeenCalled()
})

it('an existing dialog blocks competing unsubscribe actions', async () => {
  render(); dialog._state.visible = true
  await button('取消订阅').trigger('click'); await flushPromises()
  expect(dialog.confirm).not.toHaveBeenCalled()
  expect(context.subscribe).not.toHaveBeenCalled()
})

it('a context switch before the empty editor opens cannot add a draft to the new account', async () => {
  render()
  const opening = button('添加待办').trigger('click')
  context.key.value = 'owner:b'
  await opening; await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(context.dirty.value).toBe(false)
  expect(context.progress).not.toHaveBeenCalled()
})

it('day lists use nested headings while default card controls retain their existing editor entry', async () => {
  render('day')
  expect(wrapper.findAll('h4').map(node => node.text())).toEqual(['本期完成状态', '个人待办'])
  await wrapper.setProps({ variant: 'card' })
  expect(wrapper.find('.calendar-operation-heading').exists()).toBe(false)
  await button('编辑待办').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.calendar-check-row')).toHaveLength(0)
  expect(button('添加待办')).toBeDefined()
})
