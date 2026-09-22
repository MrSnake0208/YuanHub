import { expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Picker from '../src/components/operator/OperatorTrainingPlanPicker.vue'
import { operatorFixture } from '../test-support/factories.js'
const a = operatorFixture({ id: 'char_1_a', name: '阿蝉', prof: ['阳'] })
const b = operatorFixture({ id: 'char_2_b', name: '颜良', prof: ['水'] })
const plan = { id: 'plan-a', name: '第一张清单', source: 'custom' }
function render(overrides = {}) {
  return mount(Picker, { attachTo: document.body, props: { accountId: 'a', plans: [plan], activePlan: plan, catalogEntries: [a, b], memberIds: new Set([a.id]), ...overrides } })
}
async function open(wrapper) { await wrapper.get('[aria-label="编辑清单"]').trigger('click'); await flushPromises() }
it('候选项通过实际勾选更新草稿，保存事件携带完整成员且不修改传入 Set', async () => {
  const members = new Set([a.id]); const wrapper = render({ memberIds: members }); await open(wrapper)
  const row = wrapper.findAll('label').find(node => node.text().includes('颜良') && node.find('input[type="checkbox"]').exists())
  expect(row.findComponent({ name: 'OperatorAvatar' }).exists()).toBe(true)
  await row.get('input').setValue(true)
  await wrapper.get('form').trigger('submit')
  const [payload] = wrapper.emitted('save')[0]
  expect(payload).toMatchObject({ id: plan.id, name: plan.name, source: 'custom' })
  expect(new Set(payload.operatorIds)).toEqual(new Set([a.id, b.id]))
  expect(members).toEqual(new Set([a.id]))
})
it('特别关注与养成状态提供可读语义，不依赖桌面或手机 CSS 实现', async () => {
  const wrapper = render({ favoriteIds: new Set([a.id]), growthStates: { [a.id]: 'graduated', [b.id]: 'inactive' } }); await open(wrapper)
  expect(wrapper.find('[aria-label="养成状态：已毕业，特别关注"]').exists()).toBe(true)
  expect(wrapper.find('[aria-label="养成状态：养老中"]').exists()).toBe(true)
  expect(wrapper.find('[aria-label="特别关注"]').exists()).toBe(true)
  expect(wrapper.text()).toContain('阿蝉'); expect(wrapper.text()).toContain('颜良')
})
it('切换子账号立即关闭旧清单编辑器，不等待刷新页面', async () => {
  const wrapper = render(); await open(wrapper)
  expect(wrapper.get('dialog').element.open).toBe(true)
  await wrapper.setProps({ accountId: 'b' })
  expect(wrapper.get('dialog').element.open).toBe(false)
  expect(wrapper.emitted('save')).toBeUndefined()
})
it('删除必须二次确认，保留清单不会发出删除事件', async () => {
  const wrapper = render(); await open(wrapper)
  await wrapper.findAll('button').find(node => node.text() === '删除清单').trigger('click')
  expect(wrapper.get('[role="alert"]').text()).toContain('删除')
  expect(wrapper.emitted('remove')).toBeUndefined()
  await wrapper.findAll('button').find(node => node.text() === '保留清单').trigger('click')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.emitted('remove')).toBeUndefined()
})
it('清单菜单按用户选择发出新 id，重复选择当前项不发出写操作', async () => {
  const second = { ...plan, id: 'plan-b', name: '第二张清单' }
  const wrapper = render({ plans: [plan, second] })
  await wrapper.get('[aria-haspopup="menu"]').trigger('click')
  const items = wrapper.findAll('[role="menuitemradio"]')
  expect(items[0].attributes('aria-checked')).toBe('true')
  await items[0].trigger('click'); expect(wrapper.emitted('select')).toBeUndefined()
  await wrapper.get('[aria-haspopup="menu"]').trigger('click')
  await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
  expect(wrapper.emitted('select')).toEqual([['plan-b']])
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
})
it('搜索只筛选可见候选，不丢失已选成员', async () => {
  const wrapper = render(); await open(wrapper)
  await wrapper.get('input[type="search"]').setValue('颜良')
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')[0][0].operatorIds).toEqual([a.id])
})
