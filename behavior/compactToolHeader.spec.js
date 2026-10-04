import { expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import CompactToolHeader from '../src/components/CompactToolHeader.vue'
import DataAccountContextBar from '../src/components/DataAccountContextBar.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ fullPath: '/inventory' }) }))

it('帮助默认收起，可往返展开且不影响账号和主要操作；重新进入默认收起', async () => {
  const options = { props: { title: '背包库存', description: '清点当前账号库存' }, slots: {
    account: '<span>账号 A</span>', actions: '<button>录入库存</button>', help: '<p>库存使用说明</p>',
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
  expect(wrapper.get('.compact-tool-actions').text()).toBe('录入库存')
  wrapper.unmount()
  expect(mount(CompactToolHeader, options).find('.compact-tool-help-content').exists()).toBe(false)
})

it('紧凑账号区保留归属、错误和账号管理入口，默认账号条保持原说明', async () => {
  const wrapper = mount(DataAccountContextBar, { props: {
    compact: true, isLoggedIn: true, accounts: [{ id: 'a', name: '长账号名称', game: '代号鸢' }],
    accountId: 'a', error: '读取失败', description: '当前数据归属此账号',
  }, global: { stubs: { RouterLink: RouterLinkStub } } })
  expect(wrapper.get('.account-name').text()).toBe('长账号名称')
  expect(wrapper.get('[role="alert"]').text()).toBe('读取失败')
  expect(wrapper.text()).not.toContain('当前数据归属此账号')
  expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe('/user/profile#game-accounts')
  await wrapper.setProps({ compact: false })
  expect(wrapper.text()).toContain('当前数据归属此账号')
  await wrapper.setProps({ compact: true, isLoggedIn: false })
  expect(wrapper.text()).toContain('未登录')
  expect(wrapper.getComponent(RouterLinkStub).props('to')).toEqual({ path: '/login', query: { redirect: '/inventory' } })
})
