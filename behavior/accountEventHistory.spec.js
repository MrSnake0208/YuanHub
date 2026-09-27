import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AccountEventToasts from '../src/components/AccountEventToasts.vue'
import { accountEvents, previewAccountEvent, stopAccountEventStream } from '../src/store/accountEvents.js'

afterEach(() => { stopAccountEventStream(); vi.useRealTimers() })

it('需要复核的事件保留到手动关闭，历史在关闭后仍可查看', async () => {
  vi.useFakeTimers()
  previewAccountEvent('review')
  const wrapper = mount(AccountEventToasts)
  expect(wrapper.get('.account-event-toast[role="alert"]').text()).toContain('需要复核')
  await vi.advanceTimersByTimeAsync(11000)
  expect(accountEvents.toasts).toHaveLength(1)
  await wrapper.get('.account-event-toast button').trigger('click')
  expect(accountEvents.toasts).toHaveLength(0)
  expect(wrapper.get('.account-event-history').text()).toContain('需要复核')
  wrapper.unmount()
})

it('含物品明细的成功事件延长展示，消失后仍可追溯', async () => {
  vi.useFakeTimers()
  previewAccountEvent('inventory')
  await flushPromises()
  const wrapper = mount(AccountEventToasts)
  expect(accountEvents.toasts[0].entries.length).toBeGreaterThan(0)
  await vi.advanceTimersByTimeAsync(3800)
  expect(accountEvents.toasts).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(6200)
  expect(accountEvents.toasts).toHaveLength(0)
  expect(wrapper.get('.account-event-history').text()).toContain('白金币')
  stopAccountEventStream()
  expect(accountEvents.history).toHaveLength(0)
  wrapper.unmount()
})
