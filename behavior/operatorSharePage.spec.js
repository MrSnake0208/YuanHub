import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SharePage from '../src/pages/operator/share.vue'
import { useRoute, useRouter } from 'vue-router'
import { getOperatorCatalog, viewOperatorShare } from '../src/api/operator.js'
import { deferred, operatorFixture } from '../test-support/factories.js'
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ params: { token: '' } })
  const router = { push: vi.fn() }
  return { useRoute: () => route, useRouter: () => router }
})
// Deliberately export only reads: importing a command into this public page will fail the test suite.
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn(), viewOperatorShare: vi.fn() }))
vi.mock('../src/api/request.js', () => ({ avatarUrl: value => value || '' }))
const tokenA = '550e8400-e29b-41d4-a716-446655440000'
const tokenB = '550e8400-e29b-41d4-a716-446655440001'
const operator = operatorFixture({ id: 'char_001_test', name: '只读密探' })
const share = { game: '如鸢', catalog_version: 'fixture', updated_at: '2026-09-19T00:00:00Z', entries: { [operator.id]: operator.growth } }
let media
beforeEach(() => {
  useRoute().params.token = tokenA
  useRouter().push.mockReset()
  getOperatorCatalog.mockReset().mockResolvedValue({ operators: [operator] })
  viewOperatorShare.mockReset().mockResolvedValue(share)
  media = new EventTarget(); media.matches = false
  vi.stubGlobal('matchMedia', vi.fn(() => media))
})
const render = () => mount(SharePage, { global: { stubs: { IslandSidebar: true, SiteFooter: true, OperatorFilterDossier: true, ShareCardStats: true } } })
it('公开页加载真实卡片语义，点击卡片不打开编辑器或触发写请求', async () => {
  const wrapper = render(); await flushPromises()
  expect(viewOperatorShare).toHaveBeenCalledExactlyOnceWith(tokenA)
  const card = wrapper.get('article[role="listitem"]')
  expect(card.text()).toContain('只读密探')
  expect(card.attributes('tabindex')).toBeUndefined()
  expect(card.find('[role="button"]').exists()).toBe(false)
  await card.trigger('click')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(wrapper.find('dialog').exists()).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
  expect(viewOperatorShare).toHaveBeenCalledTimes(1)
})
it('快速切换分享代码时，旧请求结果不得污染新代码页面', async () => {
  const first = deferred(), second = deferred()
  viewOperatorShare.mockImplementation(token => token === tokenA ? first.promise : second.promise)
  const wrapper = render()
  useRoute().params.token = tokenB; await flushPromises()
  second.resolve({ ...share, game: '代号鸢' }); await flushPromises()
  first.resolve(share); await flushPromises()
  expect(wrapper.text()).toContain('代号鸢')
  expect(wrapper.text()).not.toContain('如鸢')
})
it.each([
  [Object.assign(new Error('gone'), { status: 404 }), '神秘代码已失效'],
  [new TypeError('Failed to fetch'), '暂时无法加载']
])('错误状态区分失效链接和网络失败，不尝试创建分享', async (error, text) => {
  viewOperatorShare.mockRejectedValue(error)
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(text)
  expect(fetch).not.toHaveBeenCalled()
})
it('空分享是有效空状态，不伪装成网络错误', async () => {
  viewOperatorShare.mockResolvedValue({ ...share, entries: {} })
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain('这个密探 BOX 还是空的')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})
it('非法代码由实际表单反馈，无 API 请求或路由跳转', async () => {
  useRoute().params.token = ''
  const wrapper = render(); await flushPromises()
  await wrapper.get('input').setValue('invalid token')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.get('[role="alert"]').text()).toContain('未识别')
  expect(viewOperatorShare).not.toHaveBeenCalled()
  expect(useRouter().push).not.toHaveBeenCalled()
})
it('viewport 变化通过 MediaQuery 事件更新卡片紧凑模式，无需刷新', async () => {
  const wrapper = render(); await flushPromises()
  const stats = () => wrapper.findComponent({ name: 'ShareCardStats' })
  expect(stats().exists()).toBe(true)
  expect(stats().props('enabled')).toBe(false)
  media.matches = true; media.dispatchEvent(new Event('change')); await flushPromises()
  expect(stats().props('enabled')).toBe(true)
  media.matches = false; media.dispatchEvent(new Event('change')); await flushPromises()
  expect(stats().props('enabled')).toBe(false)
})
