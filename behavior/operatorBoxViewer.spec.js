import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import OperatorBoxViewer from '../src/components/operator/OperatorBoxViewer.vue'
import OperatorShareContent from '../src/components/operator/OperatorShareContent.vue'
import { modalFocusState } from '../src/composables/useModalFocus.js'
import { useRoute, useRouter } from 'vue-router'
import { getOperatorCatalog, viewOperatorShare } from '../src/api/operator.js'
import { deferred, operatorFixture } from '../test-support/factories.js'
import { installViewport } from '../test-support/viewport.js'

vi.mock('vue-router', () => {
  const route = { path: '/operator', query: { tab: 'current' }, params: {} }
  const router = { push: vi.fn(), replace: vi.fn() }
  return { useRoute: () => route, useRouter: () => router }
})
// Only public reads exist here; importing any private command fails the suite.
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn(), viewOperatorShare: vi.fn() }))
vi.mock('../src/api/request.js', () => ({ avatarUrl: value => value || '' }))
const tokenA = '550e8400-e29b-41d4-a716-446655440000'
const tokenB = '550e8400-e29b-41d4-a716-446655440001'
const operator = operatorFixture({ id: 'char_001_test', name: '公开密探' })
const share = { game: '如鸢', catalog_version: 'fixture', entries: { [operator.id]: operator.growth } }
const node = selector => new DOMWrapper(document.querySelector(selector))
const panel = () => node('#operator-box-viewer')
const button = text => panel().findAll('button').find(item => item.text() === text)
const escape = () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
let wrapper
beforeEach(() => {
  installViewport(1440)
  useRouter().push.mockReset(); useRouter().replace.mockReset()
  getOperatorCatalog.mockReset().mockResolvedValue({ operators: [operator] })
  viewOperatorShare.mockReset().mockResolvedValue(share)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
async function render() {
  wrapper = mount(defineComponent({
    components: { OperatorBoxViewer },
    setup: () => ({ open: ref(false) }),
    template: '<main id="main-content"><button class="opener" @click="open = true">查看他人 BOX</button><OperatorBoxViewer v-model:open="open" /></main>',
  }), { attachTo: document.body })
  await open()
  return wrapper
}
async function open() {
  wrapper.get('.opener').element.focus()
  await wrapper.get('.opener').trigger('click'); await flushPromises()
}
async function submit(value = tokenA) {
  await panel().get('input').setValue(value)
  await panel().get('form').trigger('submit'); await flushPromises()
}

it.each([false, true])('公开标签在两种宿主中只读展示，可组合筛选、重置及刷新撤销：embedded=%s', async embedded => {
  const other = operatorFixture({ id: 'char_other', name: '备用密探', prof: ['阴'], sub_prof: ['破军'] })
  const entries = { [operator.id]: operator.growth, [other.id]: { ...other.growth, growth_state: 'graduated' } }
  getOperatorCatalog.mockResolvedValue({ operators: [operator, other] })
  viewOperatorShare.mockResolvedValue({ ...share, entries, tags: [
    { id: 'main', name: '<b>主力</b>', operator_ids: [operator.id] },
    { id: 'backup', name: '备用', operator_ids: [other.id] },
    { id: 'hidden', name: '未公开密探标签', operator_ids: ['not-shared'] },
  ] })
  const content = mount(OperatorShareContent, { props: { token: tokenA, embedded }, attachTo: document.body })
  await flushPromises()
  const tagButton = name => content.findAll('.pf-tag-row button').find(item => item.text().startsWith(name))
  expect(content.findAll('.share-ledger-tags')).toHaveLength(2)
  expect(content.get('.share-ledger-tags').text()).toContain('<b>主力</b>')
  expect(content.find('.share-ledger-tags b').exists()).toBe(false)
  expect(content.findAll('.share-ledger-tags button, .share-ledger-tags input')).toHaveLength(0)
  expect(content.get('.pf-tag-row').text()).not.toContain('未公开密探标签')
  await tagButton('<b>主力</b>').trigger('click')
  expect(content.findAll('article')).toHaveLength(1)
  expect(content.get('article').text()).toContain('公开密探')
  await content.get('.status-graduated').trigger('click')
  expect(content.findAll('article')).toHaveLength(0)
  await content.get('.current-filter-reset').trigger('click')
  expect(content.findAll('article')).toHaveLength(2)
  await tagButton('备用').trigger('click')
  await content.get('input[type="search"]').setValue('公开密探')
  expect(content.findAll('article')).toHaveLength(0)
  await content.get('.current-filter-reset').trigger('click')
  await tagButton('备用').trigger('click')
  viewOperatorShare.mockResolvedValue({ ...share, entries, tags: [] })
  await content.findAll('button').find(item => item.text() === '刷新数据').trigger('click'); await flushPromises()
  expect(content.find('.pf-tag-row').exists()).toBe(false)
  expect(content.find('.share-ledger-tags').exists()).toBe(false)
  expect(content.findAll('article')).toHaveLength(2)
  viewOperatorShare.mockResolvedValue({ ...share, entries, tags: [{ id: 'new', name: '新分享标签', operator_ids: [other.id] }] })
  await content.setProps({ token: tokenB }); await flushPromises()
  expect(content.get('.pf-tag-row').text()).toContain('新分享标签')
  await tagButton('新分享标签').trigger('click')
  viewOperatorShare.mockResolvedValue({ ...share, entries })
  await content.setProps({ token: tokenA }); await flushPromises()
  expect(content.findAll('article')).toHaveLength(2)
  expect(content.find('.pf-tag-row').exists()).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
  content.unmount()
})

it.each([390, 768, 1440])('站内完整链接输入、只读卡片、筛选、刷新和重新输入不跳转：%ipx', async width => {
  installViewport(width)
  await render()
  expect(panel().attributes('aria-modal')).toBe('true')
  expect(panel().text()).toContain('查看他人 BOX')
  expect(panel().findAll('h2').map(item => item.text())).toEqual(['查看他人 BOX'])
  expect(panel().get('.share-entry-notice').text()).toContain('不会修改你的密探档案')
  expect(panel().get('label').text()).toContain('输入分享码或分享链接')
  expect(panel().findAll('.box-step-number').map(item => item.text())).toEqual(['1', '2'])
  expect(panel().get('.box-preview-empty').text()).toContain('在这里查看公开的密探档案')
  expect(panel().get('.share-entry-notice').text()).toContain('仅展示对方已公开的内容，无需登录')
  expect(button('查看 BOX')).toBeDefined()
  expect(document.activeElement).toBe(panel().get('input').element)
  expect(viewOperatorShare).not.toHaveBeenCalled()
  const link = 'https://yuan.example/operator/share/' + tokenA
  await submit(link)
  expect(viewOperatorShare).toHaveBeenCalledExactlyOnceWith(tokenA)
  expect(panel().classes()).toContain('has-results')
  expect(panel().find('.box-preview-empty').exists()).toBe(false)
  expect(panel().get('.box-results-title').text()).toContain('查看公开内容')
  const filters = panel().get('.share-filter-dossier')
  expect(filters.classes()).toContain('is-compact')
  expect(filters.get('.dossier-extra').isVisible()).toBe(false)
  expect(filters.get('.pf-status-row').isVisible()).toBe(true)
  const more = filters.get('.dossier-more')
  expect(more.attributes('aria-expanded')).toBe('false')
  await more.trigger('click')
  expect(more.attributes('aria-expanded')).toBe('true')
  expect(filters.get('.dossier-extra').isVisible()).toBe(true)
  await filters.findAll('.pf-prof-row button').find(item => item.text() === '阴').trigger('click')
  expect(panel().findAll('article[role="listitem"]')).toHaveLength(0)
  await more.trigger('click')
  expect(filters.get('.dossier-extra').isVisible()).toBe(false)
  expect(panel().text()).toContain('没有匹配的密探')
  await filters.get('.current-filter-reset').trigger('click')
  expect(filters.find('.current-filter-reset').exists()).toBe(false)
  expect(panel().findAll('article[role="listitem"]')).toHaveLength(1)
  const card = panel().get('article[role="listitem"]')
  expect(card.text()).toContain('公开密探')
  expect(card.attributes('tabindex')).toBeUndefined()
  expect(card.find('input, textarea, [role="button"]').exists()).toBe(false)
  expect(card.findAll('button').every(item => item.classes().includes('share-stats-toggle'))).toBe(true)
  if (width === 390) {
    await card.get('.share-stats-toggle').trigger('click')
    expect(card.get('.share-stats-toggle').attributes('aria-pressed')).toBe('true')
  }
  await card.trigger('click')
  expect(panel().findAll('article')).toHaveLength(1)
  await panel().get('input[type="search"]').setValue('无匹配')
  expect(panel().text()).toContain('没有匹配的密探')
  await button('清空条件').trigger('click')
  expect(panel().findAll('article')).toHaveLength(1)
  await button('刷新数据').trigger('click'); await flushPromises()
  expect(viewOperatorShare).toHaveBeenCalledTimes(2)
  await button('重新输入').trigger('click'); await flushPromises()
  expect(panel().get('input').element.value).toBe(link)
  expect(document.activeElement).toBe(panel().get('input').element)
  expect(panel().classes()).not.toContain('has-results')
  expect(panel().find('.box-preview-empty').exists()).toBe(true)
  expect(document.querySelectorAll('#main-content')).toHaveLength(1)
  expect(panel().find('main, footer, iframe, .share-main, .island-sidebar').exists()).toBe(false)
  expect(useRouter().push).not.toHaveBeenCalled(); expect(useRouter().replace).not.toHaveBeenCalled()
  expect(useRoute()).toMatchObject({ path: '/operator', query: { tab: 'current' } })
  expect(fetch).not.toHaveBeenCalled()
})

it('从长结果重新输入或重试时将弹窗内容滚回顶部，避免隐藏输入入口', async () => {
  await render(); await submit()
  const body = panel().get('.box-viewer-body').element
  // jsdom 没有布局；为自动聚焦后的可见性检查提供真实可用的内容区。
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 24, 100, 44))
  vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 680, 400))
  body.scrollTop = 700
  await button('重新输入').trigger('click'); await flushPromises()
  expect(body.scrollTop).toBe(0)
  expect(document.activeElement).toBe(panel().get('input').element)
  viewOperatorShare.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await submit(tokenB)
  expect(panel().text()).toContain('暂时无法加载')
  body.scrollTop = 200
  await button('重试').trigger('click'); await flushPromises()
  expect(body.scrollTop).toBe(0)
  expect(panel().findAll('article')).toHaveLength(1)
  expect(useRouter().push).not.toHaveBeenCalled()
})

it.each([
  'https://yuan.example/star/share/' + tokenA,
  'https://yuan.example/operator/share/' + tokenA + '?view=star',
])('星石链接保留类型并提供新标签入口：%s', async link => {
  await render(); await submit(link)
  const action = panel().get('a')
  expect(action.text()).toBe('在新标签打开星石背包')
  expect(action.attributes()).toMatchObject({ href: '/star/share/' + tokenA, target: '_blank', rel: 'noopener noreferrer' })
  expect(viewOperatorShare).not.toHaveBeenCalled()
  expect(useRouter().push).not.toHaveBeenCalled()
  await submit(tokenB)
  expect(panel().find('a').exists()).toBe(false)
  expect(viewOperatorShare).toHaveBeenCalledExactlyOnceWith(tokenB)
})

it.each(['', 'invalid token', 'javascript:alert(1)'])('非法输入仅显示字段错误：%s', async value => {
  await render(); await submit(value)
  expect(panel().get('input').attributes('aria-invalid')).toBe('true')
  expect(panel().get('[role="alert"]').text()).toMatch(/请输入|未识别/)
  expect(viewOperatorShare).not.toHaveBeenCalled()
  await submit(tokenA)
  expect(panel().findAll('article')).toHaveLength(1)
})

it.each([
  [new TypeError('Failed to fetch'), '暂时无法加载'],
  [Object.assign(new Error('disabled'), { code: 'share_not_authorized', status: 404 }), '尚未公开密探 BOX'],
])('错误和未授权可重试恢复：%s', async (error, message) => {
  viewOperatorShare.mockRejectedValueOnce(error)
  await render(); await submit()
  expect(panel().get('[role="alert"]').text()).toContain(message)
  await button('重试').trigger('click'); await flushPromises()
  expect(panel().findAll('article')).toHaveLength(1)
  expect(useRouter().push).not.toHaveBeenCalled()
})

it('失效代码重新输入及有效空分享均保留刷新和退出入口', async () => {
  viewOperatorShare.mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 404 }))
  await render(); await submit()
  expect(panel().get('[role="alert"]').text()).toContain('分享码不存在或已失效')
  await button('重新输入').trigger('click'); await flushPromises()
  viewOperatorShare.mockResolvedValueOnce({ ...share, entries: {} })
  await submit(tokenB)
  expect(panel().text()).toContain('这个密探 BOX 还是空的')
  expect(button('刷新数据')).toBeDefined()
  expect(button('重新输入')).toBeDefined()
})

it.each(['success', 'failure'])('请求中重新输入、快速换码隔离旧%s', async outcome => {
  const pending = deferred()
  viewOperatorShare.mockReturnValueOnce(pending.promise)
  await render(); await submit()
  expect(panel().text()).toContain('正在打开密探 BOX')
  await button('重新输入').trigger('click'); await flushPromises()
  await submit(tokenB)
  if (outcome === 'success') pending.resolve({ ...share, game: '旧版本' })
  else pending.reject(Object.assign(new Error('old'), { status: 404 }))
  await flushPromises()
  expect(panel().findAll('article')).toHaveLength(1)
  expect(panel().text()).not.toContain('旧版本')
  expect(panel().find('[role="alert"]').exists()).toBe(false)
  expect(viewOperatorShare.mock.calls.map(([token]) => token)).toEqual([tokenA, tokenB])
})

it.each(['success', 'failure'])('关闭后迟到%s不污染重新打开的新实例', async outcome => {
  const pending = deferred()
  viewOperatorShare.mockReturnValueOnce(pending.promise)
  await render(); await submit()
  const old = wrapper.getComponent(OperatorShareContent).vm.$
  await panel().get('[aria-label="关闭查看他人 BOX"]').trigger('click'); await flushPromises()
  expect(document.querySelector('#operator-box-viewer')).toBeNull()
  await open(); await submit(tokenB)
  expect(wrapper.getComponent(OperatorShareContent).vm.$).not.toBe(old)
  if (outcome === 'success') pending.resolve({ ...share, entries: {} })
  else pending.reject(new Error('late failure'))
  await flushPromises()
  expect(panel().findAll('article')).toHaveLength(1)
  expect(panel().text()).not.toContain('空的')
  expect(panel().find('[role="alert"]').exists()).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

it('关闭、Escape、遮罩与卸载恢复滚动和焦点，拖出内容不误关闭', async () => {
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(420)
  document.body.style.overflow = 'auto'
  document.documentElement.style.overflow = 'scroll'
  await render()
  expect(document.body.style.position).toBe('fixed')
  expect(document.body.style.top).toBe('-420px')
  expect(modalFocusState.panel).toBe(panel().element)
  const last = button('查看 BOX'), close = panel().get('.box-viewer-close')
  last.element.focus()
  last.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(close.element)
  await panel().get('input').trigger('pointerdown')
  await node('.box-viewer-mask').trigger('click')
  expect(document.querySelector('#operator-box-viewer')).not.toBeNull()
  escape(); await flushPromises()
  expect(document.querySelector('#operator-box-viewer')).toBeNull()
  expect(document.activeElement).toBe(wrapper.get('.opener').element)
  expect(document.body.style.overflow).toBe('auto')
  expect(document.documentElement.style.overflow).toBe('scroll')
  expect(window.scrollTo).toHaveBeenLastCalledWith(0, 420)
  await open()
  await node('.box-viewer-mask').trigger('pointerdown')
  await node('.box-viewer-mask').trigger('click'); await flushPromises()
  expect(document.querySelector('#operator-box-viewer')).toBeNull()
  await open(); wrapper.unmount()
  expect(document.body.style.position).toBe('')
  expect(document.body.style.overflow).toBe('auto')
  document.body.style.overflow = ''; document.documentElement.style.overflow = ''
})

it('软键盘缩短视口保留输入与请求状态，并清理视口监听', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  const remove = vi.spyOn(viewport, 'removeEventListener')
  await render()
  const input = panel().get('input')
  await input.setValue(tokenA); input.element.focus()
  viewport.height = 240; viewport.offsetTop = 30
  viewport.dispatchEvent(new Event('resize')); await flushPromises()
  expect(node('.box-viewer-mask').classes()).toContain('is-short-viewport')
  expect(node('.box-viewer-mask').element.style.height).toBe('240px')
  expect(node('.box-viewer-mask').element.style.top).toBe('30px')
  expect(panel().get('input').element).toBe(input.element)
  expect(document.activeElement).toBe(input.element)
  expect(viewOperatorShare).not.toHaveBeenCalled()
  await panel().get('.box-viewer-close').trigger('click'); await flushPromises()
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
})
