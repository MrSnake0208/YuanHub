import { expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Card from '../src/components/calendar/CalendarEventCard.vue'
import Agenda from '../src/components/calendar/CalendarAgendaView.vue'
import Month from '../src/components/calendar/CalendarMonthView.vue'
import Timeline from '../src/components/calendar/CalendarTimelineView.vue'
import { normalizeCalendarItem } from '../src/data/activityCalendar.js'
import { denseMonthItems } from '../test-support/calendarMonthFixtures.js'

const today = '2026-10-03'
const pool = (patch = {}) => normalizeCalendarItem({
  id: 'recruitment:pool', source_type: 'RECRUITMENT_POOL', source_ref: 'pool', category: 'RECRUITMENT',
  title: '双 UP 招募池', game: '如鸢', start_date: '2026-09-25', end_date: '2026-10-18',
  up_agent_names: ['甲', '乙'], ...patch,
})

it.each([{ names: ['甲'] }, { names: ['甲', '乙'] }, { names: ['很长的密探名称'.repeat(15), '另一位密探'] }])('日程和详情完整展示名单 $names，池名仍为标题', ({ names }) => {
  const item = pool({ up_agent_names: names })
  for (const [component, props] of [[Card, { item, today }], [Agenda, { items: [item], today, anchorDate: today }]]) {
    const wrapper = mount(component, { props })
    expect(wrapper.get('h4').text()).toBe(item.title)
    expect(wrapper.get('.calendar-up-agents').text()).toBe(`UP 密探：${names.join('、')}`)
    expect(wrapper.get('.calendar-up-agents').attributes('title')).toBeUndefined()
    wrapper.unmount()
  }
})

it.each([
  pool({ up_agent_names: undefined }), pool({ up_agent_names: [] }),
  pool({ source_type: 'MANUAL', category: 'ACTIVITY' }),
  { ...pool(), source_type: 'PRIVATE_ITEM', category: 'PRIVATE_ITEM' },
  { ...pool(), category: 'SHOP' },
])('旧API、未知、非招募和私人事项不展示UP副行：$source_type/$category', item => {
  const wrapper = mount(Card, { props: { item, today } })
  expect(wrapper.find('.calendar-up-agents').exists()).toBe(false)
})

it('时间轴跨周色条不追加名单，按钮打开完整详情并恢复焦点', async () => {
  const item = pool()
  const wrapper = mount(Timeline, { props: { items: [item, ...denseMonthItems()], today, anchorDate: today }, attachTo: document.body })
  const bar = wrapper.findAll('.calendar-timeline-bar').find(node => node.text().includes(item.title))
  expect(bar.text()).not.toContain('UP 密探：')
  expect(bar.get('.calendar-timeline-bar-title').text()).toBe(item.title)
  expect(bar.attributes('aria-controls')).toBe('calendar-timeline-detail')
  bar.element.focus()
  await bar.trigger('click')
  await flushPromises()
  expect(wrapper.get('#calendar-timeline-detail .calendar-up-agents').text()).toBe('UP 密探：甲、乙')
  expect(document.activeElement).toBe(wrapper.get('#calendar-timeline-detail').element)
  await wrapper.get('#calendar-timeline-detail button').trigger('click')
  expect(document.activeElement).toBe(bar.element)
  wrapper.unmount()
})

it('高密度月历跨周色条与行数不受UP影响，当天完整清单显示两位名字', async () => {
  const item = pool({ start_date: '2026-09-01', up_agent_names: ['很长的密探名称'.repeat(15), '乙'] })
  const items = [item, ...denseMonthItems()]
  const wrapper = mount(Month, { props: { items, today, anchorDate: today }, attachTo: document.body })
  const bars = () => wrapper.findAll('.calendar-month-bar').map(node => ({ text: node.text(), style: node.attributes('style') }))
  const withNames = bars()
  const bar = wrapper.findAll('.calendar-month-bar').find(node => node.attributes('data-event-id') === item.id)
  expect(bar.text()).not.toContain(item.up_agent_names[0])
  expect(wrapper.get('#calendar-day-detail .calendar-up-agents').text()).toBe(`UP 密探：${item.up_agent_names.join('、')}`)
  await bar.trigger('click')
  const [date, accept] = wrapper.emitted('select-date').at(-1)
  expect(date).toBe(today)
  await accept()
  expect(document.activeElement.dataset.eventId).toBe(item.id)
  await wrapper.setProps({ items: items.map(value => ({ ...value, up_agent_names: [] })) })
  expect(bars()).toEqual(withNames)
  expect(wrapper.find('.calendar-up-agents').exists()).toBe(false)
  wrapper.unmount()
})
