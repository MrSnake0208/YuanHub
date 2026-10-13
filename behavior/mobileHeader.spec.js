import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MobileHeader from '../src/components/MobileHeader.vue'
import { installViewport } from '../test-support/viewport.js'

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

it('导航按1080/1081切换监听，卸载清理；640并非导航切换点', () => {
  const viewport = installViewport(1440)
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  const wrapper = mount(MobileHeader)
  const media = viewport.queries[0]
  expect(media.media.matches).toBe(false)
  viewport.resize(1080)
  expect(media.media.matches).toBe(true)
  expect(add.mock.calls.filter(([event]) => event === 'scroll')).toHaveLength(1)
  viewport.resize(640)
  viewport.resize(641)
  expect(add.mock.calls.filter(([event]) => event === 'scroll')).toHaveLength(1)
  viewport.resize(1081)
  expect(media.media.matches).toBe(false)
  const removals = remove.mock.calls.filter(([event]) => event === 'scroll').length
  wrapper.unmount()
  expect(media.listeners.size).toBe(0)
  expect(remove.mock.calls.filter(([event]) => event === 'scroll')).toHaveLength(removals + 1)
  expect(document.documentElement.style.getPropertyValue('--mobile-shell-follow-top')).toBe('')
})
