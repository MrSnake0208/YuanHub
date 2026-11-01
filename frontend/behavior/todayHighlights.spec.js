import { expect, it } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { h } from 'vue'
import TodayHighlights from '../src/components/today/TodayHighlights.vue'
import { aggregateTodayHighlights } from '../src/data/todayHighlights.js'

const items = count => aggregateTodayHighlights({ now: Date.parse('2026-10-16T04:00:00Z'), subscriptions: Array.from({ length: count }, (_, i) => ({
  event_id: String(i), subscribed: true, manual_completed: false, checklist: [{ id: 'one', completed: false }],
  item: { title: '活动' + i, start_date: '2026-10-01', end_date: '2026-10-16' }
})) })
const Link = { ...RouterLinkStub, render() { return h('a', { href: '#calendar' }, this.$slots.default?.()) } }
const render = props => mount(TodayHighlights, { attachTo: document.body, props, global: { stubs: { RouterLink: Link } } })

it('previews three, counts deduplicated entries, expands all and preserves focus on collapse', async () => {
  const wrapper = render({ items: items(6) })
  expect(wrapper.get('summary').text()).toContain('6 项提醒')
  expect(wrapper.findAll('li')).toHaveLength(3)
  const more = wrapper.get('.highlight-more')
  more.element.focus(); await more.trigger('click')
  expect(wrapper.findAll('li')).toHaveLength(6)
  expect(more.attributes('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(more.element)
  wrapper.findAll('a')[5].element.focus()
  await more.trigger('click')
  expect(wrapper.findAll('li')).toHaveLength(3)
  expect(document.activeElement).toBe(more.element)
  expect(wrapper.findAll('input')).toHaveLength(0)
  expect(wrapper.get('a').attributes('aria-label')).toContain('还有 1 条活动待办未完成')
})

it('hides an empty successful summary, keeps failed/loading sources honest and reappears with data', async () => {
  const wrapper = render({ items: [], sources: [] })
  expect(wrapper.find('details').exists()).toBe(false)
  await wrapper.setProps({ sources: [{ id: 'private', label: '私人事项', loading: true }] })
  expect(wrapper.get('[role=status]').text()).toContain('数量可能不完整')
  await wrapper.setProps({ sources: [{ id: 'private', label: '私人事项', error: '离线' }] })
  expect(wrapper.get('[role=alert]').text()).toContain('暂时无法确认')
  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('retry')).toEqual([['private']])
  await wrapper.setProps({ items: items(1) })
  expect(wrapper.get('li').text()).toContain('活动0')
  expect(wrapper.get('[role=alert]').text()).toContain('已读取的重点仍可查看')
  await wrapper.setProps({ items: [], sources: [] })
  expect(wrapper.find('details').exists()).toBe(false)
  await wrapper.setProps({ items: items(1) })
  expect(wrapper.find('details').exists()).toBe(true)
})

it('restores removed-row focus within the summary, emits fallback on disappearance, leaves outside focus alone', async () => {
  const wrapper = render({ items: items(4) })
  await wrapper.get('.highlight-more').trigger('click')
  wrapper.findAll('a')[3].element.focus()
  await wrapper.setProps({ items: items(1) }); await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('a').element)
  await wrapper.setProps({ items: [] }); await flushPromises()
  expect(wrapper.emitted('empty-focus')).toHaveLength(1)
  const outside = document.createElement('button'); document.body.append(outside); outside.focus()
  await wrapper.setProps({ items: items(1) })
  await wrapper.setProps({ items: [] }); await flushPromises()
  expect(document.activeElement).toBe(outside)
  expect(wrapper.emitted('empty-focus')).toHaveLength(1)
})

it('retains details disclosure, full-list state and focus when unrelated source state changes', async () => {
  const wrapper = render({ items: items(4) })
  await wrapper.get('.highlight-more').trigger('click')
  const link = wrapper.findAll('a')[3].element; link.focus()
  await wrapper.setProps({ sources: [{ id: 'private', error: '离线', label: '私人事项' }] })
  expect(wrapper.findAll('li')).toHaveLength(4)
  expect(document.activeElement).toBe(link)
  const details = wrapper.get('details'); details.element.open = false; await details.trigger('toggle')
  await wrapper.setProps({ items: items(5) })
  expect(wrapper.get('details').element.open).toBe(false)
})
