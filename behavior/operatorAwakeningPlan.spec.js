import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ChevronUp, CircleAlert } from '@lucide/vue'
import Tracker from '../src/components/operator/OperatorGrowthTracker.vue'
import * as plannerApi from '../src/api/operatorPlanner.js'
import { getOperatorGrowthTargets, putOperatorGrowthTarget } from '../src/api/operator.js'
import { getCurrent, listRecords } from '../src/api/inventory.js'
import { PLANNER_RULES } from '../src/data/cultivationPlanner.js'

vi.mock('../src/api/operatorPlanner.js', async importOriginal => {
  const actual = await importOriginal(); return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/operator.js', () => ({ getOperatorGrowthTargets: vi.fn(), putOperatorGrowthTarget: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), listRecords: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))
const wrappers = []
const huaji = (stage = 25, awakened = null) => ({ owned: true, stage, awakened })
const target = facts => ({ level: 100, elite: 17, huaji: facts })
const workspace = (source = 'custom', facts = huaji()) => ({ schema_version: 1, account_id: 'acc', revision: 1, active_plan_id: source === 'custom' ? 'plan' : 'favorites',
  plans: [{ id: source === 'custom' ? 'plan' : 'favorites', name: '测试清单', source, operator_ids: ['op'], excluded_operator_ids: [], targets: source === 'custom' ? { op: target(facts) } : {} }] })
beforeEach(() => {
  vi.resetAllMocks()
  plannerApi.getTrainingWorkspace.mockResolvedValue(workspace())
  plannerApi.putTrainingWorkspace.mockImplementation(async (account, body) => ({ ...body, account_id: account, revision: 2 }))
  plannerApi.getStaminaSchedule.mockResolvedValue({ schema_version: 1, rules_version: PLANNER_RULES.version, account_id: 'acc', revision: 0 })
  getOperatorGrowthTargets.mockResolvedValue({ items: [{ operator_id: 'op', revision: 3, ...target(huaji()) }] })
  putOperatorGrowthTarget.mockImplementation(async ({ operatorId, target: body }) => ({ ...body, operator_id: operatorId, revision: 4 }))
  getCurrent.mockResolvedValue([]); listRecords.mockResolvedValue({ items: [] })
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })
async function render(facts = huaji(), catalog = {}, extra = {}) {
  const wrapper = mount(Tracker, { props: { accountId: 'acc', isLoggedIn: true, favoriteIds: new Set(['op']), quickUpgrade: vi.fn(),
    catalogEntries: [{ id: 'op', name: '测试密探', rarity: 4, prof: '风', subProf: '神纪', ...catalog }],
    currentEntries: [{ id: 'op', level: 100, elite: 17, starLevel: 25, huaji: facts }], ...extra },
    global: { stubs: { PlannerExactOptimizer: true } } })
  wrappers.push(wrapper); await flushPromises(); return wrapper
}
async function choose(wrapper, value) {
  await wrapper.get('.tracker-star-trigger').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="目标星级"]').setValue(value)
}
async function save(wrapper) {
  await wrapper.findAll('.tracker-popover-actions button').find(button => /保存目标/.test(button.text())).trigger('click')
  await flushPromises()
}

it.each(['custom', 'favorites'])('%s连续目标在保存前不写云端，保存stage25+true并可回读', async source => {
  plannerApi.getTrainingWorkspace.mockResolvedValue(workspace(source))
  const wrapper = await render()
  await choose(wrapper, 'awakening')
  expect(wrapper.text()).toContain('觉醒材料规则未知')
  expect(putOperatorGrowthTarget).not.toHaveBeenCalled()
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  await save(wrapper)
  if (source === 'custom') {
    const body = plannerApi.putTrainingWorkspace.mock.lastCall[1]
    expect(body.plans[0].targets.op).toEqual(target(huaji(25, true)))
    expect(putOperatorGrowthTarget).not.toHaveBeenCalled()
    plannerApi.getTrainingWorkspace.mockResolvedValue({ ...body, account_id: 'acc', revision: 2 })
  } else {
    expect(putOperatorGrowthTarget).toHaveBeenCalledExactlyOnceWith({ accountId: 'acc', operatorId: 'op', target: { expected_revision: 3, huaji: huaji(25, true) } })
    getOperatorGrowthTargets.mockResolvedValue({ items: [{ operator_id: 'op', revision: 4, ...target(huaji(25, true)) }] })
  }
  expect(wrapper.get('.tracker-star-trigger').text()).toBe('5 星 → 觉醒')
  expect(wrapper.get('.growth-track.rose i').attributes('style')).toContain('96%')
  expect(wrapper.get('.growth-card').classes()).not.toContain('complete')
  expect(wrapper.get('.status-metric-primary').text()).toContain('暂不估算')
  wrapper.unmount()
  const reopened = await render()
  expect(reopened.get('.tracker-star-trigger').text()).toBe('5 星 → 觉醒')
})

it.each([null, false, true])('stage25+%s只有要求觉醒且已确认时显示完成', async awakened => {
  plannerApi.getTrainingWorkspace.mockResolvedValue(workspace('custom', huaji(25, true)))
  const quickUpgrade = vi.fn()
  const wrapper = await render(huaji(25, awakened), {}, { quickUpgrade })
  expect(wrapper.get('.growth-current-star').text()).toBe(awakened === true ? '已觉醒' : '5 星')
  expect(wrapper.get('.growth-card').classes().includes('complete')).toBe(awakened === true)
  expect(wrapper.get('.growth-track.rose i').attributes('style')).toContain(awakened === true ? '100%' : '96%')
  const button = wrapper.get('[aria-label*="快捷提升化极"]')
  expect(button.text()).toBe('')
  expect(button.find('svg').exists()).toBe(true)
  expect(button.element.disabled).toBe(awakened === true)
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(putOperatorGrowthTarget).not.toHaveBeenCalled()
  if (awakened !== true) { await button.trigger('click'); expect(quickUpgrade).toHaveBeenCalledWith(expect.objectContaining({ id: 'op' }), 'star', 1) }
})

it.each(['up', 'alert'])('五星觉醒入口使用父页面的%s图标状态和动作说明，不显示旧确认文字', async icon => {
  const quickUpgrade = vi.fn()
  const wrapper = await render(huaji(), {}, { quickUpgrade, quickUpgradeState: () => ({
    visible: true, disabled: false, icon, label: '觉醒', title: '查看觉醒材料并确认扣除库存',
  }) })
  const button = wrapper.get('[aria-label="测试密探快捷提升化极：觉醒"]')
  expect(button.text()).toBe('')
  expect(button.attributes('title')).toBe('查看觉醒材料并确认扣除库存')
  expect(button.findComponent(icon === 'up' ? ChevronUp : CircleAlert).exists()).toBe(true)
  await button.trigger('click')
  expect(quickUpgrade).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'op', huaji: huaji() }), 'star', 1)
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  expect(putOperatorGrowthTarget).not.toHaveBeenCalled()
})

it('只选五星可完成，觉醒目标切回五星不会把未知自动记成false', async () => {
  plannerApi.getTrainingWorkspace.mockResolvedValue(workspace('custom', huaji(25, true)))
  const wrapper = await render()
  await choose(wrapper, '5'); await save(wrapper)
  expect(plannerApi.putTrainingWorkspace.mock.lastCall[1].plans[0].targets.op.huaji).toEqual(huaji())
  expect(wrapper.get('.growth-card').classes()).toContain('complete')
  expect(wrapper.get('.tracker-star-trigger').text()).toBe('5 星')
})

it('觉醒目标保留24→25心纸需求，完整耗时不伪装今天备齐', async () => {
  plannerApi.getTrainingWorkspace.mockResolvedValue(workspace('custom', huaji(25, true)))
  const wrapper = await render(huaji(24))
  expect(wrapper.get('.growth-card').text()).toContain('心纸 0 / 80')
  expect(wrapper.get('.status-metric-primary').text()).toContain('暂不估算')
  expect(wrapper.get('.growth-card').text()).not.toContain('当前目标材料已备齐')
})

it('旧31目标可编辑为连续觉醒，但当前旧31不推断五星', async () => {
  const old = workspace(); old.plans[0].targets.op = { level: 100, elite: 17, star_level: 31 }
  plannerApi.getTrainingWorkspace.mockResolvedValue(old)
  const wrapper = await render(huaji(null, true), {}, { currentEntries: [{ id: 'op', level: 100, elite: 17, starLevel: 31 }] })
  expect(wrapper.get('.growth-card').text()).toContain('已觉醒（历史确认）')
  expect(wrapper.get('.growth-track.rose i').attributes('style')).toContain('0%')
  await wrapper.get('.tracker-star-trigger').trigger('click')
  expect(wrapper.get('[aria-label="目标星级"]').element.value).toBe('awakening')
  expect(wrapper.findAll('[aria-label="目标星级"] option').map(option => option.element.value)).toContain('5')
  await wrapper.findAll('.tracker-popover-actions button')[0].trigger('click')
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
})

it('目标409保留弹层、同步云端且不自动重试', async () => {
  plannerApi.getTrainingWorkspace.mockResolvedValue(workspace('favorites'))
  putOperatorGrowthTarget.mockRejectedValueOnce(Object.assign(new Error('目标冲突'), { status: 409 }))
  const wrapper = await render()
  await choose(wrapper, 'awakening'); await save(wrapper)
  expect(wrapper.find('.tracker-star-popover').exists()).toBe(true)
  expect(wrapper.text()).toContain('读取云端目标')
  expect(putOperatorGrowthTarget).toHaveBeenCalledTimes(1)
})

it('自建计划409保留觉醒草稿，不自动覆盖云端或重试', async () => {
  plannerApi.putTrainingWorkspace.mockRejectedValueOnce(Object.assign(new Error('云端计划冲突'), { status: 409, code: 'training_workspace_revision_conflict' }))
  const wrapper = await render()
  await choose(wrapper, 'awakening'); await save(wrapper)
  expect(wrapper.find('.tracker-star-popover').exists()).toBe(true)
  expect(wrapper.get('[aria-label="目标星级"]').element.value).toBe('awakening')
  expect(wrapper.text()).toContain('冲突')
  expect(plannerApi.putTrainingWorkspace).toHaveBeenCalledTimes(1)
})

it.each(['custom', 'favorites'])('%s保存期间切账号，旧响应不能覆盖新账号目标', async source => {
  plannerApi.getTrainingWorkspace.mockImplementation(async account => ({ ...workspace(source), account_id: account }))
  let resolve
  const pending = new Promise(yes => { resolve = yes })
  if (source === 'custom') plannerApi.putTrainingWorkspace.mockReturnValueOnce(pending)
  else putOperatorGrowthTarget.mockReturnValueOnce(pending)
  const wrapper = await render()
  await choose(wrapper, 'awakening')
  await wrapper.findAll('.tracker-popover-actions button').find(button => /保存目标/.test(button.text())).trigger('click')
  await wrapper.setProps({ accountId: 'other' }); await flushPromises()
  expect(wrapper.find('.tracker-star-popover').exists()).toBe(false)
  resolve(source === 'custom' ? workspace('custom', huaji(25, true)) : { operator_id: 'op', revision: 4, ...target(huaji(25, true)) })
  await flushPromises()
  expect(wrapper.get('.tracker-star-trigger').text()).toBe('5 星')
  expect(source === 'custom' ? plannerApi.putTrainingWorkspace : putOperatorGrowthTarget).toHaveBeenCalledTimes(1)
})

it.each([{ rarity: 3 }, { rarity: 5, spOf: 'base' }])('隐密和SP不提供普通觉醒目标 %#', async catalog => {
  const wrapper = await render(huaji(24), catalog)
  if (catalog.spOf) expect(wrapper.find('.tracker-star-trigger').exists()).toBe(false)
  else {
    await wrapper.get('.tracker-star-trigger').trigger('click')
    expect(wrapper.findAll('[aria-label="目标星级"] option').map(option => option.element.value)).not.toContain('awakening')
  }
  expect(wrapper.findAll('[aria-label*="快捷提升化极"]').map(button => button.text()).join('')).not.toContain('记录已觉醒')
})
