import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BackToTop from '@/components/BackToTop.vue'

beforeEach(() => {
  vi.stubGlobal('scrollY', 0)
  vi.stubGlobal('innerHeight', 800)
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})

async function scrollTo(y) {
  vi.stubGlobal('scrollY', y)
  window.dispatchEvent(new Event('scroll'))
  await nextTick()
}

it('超过一屏才显示，点击平滑回顶，回到顶部隐藏', async () => {
  const wrapper = mount(BackToTop)
  expect(wrapper.find('button').exists()).toBe(false)
  await scrollTo(800)
  expect(wrapper.find('button').exists()).toBe(false)
  await scrollTo(801)
  await wrapper.get('button[aria-label="返回顶部"]').trigger('click')
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  await scrollTo(0)
  expect(wrapper.find('button').exists()).toBe(false)
})

it('恢复滚动位置时显示，减少动态效果时立即回顶，调整视口后重新判断', async () => {
  vi.stubGlobal('scrollY', 900)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  const wrapper = mount(BackToTop)
  await nextTick()
  await wrapper.get('button').trigger('click')
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  vi.stubGlobal('innerHeight', 1000)
  window.dispatchEvent(new Event('resize'))
  await nextTick()
  expect(wrapper.find('button').exists()).toBe(false)
})

it('卸载时清理滚动和视口监听', () => {
  const remove = vi.spyOn(window, 'removeEventListener')
  const wrapper = mount(BackToTop)
  wrapper.unmount()
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
})
