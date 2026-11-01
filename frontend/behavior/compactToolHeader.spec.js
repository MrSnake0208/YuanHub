import { beforeEach, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { h } from 'vue'
import CompactToolHeader from '../src/components/CompactToolHeader.vue'
import DataAccountContextBar from '../src/components/DataAccountContextBar.vue'

beforeEach(() => { window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })

it('手机上下文布局保留署名、摘要、主操作与辅助操作，原帮助仍可展开', async () => {
  const save = vi.fn()
  const wrapper = mount(CompactToolHeader, { props: { title: '礼包预算', description: '作者：binary · 独立创作', mobileContext: true, mobileDescription: true }, slots: {
    account: '<button>代号鸢</button>', 'primary-actions': () => h('button', { onClick: save }, '保存方案'),
    actions: '<button>我的方案</button>', summary: '<p>真实统计</p>', help: '<p>原有帮助</p>',
  } })
  expect(wrapper.classes()).toContain('mobile-context-header')
  expect(wrapper.classes()).toContain('mobile-description')
  expect(wrapper.get('.compact-tool-description').text()).toContain('binary')
  expect(wrapper.get('.compact-tool-summary').text()).toBe('真实统计')
  expect(wrapper.get('.compact-tool-utilities').text()).toContain('我的方案')
  await wrapper.get('.compact-tool-primary button').trigger('click')
  expect(save).toHaveBeenCalledOnce()
  await wrapper.get('.compact-tool-help').trigger('click')
  expect(wrapper.get('.compact-tool-help-content').text()).toBe('原有帮助')
})

vi.mock('vue-router', () => ({ useRoute: () => ({ fullPath: '/inventory' }), onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }))

it('页头只承载身份、账号和 Utility，帮助可往返展开；不要求主操作', async () => {
  const options = { props: { title: '背包库存', description: '清点当前账号库存' }, slots: {
    account: '<span>账号 A</span>', actions: '<details><summary>更多</summary></details>', help: '<p>库存使用说明</p>',
  } }
  const wrapper = mount(CompactToolHeader, options)
  expect(wrapper.get('h1').text()).toBe('背包库存')
  expect(wrapper.find('.compact-tool-help-content').exists()).toBe(false)
  const trigger = wrapper.get('.compact-tool-help')
  await trigger.trigger('click')
  expect(trigger.attributes('aria-expanded')).toBe('true')
  expect(wrapper.get('.compact-tool-help-content').attributes('id')).toBe(trigger.attributes('aria-controls'))
  expect(wrapper.get('.compact-tool-help-content').text()).toBe('库存使用说明')
  await trigger.trigger('click')
  expect(trigger.attributes('aria-expanded')).toBe('false')
  expect(wrapper.get('.compact-tool-account').text()).toBe('账号 A')
  expect(wrapper.find('.compact-tool-primary').exists()).toBe(false)
  expect(wrapper.get('.compact-tool-actions').text()).toContain('帮助')
  expect(wrapper.get('.compact-tool-actions').text()).toContain('更多')
  wrapper.unmount()
  expect(mount(CompactToolHeader, options).find('.compact-tool-help-content').exists()).toBe(false)
})

it('紧凑账号区保留归属、错误和账号管理入口，默认账号条保持原说明', async () => {
  const wrapper = mount(DataAccountContextBar, { props: {
    compact: true, isLoggedIn: true, accounts: [{ id: 'a', name: '长账号名称', game: '代号鸢' }],
    accountId: 'a', error: '读取失败', description: '当前数据归属此账号',
  }, global: { stubs: { RouterLink: RouterLinkStub } } })
  expect(wrapper.get('.account-name').text()).toBe('长账号名称')
  expect(wrapper.get('.context-selector').attributes('title')).toBe('代号鸢 · 长账号名称')
  expect(wrapper.get('.context-selector').attributes('aria-label')).toContain('打开账号切换器')
  expect(wrapper.text()).not.toContain('切换账号')
  expect(wrapper.find('.context-actions').exists()).toBe(false)
  expect(wrapper.get('[role="alert"]').text()).toBe('读取失败')
  expect(wrapper.text()).not.toContain('当前数据归属此账号')
  await wrapper.get('.context-selector').trigger('click')
  expect([...document.querySelectorAll('.account-switch-panel footer button')].map(button => button.textContent)).toEqual(['新建游戏账号', '管理游戏账号'])
  await wrapper.setProps({ compact: false })
  expect(wrapper.text()).toContain('当前数据归属此账号')
  expect(wrapper.find('.context-selector').exists()).toBe(true)
  expect(wrapper.get('.context-action').text()).toBe('管理游戏账号')
  await wrapper.setProps({ compact: true, isLoggedIn: false })
  expect(wrapper.text()).toContain('未登录')
  expect(wrapper.getComponent(RouterLinkStub).props('to')).toEqual({ path: '/login', query: { redirect: '/inventory' } })
})

it('compact 账号为空或读取中仍保留原管理目标与可读状态', async () => {
  const wrapper = mount(DataAccountContextBar, { props: { compact: true, isLoggedIn: true }, global: { stubs: { RouterLink: RouterLinkStub } } })
  expect(wrapper.get('.context-selector').text()).toBe('选择游戏账号')
  await wrapper.get('.context-selector').trigger('click')
  expect([...document.querySelectorAll('.account-switch-panel footer button')].map(button => button.textContent)).toEqual(['新建游戏账号', '管理游戏账号'])
  await wrapper.setProps({ loading: true })
  expect(wrapper.get('.context-selector').text()).toBe('正在读取账号…')
})

it.each([[390, 1440], [1440, 390]])('页头 %i→%i 保持帮助、账号和焦点', async (from, to) => {
  const previousWidth = window.innerWidth
  window.innerWidth = from
  const wrapper = mount(CompactToolHeader, { attachTo: document.body, props: { title: '星石背包' }, slots: { account: '<span>账号 A</span>', help: '<p>未关闭的说明</p>' } })
  try {
    const instance = wrapper.vm.$
    const trigger = wrapper.get('.compact-tool-help')
    await trigger.trigger('click')
    trigger.element.focus()
    const content = wrapper.get('.compact-tool-help-content').element
    window.innerWidth = to
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.$).toBe(instance)
    expect(wrapper.get('.compact-tool-help-content').element).toBe(content)
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.compact-tool-account').text()).toBe('账号 A')
    expect(document.activeElement).toBe(trigger.element)
  } finally { wrapper.unmount(); window.innerWidth = previousWidth }
})
