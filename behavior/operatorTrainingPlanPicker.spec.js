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
async function open(wrapper) { await wrapper.get('[aria-label="管理清单"]').trigger('click'); await flushPromises() }
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

it('顶部添加密探可将非星标成员加入特别关注清单，保留隐藏的已有成员', async () => {
  const favorites = new Set([a.id]), members = new Set([a.id])
  const favoritePlan = { id: 'favorites', name: '特别关注', source: 'favorites' }
  const wrapper = render({ plans: [favoritePlan], activePlan: favoritePlan, favoriteIds: favorites, memberIds: members })
  const actions = wrapper.get('.plan-heading-actions')
  expect(actions.text()).toContain('添加密探')
  expect(actions.text()).toContain('新建清单')
  expect(actions.text()).toContain('管理清单')
  expect(wrapper.get('.plan-source-note').text()).toContain('也可添加其他密探')
  await actions.findAll('button').find(button => button.text() === '添加密探').trigger('click')
  await flushPromises()
  expect(wrapper.get('dialog').element.open).toBe(true)
  expect(wrapper.get('.plan-selection-tabs [aria-pressed="true"]').text()).toContain('未选')
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
  expect(wrapper.get('.plan-candidates').text()).toContain('颜良')
  await wrapper.get('input[type="checkbox"]').setValue(true)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')[0][0]).toMatchObject({ id: 'favorites', source: 'favorites' })
  expect(new Set(wrapper.emitted('save')[0][0].operatorIds)).toEqual(new Set([a.id, b.id]))
  expect(favorites).toEqual(new Set([a.id]))
  expect(members).toEqual(new Set([a.id]))
})

it('养成中筛选使用拥有状态与养成标注，搜索和切换筛选不会丢失成员', async () => {
  const c = operatorFixture({ id: 'char_3_c', name: '陈登' })
  const d = operatorFixture({ id: 'char_4_d', name: '孙权' })
  const e = operatorFixture({ id: 'char_5_e', name: '王粲' })
  const growthStates = { [b.id]: 'active', [d.id]: 'graduated' }
  const wrapper = render({ catalogEntries: [a, b, c, d, e], growthStates,
    currentEntries: [{ id: a.id, starLevel: 0, level: 100 }, { id: b.id, starLevel: 1 },
      { id: c.id, huaji: { owned: true, stage: null } }, { id: d.id, starLevel: 1 }, { id: 'unknown', starLevel: 1 }] })
  await open(wrapper)
  const growing = wrapper.findAll('.plan-selection-tabs button').find(button => button.text().startsWith('养成中'))
  expect(growing.text()).toContain('2')
  await growing.trigger('click')
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2)
  expect(wrapper.get('.plan-candidates').text()).toContain('颜良')
  expect(wrapper.get('.plan-candidates').text()).toContain('陈登')
  expect(wrapper.get('.plan-candidates').text()).not.toMatch(/阿蝉|孙权|王粲/)
  await wrapper.get('input[type="search"]').setValue('颜良')
  await wrapper.get('input[type="checkbox"]').setValue(true)
  await wrapper.findAll('.plan-selection-tabs button').find(button => button.text().startsWith('已选')).trigger('click')
  await wrapper.get('form').trigger('submit')
  expect(new Set(wrapper.emitted('save')[0][0].operatorIds)).toEqual(new Set([a.id, b.id]))
  expect(growthStates).toEqual({ [b.id]: 'active', [d.id]: 'graduated' })
})

it('没有养成中成员时提供空态并可切回全部，已有成员仍可保存', async () => {
  const wrapper = render({ currentEntries: [{ id: a.id, starLevel: 0 }, { id: b.id, starLevel: 1 }], growthStates: { [b.id]: 'inactive' } })
  await open(wrapper)
  await wrapper.findAll('.plan-selection-tabs button').find(button => button.text().startsWith('养成中')).trigger('click')
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
  expect(wrapper.get('.plan-candidates').text()).toContain('可切换「全部」')
  await wrapper.findAll('.plan-selection-tabs button').find(button => button.text().startsWith('全部')).trigger('click')
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')[0][0].operatorIds).toEqual([a.id])
})

it('新建清单与添加成员区分，空工作区仍可创建且忙碌时禁用入口', async () => {
  const wrapper = render({ plans: [], activePlan: null })
  expect(wrapper.get('.plan-heading-actions').text()).toBe('新建清单')
  await wrapper.get('.plan-heading-actions button').trigger('click')
  expect(wrapper.get('dialog').element.open).toBe(true)
  expect(wrapper.get('#plan-editor-title').text()).toBe('建立培养清单')
  await wrapper.setProps({ disabled: true })
  expect(wrapper.get('.plan-heading-actions button').attributes('disabled')).toBeDefined()
  expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
})

it('已弃置及未知状态可读，保留清单成员和特别关注', async () => {
  const members = new Set([a.id]), favorites = new Set([a.id])
  const wrapper = render({ memberIds: members, favoriteIds: favorites, growthStates: { [a.id]: 'discarded', [b.id]: 'future' } })
  await open(wrapper)
  expect(wrapper.find('[aria-label="养成状态：已弃置，特别关注"]').exists()).toBe(true)
  expect(wrapper.text()).toContain('不支持的养成状态：future')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')[0][0].operatorIds).toEqual([a.id])
  expect(members).toEqual(new Set([a.id])); expect(favorites).toEqual(new Set([a.id]))
  wrapper.unmount()
})
