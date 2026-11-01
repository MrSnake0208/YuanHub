import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TodayLobby from '../src/components/today/TodayLobby.vue'
import { getOperatorCatalog } from '../src/api/operator.js'
import { AGENT_CATALOG } from '../src/data/inventory/catalog.js'

vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn() }))

beforeEach(() => {
  getOperatorCatalog.mockReset().mockResolvedValue({ operators: [...AGENT_CATALOG.map(entry => ({
    ...entry,
    games: entry.name === '孙尚香' ? ['代号鸢'] : ['代号鸢', '如鸢']
  })), { id: 'char_131_weiyan', name: '魏延', games: ['代号鸢', '如鸢'] }] })
})

const status = '当前账号的三项数据已录入，今日事项在下方。'
const render = props => mount(TodayLobby, { attachTo: document.body, props: { status, ...props } })

it('复用页头可覆盖页面名称，首页默认名称保持不变', async () => {
  const wrapper = render()
  expect(wrapper.get('h1').text()).toBe('今日一览')
  await wrapper.setProps({ title: '发展规划' })
  expect(wrapper.get('h1').text()).toBe('发展规划')
  expect(wrapper.get('.lobby-greeting').text()).toContain('殿下')
})

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

it('值守名单及搜索随当前游戏过滤，切换游戏不重复请求目录', async () => {
  const wrapper = render({ game: '如鸢' })
  await open(wrapper)
  expect(picker().querySelector('[aria-label="选择郭嘉值守"]')).not.toBeNull()
  expect(picker().querySelector('[aria-label="选择孙尚香值守"]')).toBeNull()
  for (const query of ['孙尚香', 'ssx']) {
    await search(query)
    expect(picker().textContent).toContain('没有找到密探')
  }
  await wrapper.setProps({ game: '代号鸢' })
  expect(picker().querySelector('[aria-label="选择孙尚香值守"]')).not.toBeNull()
  expect(getOperatorCatalog).toHaveBeenCalledTimes(1)
  await wrapper.setProps({ game: '' })
  expect(picker().querySelector('[aria-label="选择孙尚香值守"]')).not.toBeNull()
})

it('目录加载与失败时不放出未过滤名单，可重试恢复', async () => {
  let rejectCatalog
  getOperatorCatalog.mockImplementationOnce(() => new Promise((_, reject) => { rejectCatalog = reject }))
  const wrapper = render({ game: '如鸢' })
  await open(wrapper)
  expect(picker().textContent).toContain('正在读取密探目录')
  expect(picker().querySelectorAll('.duty-candidates button')).toHaveLength(0)
  rejectCatalog(new Error('合成目录失败'))
  await flushPromises()
  expect(picker().querySelector('[role="alert"]').textContent).toContain('合成目录失败')
  expect(picker().querySelectorAll('.duty-candidates button')).toHaveLength(0)
  picker().querySelector('.duty-retry').click()
  await flushPromises()
  expect(picker().querySelector('[role="alert"]')).toBeNull()
  expect(picker().querySelector('[aria-label="选择郭嘉值守"]')).not.toBeNull()
  expect(picker().querySelector('[aria-label="选择孙尚香值守"]')).toBeNull()
})

it('游戏不适用的已存值守暂用阿蝉，不覆盖偏好，切回后恢复', async () => {
  localStorage.setItem('yh_today_companion:user:user-a', 'char_003_sunshangxiang')
  const write = vi.spyOn(Storage.prototype, 'setItem')
  const wrapper = render({ ownerId: 'user-a', game: '如鸢' })
  await flushPromises()
  expect(wrapper.get('.lobby-duty').text()).toContain('阿蝉')
  await wrapper.setProps({ game: '代号鸢' })
  expect(wrapper.get('.lobby-duty').text()).toContain('孙尚香')
  expect(write).not.toHaveBeenCalled()
})

it('公共图鉴新增且有立绘的密探可选择，刷新后仍保留', async () => {
  const wrapper = render({ ownerId: 'user-a', game: '如鸢' })
  await open(wrapper)
  await choose('魏延')
  expect(wrapper.get('.lobby-duty').text()).toContain('魏延')
  wrapper.unmount()
  const restored = render({ ownerId: 'user-a', game: '如鸢' })
  await flushPromises()
  expect(restored.get('.lobby-duty').text()).toContain('魏延')
})

it('选择值守密探作为搜索框上方的可见关联标签', async () => {
  const wrapper = render()
  await open(wrapper)
  const input = picker().querySelector('input')
  const label = input.labels[0]
  expect(label.textContent).toBe('选择值守密探')
  expect(label.classList.contains('sr-only')).toBe(false)
  expect(label.contains(input)).toBe(false)
  expect(label.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('账号上下文与标题同属页头，问候场景不再承载账号入口', () => {
  const wrapper = mount(TodayLobby, { props: { status }, slots: { default: '<button>切换游戏账号</button>' } })
  expect(wrapper.get('.lobby-header h1').text()).toBe('今日一览')
  expect(wrapper.get('.lobby-header time').exists()).toBe(true)
  expect(wrapper.get('.lobby-header button').text()).toBe('切换游戏账号')
  expect(wrapper.get('.lobby-scene').text()).not.toContain('切换游戏账号')
})

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

it('页头日历日期以北京时间为准，与游戏活动跨日口径一致', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-06T16:01:00Z'))
  const wrapper = render()
  expect(wrapper.get('time').attributes('datetime')).toBe('2026-10-07')
  expect(wrapper.get('time').attributes('title')).toContain('北京时间')
  expect(wrapper.get('time').text()).toContain('10月7日')
})
