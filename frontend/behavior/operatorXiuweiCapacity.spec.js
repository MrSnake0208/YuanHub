import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, DOMWrapper } from '@vue/test-utils'
import CapacityDialog from '../src/components/operator/OperatorXiuweiCapacityDialog.vue'
import PlannerSelect from '../src/components/operator/PlannerSelect.vue'
import Tracker from '../src/components/operator/OperatorGrowthTracker.vue'
import * as plannerApi from '../src/api/operatorPlanner.js'
import { getCurrent, listRecords } from '../src/api/inventory.js'
import { getOperatorGrowthTargets, putOperatorGrowthTarget } from '../src/api/operator.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, adminAccess: { permissions: [] } }) }
})
vi.mock('../src/api/operatorPlanner.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/operator.js', () => ({ getOperatorGrowthTargets: vi.fn(), putOperatorGrowthTarget: vi.fn(), getOperatorReserveWorkspace: vi.fn(), putOperatorReserveWorkspace: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), listRecords: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))

const stock = { baoshijing: 3000, shuijing: 8000, xinghanjing: 5000 }
const renderDialog = props => mount(CapacityDialog, { attachTo: document.body, props: { open: true, accountId: 'a', accountName: '大号', game: '如鸢', stock, ...props } })
const modal = () => new DOMWrapper(document.body.querySelector('.capacity-dialog'))
const groups = () => modal().findAll('.capacity-group')
const button = (wrapper, text) => wrapper.findAll('button').find(node => node.text() === text)
async function selectFrom(wrapper, value) {
  wrapper.findAllComponents(PlannerSelect)[0].vm.$emit('update:modelValue', value)
  await flushPromises()
}
async function openTrial(wrapper) {
  await button(wrapper, '修为人数试算').trigger('click')
  await flushPromises()
}
const renderTracker = props => mount(Tracker, { attachTo: document.body,
  props: { accountId: 'a', accountName: '大号', isLoggedIn: true, game: '如鸢', ...props },
  global: { stubs: { PlannerExactOptimizer: true } }
})
beforeEach(() => {
  vi.clearAllMocks()
  plannerApi.getTrainingWorkspace.mockImplementation(async account => ({ schema_version: 1, account_id: account, revision: 0, active_plan_id: null, plans: [] }))
  getOperatorGrowthTargets.mockResolvedValue({ items: [] })
  getCurrent.mockImplementation(async ({ entityType }) => entityType === 'item' ? [{ entries: stock }] : [])
  listRecords.mockResolvedValue({ items: [] })
})

it('默认 1→17，即时更新人数、剩余和下一人缺口，且选项阻止非法区间', async () => {
  const wrapper = renderDialog()
  expect(wrapper.findAllComponents(PlannerSelect).map(node => node.props('modelValue'))).toEqual([1, 17])
  await selectFrom(wrapper, 13)
  expect(groups()[2].attributes('aria-label')).toContain('材料可供 2 人')
  const detail = modal().findAll('.capacity-detail')[2]
  expect(detail.isVisible()).toBe(true)
  expect(detail.findAll('tbody tr').map(row => row.findAll('td').map(td => td.text()))).toEqual([
    ['940', '3,000', '1,120', '已足够—'],
    ['2,760', '8,000', '2,480', '还缺 280'],
    ['2,100', '5,000', '800', '还缺 1,300']
  ])
  expect(detail.text()).toContain('再培养 1 人，还缺水镜 280、星汉镜 1,300。')
  expect(wrapper.findAllComponents(PlannerSelect)[0].props('options').at(-1).disabled).toBe(true)
  expect(wrapper.findAllComponents(PlannerSelect)[1].props('options').filter(option => !option.disabled).map(option => option.value)).toEqual([14, 15, 16, 17])
  await groups()[0].trigger('click')
  expect(modal().findAll('.capacity-detail')[0].isVisible()).toBe(true)
  expect(modal().findAll('.capacity-detail')[2].isVisible()).toBe(false)
  await groups()[0].trigger('click')
  expect(groups().every(group => group.attributes('aria-expanded') === 'false')).toBe(true)
})

it('刷新中和失败时隐藏旧人数，成功后按新库存重算，已读取空库存才显示零人', async () => {
  const wrapper = renderDialog()
  await selectFrom(wrapper, 13)
  await wrapper.setProps({ loading: true })
  expect(groups()).toHaveLength(0)
  expect(modal().text()).toContain('正在读取当前库存')
  await wrapper.setProps({ loading: false, error: '库存读取失败' })
  expect(groups()).toHaveLength(0)
  await button(modal(), '重新读取库存').trigger('click')
  expect(wrapper.emitted('refresh')).toHaveLength(1)
  await wrapper.setProps({ error: '', stock: {} })
  expect(groups().every(group => group.attributes('aria-label').includes('材料可供 0 人'))).toBe(true)
  expect(modal().text()).toContain('培养第 1 人，还缺宝石镜 940、水镜 2,760、星汉镜 2,100。')
  await wrapper.setProps({ stock })
  expect(groups()[2].attributes('aria-label')).toContain('材料可供 2 人')
})

it('不确定库存有可操作提示，账号更换清空本次条件并请求关闭', async () => {
  const wrapper = renderDialog({ stock: null })
  expect(groups()).toHaveLength(0)
  expect(modal().text()).toContain('库存尚未同步')
  await selectFrom(wrapper, 13)
  await wrapper.setProps({ accountId: 'b', accountName: '小号', stock: {} })
  expect(wrapper.emitted('update:open').at(-1)).toEqual([false])
  expect(wrapper.findAllComponents(PlannerSelect)[0].props('modelValue')).toBe(1)
})

it('普通用户无需培养清单即可打开；关闭和 Escape 恢复入口焦点，试算不写云端', async () => {
  const wrapper = renderTracker()
  await flushPromises()
  const opener = button(wrapper, '修为人数试算')
  opener.element.focus()
  await openTrial(wrapper)
  expect(modal().text()).toContain('当前子账号：大号 · 如鸢')
  expect(document.activeElement.textContent).toBe('修为人数试算')
  expect(document.body.style.overflow).toBe('hidden')
  await selectFrom(wrapper.findComponent(CapacityDialog), 13)
  expect(groups()[2].attributes('aria-label')).toContain('材料可供 2 人')
  await button(modal(), '关闭').trigger('click')
  await flushPromises()
  expect(document.body.querySelector('.capacity-dialog')).toBeNull()
  expect(document.activeElement).toBe(opener.element)
  expect(document.body.style.overflow).not.toBe('hidden')
  await openTrial(wrapper)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(document.body.querySelector('.capacity-dialog')).toBeNull()
  expect(document.activeElement).toBe(opener.element)
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  expect(putOperatorGrowthTarget).not.toHaveBeenCalled()
})

it('试算刷新只读库存，不刷新规划；账号切换后旧响应不能回填新账号', async () => {
  const wrapper = renderTracker()
  await flushPromises()
  await openTrial(wrapper)
  await selectFrom(wrapper.findComponent(CapacityDialog), 13)
  let resolveOld
  getCurrent.mockImplementation(({ accountId, entityType }) => {
    if (accountId === 'a' && entityType === 'item') return new Promise(resolve => { resolveOld = resolve })
    return Promise.resolve([])
  })
  const workspaceReads = plannerApi.getTrainingWorkspace.mock.calls.length
  await modal().get('[aria-label="刷新试算库存"]').trigger('click')
  expect(groups()).toHaveLength(0)
  expect(plannerApi.getTrainingWorkspace).toHaveBeenCalledTimes(workspaceReads)
  await wrapper.setProps({ accountId: 'b', accountName: '小号' })
  await flushPromises()
  expect(document.body.querySelector('.capacity-dialog')).toBeNull()
  resolveOld([{ entries: stock }])
  await flushPromises()
  await openTrial(wrapper)
  expect(modal().text()).toContain('当前子账号：小号 · 如鸢')
  expect(groups().every(group => group.attributes('aria-label').includes('材料可供 0 人'))).toBe(true)
  await wrapper.setProps({ active: false })
  expect(document.body.querySelector('.capacity-dialog')).toBeNull()
})
