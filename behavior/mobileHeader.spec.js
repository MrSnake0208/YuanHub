import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MobileHeader from '../src/components/MobileHeader.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ fullPath: '/' }) }))

it('主导航固定在手机顶部，滚动时不注册自动隐藏处理', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const addListener = vi.spyOn(window, 'addEventListener')
  const wrapper = mount(MobileHeader, { props: { pinned: true } })
  expect(addListener.mock.calls.some(([event]) => event === 'scroll')).toBe(false)
  window.dispatchEvent(new Event('scroll'))
  expect(wrapper.classes()).not.toContain('mobile-shell--hidden')
  addListener.mockRestore()
})
