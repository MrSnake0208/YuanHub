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
  pool({ up_agent_names: [null, '', ' ', 42] }),
  pool({ up_agent_names: undefined, source_up_agent_names: ['未知候选'] }),
  pool({ source_type: 'MANUAL', category: 'ACTIVITY' }),
  { ...pool(), source_type: 'PRIVATE_ITEM', category: 'PRIVATE_ITEM' },
  { ...pool(), category: 'SHOP' },
])('旧API、未知、非招募和私人事项不展示UP副行：$source_type/$category', item => {
  const wrapper = mount(Card, { props: { item, today } })
  expect(wrapper.find('.calendar-up-agents').exists()).toBe(false)
  wrapper.unmount()
  for (const component of [Month, Timeline]) {
    const view = mount(component, { global: { stubs: { Teleport: true } }, props: { items: [item], today, anchorDate: today } })
    expect(view.find('.calendar-month-bar-up, .calendar-timeline-bar-up').exists()).toBe(false)
    for (const bar of view.findAll('.calendar-month-bar, .calendar-timeline-bar')) expect(bar.attributes('aria-label')).not.toContain('UP 密探')
    view.unmount()
  }
})

it('时间轴跨周色条直显双UP，按钮打开完整详情并恢复焦点', async () => {
  const item = pool()
  const wrapper = mount(Timeline, { global: { stubs: { Teleport: true } }, props: { items: [item, ...denseMonthItems()], today, anchorDate: today }, attachTo: document.body })
  const bar = wrapper.findAll('.calendar-timeline-bar').find(node => node.text().includes(item.title))
  expect(bar.get('.calendar-timeline-bar-up').text()).toBe('UP · 甲 / 乙')
  expect(bar.attributes('aria-label')).toContain('UP 密探：甲、乙')
  expect(bar.get('.calendar-timeline-bar-title').text()).toBe(item.title)
  expect(bar.attributes('aria-haspopup')).toBe('dialog')
  bar.element.focus()
  await bar.trigger('click')
  await flushPromises()
  expect(wrapper.get('.calendar-detail-dialog .calendar-up-agents').text()).toBe('UP 密探：甲、乙')
  expect(document.activeElement.id).toBe('calendar-detail-title')
  await wrapper.get('button[aria-label="关闭日历详情"]').trigger('click'); await flushPromises()
  expect(document.activeElement).toBe(bar.element)
  wrapper.unmount()
})

it('高密度月历跨周色条与行数不受UP影响，当天完整清单显示两位名字', async () => {
  const item = pool({ start_date: '2026-09-01', up_agent_names: ['很长的密探名称'.repeat(15), '乙'] })
  const items = [item, ...denseMonthItems()]
  const wrapper = mount(Month, { global: { stubs: { Teleport: true } }, props: { items, today, anchorDate: today }, attachTo: document.body })
  const bars = () => wrapper.findAll('.calendar-month-bar').map(node => ({ id: node.attributes('data-event-id'), style: node.attributes('style') }))
  const withNames = bars()
  const bar = wrapper.findAll('.calendar-month-bar').find(node => node.attributes('data-event-id') === item.id)
  expect(bar.get('.calendar-month-bar-up').text()).toContain(item.up_agent_names[0])
  expect(bar.attributes('aria-label')).toContain(`UP 密探：${item.up_agent_names.join('、')}`)
  expect(wrapper.find('.calendar-detail-dialog').exists()).toBe(false)
  await bar.trigger('click')
  const [date, accept] = wrapper.emitted('select-date').at(-1)
  expect(date).toBe(today)
  await accept(); await flushPromises()
  expect(wrapper.get('.calendar-detail-dialog .calendar-up-agents').text()).toBe(`UP 密探：${item.up_agent_names.join('、')}`)
  expect(document.activeElement.id).toBe('calendar-detail-title')
  await wrapper.setProps({ items: items.map(value => ({ ...value, up_agent_names: [] })) })
  expect(bars()).toEqual(withNames)
  expect(wrapper.find('.calendar-up-agents').exists()).toBe(false)
  wrapper.unmount()
})

it.each([
  { names: ['甲'], summary: '甲' },
  { names: ['甲', '乙'], summary: '甲 / 乙' },
  { names: ['甲', '乙', '丙', '丁'], summary: '甲 / 乙 +2' },
  { names: ['超长中文名'.repeat(20), 'LongEnglishName'.repeat(20)], summary: `${'超长中文名'.repeat(20)} / ${'LongEnglishName'.repeat(20)}` },
  { names: ['<img src=x onerror=alert(1)>', 'A&B "Q"'], summary: '<img src=x onerror=alert(1)> / A&B "Q"' },
])('长条正文展示真实名单摘要，完整名单可读屏且安全转义：$names', ({ names, summary }) => {
  const item = pool({ up_agent_names: names })
  for (const component of [Month, Timeline]) {
    const view = mount(component, { global: { stubs: { Teleport: true } }, props: { items: [item], today, anchorDate: today } })
    const bars = view.findAll('.calendar-month-bar, .calendar-timeline-bar')
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) {
      expect(bar.get('.calendar-month-bar-up, .calendar-timeline-bar-up').text()).toBe(`UP · ${summary}`)
      expect(bar.attributes('aria-label')).toContain(`UP 密探：${names.join('、')}`)
      expect(bar.find('img').exists()).toBe(false)
    }
    view.unmount()
  }
})

it.each(['如鸢', '代号鸢'])('单日窄条保留首名和余量，详情完整；%s部分确认不使用候选名单', async game => {
  const item = pool({ game, start_date: today, end_date: today, up_agent_names: ['甲', '乙', '丙'], source_up_agent_names: ['未知候选'] })
  for (const component of [Month, Timeline]) {
    const view = mount(component, { global: { stubs: { Teleport: true } }, props: { items: [item], today, anchorDate: today } })
    const bar = view.get('.calendar-month-bar, .calendar-timeline-bar')
    expect(bar.get('.calendar-month-bar-up, .calendar-timeline-bar-up').text()).toBe('UP · 甲 +2')
    expect(bar.attributes('aria-label')).toContain('UP 密探：甲、乙、丙')
    expect(view.text()).not.toContain('未知候选')
    await bar.trigger('click')
    if (component === Month) await view.emitted('select-date').at(-1)[1]()
    await flushPromises()
    expect(view.get('.calendar-up-agents').text()).toBe('UP 密探：甲、乙、丙')
    view.unmount()
  }
})
