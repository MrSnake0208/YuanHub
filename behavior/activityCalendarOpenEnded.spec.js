import { expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import Fields from '../src/components/calendar/CalendarSuggestionFields.vue'
import Duplicates from '../src/components/calendar/CalendarSuggestionDuplicates.vue'
import { calendarForm } from '../src/data/activityCalendar.js'
import { listActivityCalendar } from '../src/api/activityCalendar.js'

vi.mock('../src/api/activityCalendar.js', () => ({ listActivityCalendar: vi.fn() }))
const form = () => ({ ...calendarForm(), title: '持续活动', game: '如鸢', start_date: '2026-10-01', source_url: 'https://example.com/notice' })
const global = { stubs: { RouterLink: RouterLinkStub } }

it('建议表单结束日期可留空，精确时间只要求开始时刻', async () => {
  const wrapper = mount(Fields, { props: { form: { ...form(), precise: true, start_time: '05:00' } }, global })
  expect(wrapper.get('#suggestion-start_date').attributes('required')).toBeDefined()
  expect(wrapper.get('#suggestion-end_date').attributes('required')).toBeUndefined()
  expect(wrapper.text()).toContain('留空表示持续进行')
  expect(wrapper.get('#suggestion-start_time').element.value).toBe('05:00')
  expect(wrapper.find('#suggestion-end_time').exists()).toBe(false)
})

it('开放结束的建议检查重叠时不发送虚构结束日期，并保留已有持续活动', async () => {
  listActivityCalendar.mockResolvedValue({ items: [{ id: 'ongoing', source_type: 'MANUAL', game: '如鸢', category: 'ACTIVITY', title: '已有持续活动', start_date: '2026-09-01', end_date: null }] })
  const wrapper = mount(Duplicates, { props: { form: form() }, global })
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(listActivityCalendar).toHaveBeenCalledWith({ game: '如鸢', from: '2026-10-01', to: undefined })
  expect(wrapper.text()).toContain('已有持续活动')
  expect(wrapper.text()).toContain('持续进行')
})
