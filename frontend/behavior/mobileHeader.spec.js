import { installViewport } from '../test-support/viewport.js'
import { beforeEach, expect, test, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import MobileHeader from '../src/components/MobileHeader.vue'

const route = reactive({ fullPath: '/achievement' })
vi.mock('vue-router', () => ({ useRoute: () => route }))
let y, height, now, viewport
beforeEach(() => {
  y = 200; height = 2000; now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y)
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => height)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(64)
  viewport = new EventTarget(); viewport.matches = true
  vi.stubGlobal('matchMedia', () => viewport)
})
const hidden = wrapper => wrapper.classes().includes('mobile-shell--hidden')
async function scroll(to) { y = to; window.dispatchEvent(new Event('scroll')); await nextTick() }
function wheel(deltaY) { window.dispatchEvent(new WheelEvent('wheel', { deltaY })) }
function touch(type, clientY) {
  const event = new Event(type)
  Object.defineProperty(event, 'touches', { value: [{ clientY }] })
  window.dispatchEvent(event)
}

test('没有主动输入的内容调整和程序滚动不切换导航', async () => {
  const wrapper = mount(MobileHeader)
  await scroll(400); expect(hidden(wrapper)).toBe(false)
  wheel(80); await scroll(480); expect(hidden(wrapper)).toBe(true)
  window.dispatchEvent(new Event('click'))
  await scroll(300); expect(hidden(wrapper)).toBe(true)
})

test('滚轮同方向累计达到缓冲后隐藏，反向微动不闪烁', async () => {
  const wrapper = mount(MobileHeader)
  wheel(10); await scroll(210); expect(hidden(wrapper)).toBe(false)
  wheel(20); await scroll(230); expect(hidden(wrapper)).toBe(true)
  wheel(-5); await scroll(225); expect(hidden(wrapper)).toBe(true)
  wheel(-30); await scroll(195); expect(hidden(wrapper)).toBe(false)
})

test('触摸点击不隐藏，实际滑动才切换', async () => {
  const wrapper = mount(MobileHeader)
  touch('touchstart', 300); await scroll(240); expect(hidden(wrapper)).toBe(false)
  touch('touchmove', 250); await scroll(290); expect(hidden(wrapper)).toBe(true)
  touch('touchstart', 250); touch('touchmove', 300)
  await scroll(240); expect(hidden(wrapper)).toBe(false)
})

test('过期输入和页面高度变化不能延续滚动意图', async () => {
  const wrapper = mount(MobileHeader)
  wheel(100); now += 500; await scroll(300); expect(hidden(wrapper)).toBe(false)
  wheel(100); height += 300; await scroll(400); expect(hidden(wrapper)).toBe(false)
})

test('页面滚动键有效，输入字段方向键不控制导航', async () => {
  const wrapper = mount(MobileHeader)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }))
  await scroll(300); expect(hidden(wrapper)).toBe(true)
  const input = document.createElement('input'); document.body.append(input)
  window.dispatchEvent(new Event('pointerdown'))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  await scroll(250); expect(hidden(wrapper)).toBe(true)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }))
  await scroll(200); expect(hidden(wrapper)).toBe(false)
})

test('菜单固定状态同步偏移，关闭后恢复滚动判断', async () => {
  const wrapper = mount(MobileHeader)
  wheel(80); await scroll(280); expect(hidden(wrapper)).toBe(true)
  await wrapper.setProps({ pinned: true }); expect(hidden(wrapper)).toBe(false)
  expect(document.documentElement.style.getPropertyValue('--mobile-shell-follow-top')).toContain('72px')
  wheel(80); await scroll(360); expect(hidden(wrapper)).toBe(false)
  await wrapper.setProps({ pinned: false })
  await scroll(400); expect(hidden(wrapper)).toBe(false)
  wheel(80); await scroll(480); expect(hidden(wrapper)).toBe(true)
})

test('路由切换和桌面断点重置，卸载清理监听', async () => {
  const wrapper = mount(MobileHeader)
  wheel(80); await scroll(280)
  route.fullPath = '/operator'; await nextTick(); expect(hidden(wrapper)).toBe(false)
  wheel(80); await scroll(360)
  viewport.matches = false; viewport.dispatchEvent(new Event('change')); await nextTick()
  expect(hidden(wrapper)).toBe(false)
  wheel(80); await scroll(440); expect(hidden(wrapper)).toBe(false)
  wrapper.unmount()
  wheel(80); await scroll(520)
  expect(document.documentElement.style.getPropertyValue('--mobile-shell-follow-top')).toBe('')
})

test('输入方向相反的位置跳动不切换，返回页顶仍显示', async () => {
  const wrapper = mount(MobileHeader)
  wheel(80); await scroll(280); expect(hidden(wrapper)).toBe(true)
  wheel(80); await scroll(200); expect(hidden(wrapper)).toBe(true)
  await scroll(0); expect(hidden(wrapper)).toBe(false)
})

test('导航收到焦点立即显示并清除旧输入意图', async () => {
  const wrapper = mount(MobileHeader, { slots: { default: '<button>菜单</button>' } })
  wheel(80); await scroll(280); expect(hidden(wrapper)).toBe(true)
  await wrapper.get('button').trigger('focusin'); expect(hidden(wrapper)).toBe(false)
  await scroll(360); expect(hidden(wrapper)).toBe(false)
})

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
