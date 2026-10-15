import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import Detail from '../src/components/calendar/CalendarDetailDialog.vue'
import EventCard from '../src/components/calendar/CalendarEventCard.vue'
import Month from '../src/components/calendar/CalendarMonthView.vue'
import { CALENDAR_SUBSCRIPTIONS } from '../src/data/activityCalendarSubscriptions.js'

const date = '2026-10-15'
const item = (id, patch = {}) => ({ id, title: id, game: '如鸢', category: 'ACTIVITY', start_date: date, end_date: date, ...patch })
const props = { selection: { date, id: '' }, items: [item('one'), item('two')], today: date }
afterEach(() => { document.body.removeAttribute('style'); document.documentElement.removeAttribute('style') })

it.each(['one', ''])('keeps todo editing within the visual viewport for selection %j without losing drafts or moving the page', async id => {
  const viewport = new EventTarget()
  viewport.height = 800; viewport.offsetTop = 0
  vi.stubGlobal('visualViewport', viewport)
  const add = vi.spyOn(viewport, 'addEventListener'), remove = vi.spyOn(viewport, 'removeEventListener')
  const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const context = {
    permitted: ref(true), account: ref({ id: 'a', game: '如鸢' }), key: ref('owner:a'), epoch: ref(0), now: ref(Date.parse('2026-10-15T04:00:00Z')),
    byId: ref({ one: { event_id: 'one', subscribed: true, version: 0, checklist: [{ id: 'todo', title: '已有待办', completed: false }] } }),
    dirty: ref(false), loading: ref(false), error: ref(''), setDirty: vi.fn((eventId, value) => { context.dirty.value = value }), progress: vi.fn(), complete: vi.fn(), subscribe: vi.fn(),
  }
  const wrapper = mount(Detail, { props: { ...props, selection: { date, id }, canCreate: true }, attachTo: document.body, global: { provide: { [CALENDAR_SUBSCRIPTIONS]: context } } })
  await flushPromises()
  const mask = document.querySelector('.calendar-detail-mask'), body = mask.querySelector('.calendar-detail-body'), footer = mask.querySelector('footer')
  expect(mask.style.height).toBe('800px')
  const card = mask.querySelector('[data-event-id="one"]')
  Array.from(card.querySelectorAll('button')).find(node => node.textContent === '编辑待办').click(); await flushPromises()
  const input = card.querySelector('input[type=text]')
  expect(document.activeElement).toBe(input)
  expect(mask.classList.contains('is-editing-todo')).toBe(true)
  expect(footer.style.display).toBe('none')
  input.value = '键盘变化后保留的草稿'; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises()
  const bounds = { top: 70, bottom: 280 }
  const inputBounds = { top: 390, bottom: 434 }
  vi.spyOn(body, 'getBoundingClientRect').mockImplementation(() => bounds)
  vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() => inputBounds)
  body.scrollTop = 0
  viewport.height = 320; viewport.offsetTop = 90
  viewport.dispatchEvent(new Event('resize')); await flushPromises()
  expect(mask.style.top).toBe('90px')
  expect(mask.style.height).toBe('320px')
  expect(mask.style.bottom).toBe('auto')
  expect(mask.style.getPropertyValue('--calendar-detail-viewport-height')).toBe('320px')
  expect(body.scrollTop).toBe(166)
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('键盘变化后保留的草稿')
  body.scrollTop = 200; inputBounds.top = 50; inputBounds.bottom = 94
  viewport.offsetTop = 110
  viewport.dispatchEvent(new Event('scroll')); await flushPromises()
  expect(mask.style.top).toBe('110px')
  expect(body.scrollTop).toBe(168)
  bounds.bottom = 760; inputBounds.top = 100; inputBounds.bottom = 144
  viewport.height = 800; viewport.offsetTop = 0
  viewport.dispatchEvent(new Event('resize')); await flushPromises()
  expect(mask.style.height).toBe('800px')
  expect(body.scrollTop).toBe(168)
  expect(input.value).toBe('键盘变化后保留的草稿')
  Array.from(card.querySelectorAll('button')).find(node => node.textContent === '添加待办').click(); await flushPromises()
  const added = card.querySelectorAll('input[type=text]')[1]
  expect(added).toBeDefined()
  expect(document.activeElement).toBe(added)
  expect(input.value).toBe('键盘变化后保留的草稿')
  expect(footer.style.display).toBe('none')
  vi.spyOn(added, 'getBoundingClientRect').mockReturnValue({ top: 790, bottom: 834 })
  body.scrollTop = 0
  viewport.dispatchEvent(new Event('resize')); await flushPromises()
  expect(body.scrollTop).toBe(86)
  const save = card.querySelector('.calendar-todo-save')
  vi.spyOn(save, 'getBoundingClientRect').mockImplementation(() => ({ top: 916 - body.scrollTop, bottom: 960 - body.scrollTop }))
  save.focus(); await flushPromises()
  expect(document.activeElement).toBe(save)
  expect(body.scrollTop).toBe(212)
  expect(mask.classList.contains('is-editing-todo')).toBe(true)
  expect(footer.style.display).toBe('none')
  mask.querySelector('.calendar-detail-close').focus(); await flushPromises()
  expect(mask.classList.contains('is-editing-todo')).toBe(false)
  expect(footer.style.display).toBe('')
  expect(pageScroll).not.toHaveBeenCalled()
  expect(context.progress).not.toHaveBeenCalled()
  expect(context.complete).not.toHaveBeenCalled()
  expect(context.subscribe).not.toHaveBeenCalled()
  input.focus(); await flushPromises()
  expect(footer.style.display).toBe('none')
  await wrapper.setProps({ selection: { date, id: 'two' } }); await flushPromises()
  expect(mask.classList.contains('is-editing-todo')).toBe(false)
  expect(footer.style.display).toBe('')
  await wrapper.setProps({ selection: null }); await flushPromises()
  const resize = add.mock.calls.find(([name]) => name === 'resize')[1]
  expect(remove).toHaveBeenCalledWith('resize', resize)
  expect(remove).toHaveBeenCalledWith('scroll', resize)
  await wrapper.setProps({ selection: { date, id } }); await flushPromises()
  expect(document.querySelector('.calendar-detail-mask').classList.contains('is-editing-todo')).toBe(false)
  wrapper.unmount()
  expect(remove.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(2)
  expect(document.body.style.overflow).toBe('')
})

it('falls back to the window viewport and removes its resize listener on close and unmount', async () => {
  vi.stubGlobal('visualViewport', undefined)
  vi.stubGlobal('innerHeight', 700)
  const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener')
  const wrapper = mount(Detail, { props, attachTo: document.body })
  await flushPromises()
  const mask = document.querySelector('.calendar-detail-mask')
  expect(mask.style.height).toBe('700px')
  expect(mask.style.top).toBe('0px')
  vi.stubGlobal('innerHeight', 360)
  window.dispatchEvent(new Event('resize')); await flushPromises()
  expect(mask.style.height).toBe('360px')
  const resize = add.mock.calls.find(([name]) => name === 'resize')[1]
  await wrapper.setProps({ selection: null }); await flushPromises()
  expect(remove).toHaveBeenCalledWith('resize', resize)
  await wrapper.setProps({ selection: props.selection }); await flushPromises()
  expect(document.querySelector('.calendar-detail-mask').style.height).toBe('360px')
  wrapper.unmount()
  expect(remove.mock.calls.filter(([name]) => name === 'resize')).toHaveLength(2)
})

it('real Teleport focuses heading, traps Tab, emits every close path and restores opener/scroll styles', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus()
  document.body.style.overflow = 'auto'; document.body.style.paddingRight = '7px'
  document.documentElement.style.overflow = 'scroll'
  const focus = vi.spyOn(opener, 'focus')
  const wrapper = mount(Detail, { props, attachTo: document.body }); await flushPromises()
  const panel = document.querySelector('.calendar-detail-dialog')
  expect(panel.parentElement.parentElement).toBe(document.body)
  expect(document.activeElement.id).toBe('calendar-detail-title')
  expect(panel.querySelector('[role=region]').tabIndex).toBe(0)
  expect(document.body.style.overflow).toBe('hidden')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  expect(document.activeElement.textContent).toBe('完成')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement.getAttribute('aria-label')).toBe('关闭日历详情')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  panel.parentElement.click(); panel.querySelector('header button').click(); panel.querySelector('footer button').click()
  expect(wrapper.emitted('close')).toHaveLength(4)
  await wrapper.setProps({ selection: null }); await flushPromises()
  expect(document.activeElement).toBe(opener)
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
  expect(document.body.style.overflow).toBe('auto')
  expect(document.body.style.paddingRight).toBe('7px')
  expect(document.documentElement.style.overflow).toBe('scroll')
  wrapper.unmount()
})

it('shows live deduplicated day or single-item data, updates/deletion and selected-day creation', async () => {
  const wrapper = mount(Detail, { props: { ...props, items: [...props.items, props.items[0]], canCreate: true }, global: { stubs: { Teleport: true } } })
  expect(wrapper.findAll('article')).toHaveLength(2)
  await wrapper.setProps({ selection: { date, id: 'two' } })
  expect(wrapper.findAll('article')).toHaveLength(1)
  await wrapper.setProps({ items: [item('two', { title: 'updated' })] })
  expect(wrapper.get('h2').text()).toBe('updated')
  expect(wrapper.find('.calendar-event-title').exists()).toBe(false)
  expect(wrapper.find('.calendar-detail-done').exists()).toBe(false)
  await wrapper.get('.calendar-private-add').trigger('click')
  expect(wrapper.emitted('create-private')).toEqual([[date]])
  await wrapper.setProps({ items: [] })
  expect(wrapper.text()).toContain('该事项已删除、不可用或不在当前筛选范围内')
  await wrapper.setProps({ selection: { date, id: '' } })
  expect(wrapper.text()).toContain('当天暂无事项')
})

it('loading and errors stay in dialog, retry emits and unmount releases scroll lock', async () => {
  const wrapper = mount(Detail, { props: { ...props, items: [], loading: true }, global: { stubs: { Teleport: true } } })
  expect(wrapper.text()).toContain('正在读取事项')
  await wrapper.setProps({ loading: false, error: 'offline' })
  expect(wrapper.get('[role=alert]').text()).toContain('offline')
  await wrapper.get('[role=alert] button').trigger('click')
  expect(wrapper.emitted('retry')).toHaveLength(1)
  wrapper.unmount()
  expect(document.body.style.overflow).toBe('')
})

it('late date acceptance after A→B→A cannot open the old account selection', async () => {
  const context = { identity: ref('owner'), account: ref({ id: 'a' }), key: ref('a') }
  const wrapper = mount(Month, { props: { items: props.items, today: date, anchorDate: date }, global: { provide: { [CALENDAR_SUBSCRIPTIONS]: context }, stubs: { Teleport: true } } })
  await wrapper.get('.calendar-month-day[aria-pressed=true]').trigger('click')
  const accept = wrapper.emitted('select-date').at(-1)[1]
  context.account.value = { id: 'b' }; context.key.value = 'b'
  context.account.value = { id: 'a' }; context.key.value = 'a'
  await accept(); await flushPromises()
  expect(wrapper.find('.calendar-detail-dialog').exists()).toBe(false)
})


it('single-item details are independent of the anchor day and follow edits within the visible range', async () => {
  const future = item('future', { start_date: '2026-10-17', end_date: '2026-10-19' })
  const wrapper = mount(Detail, { props: { ...props, items: [future, future] }, global: { stubs: { Teleport: true } } })
  expect(wrapper.findAll('article')).toHaveLength(0)
  await wrapper.setProps({ selection: { date, id: 'future' } })
  expect(wrapper.findAll('article')).toHaveLength(1)
  expect(wrapper.get('h2').text()).toBe('future')
  await wrapper.setProps({ items: [{ ...future, start_date: '2026-10-20', end_date: '2026-10-20', title: 'moved' }] })
  expect(wrapper.get('h2').text()).toBe('moved')
  expect(wrapper.get('.calendar-range').text()).toContain('2026-10-20')
})

it('single detail uses the event title once, hides missing-time noise, and preserves the day list and default agenda card', async () => {
  const event = item('activity', { title: 'https://example.com/' + 'long-title/'.repeat(7), source_type: 'MANUAL' })
  const wrapper = mount(Detail, { props: { ...props, selection: { date, id: event.id }, items: [event, item('another')] }, global: { stubs: { Teleport: true } } })
  expect(wrapper.get('h2').text()).toBe(event.title)
  expect(wrapper.get('.calendar-event').classes()).toContain('is-detail')
  expect(wrapper.find('.calendar-event-title').exists()).toBe(false)
  expect(wrapper.find('footer').exists()).toBe(false)
  expect(wrapper.get('.calendar-category').classes()).toContain('is-muted')
  expect(wrapper.get('.calendar-range').text()).toContain(date)
  expect(wrapper.text()).not.toContain('具体时间未提供')
  await wrapper.get('button[aria-label="关闭日历详情"]').trigger('click')
  await wrapper.get('.calendar-detail-mask').trigger('click')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(wrapper.emitted('close')).toHaveLength(3)
  await wrapper.setProps({ selection: { date, id: '' } })
  expect(wrapper.findAll('.calendar-event.is-day')).toHaveLength(2)
  expect(wrapper.findAll('h3.calendar-event-title').map(node => node.text())).toEqual([event.title, 'another'])
  expect(wrapper.get('.calendar-detail-done').text()).toBe('完成')
  expect(wrapper.text()).not.toContain('具体时间未提供')
  const agenda = mount(EventCard, { props: { item: event, today: date } })
  expect(agenda.get('h4').text()).toBe(event.title)
  expect(agenda.text()).toContain('具体时间未提供')
  expect(agenda.get('.calendar-event').classes()).not.toContain('is-detail')
  expect(agenda.get('.calendar-category').classes()).not.toContain('is-muted')
  agenda.unmount()
})
