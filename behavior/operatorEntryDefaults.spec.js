import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OperatorPage from '../src/pages/operator/index.vue'
import * as operatorApi from '../src/api/operator.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { getCurrentStarLoadout, putCurrentStarLoadout } from '../src/api/starLoadout.js'
import { listAgentFavorites } from '../src/api/inventory.js'
import { starLoadoutPresetStore } from '../src/domain/starLoadoutPresets.js'

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useRoute: () => ({ query: {}, path: '/operator' }),
  onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {},
}))
vi.mock('../src/api/operator.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/inventory.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, listAgentFavorites: vi.fn() }
})
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn(), putCurrentStarLoadout: vi.fn() }))
vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: true } }))
vi.mock('../src/store/activeAccount.js', () => ({ activeAccount: {
  id: 'acc', gameFor: () => '如鸢', set: vi.fn(), setGame: vi.fn(), syncAccounts: vi.fn(),
} }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() } }))

const operator = { id: 'op', name: '测试密探', rarity: 3, games: ['如鸢'] }
beforeEach(() => {
  vi.clearAllMocks()
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [operator] })
  operatorApi.listOperatorAccounts.mockResolvedValue([{ id: 'acc', name: '测试账号', game: '如鸢' }])
  operatorApi.getOperatorCurrent.mockResolvedValue([])
  operatorApi.getOperatorAnnotations.mockResolvedValue({ items: [] })
  operatorApi.listOperatorScanReviews.mockResolvedValue({ items: [] })
  listAgentFavorites.mockResolvedValue({ agent_ids: [] })
  getCurrentStarState.mockResolvedValue({ generation: 0, entries: [] })
  getCurrentStarLoadout.mockResolvedValue({ generation: 0, revision: 0, loadouts: {} })
  vi.spyOn(starLoadoutPresetStore, 'load').mockResolvedValue()
  const media = new EventTarget()
  media.matches = false
  vi.stubGlobal('matchMedia', vi.fn(() => media))
})

async function openEditor(existing, catalog = operator) {
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [catalog] })
  operatorApi.getOperatorCurrent.mockResolvedValue(existing ? [{ entries: { op: existing } }] : [])
  const wrapper = mount(OperatorPage, { global: {
    stubs: { IslandSidebar: true, SiteFooter: true, AccountWorkspace: true, DataAccountContextBar: true,
      OperatorShareManager: true, OperatorGrowthTracker: true, StarLoadoutEditor: true, StarLoadoutModal: true },
    directives: { reveal: () => {} },
  } })
  await flushPromises()
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('.editor-panel').exists()).toBe(true)
  return wrapper
}
const growthValues = wrapper => wrapper.findAll('.level-row input').map(input => input.element.value)
const pickStar = (wrapper, label) => wrapper.findAll('.star-groups button').find(button => button.text() === label).trigger('click')

it('新草稿默认1级1修为且未拥有，打开不写云端，保存才提交默认值', async () => {
  const wrapper = await openEditor()
  expect(growthValues(wrapper)).toEqual(['1', '1'])
  expect(wrapper.get('.star-groups .on').text()).toBe('未拥有')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
  expect(putCurrentStarLoadout).not.toHaveBeenCalled()
  await pickStar(wrapper, '1星')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent).toHaveBeenCalledWith(expect.objectContaining({
    accountId: 'acc', operatorId: 'op', patch: expect.objectContaining({ level: 1, elite: 1, star_level: 1 }),
  }))
})

it.each(['1星', '5星', '觉醒'])('已有零值保留到选择%s，切回未拥有不清空养成', async label => {
  const wrapper = await openEditor({ level: 0, elite: 0, starLevel: 0 })
  expect(growthValues(wrapper)).toEqual(['0', '0'])
  await pickStar(wrapper, label)
  expect(growthValues(wrapper)).toEqual(['1', '1'])
  await pickStar(wrapper, '未拥有')
  expect(growthValues(wrapper)).toEqual(['1', '1'])
  expect(wrapper.get('.star-groups .on').text()).toBe('未拥有')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it.each([
  [{ level: 80, elite: 12, starLevel: 0 }, { ...operator, sp_of: 'base' }, ['80', '12']],
  [{ level: 0, elite: 0, starLevel: 0 }, { ...operator, sp_of: 'base' }, ['1', '1']],
  [{ level: 80, elite: 0, starLevel: 0 }, operator, ['80', '1']],
  [{ level: 80, elite: 12, starLevel: 7 }, operator, ['80', '12']],
])('选择星级保留已有/SP养成值，只补零值 %#', async (existing, catalog, expected) => {
  const original = { ...existing }
  const wrapper = await openEditor(existing, catalog)
  await pickStar(wrapper, '2星')
  expect(growthValues(wrapper)).toEqual(expected)
  expect(existing).toEqual(original)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it.each([
  ['奇闻全部拉满', [90, 15]],
  ['一键拉满等级/修为/漆园蝶', [100, 17]],
])('%s 按图鉴填充奇闻，保存前不写入，保留化极', async (label, expectedGrowth) => {
  const schema = { attack: { max: 350 }, hp: { max: 1820 }, special: { name: '增伤值', max: 11 } }
  const wrapper = await openEditor({
    level: 90, elite: 15, starLevel: 8,
    combat_stats: { oddities: { attack: { current: 10 }, hp: { current: 20 }, special: { current: 7 } } },
  }, { ...operator, rarity: 4, oddity_schema: schema })
  await wrapper.findAll('.editor-fill-max').find(button => button.text() === label).trigger('click')
  await flushPromises()
  expect(growthValues(wrapper)).toEqual(expectedGrowth.map(String))
  expect(wrapper.findAll('.oddity-field input').map(input => input.element.value)).toEqual(['350', '1820', '11'])
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
  expect(putCurrentStarLoadout).not.toHaveBeenCalled()
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent).toHaveBeenCalledWith(expect.objectContaining({
    accountId: 'acc', operatorId: 'op', patch: expect.objectContaining({
      level: expectedGrowth[0], elite: expectedGrowth[1], star_level: 8,
      combat_stats: expect.objectContaining({ oddities: {
        attack: { current: 350 }, hp: { current: 1820 }, special: { current: 11 },
      } }),
    }),
  }))
  wrapper.unmount()
})

it('奇闻独立拉满保留图鉴缺少上限的原值，并提示确认后保存', async () => {
  const wrapper = await openEditor({
    level: 90, elite: 15, starLevel: 8,
    combat_stats: { oddities: { special: { current: 7 } } },
  }, { ...operator, oddity_schema: {
    attack: { max: 300 }, hp: { max: 1560 }, special: { name: '增伤值', max: null },
  } })
  await wrapper.get('.oddity-fill-max').trigger('click')
  expect(growthValues(wrapper)).toEqual(['90', '15'])
  expect(wrapper.findAll('.oddity-field input').map(input => input.element.value)).toEqual(['300', '1560', '7'])
  expect(wrapper.get('.editor-action-status').text()).toContain('增伤值暂无图鉴上限，已保留原值，请确认后保存')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  wrapper.unmount()
})
