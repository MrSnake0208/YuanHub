import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import SharePage from '../src/pages/operator/share.vue'
import { useRoute, useRouter } from 'vue-router'
import { getOperatorCatalog, viewOperatorShare } from '../src/api/operator.js'
import { deferred, operatorFixture } from '../test-support/factories.js'
import { installViewport } from '../test-support/viewport.js'
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
const render = (stubs = {}) => mount(SharePage, { global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true, OperatorFilterDossier: true, ShareCardStats: true, ...stubs } } })
it.each([390, 1440])('公开页真实筛选跨布局保持搜索、焦点和只读单实例：%ipx', async width => {
  const viewport = installViewport(width)
  const wrapper = render({ OperatorFilterDossier: false, ShareCardStats: false })
  document.body.append(wrapper.element); await flushPromises()
  expect(wrapper.get('.share-filter-dossier').classes()).not.toContain('is-compact')
  const dossier = wrapper.getComponent({ name: 'OperatorFilterDossier' }).vm.$
  const search = wrapper.get('input[type="search"]')
  await search.setValue('只读')
  search.element.focus()
  for (const next of [640, 641, 1080, 1081, 320, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.getComponent({ name: 'OperatorFilterDossier' }).vm.$).toBe(dossier)
    expect(wrapper.findAll('article[role="listitem"]')).toHaveLength(1)
    expect(search.element.value).toBe('只读')
    expect(document.activeElement).toBe(search.element)
    expect(viewOperatorShare).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  }
})
it.each([[7, null, ''], [25, null, '未觉醒'], [25, false, '未觉醒'], [25, true, '已觉醒']])('化极%s觉醒%s的公开摘要未填按未觉醒且不在低星显示觉醒', async (stage, awakened, label) => {
  getOperatorCatalog.mockResolvedValue({ operators: [{ ...operator, rarity: 4 }] })
  viewOperatorShare.mockResolvedValue({ ...share, entries: { [operator.id]: { ...operator.growth, huaji: { owned: true, stage, awakened } } } })
  const wrapper = mount(SharePage, { global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true, OperatorFilterDossier: true,
    ShareCardStats: { template: '<div><slot name="growth" /></div>' } } } })
  await flushPromises()
  expect(wrapper.find('.ledger-huaji-value small').exists()).toBe(Boolean(label))
  if (label) expect(wrapper.get('.ledger-huaji-value small').text()).toBe(label)
  expect(fetch).not.toHaveBeenCalled()
  wrapper.unmount()
})
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
  [Object.assign(new Error('gone'), { status: 404 }), '分享码不存在或已失效'],
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

it.each([Object.assign(new Error('catalog missing'), { status: 404 }), new TypeError('Failed to fetch')])('图鉴故障不归因于分享码失效，重试后可恢复展示', async error => {
  getOperatorCatalog.mockRejectedValueOnce(error)
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('密探图鉴暂时无法加载')
  expect(wrapper.text()).not.toContain('分享码不存在或已失效')
  const retry = wrapper.findAll('button').find(button => button.text() === '重试')
  await retry.trigger('click'); await flushPromises()
  expect(wrapper.findAll('article[role="listitem"]')).toHaveLength(1)
  expect(viewOperatorShare).toHaveBeenCalledTimes(2)
  expect(fetch).not.toHaveBeenCalled()
})

it.each([
  [Object.assign(new Error('upstream stack trace'), { status: 503 }), '分享服务暂时不可用'],
  [Object.assign(new Error('transport details'), { code: 'REQUEST_TIMEOUT' }), '读取分享数据超时']
])('服务故障与超时使用可恢复文案，不展示底层错误', async (error, text) => {
  viewOperatorShare.mockRejectedValueOnce(error)
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(text)
  expect(wrapper.text()).not.toContain(error.message)
  await wrapper.findAll('button').find(button => button.text() === '重试').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('article[role="listitem"]')).toHaveLength(1)
})

it('完整链接输入后返回输入框保留原值，可修改分享码', async () => {
  useRoute().params.token = ''
  const wrapper = render(); await flushPromises()
  const link = 'https://yuan.example/operator/share/' + tokenA
  await wrapper.get('input').setValue(link)
  await wrapper.get('form').trigger('submit')
  expect(useRouter().push).toHaveBeenLastCalledWith({ name: 'operator-share', params: { token: tokenA } })
  useRoute().params.token = tokenA; await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '重新输入').trigger('click')
  useRoute().params.token = ''; await flushPromises()
  expect(wrapper.get('input').element.value).toBe(link)
  await wrapper.get('input').setValue(tokenB)
  await wrapper.get('form').trigger('submit')
  expect(useRouter().push).toHaveBeenLastCalledWith({ name: 'operator-share', params: { token: tokenB } })
})

it('外部路由换码后返回输入框保留当前代码，迟到的图鉴错误不污染新页面', async () => {
  const firstCatalog = deferred()
  getOperatorCatalog.mockReturnValueOnce(firstCatalog.promise)
  const wrapper = render()
  useRoute().params.token = tokenB; await flushPromises()
  firstCatalog.reject(Object.assign(new Error('old 404'), { status: 404 })); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  useRoute().params.token = ''; await flushPromises()
  expect(wrapper.get('input').element.value).toBe(tokenB)
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

it('独立公开页保留输入标题和路由式查询，不受弹窗紧凑入口影响', async () => {
  useRoute().params.token = ''
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.share-entry h2').text()).toBe('输入 BOX 分享码')
  expect(wrapper.get('.share-entry button').text()).toBe('查看密探 BOX')
  expect(wrapper.find('.share-entry-notice').exists()).toBe(false)
  await wrapper.get('input').setValue(tokenA)
  await wrapper.get('form').trigger('submit')
  expect(useRouter().push).toHaveBeenCalledExactlyOnceWith({ name: 'operator-share', params: { token: tokenA } })
})

it('密探入口粘贴星石完整链接时尊重星石路径，不丢弃类型', async () => {
  useRoute().params.token = ''
  const wrapper = render(); await flushPromises()
  await wrapper.get('input').setValue('https://yuan.example/star/share/' + tokenA)
  await wrapper.get('form').trigger('submit')
  expect(useRouter().push).toHaveBeenLastCalledWith({ name: 'star-share', params: { token: tokenA } })
  expect(viewOperatorShare).not.toHaveBeenCalled()
})
it('密探未授权时显示独立提示，不归类为空 BOX', async () => {
  viewOperatorShare.mockRejectedValue(Object.assign(new Error('disabled'), { status: 404, code: 'share_not_authorized' }))
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('尚未公开密探 BOX')
  expect(wrapper.find('article').exists()).toBe(false)
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

it('公开分享显示已弃置及未知状态，保留全部成员', async () => {
  getOperatorCatalog.mockResolvedValue({ operators: [operator, { ...operator, id: 'future', name: '未知状态密探' }] })
  viewOperatorShare.mockResolvedValue({ ...share, entries: {
    [operator.id]: { ...operator.growth, growth_state: 'discarded' },
    future: { ...operator.growth, growth_state: 'future' },
  } })
  const wrapper = render(); await flushPromises()
  const options = wrapper.getComponent({ name: 'OperatorFilterDossier' }).props('statusOptions')
  expect(options.map(option => option.value)).toEqual(['all', 'growing', 'graduated', 'inactive'])
  expect(wrapper.findAll('article[role="listitem"]')).toHaveLength(2)
  expect(wrapper.text()).toContain('已弃置')
  expect(wrapper.text()).toContain('不支持的养成状态：future')
  expect(fetch).not.toHaveBeenCalled()
  wrapper.unmount()
})
