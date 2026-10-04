import { beforeEach, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import Tracker from '../src/components/operator/OperatorGrowthTracker.vue'
import * as plannerApi from '../src/api/operatorPlanner.js'
import { getOperatorGrowthTargets } from '../src/api/operator.js'
import { getCurrent, listRecords } from '../src/api/inventory.js'
import { PLANNER_RULES } from '../src/data/cultivationPlanner.js'

vi.mock('../src/api/operatorPlanner.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/operator.js', () => ({ getOperatorGrowthTargets: vi.fn(), putOperatorGrowthTarget: vi.fn() }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), listRecords: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))

beforeEach(() => {
  vi.clearAllMocks()
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
  expect(input.element.value).toBe('5')
  expect(card.find('[aria-label*="快捷提升化极"]').exists()).toBe(false)
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
  wrapper.unmount()
})
