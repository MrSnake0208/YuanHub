import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OperatorPage from '../src/pages/operator/index.vue'
import * as api from '../src/api/operator.js'
import * as inventory from '../src/api/inventory.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { getCurrentStarLoadout } from '../src/api/starLoadout.js'
import { starLoadoutPresetStore } from '../src/domain/starLoadoutPresets.js'
import { emptyOperatorOrganization } from '../src/utils/operatorOrganization.js'

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn().mockResolvedValue(), push: vi.fn() }),
  useRoute: () => ({ query: { tab: 'current' }, path: '/operator' }), onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {} }))
vi.mock('../src/api/operator.js', async original => Object.fromEntries(Object.keys(await original()).map(key => [key, vi.fn()])))
vi.mock('../src/api/inventory.js', async original => Object.fromEntries(Object.keys(await original()).map(key => [key, vi.fn()])))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn(), putCurrentStarLoadout: vi.fn() }))
vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: true } }))
vi.mock('../src/store/activeAccount.js', async () => {
  const { reactive } = await import('vue')
  return { activeAccount: reactive({ id: 'acc', gameFor: () => '如鸢', set(value) { this.id = value }, setGame: vi.fn(), syncAccounts: vi.fn() }) }
})
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() } }))

const catalog = ['a', 'b', 'c'].map(id => ({ id, name: id, rarity: 5, games: ['如鸢'], prof: '阳', sub_prof: '输出' }))
let organization, wrapper
beforeEach(() => {
  vi.clearAllMocks(); activeAccount.id = 'acc'
  organization = { ...emptyOperatorOrganization(), account_id: 'acc', revision: 0 }
  api.getOperatorOrganization.mockImplementation(async account => ({ ...organization, account_id: account }))
  api.putOperatorOrganization.mockImplementation(async (account, body) => {
    const { expected_revision, ...content } = body
    organization = { ...content, account_id: account, revision: expected_revision + 1 }; return organization
  })
  api.getOperatorCatalog.mockResolvedValue({ operators: catalog })
  api.listOperatorAccounts.mockResolvedValue([{ id: 'acc', name: 'acc', game: '如鸢' }])
  api.getOperatorCurrent.mockResolvedValue([{ entries: Object.fromEntries(catalog.map(({ id }) => [id, { level: 100, elite: 17, star_level: 30, revision: 1 }])) }])
  api.getOperatorAnnotations.mockResolvedValue({ items: ['active', 'graduated', 'skip'].map((state, i) => ({ operator_id: catalog[i].id, growth_state: state, revision: 1 })) })
  api.listOperatorScanReviews.mockResolvedValue({ items: [] }); inventory.listAgentFavorites.mockResolvedValue({ agent_ids: [] })
  inventory.getCurrent.mockResolvedValue([{ entries: {} }]); getCurrentStarState.mockResolvedValue({ generation: 0, entries: [] })
  getCurrentStarLoadout.mockResolvedValue({ generation: 0, revision: 0, loadouts: {} }); vi.spyOn(starLoadoutPresetStore, 'load').mockResolvedValue()
  const media = new EventTarget(); media.matches = false; vi.stubGlobal('matchMedia', vi.fn(() => media))
})
afterEach(() => wrapper?.unmount())
async function render() {
  wrapper = mount(OperatorPage, { global: { plugins: [createPinia()], directives: { reveal: () => {} }, stubs: {
    OnboardingGuide: true, IslandSidebar: true, SiteFooter: true, AccountWorkspace: { template: '<div><slot /><slot name="side" /></div>' },
    DataAccountContextBar: { template: '<div><slot name="actions" /></div>' }, OperatorShareManager: true, OperatorGrowthTracker: true,
    StarLoadoutEditor: true, StarLoadoutModal: true, RouterLink: true,
  } } }); await flushPromises()
}
const cardNames = () => wrapper.findAll('.agent-ledger-card h3').map(node => node.text())
const card = id => wrapper.findAll('.agent-ledger-card').find(node => node.get('h3').text() === id)
const noGrowthWrites = () => {
  expect(api.putOperatorAnnotation).not.toHaveBeenCalled(); expect(api.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(api.importOperator).not.toHaveBeenCalled(); expect(inventory.addAgentFavorite).not.toHaveBeenCalled(); expect(inventory.removeAgentFavorite).not.toHaveBeenCalled()
}

it('养老密探置顶跨越养成中，取消后恢复默认顺序，状态筛选仍排除不匹配密探', async () => {
  await render(); expect(cardNames()).toEqual(['a', 'b', 'c'])
  await card('c').get('[aria-label="置顶c"]').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['c', 'a', 'b'])
  await wrapper.get('.current-status-filter .status-growing').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['a'])
  await wrapper.get('.current-status-filter .status-all').trigger('click'); await flushPromises()
  await card('c').get('[aria-label="取消置顶c"]').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['a', 'b', 'c']); noGrowthWrites()
})

it('云端分组顺序刷新回读生效；置顶始终优先，未开启弃置入口', async () => {
  organization.status_order = ['skip', 'graduated', 'active', 'discarded']; organization.pinned_ids = ['b']
  await render(); expect(cardNames()).toEqual(['b', 'c', 'a'])
  expect(wrapper.find('.current-status-filter .status-discarded').exists()).toBe(false)
  expect(wrapper.findAll('.current-status-filter button').map(node => node.text().replace(/\d/g, ''))).toEqual(['全部', '养老中', '已毕业', '养成中'])
  expect(api.putOperatorOrganization).not.toHaveBeenCalled(); noGrowthWrites()
})

it('标签筛选与状态筛选取交集，清除筛选保留标签与置顶，单卡标签独立保存', async () => {
  organization.tags = [{ id: 'team', name: '主力', operator_ids: ['a', 'c'] }]
  await render()
  await wrapper.findAll('.organization-filters button').find(node => node.text() === '主力').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['a', 'c'])
  await wrapper.get('.current-status-filter .status-graduated').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual([]); expect(wrapper.text()).toContain('标签「主力」')
  await wrapper.findAll('button').find(node => node.text() === '清除筛选').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['a', 'b', 'c'])
  await card('b').get('.organization-tag-options input').setValue(true); await flushPromises()
  expect(api.putOperatorOrganization).toHaveBeenCalledWith('acc', expect.objectContaining({ tags: [{ id: 'team', name: '主力', operator_ids: ['a', 'c', 'b'] }] }))
  expect(card('b').text()).toContain('主力'); noGrowthWrites()
})
