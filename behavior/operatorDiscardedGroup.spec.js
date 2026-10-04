import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OperatorPage from '../src/pages/operator/index.vue'
import * as api from '../src/api/operator.js'
import * as inventory from '../src/api/inventory.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { getCurrentStarLoadout } from '../src/api/starLoadout.js'
import { starLoadoutPresetStore } from '../src/domain/starLoadoutPresets.js'
import { deferred } from '../test-support/factories.js'

const events = vi.hoisted(() => ({ handler: null, discardedEnabled: true }))
vi.mock('../src/config/features.js', async original => {
  const actual = await original()
  return { ...actual, isFeatureEnabled: key => key === actual.FEATURE_KEYS.OPERATOR_DISCARDED ? events.discardedEnabled : actual.isFeatureEnabled(key) }
})
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn().mockResolvedValue(), push: vi.fn() }),
  useRoute: () => ({ query: { tab: 'current' }, path: '/operator' }),
  onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {},
}))
vi.mock('../src/api/operator.js', async original => Object.fromEntries(Object.keys(await original()).map(key => [key, vi.fn()])))
vi.mock('../src/api/inventory.js', async original => Object.fromEntries(Object.keys(await original()).map(key => [key, vi.fn()])))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn(), putCurrentStarLoadout: vi.fn() }))
vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: true } }))
vi.mock('../src/store/activeAccount.js', async () => {
  const { reactive } = await import('vue')
  return { activeAccount: reactive({ id: 'accA', gameFor: () => '如鸢', set(value) { this.id = value }, setGame: vi.fn(), syncAccounts: vi.fn() }) }
})
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: handler => { events.handler = handler; return () => { events.handler = null } } }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() } }))

const catalog = ['a', 'b', 'c', 'd', 'missing', 'other'].map((id, i) => ({
  id, name: id, rarity: i === 3 ? 3 : 5, prof: '阳', sub_prof: '输出', games: id === 'other' ? ['代号鸢'] : ['如鸢'],
}))
const annotations = () => ({ items: [
  { operator_id: 'a', growth_state: 'active', revision: 1, note: '保留备注' },
  { operator_id: 'b', growth_state: 'graduated', revision: 2 },
  { operator_id: 'c', growth_state: 'skip', revision: 1 },
  { operator_id: 'd', growth_state: 'discarded', revision: 3 },
] })
const entries = Object.fromEntries(catalog.map(({ id }) => [id, { level: 100, elite: 17, star_level: id === 'missing' ? 0 : 30, revision: 1 }]))
beforeEach(() => {
  events.discardedEnabled = true
  vi.clearAllMocks(); activeAccount.id = 'accA'
  api.getOperatorCatalog.mockResolvedValue({ operators: catalog })
  api.listOperatorAccounts.mockResolvedValue(['accA', 'accB'].map(id => ({ id, name: id, game: '如鸢' })))
  api.getOperatorCurrent.mockResolvedValue([{ entries }])
  api.getOperatorAnnotations.mockResolvedValue(annotations())
  api.listOperatorScanReviews.mockResolvedValue({ items: [] })
  api.putOperatorAnnotation.mockImplementation(async ({ operatorId, annotation }) => ({
    operator_id: operatorId, growth_state: annotation.growth_state, revision: annotation.expected_revision + 1, note: '保留备注',
  }))
  inventory.listAgentFavorites.mockResolvedValue({ agent_ids: ['d'] })
  inventory.getCurrent.mockImplementation(async ({ entityType }) => [{ entries: entityType === 'agent'
    ? Object.fromEntries(catalog.map(({ id }) => [id, { count: 100000 }])) : { zhuangjinboli: { count: 1000 } } }])
  getCurrentStarState.mockResolvedValue({ generation: 0, entries: [] })
  getCurrentStarLoadout.mockResolvedValue({ generation: 0, revision: 0, loadouts: {} })
  vi.spyOn(starLoadoutPresetStore, 'load').mockResolvedValue()
  const media = new EventTarget(); media.matches = false
  vi.stubGlobal('matchMedia', vi.fn(() => media))
})
const render = async () => {
  const wrapper = mount(OperatorPage, { global: {
    stubs: { IslandSidebar: true, SiteFooter: true, AccountWorkspace: { template: '<div><slot /><slot name="side" /></div>' },
      DataAccountContextBar: { template: '<div><slot name="actions" /></div>' },
      OperatorShareManager: true, OperatorGrowthTracker: true, StarLoadoutEditor: true, StarLoadoutModal: true, RouterLink: true },
    directives: { reveal: () => {} },
  } })
  await flushPromises(); return wrapper
}
const cards = wrapper => wrapper.findAll('.agent-ledger-card')
const card = (wrapper, id) => cards(wrapper).find(node => node.get('h3').text() === id)
const group = async (wrapper, state) => { await wrapper.get('.current-status-filter .status-' + state).trigger('click'); await flushPromises() }
const status = async (wrapper, id, state) => {
  const option = card(wrapper, id).findAll('[role="option"]').find(node => node.text() === state)
  await option.trigger('click'); await flushPromises()
}
const noObjectiveWrites = () => {
  expect(api.patchOperatorCurrent).not.toHaveBeenCalled(); expect(api.importOperator).not.toHaveBeenCalled()
  expect(inventory.addAgentFavorite).not.toHaveBeenCalled(); expect(inventory.removeAgentFavorite).not.toHaveBeenCalled()
}

it('关闭弃置时默认全部，单条及批量只提供旧三态，仍能读取并恢复已有弃置', async () => {
  events.discardedEnabled = false
  const wrapper = await render()
  expect(cards(wrapper)).toHaveLength(4)
  expect(wrapper.get('.current-status-filter .status-all').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('.current-status-filter .status-all').text()).toBe('全部4')
  expect(wrapper.find('.current-status-filter .status-discarded').exists()).toBe(false)
  expect(wrapper.find('.current-status-filter .status-registered').exists()).toBe(false)
  expect(wrapper.find('.current-status-summary .status-discarded').exists()).toBe(false)
  expect(wrapper.find('.ledger-status-help').exists()).toBe(false)
  expect(card(wrapper, 'a').findAll('[role="option"]').map(option => option.text())).toEqual(['养成中', '已毕业', '养老中'])
  expect(card(wrapper, 'd').get('summary').text()).toContain('已弃置')
  expect(api.putOperatorAnnotation).not.toHaveBeenCalled()
  await wrapper.get('.current-batch-toggle').trigger('click')
  expect(wrapper.findAll('.batch-status-action').map(option => option.text())).toEqual(['设为养成中', '设为已毕业', '设为养老中'])
  await wrapper.get('.batch-select-all input').setValue(true)
  await wrapper.get('.batch-status-action.graduated').trigger('click'); await flushPromises()
  expect(api.putOperatorAnnotation).toHaveBeenCalledTimes(4)
  expect(api.putOperatorAnnotation.mock.calls.every(([input]) => input.annotation.growth_state === 'graduated')).toBe(true)
  await group(wrapper, 'growing')
  await wrapper.findAll('button').find(node => node.text() === '清除筛选').trigger('click'); await flushPromises()
  expect(cards(wrapper)).toHaveLength(4)
  expect(wrapper.get('.current-status-filter .status-all').attributes('aria-pressed')).toBe('true')
  await status(wrapper, 'a', '养老中')
  expect(api.putOperatorAnnotation).toHaveBeenLastCalledWith(expect.objectContaining({ operatorId: 'a', annotation: expect.objectContaining({ growth_state: 'skip' }) }))
  noObjectiveWrites()
})

it('关闭弃置时延后迁移本地弃置且保留缓存，旧状态照常迁移，重新开放后可继续迁移', async () => {
  events.discardedEnabled = false
  const key = 'yuanhub:operator-workbench:statuses:accA:如鸢'
  localStorage.setItem(key, JSON.stringify({ d: 'discarded', b: 'graduated' }))
  api.getOperatorAnnotations.mockResolvedValue({ items: [] })
  const wrapper = await render()
  expect(card(wrapper, 'd').get('summary').text()).toContain('已弃置')
  expect(JSON.parse(localStorage.getItem(key)).d).toBe('discarded')
  expect(localStorage.getItem('yuanhub:operator-annotations-migrated:v1:accA')).not.toBe('done')
  expect(api.putOperatorAnnotation.mock.calls.map(([input]) => input.operatorId)).toEqual(['b'])
  wrapper.unmount()
  api.putOperatorAnnotation.mockClear()
  api.getOperatorAnnotations.mockResolvedValue({ items: [{ operator_id: 'b', growth_state: 'graduated', revision: 1 }] })
  events.discardedEnabled = true
  const reopened = await render()
  expect(api.putOperatorAnnotation).toHaveBeenCalledWith(expect.objectContaining({ operatorId: 'd', annotation: expect.objectContaining({ growth_state: 'discarded' }) }))
  await group(reopened, 'discarded')
  expect(card(reopened, 'd')).toBeTruthy()
})

it('默认在册、独立弃置、显式全部及品质交集，计数不受额外筛选影响，重置回在册', async () => {
  const wrapper = await render()
  expect(cards(wrapper).map(node => node.get('h3').text())).toEqual(['a', 'b', 'c'])
  expect(wrapper.get('.current-status-filter .status-registered').text()).toBe('在册3')
  expect(wrapper.get('.current-status-filter .status-all').text()).toBe('全部（含已弃置）4')
  await group(wrapper, 'discarded'); expect(card(wrapper, 'd')).toBeTruthy(); expect(cards(wrapper)).toHaveLength(1)
  await wrapper.get('.rarity-filter .rarity-r5').trigger('click')
  expect(cards(wrapper)).toHaveLength(0)
  expect(wrapper.text()).toContain('分组「已弃置」')
  expect(wrapper.get('.current-status-filter .status-discarded').text()).toBe('已弃置1')
  await wrapper.findAll('button').find(node => node.text() === '清除筛选，返回在册').trigger('click')
  expect(cards(wrapper)).toHaveLength(3)
  await group(wrapper, 'all'); expect(cards(wrapper)).toHaveLength(4)
  expect(wrapper.findAll('.slot')).toHaveLength(5) // 图鉴保留已弃置与未拥有，版本外不展示
  noObjectiveWrites()
})

it('保存中保留原卡片并显示忙碌，成功后移出并可查看弃置，恢复目标明确', async () => {
  const pending = deferred(); api.putOperatorAnnotation.mockReturnValueOnce(pending.promise)
  const wrapper = await render(); await status(wrapper, 'a', '已弃置')
  expect(card(wrapper, 'a').attributes('aria-busy')).toBe('true')
  expect(card(wrapper, 'a').get('summary').text()).toContain('保存中')
  expect(api.putOperatorAnnotation).toHaveBeenCalledWith({ accountId: 'accA', operatorId: 'a', annotation: { growth_state: 'discarded', expected_revision: 1 } })
  pending.resolve({ operator_id: 'a', growth_state: 'discarded', revision: 2, note: '保留备注' }); await flushPromises()
  expect(card(wrapper, 'a')).toBeUndefined()
  await wrapper.findAll('button').find(node => node.text() === '查看已弃置').trigger('click'); await flushPromises()
  expect(card(wrapper, 'a')).toBeTruthy()
  await status(wrapper, 'a', '养老中'); expect(card(wrapper, 'a')).toBeUndefined()
  expect(wrapper.text()).toContain('已恢复为养老中')
  noObjectiveWrites()
})

it('失败保留原位置和选中对象，冲突重新读取而不盲目覆盖', async () => {
  const wrapper = await render()
  await wrapper.get('.current-batch-toggle').trigger('click')
  await card(wrapper, 'a').get('input[type="checkbox"]').setValue(true)
  api.putOperatorAnnotation.mockRejectedValueOnce(new Error('保存失败'))
  await status(wrapper, 'a', '已弃置')
  expect(card(wrapper, 'a').get('input[type="checkbox"]').element.checked).toBe(true)
  expect(card(wrapper, 'a').get('summary').text()).toContain('养成中')
  api.getOperatorAnnotations.mockResolvedValueOnce({ items: [{ operator_id: 'a', growth_state: 'skip', revision: 9 }] })
  api.putOperatorAnnotation.mockRejectedValueOnce(Object.assign(new Error('冲突'), { code: 'annotation_revision_conflict' }))
  await status(wrapper, 'a', '已弃置')
  expect(card(wrapper, 'a').get('summary').text()).toContain('养老中')
  expect(wrapper.text()).toContain('已在其他页面更新')
  expect(api.putOperatorAnnotation).toHaveBeenCalledTimes(2)
})

it('批量固定请求对象，部分成功保留失败选择，重试后可批量恢复到养成中', async () => {
  const wrapper = await render(); await wrapper.get('.current-batch-toggle').trigger('click')
  await wrapper.get('.batch-select-all input').setValue(true)
  api.putOperatorAnnotation.mockImplementation(async ({ operatorId, annotation }) => {
    if (operatorId === 'b') throw new Error('失败')
    return { operator_id: operatorId, growth_state: annotation.growth_state, revision: annotation.expected_revision + 1 }
  })
  await wrapper.get('.batch-status-action.discarded').trigger('click'); await flushPromises()
  expect(api.putOperatorAnnotation.mock.calls.map(([input]) => input.operatorId).sort()).toEqual(['a', 'b', 'c'])
  expect(cards(wrapper)).toHaveLength(1); expect(card(wrapper, 'b').get('input[type="checkbox"]').element.checked).toBe(true)
  expect(wrapper.text()).toContain('成功 2 位，失败 1 位')
  api.putOperatorAnnotation.mockImplementation(async ({ operatorId, annotation }) => ({ operator_id: operatorId, growth_state: annotation.growth_state, revision: annotation.expected_revision + 1 }))
  await wrapper.get('.batch-status-action.discarded').trigger('click'); await flushPromises()
  expect(cards(wrapper)).toHaveLength(0)
  await group(wrapper, 'discarded'); await wrapper.get('.batch-select-all input').setValue(true)
  expect(wrapper.get('.batch-status-action.growing').text()).toBe('恢复为养成中')
  await wrapper.get('.batch-status-action.growing').trigger('click'); await flushPromises()
  expect(cards(wrapper)).toHaveLength(0); expect(wrapper.text()).toContain('成功项已设为养成中')
  await group(wrapper, 'registered'); expect(cards(wrapper)).toHaveLength(4)
  noObjectiveWrites()
})

it.each([false, true])('切账号后旧保存结果不污染新账号（返回旧账号=%s）', async returnToA => {
  const pending = deferred(); api.putOperatorAnnotation.mockReturnValueOnce(pending.promise)
  const wrapper = await render(); await status(wrapper, 'a', '已弃置')
  activeAccount.id = 'accB'; await flushPromises()
  if (returnToA) { activeAccount.id = 'accA'; await flushPromises() }
  pending.resolve({ operator_id: 'a', growth_state: 'discarded', revision: 99 }); await flushPromises()
  expect(card(wrapper, 'a').get('summary').text()).toContain('养成中')
  expect(wrapper.text()).not.toContain('a：已移至已弃置')
})

it('弃置不产生化极提醒或关注名单，但仍可主动编辑和提升，关注不变', async () => {
  const wrapper = await render()
  expect(wrapper.get('.current-upgrade-reminders').text()).toContain('3')
  expect(wrapper.get('.current-upgrade-reminders').text()).not.toContain('特别关注')
  await group(wrapper, 'discarded')
  expect(card(wrapper, 'd').get('[aria-label="取消特别关注d"]').attributes('aria-pressed')).toBe('true')
  expect(card(wrapper, 'd').findAll('button').some(node => (node.attributes('aria-label') || '').startsWith('化极：'))).toBe(true)
  await card(wrapper, 'd').get('.ledger-full-edit').trigger('click'); await flushPromises()
  expect(wrapper.find('.editor-panel').exists()).toBe(true)
  noObjectiveWrites()
})

it('刷新较旧revision不覆盖弃置；未知状态在全部可见且明确提示不受支持', async () => {
  api.getOperatorAnnotations.mockResolvedValue({ items: [{ operator_id: 'a', growth_state: 'future', revision: 1 }] })
  const wrapper = await render(); expect(card(wrapper, 'a')).toBeUndefined()
  await group(wrapper, 'all'); expect(card(wrapper, 'a').get('summary').text()).toContain('不支持的养成状态：future')
  await status(wrapper, 'a', '已弃置')
  api.getOperatorAnnotations.mockResolvedValue({ items: [{ operator_id: 'a', growth_state: 'active', revision: 1 }] })
  events.handler({ account_id: 'accA', kind: 'operator_annotation' }); await flushPromises()
  expect(card(wrapper, 'a').get('summary').text()).toContain('已弃置')
})

it('本地弃置缓存按云端标注迁移，不重置为active', async () => {
  localStorage.setItem('yuanhub:operator-workbench:statuses:accA:如鸢', JSON.stringify({ d: 'discarded' }))
  api.getOperatorAnnotations.mockResolvedValue({ items: [] })
  const wrapper = await render()
  expect(api.putOperatorAnnotation).toHaveBeenCalledWith(expect.objectContaining({
    operatorId: 'd', annotation: { growth_state: 'discarded', note: null, expected_revision: 0 },
  }))
  expect(card(wrapper, 'd')).toBeUndefined()
  await group(wrapper, 'discarded'); expect(card(wrapper, 'd')).toBeTruthy()
})

it('主观备份预览明确展示养成中到已弃置，预览不写标注', async () => {
  const wrapper = await render()
  await wrapper.get('.archive-toggle').trigger('click')
  await wrapper.get('.archive-import').trigger('click')
  await wrapper.get('#operator-import-json').setValue(JSON.stringify({
    format: 'myshare-operator-exchange', version: 3,
    accounts: [{ id: 'accA', name: '测试账号' }],
    records: [{ account_id: 'accA', record_type: 'operator_annotation_snapshot', entries: [{ operator_id: 'a', growth_state: 'discarded' }] }],
  }))
  api.previewOperatorImport.mockResolvedValue({ accepted: 1, partial: 0, rejected: 0, review: 0, unchanged: 0, items: [{
    operator_id: 'a', record_id: 'annotation:test', status: 'accepted',
    changes: { growth_state: { before: 'active', after: 'discarded' } }, warnings: [], blocking_errors: [],
  }] })
  await wrapper.findAll('.import-actions button').find(button => button.text() === '校验并预览').trigger('click')
  await flushPromises()
  expect(wrapper.get('.import-change-list').text()).toContain('养成状态养成中 → 已弃置')
  expect(api.putOperatorAnnotation).not.toHaveBeenCalled()
})

it('保存中刷新不提前移动卡片；页面卸载后忽略保存结果', async () => {
  const pending = deferred(); api.putOperatorAnnotation.mockReturnValueOnce(pending.promise)
  const wrapper = await render(); await status(wrapper, 'a', '已弃置')
  events.handler({ account_id: 'accA', kind: 'operator_annotation' }); await flushPromises()
  expect(card(wrapper, 'a').get('summary').text()).toContain('保存中')
  wrapper.unmount()
  pending.resolve({ operator_id: 'a', growth_state: 'discarded', revision: 2 }); await flushPromises()
  const cached = JSON.parse(localStorage.getItem('yuanhub:operator-workbench:statuses:accA:如鸢'))
  expect(cached.a).toBe('growing')
})


it('养成总览的紧凑搜索与状态筛选组合，重置恢复列表且不写数据', async () => {
  const wrapper = await render()
  await wrapper.get('.current-filter-search input').setValue('b')
  expect(cards(wrapper).map(node => node.get('h3').text())).toEqual(['b'])
  await group(wrapper, 'growing')
  expect(cards(wrapper)).toHaveLength(0)
  await wrapper.get('.current-filter-reset').trigger('click')
  expect(wrapper.get('.current-filter-search input').element.value).toBe('')
  expect(cards(wrapper)).toHaveLength(3)
  noObjectiveWrites()
})
