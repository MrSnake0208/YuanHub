import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installViewport } from '../test-support/viewport.js'
import { h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import Tracker from '../src/components/operator/OperatorGrowthTracker.vue'
import * as plannerApi from '../src/api/operatorPlanner.js'
import { getOperatorGrowthTargets } from '../src/api/operator.js'
import { getCurrent, listRecords } from '../src/api/inventory.js'
import { PLANNER_RULES } from '../src/data/cultivationPlanner.js'
import PlannerDailySources from '../src/components/operator/PlannerDailySources.vue'
import PlannerSelect from '../src/components/operator/PlannerSelect.vue'
import PlannerRoutineSettings from '../src/components/operator/PlannerRoutineSettings.vue'
import { dialog } from '../src/utils/dialog.js'

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
afterEach(() => { HTMLElement.prototype.scrollIntoView = originalScrollIntoView })

vi.mock('../src/api/operatorPlanner.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/operator.js', () => ({ getOperatorGrowthTargets: vi.fn(), putOperatorGrowthTarget: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), listRecords: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))

// 仅模拟拖拽库边界；真实节点移动、Vue 更新和保存仍由挂载的组件完成。
const rosterSortables = vi.hoisted(() => [])
vi.mock('sortablejs', () => ({ default: class {
  constructor(element, options) {
    this.el = element; this.options = options; rosterSortables.push(this)
    this.drop = event => options.onEnd({ ...this.indices, originalEvent: event })
    document.addEventListener('mouseup', this.drop)
  }
  option(key, value) { this.options[key] = value }
  destroy() { document.removeEventListener('mouseup', this.drop) }
} }))

beforeEach(() => {
  vi.clearAllMocks()
  rosterSortables.length = 0
  // jsdom 不实现布局滚动；这里仅验证步骤切换和原有数据事件。
  HTMLElement.prototype.scrollIntoView = vi.fn()
  plannerApi.putTrainingWorkspace.mockReset()
  plannerApi.putStaminaSchedule.mockReset()
  plannerApi.getTrainingWorkspace.mockResolvedValue({
    schema_version: 1, account_id: 'acc', revision: 1, active_plan_id: 'plan',
    plans: [{ id: 'plan', name: '测试清单', source: 'custom', operator_ids: ['op'], excluded_operator_ids: [],
      targets: { op: { level: 1, elite: 1, star_level: 0 } } }],
  })
  plannerApi.getStaminaSchedule.mockResolvedValue({
    schema_version: 1, rules_version: PLANNER_RULES.version, account_id: 'acc', revision: 0,
  })
  getOperatorGrowthTargets.mockResolvedValue({ items: [] })
  getCurrent.mockResolvedValue([])
  listRecords.mockResolvedValue({ items: [] })
})

async function mountRoster() {
  const ids = ['op', 'op2', 'op3']
  plannerApi.getTrainingWorkspace.mockResolvedValue({
    schema_version: 1, account_id: 'acc', revision: 1, active_plan_id: 'plan',
    plans: [{ id: 'plan', name: '测试清单', source: 'custom', operator_ids: ids, excluded_operator_ids: [], targets: {} }],
  })
  plannerApi.putStaminaSchedule.mockImplementation(async (_account, _plan, body) => ({ ...body, account_id: 'acc', plan_id: 'plan', revision: 1 }))
  const wrapper = mount(Tracker, {
    props: { accountId: 'acc', isLoggedIn: true,
      currentEntries: ids.map(id => ({ id, level: 1, elite: 1, starLevel: 1 })),
      catalogEntries: ids.map(id => ({ id, name: id, rarity: 3 })),
    },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  await wrapper.vm.editSchedule('conditions')
  await flushPromises()
  return wrapper
}
const rosterIds = wrapper => wrapper.findAll('[data-roster-id]').map(row => row.attributes('data-roster-id'))
function previewRosterMove(from, to) {
  const sortable = rosterSortables.at(-1), item = sortable.el.children[from]
  sortable.indices = { oldDraggableIndex: from, newDraggableIndex: to }
  sortable.options.onStart({ item })
  item.remove()
  sortable.el.insertBefore(item, sortable.el.children[to] || null)
  return sortable
}

it('培养清单拖动中预览位置但不保存，松手保存一次，连续反向移动保持卡片与目标输入对应', async () => {
  const wrapper = await mountRoster()
  const sortable = previewRosterMove(0, 2)
  expect(sortable.options).toMatchObject({ animation: 160, forceFallback: true, ghostClass: 'roster-drag-gap' })
  expect(rosterIds(wrapper)).toEqual(['op2', 'op3', 'op'])
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  sortable.drop(new Event('mouseup'))
  await flushPromises()
  expect(rosterIds(wrapper)).toEqual(['op2', 'op3', 'op'])
  expect(plannerApi.putStaminaSchedule).toHaveBeenCalledTimes(1)
  expect(plannerApi.putStaminaSchedule.mock.calls[0][2].agent_order).toEqual(['op2', 'op3', 'op'])
  previewRosterMove(2, 0).drop(new Event('mouseup'))
  await flushPromises()
  expect(rosterIds(wrapper)).toEqual(['op', 'op2', 'op3'])
  wrapper.findAll('[data-roster-id]').forEach(row => expect(row.get('input').attributes('aria-label')).toBe(row.attributes('data-roster-id') + '目标等级'))
  expect(plannerApi.putStaminaSchedule).toHaveBeenCalledTimes(2)
})

it.each(['Escape', 'touchcancel', 'unchanged'])('培养清单拖动 %s 不保存且恢复原顺序', async reason => {
  const wrapper = await mountRoster()
  const sortable = previewRosterMove(0, reason === 'unchanged' ? 0 : 2)
  if (reason === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
  else sortable.drop(new Event(reason === 'unchanged' ? 'mouseup' : reason))
  await flushPromises()
  expect(rosterIds(wrapper)).toEqual(['op', 'op2', 'op3'])
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
})

it('拖动时离开规划条件会取消；卸载清理拖拽实例', async () => {
  const wrapper = await mountRoster()
  await wrapper.vm.editSchedule('conditions')
  const sortable = previewRosterMove(0, 2)
  const destroy = vi.spyOn(sortable, 'destroy')
  await wrapper.vm.editSchedule('daily')
  await flushPromises()
  expect(rosterIds(wrapper)).toEqual(['op', 'op2', 'op3'])
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  wrapper.unmount()
  expect(destroy).toHaveBeenCalledOnce()
})

it('规划首页仅保留三模块，按需保存策略/偏好/关卡；两种模式及原培养清单、后两步保留', async () => {
  vi.spyOn(dialog, 'confirm').mockResolvedValue(true)
  plannerApi.putTrainingWorkspace.mockImplementation(async (_account, body) => ({ ...body, account_id: 'acc', revision: 2 }))
  plannerApi.putStaminaSchedule.mockImplementation(async (_account, _plan, body) => {
    const saved = { ...body, account_id: 'acc', plan_id: 'plan', revision: 1 }
    plannerApi.getStaminaSchedule.mockResolvedValue(saved)
    return saved
  })
  const wrapper = mount(Tracker, { attachTo: document.body,
    props: { accountId: 'acc', isLoggedIn: true, currentEntries: [{ id: 'op', level: 1, elite: 1, starLevel: 1 }], catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  const click = async text => { await wrapper.findAll('button').find(button => button.text().includes(text)).trigger('click'); await flushPromises() }
  await click('调整设置')
  expect(wrapper.get('#core-conditions-title').text()).toBe('你想怎么养？')
  expect(wrapper.get('#routine-settings-title').text()).toBe('我的日常安排')
  expect(wrapper.get('#daily-sources-title').text()).toBe('我的体力来源')
  expect(wrapper.find('.condition-letter').exists()).toBe(false)
  expect(wrapper.find('#pref-luoyang').exists()).toBe(false)
  expect(wrapper.find('[aria-label="月卡权益档位"]').exists()).toBe(false)
  expect(wrapper.get('.edit-roster').text()).toContain('测试密探')
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  const sources = wrapper.getComponent(PlannerDailySources)
  await sources.findAll('.condition-summary-card')[0].trigger('click'); await flushPromises()
  await sources.get('[aria-label="月卡每日奖励体力"]').setValue(-1)
  await sources.get('form').trigger('submit'); await flushPromises()
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  await sources.get('[aria-label="关闭设置"]').trigger('click'); await flushPromises()
  await click('优先完成密探')
  expect(wrapper.get('[aria-label="培养策略"]').findAll('button')[1].attributes('aria-pressed')).toBe('true')
  const routine = wrapper.getComponent(PlannerRoutineSettings)
  await routine.findAll('.condition-summary-card')[0].trigger('click'); await flushPromises()
  await routine.get('#pref-luoyang').setValue(2)
  await routine.get('#pref-shouchun').setValue(1)
  await routine.get('#pref-purchase').setValue(3)
  const writesBeforeSave = plannerApi.putStaminaSchedule.mock.calls.length
  await routine.get('form').trigger('submit'); await flushPromises()
  expect(plannerApi.putStaminaSchedule).toHaveBeenCalledTimes(writesBeforeSave + 1)
  expect(routine.find('form').exists()).toBe(false)
  expect(routine.findAll('.condition-summary-card')[0].text()).toContain('洛阳 2 次 · 寿春 1 次 · 购买体力 3 次')
  await routine.findAll('.condition-summary-card')[1].trigger('click'); await flushPromises()
  const level = routine.findAllComponents(PlannerSelect)[0], option = level.props('options')[0]
  level.vm.$emit('update:modelValue', option.value); await flushPromises()
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  await routine.get('form').trigger('submit'); await flushPromises()
  expect(plannerApi.putTrainingWorkspace).toHaveBeenCalledTimes(1)
  expect(routine.findAll('.condition-summary-card')[1].text()).toContain('风火 1 层')
  const settings = sources.vm.$
  await click('按目标天数规划')
  expect(wrapper.find('[aria-label="培养策略"]').exists()).toBe(false)
  expect(wrapper.get('#goal-days').element.value).toBe('10')
  expect(wrapper.get('#reserve-management-title').text()).toBe('体力储备')
  await wrapper.get('#goal-days').setValue(14)
  wrapper.get('.reserve-details').element.open = true
  await wrapper.get('#goal-initial-extra').setValue(42)
  await wrapper.get('[aria-label="添加储备"]').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.reserve-pack-row')).toHaveLength(1)
  expect(wrapper.getComponent(PlannerDailySources).vm.$).toBe(settings)
  expect(sources.find('.source-application-region').exists()).toBe(false)
  await click('下一步：方案对比')
  const goalInput = wrapper.getComponent({ name: 'PlannerExactOptimizer' }).props('input')
  expect(goalInput).toMatchObject({ objective: 'coins', initialExtra: 42 })
  expect(goalInput.dates).toHaveLength(14)
  expect(goalInput.reserveSources).toEqual([expect.objectContaining({ amount: 120, mode: 'flexible' })])
  expect(wrapper.get('#planner-step-comparison').isVisible()).toBe(true)
  await wrapper.get('[aria-label="上一步：规划条件"]').trigger('click'); await flushPromises()
  await click('常规日程规划')
  await sources.get('[aria-label="固定来源应用开始日期"]').setValue('')
  expect(routine.findAll('.condition-summary-card')[0].text()).toContain('购买体力 3 次')
  await click('下一步：方案对比')
  expect(wrapper.get('#planner-step-conditions').isVisible()).toBe(false)
  expect(plannerApi.putStaminaSchedule.mock.calls.at(-1)[2]).toMatchObject({ strategy: 'priority', preferences: { luoyang: 2, shouchun: 1, purchase_count: 3 } })
  await click('编辑当前日程')
  expect(wrapper.get('#planner-step-daily').isVisible()).toBe(true)
})

it('真实追踪工作台保存月卡后预览并确认应用，初始化、保存来源与预览均不写云端日程', async () => {
  let confirm
  vi.spyOn(dialog, 'confirm').mockImplementation(() => new Promise(resolve => { confirm = resolve }))
  plannerApi.putTrainingWorkspace.mockImplementation(async (_account, body) => ({ ...body, account_id: 'acc', revision: 2 }))
  plannerApi.putStaminaSchedule.mockImplementation(async (_account, _plan, body) => ({ ...body, account_id: 'acc', plan_id: 'plan', revision: 1 }))
  const wrapper = mount(Tracker, { attachTo: document.body,
    props: { accountId: 'acc', isLoggedIn: true, game: '如鸢', currentEntries: [{ id: 'op', level: 1, elite: 1, starLevel: 1 }], catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  await wrapper.findAll('button').find(button => button.text().includes('调整设置')).trigger('click'); await flushPromises()
  const settings = wrapper.getComponent(PlannerDailySources)
  await settings.findAll('.condition-summary-card')[0].trigger('click'); await flushPromises()
  await settings.get('[aria-label="月卡权益档位"]').setValue('zhaoyang')
  await settings.get('form').trigger('submit'); await flushPromises()
  expect(plannerApi.putTrainingWorkspace.mock.calls[0][1].stamina_sources.monthly_card).toMatchObject({ tier: 'zhaoyang', daily_amount: 60, shop_amount: 20 })
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  settings.get('.source-application-region').element.open = true
  await settings.findAll('button').find(button => button.text() === '查看将修改的日程').trigger('click'); await flushPromises()
  expect(settings.text()).toContain('过去不变')
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  await settings.findAll('button').find(button => button.text() === '应用到未来日程').trigger('click'); await flushPromises()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  confirm(true); await flushPromises()
  expect(plannerApi.putStaminaSchedule).toHaveBeenCalledTimes(1)
  const [account, plan, body] = plannerApi.putStaminaSchedule.mock.calls[0]
  expect([account, plan]).toEqual(['acc', 'plan'])
  expect(body.schedule.result.timeline[0].totals.gains).toBe(488)
  expect(body.preferences.source_periods[0].sources.monthly_card.tier).toBe('zhaoyang')
})

it('偏好云端保存失败后结束忙碌状态，保留草稿并显示可恢复错误', async () => {
  plannerApi.putStaminaSchedule.mockRejectedValue(new Error('网络中断'))
  const wrapper = mount(Tracker, { attachTo: document.body,
    props: { accountId: 'acc', isLoggedIn: true, currentEntries: [{ id: 'op', level: 1, elite: 1, starLevel: 1 }], catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '调整设置').trigger('click'); await flushPromises()
  const routine = wrapper.getComponent(PlannerRoutineSettings)
  await routine.findAll('.condition-summary-card')[0].trigger('click'); await flushPromises()
  await routine.get('#pref-purchase').setValue(2)
  await routine.get('form').trigger('submit'); await flushPromises()
  expect(routine.get('[role="alert"]').text()).toContain('保存未成功')
  expect(routine.get('[aria-label="关闭设置"]').element.disabled).toBe(false)
  expect(routine.get('#pref-purchase').element.value).toBe('2')
  expect(plannerApi.putStaminaSchedule).toHaveBeenCalledTimes(1)
})

it('A→B→A 时旧来源保存完成不能污染新会话的预测', async () => {
  const base = await plannerApi.getTrainingWorkspace('acc')
  plannerApi.getTrainingWorkspace.mockImplementation(async account => ({ ...base, account_id: account }))
  plannerApi.getStaminaSchedule.mockImplementation(async account => ({ schema_version: 1, rules_version: PLANNER_RULES.version, account_id: account, revision: 0 }))
  let finish, sent
  plannerApi.putTrainingWorkspace.mockImplementation((_account, body) => { sent = body; return new Promise(resolve => { finish = resolve }) })
  const wrapper = mount(Tracker, { attachTo: document.body,
    props: { accountId: 'acc', isLoggedIn: true, currentEntries: [{ id: 'op', level: 1, elite: 1, starLevel: 1 }], catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '调整设置').trigger('click'); await flushPromises()
  const sources = wrapper.getComponent(PlannerDailySources)
  await sources.findAll('.condition-summary-card')[0].trigger('click'); await flushPromises()
  await sources.get('[aria-label="月卡权益档位"]').setValue('zhaoyang')
  await sources.get('form').trigger('submit'); await flushPromises()
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  await wrapper.setProps({ accountId: 'acc' }); await flushPromises()
  finish({ ...sent, account_id: 'acc', revision: 2 }); await flushPromises()
  expect(sources.findAll('.condition-summary-card')[0].text()).toContain('未启用月卡')
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  expect(wrapper.getComponent({ name: 'PlannerExactOptimizer' }).props('input').preferences.sourcePeriods).toBeUndefined()
})

it('切换子账号清空未保存的期限与储备独立试算', async () => {
  const base = await plannerApi.getTrainingWorkspace('acc')
  plannerApi.getTrainingWorkspace.mockImplementation(async account => ({ ...base, account_id: account }))
  plannerApi.getStaminaSchedule.mockImplementation(async account => ({ schema_version: 1, rules_version: PLANNER_RULES.version, account_id: account, revision: 0 }))
  const wrapper = mount(Tracker, { attachTo: document.body,
    props: { accountId: 'acc', isLoggedIn: true, currentEntries: [{ id: 'op', level: 1, elite: 1, starLevel: 1 }], catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '调整设置').trigger('click'); await flushPromises()
  const mode = () => wrapper.findAll('button').find(button => button.text() === '按目标天数规划')
  await mode().trigger('click'); await wrapper.get('#goal-days').setValue(21)
  wrapper.get('.reserve-details').element.open = true
  await wrapper.get('#goal-initial-extra').setValue(42)
  await wrapper.get('[aria-label="添加储备"]').trigger('click')
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  await mode().trigger('click')
  expect(wrapper.get('#goal-days').element.value).toBe('10')
  expect(wrapper.get('#goal-initial-extra').element.value).toBe('0')
  expect(wrapper.findAll('.reserve-pack-row')).toHaveLength(0)
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
})

it.each([390, 1440])('真实养成追踪父级跨布局保留清单名称草稿和编辑器：%ipx', async width => {
  const viewport = installViewport(width)
  const wrapper = mount(Tracker, { attachTo: document.body,
    props: { accountId: 'acc', isLoggedIn: true, currentEntries: [{ id: 'op', level: 1, elite: 1, starLevel: 1 }],
      catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  await wrapper.get('[aria-label="管理清单"]').trigger('click'); await flushPromises()
  const picker = wrapper.getComponent({ name: 'OperatorTrainingPlanPicker' }).vm.$
  const input = wrapper.get('#plan-name-input')
  await input.setValue('尚未保存的清单'); input.element.focus()
  const reads = plannerApi.getTrainingWorkspace.mock.calls.length
  for (const next of [640, 641, 700, 701, 900, 901, 1080, 1081, 320, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.getComponent({ name: 'OperatorTrainingPlanPicker' }).vm.$).toBe(picker)
    expect(wrapper.get('dialog').element.open).toBe(true)
    expect(input.element.value).toBe('尚未保存的清单')
    expect(document.activeElement).toBe(input.element)
    expect(plannerApi.getTrainingWorkspace).toHaveBeenCalledTimes(reads)
    expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
    expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  }
})

it('追踪页顶部直接添加密探，并将真实拥有状态传入养成中筛选', async () => {
  const wrapper = mount(Tracker, { attachTo: document.body,
    props: { accountId: 'acc', isLoggedIn: true,
      currentEntries: [{ id: 'op', starLevel: 1 }], growthStates: { op: 'growing' },
      catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }, { id: 'missing', name: '未拥有密探', rarity: 3 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  const toolbar = wrapper.get('.plan-heading-actions')
  for (const label of ['添加密探', '新建清单', '管理清单', '调整设置', '查看体力日程']) {
    expect(toolbar.text()).toContain(label)
  }
  expect(wrapper.get('.status-metrics').text()).toContain('刷取材料备齐度')
  expect(wrapper.get('.status-metrics').text()).toContain('清单心纸库存')
  await wrapper.get('.plan-member-add').trigger('click')
  await flushPromises()
  await wrapper.findAll('.plan-selection-tabs button').find(button => button.text().startsWith('养成中')).trigger('click')
  expect(wrapper.get('dialog').element.open).toBe(true)
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
  expect(wrapper.get('.plan-candidates').text()).toContain('测试密探')
  expect(wrapper.get('.plan-candidates').text()).not.toContain('未拥有密探')
  expect(wrapper.text()).toContain('此日程暂不支持交给 Maa 自动执行')
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
})

it('等级修为非零但星级未拥有时，规划不标完成、不显示快捷提升；更新星级后正常拥有', async () => {
  const current = { id: 'op', level: 1, elite: 1, starLevel: 0 }
  const wrapper = mount(Tracker, {
    props: { accountId: 'acc', isLoggedIn: true, currentEntries: [current], quickUpgrade: vi.fn(),
      catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }] },
    slots: { remark: ({ row }) => h('span', { 'data-testid': 'ownership' }, String(row.owned)) },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  expect(wrapper.get('[data-testid="ownership"]').text()).toBe('false')
  expect(wrapper.get('.growth-card').classes()).not.toContain('complete')
  expect(wrapper.find('.growth-quick-action').exists()).toBe(false)
  expect(wrapper.find('.growth-complete').exists()).toBe(false)
  await wrapper.setProps({ currentEntries: [{ ...current, starLevel: 1 }] })
  expect(wrapper.get('[data-testid="ownership"]').text()).toBe('true')
  expect(wrapper.get('.growth-card').classes()).toContain('complete')
  expect(wrapper.find('.growth-quick-action').exists()).toBe(true)
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
})


it.each(['level', 'elite', 'star'])('快捷提升弹层仅打开%s时计算内容，关闭后停止读取卡片草稿', async field => {
  const growthActionTargetLabel = vi.fn(() => '测试提升目标')
  const growthActionBreakthrough = vi.fn(() => false)
  const wrapper = mount(Tracker, {
    props: { accountId: 'acc', isLoggedIn: true,
      currentEntries: [{ id: 'op', level: 1, elite: 1, starLevel: 1 }],
      catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }],
      growthActionTargetLabel, growthActionBreakthrough },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  expect(growthActionTargetLabel).not.toHaveBeenCalled()
  expect(growthActionBreakthrough).not.toHaveBeenCalled()
  await wrapper.setProps({ growthActionPopoverKey: 'op:' + field })
  expect(wrapper.findAll('.growth-action-popover')).toHaveLength(1)
  expect(wrapper.get('.growth-action-popover').text()).toContain('测试提升目标')
  expect(growthActionTargetLabel).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'op' }), field)
  growthActionTargetLabel.mockClear()
  growthActionBreakthrough.mockClear()
  await wrapper.setProps({ growthActionPopoverKey: '' })
  expect(wrapper.find('.growth-action-popover').exists()).toBe(false)
  expect(growthActionTargetLabel).not.toHaveBeenCalled()
  expect(growthActionBreakthrough).not.toHaveBeenCalled()
})

it('电影目标使用直接星级，不显示普通心纸和节点，并保留共享规划说明', async () => {
  plannerApi.getTrainingWorkspace.mockResolvedValue({
    schema_version: 1, account_id: 'acc', revision: 1, active_plan_id: 'plan',
    plans: [{ id: 'plan', name: '电影清单', source: 'custom', operator_ids: ['movie'], excluded_operator_ids: [],
      targets: { movie: { level: 100, elite: 17, star_level: 31 } } }],
  })
  const wrapper = mount(Tracker, {
    props: { accountId: 'acc', isLoggedIn: true, quickUpgrade: vi.fn(),
      catalogEntries: [{ id: 'base', name: '本体', prof: '风', subProf: '神纪', rarity: 4 },
        { id: 'movie', name: '电影形态', spOf: 'base', prof: '阳', subProf: '神纪', rarity: 5 }],
      currentEntries: [{ id: 'base', level: 90, elite: 16, starLevel: 31 }, { id: 'movie', level: 90, elite: 16, starLevel: 2 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  const card = wrapper.get('.growth-card')
  expect(card.text()).toContain('2 星')
  expect(card.text()).toContain('按本体路径计入')
  expect(card.text()).toContain('电影星级材料暂不支持估算')
  expect(card.text()).not.toContain('心纸')
  expect(card.find('.tracker-star-trigger').exists()).toBe(false)
  const input = card.get('[aria-label="电影形态的目标星级"]')
  expect(input.attributes('max')).toBe('5')
  expect(input.element.value).toBe('31')
  expect(card.find('[aria-label*="快捷提升化极"]').exists()).toBe(false)
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  wrapper.unmount()
})

it.each([
  ['尚未录入', null, true],
  ['历史阶段未知', 31, true],
  ['已知且有缺口', 1, false],
  ['已知且无缺口', 7, false],
])('培养卡区分未知心纸需求和已知零缺口：%s', async (_label, starLevel, unknown) => {
  plannerApi.getTrainingWorkspace.mockResolvedValue({
    schema_version: 1, account_id: 'acc', revision: 1, active_plan_id: 'plan',
    plans: [{ id: 'plan', name: '测试清单', source: 'custom', operator_ids: ['op'], excluded_operator_ids: [],
      targets: { op: { level: 100, elite: 17, star_level: 7 } } }],
  })
  const wrapper = mount(Tracker, {
    props: { accountId: 'acc', isLoggedIn: true,
      currentEntries: starLevel == null ? [] : [{ id: 'op', level: 1, elite: 1, starLevel }],
      catalogEntries: [{ id: 'op', name: '测试密探', rarity: 4 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  const card = wrapper.get('.growth-card')
  const note = card.get('.heart-progress-note').text()
  expect(card.get('.growth-progress-status').text()).toBe('目标进度')
  if (unknown) {
    expect(note).toBe('化极需求待确认，暂无法完整估算')
    expect(card.find('.heart-gap-number').exists()).toBe(false)
  } else {
    expect(note).toContain('心纸')
    expect(note).not.toContain('待确认')
    const gap = Number(card.get('.heart-gap-number').text())
    if (starLevel === 7) expect(gap).toBe(0)
    else expect(gap).toBeGreaterThan(0)
  }
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
})

it.each([390, 1440])('培养卡化极保留完整数值单位，并解释当前等级修为上限：%ipx', async width => {
  installViewport(width)
  plannerApi.getTrainingWorkspace.mockResolvedValue({
    schema_version: 1, account_id: 'acc', revision: 1, active_plan_id: 'plan',
    plans: [{ id: 'plan', name: '测试清单', source: 'custom', operator_ids: ['op'], excluded_operator_ids: [],
      targets: { op: { level: 100, elite: 17, star_level: 13 } } }],
  })
  const wrapper = mount(Tracker, {
    props: { accountId: 'acc', isLoggedIn: true,
      currentEntries: [{ id: 'op', level: 90, elite: 15, starLevel: 13 }],
      catalogEntries: [{ id: 'op', name: '测试密探', rarity: 4 }] },
    global: { stubs: { PlannerExactOptimizer: true, teleport: true } },
  })
  await flushPromises()
  const card = wrapper.get('.growth-card')
  for (const selector of ['.growth-current-star', '.tracker-star-trigger']) {
    expect(card.get(selector).findAll('.growth-stage-unit').map(unit => unit.text())).toEqual(['3 星', '0 节点'])
    expect(card.get(selector).text()).toBe('3 星 · 0 节点')
  }
  expect(card.get('.tracker-star-trigger').attributes('aria-label')).toBe('测试密探的目标化极：3 星 · 0 节点')
  expect(card.get('.growth-limit-note').text()).toBe('已达当前等级修为上限，先提升等级')
  await wrapper.setProps({ currentEntries: [{ id: 'op', level: 90, elite: 14, starLevel: 13 }] })
  expect(card.find('.growth-limit-note').exists()).toBe(false)
  await wrapper.setProps({ currentEntries: [{ id: 'op', level: 100, elite: 17, starLevel: 13 }] })
  expect(card.find('.growth-limit-note').exists()).toBe(false)
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
})
