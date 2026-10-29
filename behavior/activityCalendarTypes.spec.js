import { expect, it } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import Card from '../src/components/calendar/CalendarEventCard.vue'
import Timeline from '../src/components/calendar/CalendarTimelineView.vue'
import Month from '../src/components/calendar/CalendarMonthView.vue'
import Fields from '../src/components/calendar/CalendarClassificationFields.vue'
import { calendarForm } from '../src/data/activityCalendar.js'

const today = '2026-10-09'
const event = patch => ({ id: 'sample', title: '很长的活动名称与家具关联内容', game: '如鸢', category: 'ACTIVITY', source_type: 'MANUAL', start_date: today, end_date: '2026-10-10', ...patch })
const samples = [
  event({ id: 'large', subtype: 'LARGE_EVENT' }), event({ id: 'cave', subtype: 'FURNITURE', subtype_detail: 'MYSTERIOUS_CAVE' }),
  event({ id: 'login', category: 'LOGIN' }), event({ id: 'maintenance', category: 'MAINTENANCE' }),
  event({ id: 'shop', category: 'SHOP', subtype: 'ACTIVITY_SHOP' }), event({ id: 'star', category: 'OTHER', subtype: 'STAR_POOL' }),
  event({ id: 'unknown', subtype: 'UNRECOGNIZED' }),
  event({ id: 'pool', category: 'RECRUITMENT', source_type: 'RECRUITMENT_POOL', pool_type: '限定' }),
].map(item => ({ ...item, title: item.id + ' · ' + item.title }))
const colors = ['rouge', 'yellow', 'blue', 'gray', 'gray', 'orange', 'neutral', 'gold']

it('日程和时间条共享颜色与文字，临近结束和选中不覆盖类型；四组不漏旧类型', async () => {
  const wrapper = mount(Timeline, { attachTo: document.body, props: { items: samples, today, anchorDate: today } })
  expect(wrapper.findAll('.calendar-timeline-group h3').map(node => node.text())).toEqual(['活动2', '常驻1', '卡池1', '待归类4'])
  expect(wrapper.findAll('.calendar-timeline-bar')).toHaveLength(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const card = mount(Card, { props: { item: samples[i], today } })
    const bar = wrapper.findAll('.calendar-timeline-bar').find(node => node.attributes('aria-label').startsWith(samples[i].title + '，') && node.attributes('data-type-color') === colors[i])
    expect(card.get('.calendar-event').attributes('data-type-color')).toBe(colors[i])
    expect(bar.attributes('style')).toContain(card.get('.calendar-event').element.style.getPropertyValue('--event-mark'))
    expect(bar.attributes('aria-label')).toContain(card.get('.calendar-category').text())
    expect(card.get('.calendar-event').classes()).toContain('is-ending')
  }
  const bar = wrapper.findAll('.calendar-timeline-bar').find(node => node.attributes('data-type-color') === 'yellow')
  await bar.trigger('click'); await flushPromises()
  expect(new DOMWrapper(document.body).get('.calendar-detail-dialog .calendar-category').text()).toBe('常驻 · 历练/洞窟')
  expect(bar.attributes('aria-pressed')).toBe('true')
  expect(bar.attributes('data-type-color')).toBe('yellow')
})

it('月历周条与完整当天详情共享类型，独立关联条目数量不合并', async () => {
  const wrapper = mount(Month, { global: { stubs: { Teleport: true } }, props: { items: samples, today, anchorDate: today } })
  const day = wrapper.get('.calendar-month-day[aria-pressed=true]')
  expect(day.attributes('aria-label')).toContain('8项活动')
  expect(wrapper.get('.calendar-month-overflow button').text()).toContain('+5')
  expect(day.element.closest('.calendar-month-week').querySelectorAll('.calendar-month-bar')).toHaveLength(3)
  expect(wrapper.find('.calendar-detail-dialog').exists()).toBe(false)
  await day.trigger('click'); await wrapper.emitted('select-date').at(-1)[1](); await wrapper.vm.$nextTick()
  expect(day.attributes('aria-label')).toContain('常驻 · 历练/洞窟')
  expect(day.attributes('aria-label')).toContain('待归类 · 星池')
  for (let i = 0; i < samples.length; i++) {
    const card = wrapper.findAll('.calendar-detail-dialog .calendar-event').find(node => node.get('.calendar-event-title').text() === samples[i].title)
    expect(card.attributes('data-type-color')).toBe(colors[i])
  }
})

it('分组录入保留旧LOGIN原值，主动改类才规范category，并清除失效细目', async () => {
  const form = reactive(calendarForm({ item: event({ category: 'LOGIN' }), version: 0 }))
  const wrapper = mount(Fields, { props: { form } })
  expect(wrapper.get('#calendar-category').element.value).toBe('ACTIVITY')
  expect(wrapper.get('#calendar-subtype').element.value).toBe('SIGN_IN')
  expect(form.category).toBe('LOGIN')
  await wrapper.get('#calendar-category').setValue('PERMANENT')
  expect(wrapper.get('#calendar-subtype').text()).toBe('当季星图白鸽密探特训历练/洞窟')
  await wrapper.get('#calendar-subtype').setValue('TRIAL_CAVE')
  expect(form.category).toBe('ACTIVITY')
  expect(form.subtype).toBe('TRIAL_CAVE')
  expect(form.subtype_detail).toBe('')
  await wrapper.get('#calendar-category').setValue('OTHER')
  expect(form.subtype).toBe('OTHER')
  expect(form.subtype_detail).toBe('')
  expect(wrapper.find('#calendar-subtype_detail').exists()).toBe(false)
  expect(wrapper.get('#calendar-subtype').text()).toBe('其他')
})

it.each([
  ['FURNITURE_TRIAL', null], ['MYSTERIOUS_CAVE', null], ['FURNITURE', 'MYSTERIOUS_CAVE'],
  ['MEDIUM_EVENT', null], ['TAISHAN_FU', null], ['FIRST_MEETING_ROULETTE', null],
])('旧编码 %s 编辑其他字段不改分类，主动重选才规范化', async (subtype, subtype_detail) => {
  const form = reactive(calendarForm({ item: event({ subtype, subtype_detail }), version: 0 }))
  const wrapper = mount(Fields, { props: { form } })
  form.title = '只改标题'
  await wrapper.vm.$nextTick()
  expect(form.subtype).toBe(subtype)
  expect(form.subtype_detail).toBe(subtype_detail || '')
  expect(wrapper.text()).toContain(subtype)
  if (wrapper.get('#calendar-category').element.value !== 'PERMANENT') await wrapper.get('#calendar-category').setValue('PERMANENT')
  await wrapper.get('#calendar-subtype').setValue('TRIAL_CAVE')
  expect(form.category).toBe('ACTIVITY')
  expect(form.subtype).toBe('TRIAL_CAVE')
  expect(form.subtype_detail).toBe('')
})
