import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TodayLobby from '../src/components/today/TodayLobby.vue'

const status = '当前账号的三项数据已录入，今日事项在下方。'
const render = props => mount(TodayLobby, { attachTo: document.body, props: { status, ...props } })
const picker = () => document.querySelector('[role="dialog"]')
async function open(wrapper) {
  const trigger = wrapper.get('.lobby-duty button')
  trigger.element.focus()
  await trigger.trigger('click')
  await flushPromises()
}
async function search(text) {
  const input = picker().querySelector('input')
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
async function choose(name) {
  picker().querySelector(`[aria-label="选择${name}值守"]`).click()
  await flushPromises()
}
afterEach(() => vi.restoreAllMocks())

it('搜索复用中文/拼音/首字母，选择后刷新保留且恢复入口焦点', async () => {
  const wrapper = render({ ownerId: 'user-a' })
  expect(wrapper.get('.lobby-duty').text()).toContain('阿蝉')
  await open(wrapper)
  expect(document.activeElement).toBe(picker().querySelector('input'))
  for (const query of ['孙尚香', 'sun shang xiang', 'ssx']) {
    await search(query)
    expect(picker().querySelector('[aria-label="选择孙尚香值守"]')).not.toBeNull()
  }
  await search('不存在的密探')
  expect(picker().textContent).toContain('没有找到密探')
  await search('郭嘉')
  await choose('郭嘉')
  expect(picker()).toBeNull()
  expect(wrapper.get('.lobby-portrait img').attributes('alt')).toBe('郭嘉的值守立绘')
  expect(document.activeElement).toBe(wrapper.get('.lobby-duty button').element)
  wrapper.unmount()
  const restored = render({ ownerId: 'user-a' })
  expect(restored.get('.lobby-duty').text()).toContain('郭嘉')
})

it('不同用户与游客隔离，身份切换关闭正在打开的选择', async () => {
  const wrapper = render({ ownerId: 'user-a' })
  await open(wrapper); await choose('杨修')
  await open(wrapper)
  await wrapper.setProps({ ownerId: 'user-b' }); await flushPromises()
  expect(picker()).toBeNull()
  expect(wrapper.get('.lobby-duty').text()).toContain('阿蝉')
  await open(wrapper); await choose('郭嘉')
  await wrapper.setProps({ ownerId: '' })
  expect(wrapper.get('.lobby-duty').text()).toContain('阿蝉')
  await open(wrapper); await choose('孙尚香')
  await wrapper.setProps({ ownerId: 'user-a' })
  expect(wrapper.get('.lobby-duty').text()).toContain('杨修')
  await wrapper.setProps({ ownerId: 'user-b' })
  expect(wrapper.get('.lobby-duty').text()).toContain('郭嘉')
  await wrapper.setProps({ ownerId: '' })
  expect(wrapper.get('.lobby-duty').text()).toContain('孙尚香')
})

it('失效选择回退默认，读取或写入存储失败仍可使用且不声称保存成功', async () => {
  localStorage.setItem('yh_today_companion:user:user-a', '/invalid.webp')
  const wrapper = render({ ownerId: 'user-a' })
  expect(wrapper.get('.lobby-duty').text()).toContain('阿蝉')
  await wrapper.get('.lobby-portrait img').trigger('error')
  expect(wrapper.find('.lobby-art-error').exists()).toBe(true)
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  await wrapper.setProps({ ownerId: 'user-b' })
  expect(wrapper.get('.lobby-duty').text()).toContain('阿蝉')
  expect(wrapper.find('.lobby-portrait img').exists()).toBe(true)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  await open(wrapper); await choose('郭嘉')
  expect(wrapper.get('.lobby-duty').text()).toContain('郭嘉')
  expect(wrapper.get('.lobby-save-notice').text()).toContain('暂时无法保存')
})

it('Esc/遮罩取消不保存；立绘失败可更换并恢复图片', async () => {
  const wrapper = render()
  const write = vi.spyOn(Storage.prototype, 'setItem')
  await open(wrapper)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(picker()).toBeNull()
  expect(document.activeElement).toBe(wrapper.get('.lobby-duty button').element)
  await open(wrapper)
  picker().parentElement.click(); await flushPromises()
  expect(picker()).toBeNull()
  expect(write).not.toHaveBeenCalled()
  await wrapper.get('.lobby-portrait img').trigger('error')
  expect(wrapper.get('.lobby-art-error').text()).toContain('立绘暂未加载')
  await open(wrapper); await choose('郭嘉')
  expect(wrapper.find('.lobby-art-error').exists()).toBe(false)
  expect(wrapper.get('.lobby-portrait img').attributes('src')).toContain('char_004_guojia.webp')
})

it('问候按本地时间更新，跨日恢复可见时更新日期，卸载释放时钟', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 6, 10, 59, 30))
  const wrapper = render()
  expect(wrapper.get('.lobby-greeting').text()).toBe('早上好，殿下')
  await vi.advanceTimersByTimeAsync(60000)
  expect(wrapper.get('.lobby-greeting').text()).toBe('中午好，殿下')
  for (const [hour, greeting] of [[13, '中午好'], [14, '下午好'], [18, '晚上好'], [5, '夜深了'], [6, '早上好']]) {
    vi.setSystemTime(new Date(2026, 9, 7, hour))
    window.dispatchEvent(new Event('pageshow'))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.lobby-greeting').text()).toBe(greeting + '，殿下')
  }
  expect(wrapper.get('time').attributes('datetime')).toBe('2026-10-07')
  await wrapper.setProps({ status: '星石状态待确认，无需重复录入。' })
  expect(wrapper.get('.lobby-status').text()).toContain('星石状态待确认')
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
