import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OperatorReserveWorkspace from '../src/components/operator/OperatorReserveWorkspace.vue'
import PlannerSelect from '../src/components/operator/PlannerSelect.vue'
import OperatorGrowthTracker from '../src/components/operator/OperatorGrowthTracker.vue'
import * as plannerApi from '../src/api/operatorPlanner.js'
import { auth } from '../src/store/auth.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, adminAccess: { permissions: [] } }) }
})

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), inventory: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({
  getOperatorReserveWorkspace: api.get, putOperatorReserveWorkspace: api.put,
  getOperatorGrowthTargets: vi.fn(async () => ({ items: [] })), putOperatorGrowthTarget: vi.fn()
}))
vi.mock('../src/api/operatorPlanner.js', async importOriginal => {
  const actual = await importOriginal(); return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/inventory.js', () => ({ getCurrent: api.inventory, listRecords: vi.fn(async () => ({ items: [] })) }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))
const PLAN = '00000000-0000-4000-8000-000000000001'
const DEMAND = '00000000-0000-4000-8000-000000000002'
const copy = value => JSON.parse(JSON.stringify(value))
const demand = overrides => ({ id: DEMAND, count: 1, attribute: '阴', profession: '破军',
  current: { level: 100, elite: 13, breakthrough_stage: 9 }, target: { level: 100, elite: 17 }, ...overrides })
const workspace = (account = 'a', plans = [{ id: PLAN, name: '未来主队', demands: [demand()] }], revision = 0) => ({
  schema_version: 1, account_id: account, game_snapshot: '如鸢', read_only: false,
  revision, updated_at: null, active_plan_id: plans[0]?.id || null, plans
})
const render = props => mount(OperatorReserveWorkspace, { props: { accountId: 'a', game: '如鸢', stock: {}, ...props }, attachTo: document.body })
const button = (wrapper, text) => wrapper.findAll('button').find(node => node.text() === text)
const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const input = (wrapper, field) => wrapper.get(`input[id$="-${field}"]`)
async function choose(wrapper, label, value) {
  const select = wrapper.findAllComponents(PlannerSelect).find(node => node.props('label') === label)
  await select.get('[role="combobox"]').trigger('click')
  const index = select.props('options').findIndex(option => option.value === value)
  await select.findAll('[role="option"]')[index].trigger('click')
}
beforeEach(() => {
  auth.isLoggedIn = true
  auth.adminAccess = { permissions: ['operator_reserve:use'] }
  api.get.mockReset().mockImplementation(account => Promise.resolve(workspace(account)))
  api.put.mockReset().mockImplementation((account, body) => Promise.resolve({ ...copy(body), account_id: account, revision: body.expected_revision + 1, game_snapshot: '如鸢', read_only: false, updated_at: '2026-10-23T00:00:00Z' }))
  api.inventory.mockReset().mockResolvedValue([])
  plannerApi.getTrainingWorkspace.mockResolvedValue({ schema_version: 1, account_id: 'a', revision: 0, active_plan_id: null, plans: [] })
  Object.defineProperties(HTMLElement.prototype, {
    showPopover: { configurable: true, value() {} }, hidePopover: { configurable: true, value() {} }
  })
})

it('读取不写库存或方案，固定费用和人数变化实时计算，保存刷新后恢复', async () => {
  const stores = new Map([['a', workspace()]])
  api.get.mockImplementation(account => Promise.resolve(copy(stores.get(account))))
  api.put.mockImplementation((account, body) => {
    const saved = { ...copy(body), account_id: account, game_snapshot: '如鸢', read_only: false, revision: body.expected_revision + 1 }
    delete saved.expected_revision; stores.set(account, saved); return Promise.resolve(copy(saved))
  })
  const wrapper = render(); await flushPromises()
  expect(api.put).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('1,250,000')
  await input(wrapper, 'count').setValue('2')
  expect(wrapper.text()).toContain('2,500,000')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.put.mock.calls[0][1]).toMatchObject({ expected_revision: 0, plans: [{ demands: [{ count: 2 }] }] })
  expect(wrapper.text()).toContain('储备方案已保存')
  wrapper.unmount()
  const reopened = render(); await flushPromises()
  expect(input(reopened, 'count').element.value).toBe('2')
  expect(reopened.text()).toContain('2,500,000')
  expect(api.put).toHaveBeenCalledTimes(1)
})

it('空方案可创建、编辑属性职业目标、新建与切换方案，保存只发储备正文', async () => {
  api.get.mockResolvedValue(workspace('a', []))
  const wrapper = render(); await flushPromises()
  await button(wrapper, '新建方案').trigger('click'); await flushPromises()
  await input(wrapper, 'name').setValue('备战')
  await button(wrapper, '添加需求组').trigger('click'); await flushPromises()
  await choose(wrapper, '需求组 1 属性', '阳')
  await choose(wrapper, '需求组 1 职业', '龙盾')
  await input(wrapper, 'current-level').setValue('100')
  await input(wrapper, 'current-elite').setValue('13')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  const body = api.put.mock.calls[0][1]
  expect(Object.keys(body).sort()).toEqual(['active_plan_id', 'expected_revision', 'plans', 'schema_version'])
  expect(body.plans[0]).toMatchObject({ name: '备战', demands: [{ count: 1, attribute: '阳', profession: '龙盾' }] })
  await button(wrapper, '新建方案').trigger('click'); await flushPromises()
  await input(wrapper, 'name').setValue('另一假设')
  await choose(wrapper, '当前储备方案', body.active_plan_id)
  expect(input(wrapper, 'name').element.value).toBe('备战')
})

it('没有 randomUUID 时仍可新建方案与需求组并保存有效 UUID', async () => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
  vi.stubGlobal('crypto', { getRandomValues })
  api.get.mockResolvedValue(workspace('a', []))
  const wrapper = render(); await flushPromises()
  await button(wrapper, '新建方案').trigger('click'); await flushPromises()
  await button(wrapper, '添加需求组').trigger('click'); await flushPromises()
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.put).toHaveBeenCalledTimes(1)
  const body = api.put.mock.calls[0][1]
  const plan = body.plans[0], group = plan.demands[0]
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  expect(plan.id).toMatch(uuid)
  expect(group.id).toMatch(uuid)
  expect(group.id).not.toBe(plan.id)
  expect(body.active_plan_id).toBe(plan.id)
  expect(wrapper.text()).toContain('储备方案已保存')
})

it('删除先确认，未保存不写云端，保存最后一个删除后恢复为空', async () => {
  const wrapper = render(); await flushPromises()
  await button(wrapper, '删除方案').trigger('click')
  await button(wrapper, '保留方案').trigger('click')
  expect(input(wrapper, 'name').element.value).toBe('未来主队')
  await button(wrapper, '删除方案').trigger('click')
  await button(wrapper, '确认删除方案').trigger('click'); await flushPromises()
  expect(api.put).not.toHaveBeenCalled()
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.put.mock.calls[0][1]).toMatchObject({ plans: [], active_plan_id: null })
  expect(wrapper.text()).toContain('还没有储备方案')
})

it('库存不可用仍可保存需求，混沌与未知突破不产生确定费用', async () => {
  const wrapper = render({ stock: null }); await flushPromises()
  expect(wrapper.text()).toContain('库存暂不可用')
  expect(wrapper.text()).toContain('待库存可用')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.put).toHaveBeenCalledTimes(1)
  await choose(wrapper, '需求组 1 属性', '混沌')
  expect(wrapper.text()).toContain('混沌暂无规则')
  expect(wrapper.text()).not.toContain('总五铢钱')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.put).toHaveBeenCalledTimes(2)
  await choose(wrapper, '需求组 1 属性', '阴')
  await input(wrapper, 'current-elite').setValue('1')
  await input(wrapper, 'current-level').setValue('70')
  await choose(wrapper, '需求组 1 当前等级突破', null)
  expect(wrapper.text()).toContain('需确认突破')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.put).toHaveBeenCalledTimes(3)
})

it('共享材料只扣一次，三种兵书按同一经验余额扣除且输入库存不变', async () => {
  const value = demand({ current: { level: 69, elite: 1 }, target: { level: 70, elite: 1 } })
  api.get.mockResolvedValue(workspace('a', [{ id: PLAN, name: '双人', demands: [value, { ...copy(value), id: '00000000-0000-4000-8000-000000000003' }] }]))
  const stock = { bingshucanjuan: 1, bingshuquanjuan: 1, liutaobingshu: 1 }
  const wrapper = render({ stock }); await flushPromises()
  expect(wrapper.text()).toContain('59,000')
  expect(wrapper.get('tbody').text()).toContain('47,900')
  expect(stock).toEqual({ bingshucanjuan: 1, bingshuquanjuan: 1, liutaobingshu: 1 })
})

it('非法字段阻止提交并聚焦带字段链接的错误摘要，字段保留说明关联', async () => {
  const wrapper = render(); await flushPromises()
  await input(wrapper, 'count').setValue('0')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.put).not.toHaveBeenCalled()
  const summary = wrapper.get('[aria-label="请检查储备方案"]')
  expect(document.activeElement).toBe(summary.element)
  const control = input(wrapper, 'count')
  expect(control.attributes('aria-invalid')).toBe('true')
  expect(document.getElementById(control.attributes('aria-describedby')).textContent).toContain('人数')
  await summary.get('a').trigger('click'); await flushPromises()
  expect(document.activeElement).toBe(control.element)
})

it('保存失败保留输入，处理中不能重复提交或编辑', async () => {
  const saving = pending(); api.put.mockReturnValue(saving.promise)
  const wrapper = render(); await flushPromises()
  await input(wrapper, 'count').setValue('3')
  await wrapper.get('form').trigger('submit'); await wrapper.get('form').trigger('submit')
  expect(api.put).toHaveBeenCalledTimes(1)
  expect(wrapper.get('fieldset').element.disabled).toBe(true)
  saving.reject(new Error('网络中断')); await flushPromises()
  expect(input(wrapper, 'count').element.value).toBe('3')
  expect(wrapper.text()).toContain('网络中断')
  expect(wrapper.get('fieldset').element.disabled).toBe(false)
})

it('409 保留草稿，读取比较不覆盖，明确选择后才能按新版本重试', async () => {
  const wrapper = render(); await flushPromises()
  await input(wrapper, 'count').setValue('3')
  api.put.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(input(wrapper, 'count').element.value).toBe('3')
  api.get.mockResolvedValue(workspace('a', [{ id: PLAN, name: '云端方案', demands: [demand({ count: 5 })] }], 7))
  await button(wrapper, '读回云端比较').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('5 人')
  expect(input(wrapper, 'count').element.value).toBe('3')
  expect(api.put).toHaveBeenCalledTimes(1)
  await button(wrapper, '保留草稿，重试保存').trigger('click'); await flushPromises()
  expect(api.put.mock.calls[1][1]).toMatchObject({ expected_revision: 7, plans: [{ demands: [{ count: 3 }] }] })
  expect(wrapper.text()).toContain('储备方案已保存')
})

it('比较读取失败也保留草稿，采用云端只读回不再写入', async () => {
  const wrapper = render(); await flushPromises()
  api.put.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await input(wrapper, 'count').setValue('3')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  api.get.mockRejectedValueOnce(new Error('读回失败'))
  await button(wrapper, '读回云端比较').trigger('click'); await flushPromises()
  expect(input(wrapper, 'count').element.value).toBe('3')
  api.get.mockResolvedValue(workspace('a', [], 3))
  await button(wrapper, '读回云端比较').trigger('click'); await flushPromises()
  await button(wrapper, '采用云端，替换草稿').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('还没有储备方案')
  expect(api.put).toHaveBeenCalledTimes(1)
})

it('A→B 丢弃旧 GET 响应，清空账号不读取且不会沿用旧草稿', async () => {
  const old = pending(); api.get.mockImplementation(account => account === 'a' ? old.promise : Promise.resolve(workspace(account, [])))
  const wrapper = render()
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  old.resolve(workspace('a')); await flushPromises()
  expect(wrapper.text()).not.toContain('未来主队')
  expect(wrapper.text()).toContain('还没有储备方案')
  await wrapper.setProps({ accountId: '' }); await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(api.get).toHaveBeenCalledTimes(2)
})

it('A 保存晚返回不能回填 B，随后只允许保存 B 的正文', async () => {
  const old = pending(); api.put.mockReturnValueOnce(old.promise)
  const wrapper = render(); await flushPromises()
  await wrapper.get('form').trigger('submit'); await flushPromises()
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  old.resolve(workspace('a', [], 1)); await flushPromises()
  expect(wrapper.text()).not.toContain('储备方案已保存')
  expect(wrapper.get('form').exists()).toBe(true)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.put.mock.calls[1][0]).toBe('b')
})

it('校验微任务期间切换账号不会把 A 草稿发到 B', async () => {
  const wrapper = render(); await flushPromises()
  wrapper.get('form').element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  expect(api.put).not.toHaveBeenCalled()
})

it('游戏变化重载，旧游戏方案只读，不删除旧需求、不发送写入', async () => {
  api.get.mockResolvedValue({ ...workspace(), read_only: true })
  const wrapper = render({ game: '代号鸢' }); await flushPromises()
  expect(wrapper.text()).toContain('请新建对应游戏账号')
  expect(wrapper.get('fieldset').element.disabled).toBe(true)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.put).not.toHaveBeenCalled()
  expect(input(wrapper, 'count').element.value).toBe('1')
})

it('读取失败可重试，错误账号或未知 schema 不会变成空方案', async () => {
  api.get.mockRejectedValueOnce(new Error('读取失败'))
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain('读取失败')
  expect(wrapper.find('form').exists()).toBe(false)
  api.get.mockResolvedValueOnce(workspace('wrong'))
  await button(wrapper, '重新读取方案').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('方案响应不匹配')
  api.get.mockResolvedValueOnce({ ...workspace(), schema_version: 2 })
  await button(wrapper, '重新读取方案').trigger('click'); await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
  api.get.mockResolvedValueOnce(workspace())
  await button(wrapper, '重新读取方案').trigger('click'); await flushPromises()
  expect(wrapper.find('form').exists()).toBe(true)
})

it('管理员养成规划在库存加载前和失败后都保留储备入口，仅成功库存用于缺口且仍可保存', async () => {
  const inventory = pending()
  api.inventory.mockImplementation(({ entityType }) => entityType === 'item' ? inventory.promise : Promise.resolve([]))
  const wrapper = mount(OperatorGrowthTracker, { props: { accountId: 'a', game: '如鸢', isLoggedIn: true }, attachTo: document.body })
  await flushPromises()
  const reserve = wrapper.getComponent(OperatorReserveWorkspace)
  expect(reserve.props('stock')).toBe(null)
  expect(reserve.text()).toContain('库存暂不可用')
  inventory.resolve([{ entries: { baoshijing: { count: 940 }, shuijing: { count: 2760 }, xinghanjing: { count: 2100 } } }])
  await flushPromises()
  expect(reserve.props('stock')).toEqual({ baoshijing: 940, shuijing: 2760, xinghanjing: 2100 })
  expect(reserve.text()).not.toContain('库存暂不可用')
  api.inventory.mockRejectedValue(new Error('库存断线'))
  await wrapper.setProps({ refreshKey: 1 }); await flushPromises()
  expect(reserve.props('stock')).toBe(null)
  expect(wrapper.find('.planner-reserve-entry').exists()).toBe(true)
  expect(reserve.text()).toContain('库存暂不可用')
  await reserve.get('form').trigger('submit'); await flushPromises()
  expect(api.put).toHaveBeenCalledTimes(1)
  expect(api.put.mock.calls[0][0]).toBe('a')
})

it('选项校验错误关联到真实下拉按钮，切换等级不会默认确认突破', async () => {
  const wrapper = render(); await flushPromises()
  await input(wrapper, 'current-elite').setValue('1')
  await input(wrapper, 'current-level').setValue('70')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  const control = wrapper.get('[id$="-current-breakthrough_stage"]')
  expect(control.attributes('aria-invalid')).toBe('true')
  expect(document.getElementById(control.attributes('aria-describedby')).textContent).toContain('突破阶段')
  await choose(wrapper, '需求组 1 当前等级突破', null)
  expect(wrapper.text()).toContain('需确认突破')
})

it.each([
  ['普通用户', true, []],
  ['内测用户', true, ['beta:access']],
  ['历史使用角色', true, ['archive:access', 'operator_panel:use']],
  ['未登录的旧权限', false, ['operator_reserve:use']],
])('%s 看不到未来储备且不会读取或保存方案', async (_, loggedIn, permissions) => {
  auth.isLoggedIn = loggedIn
  auth.adminAccess = { permissions }
  const wrapper = mount(OperatorGrowthTracker, { props: { accountId: 'a', game: '如鸢', isLoggedIn: true } })
  await flushPromises()
  expect(wrapper.find('.planner-reserve-entry').exists()).toBe(false)
  expect(wrapper.findComponent(OperatorReserveWorkspace).exists()).toBe(false)
  expect(api.get).not.toHaveBeenCalled()
  expect(api.put).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('管理员撤销储备权限后卸载储备但保留培养规划', async () => {
  const wrapper = mount(OperatorGrowthTracker, { props: { accountId: 'a', game: '如鸢', isLoggedIn: true } })
  await flushPromises()
  expect(wrapper.findComponent(OperatorReserveWorkspace).exists()).toBe(true)
  expect(api.get).toHaveBeenCalledWith('a')
  auth.adminAccess = { permissions: [] }
  await flushPromises()
  expect(wrapper.findComponent(OperatorReserveWorkspace).exists()).toBe(false)
  expect(wrapper.text()).toContain('培养计划 · 体力规划')
  expect(api.put).not.toHaveBeenCalled()
  wrapper.unmount()
})
