import { beforeEach, expect, it, vi } from 'vitest'
import { installViewport } from '../test-support/viewport.js'
import { h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import Tracker from '../src/components/operator/OperatorGrowthTracker.vue'
import * as plannerApi from '../src/api/operatorPlanner.js'
import { getOperatorGrowthTargets } from '../src/api/operator.js'
import { getCurrent, listRecords } from '../src/api/inventory.js'
import { PLANNER_RULES } from '../src/data/cultivationPlanner.js'
import PlannerDailySources from '../src/components/operator/PlannerDailySources.vue'

vi.mock('../src/api/operatorPlanner.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/operator.js', () => ({ getOperatorGrowthTargets: vi.fn(), putOperatorGrowthTarget: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), listRecords: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))

beforeEach(() => {
  vi.clearAllMocks()
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

it('真实追踪工作台保存子账号月卡后预览并确认应用，初始化与预览均不写云端日程', async () => {
  plannerApi.putTrainingWorkspace.mockImplementation(async (_account, body) => ({ ...body, account_id: 'acc', revision: 2 }))
  plannerApi.putStaminaSchedule.mockImplementation(async (_account, _plan, body) => ({ ...body, account_id: 'acc', plan_id: 'plan', revision: 1 }))
  const wrapper = mount(Tracker, { attachTo: document.body,
    props: { accountId: 'acc', isLoggedIn: true, game: '如鸢', currentEntries: [{ id: 'op', level: 1, elite: 1, starLevel: 1 }], catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }] },
    global: { stubs: { PlannerExactOptimizer: true } },
  })
  await flushPromises()
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  await wrapper.findAll('button').find(button => button.text().includes('调整设置')).trigger('click'); await flushPromises()
  const settings = wrapper.getComponent(PlannerDailySources)
  await settings.get('[aria-label="月卡权益档位"]').setValue('zhaoyang')
  await settings.findAll('button').find(button => button.text() === '保存子账号配置').trigger('click'); await flushPromises()
  expect(plannerApi.putTrainingWorkspace.mock.calls[0][1].stamina_sources.monthly_card).toMatchObject({ tier: 'zhaoyang', daily_amount: 60, shop_amount: 20 })
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  await settings.findAll('button').find(button => button.text() === '预览影响范围').trigger('click'); await flushPromises()
  expect(settings.text()).toContain('过去不变')
  expect(plannerApi.putStaminaSchedule).not.toHaveBeenCalled()
  await settings.findAll('button').find(button => button.text() === '应用到未来日程').trigger('click'); await flushPromises()
  expect(plannerApi.putStaminaSchedule).toHaveBeenCalledTimes(1)
  const [account, plan, body] = plannerApi.putStaminaSchedule.mock.calls[0]
  expect([account, plan]).toEqual(['acc', 'plan'])
  expect(body.schedule.result.timeline[0].totals.gains).toBe(488)
  expect(body.preferences.source_periods[0].sources.monthly_card.tier).toBe('zhaoyang')
})

it.each([390, 1440])('真实养成追踪父级跨布局保留清单名称草稿和编辑器：%ipx', async width => {
  const viewport = installViewport(width)
  const wrapper = mount(Tracker, { attachTo: document.body,
    props: { accountId: 'acc', isLoggedIn: true, currentEntries: [{ id: 'op', level: 1, elite: 1, starLevel: 1 }],
      catalogEntries: [{ id: 'op', name: '测试密探', rarity: 3 }] },
    global: { stubs: { PlannerExactOptimizer: true } },
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
    global: { stubs: { PlannerExactOptimizer: true } },
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
    global: { stubs: { PlannerExactOptimizer: true } },
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
    global: { stubs: { PlannerExactOptimizer: true } },
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
    global: { stubs: { PlannerExactOptimizer: true } },
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
    global: { stubs: { PlannerExactOptimizer: true } },
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
    global: { stubs: { PlannerExactOptimizer: true } },
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
