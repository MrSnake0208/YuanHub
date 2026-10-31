import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OperatorPage from '../src/pages/operator/index.vue'
import { auth } from '../src/store/auth.js'
import * as api from '../src/api/operator.js'
import * as inventory from '../src/api/inventory.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { getCurrentStarLoadout } from '../src/api/starLoadout.js'
import { starLoadoutPresetStore } from '../src/domain/starLoadoutPresets.js'
import { emptyOperatorOrganization, operatorOrganizationBackup } from '../src/utils/operatorOrganization.js'
import DataAccountContextBar from '../src/components/DataAccountContextBar.vue'
import { dialog } from '../src/utils/dialog.js'
import { deferred } from '../test-support/factories.js'

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn().mockResolvedValue(), push: vi.fn() }),
  useRoute: () => ({ query: { tab: 'current' }, path: '/operator' }), onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {} }))
vi.mock('../src/api/operator.js', async original => Object.fromEntries(Object.keys(await original()).map(key => [key, vi.fn()])))
vi.mock('../src/api/inventory.js', async original => Object.fromEntries(Object.keys(await original()).map(key => [key, vi.fn()])))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn(), putCurrentStarLoadout: vi.fn() }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, adminAccess: null }) }
})
vi.mock('../src/store/activeAccount.js', async () => {
  const { reactive } = await import('vue')
  return { activeAccount: reactive({ id: 'acc', gameFor: () => '如鸢', set(value) { this.id = value }, setGame: vi.fn(), syncAccounts: vi.fn() }) }
})
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() } }))

const catalog = ['a', 'b', 'c'].map(id => ({ id, name: id, rarity: 5, games: ['如鸢'], prof: '阳', sub_prof: '输出' }))
let organization, wrapper
beforeEach(() => {
  auth.adminAccess = null;
  vi.resetAllMocks(); dialog.confirm.mockResolvedValue(true); activeAccount.id = 'acc'
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
    DataAccountContextBar: { name: 'DataAccountContextBar', props: ['beforeSwitch', 'switchDisabled'], template: '<div><slot name="actions" /></div>' }, OperatorShareManager: true, OperatorGrowthTracker: true,
    StarLoadoutEditor: true, StarLoadoutModal: true, RouterLink: true,
  } } }); await flushPromises()
}
const cardNames = () => wrapper.findAll('.agent-ledger-card').map(node => node.get('h3').text())
const card = id => wrapper.findAll('.agent-ledger-card').find(node => node.get('h3').text() === id)
const noGrowthWrites = () => {
  expect(api.putOperatorAnnotation).not.toHaveBeenCalled(); expect(api.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(api.importOperator).not.toHaveBeenCalled(); expect(inventory.addAgentFavorite).not.toHaveBeenCalled(); expect(inventory.removeAgentFavorite).not.toHaveBeenCalled()
}

it('排序控件保存本机偏好，重新进入可恢复，切回默认保留特别关注设置', async () => {
  const sortKey = 'yuanhub:operator-workbench:sort:acc:如鸢'
  const favoriteKey = 'yuanhub:operator-workbench:favorite-first:acc:如鸢'
  localStorage.setItem(favoriteKey, 'true')
  organization.pinned_ids = ['c']
  inventory.listAgentFavorites.mockResolvedValue({ agent_ids: ['a'] })
  api.getOperatorAnnotations.mockResolvedValue({ items: catalog.map(({ id }) => ({ operator_id: id, growth_state: 'active', revision: 1 })) })
  api.getOperatorCurrent.mockResolvedValue([{ entries: Object.fromEntries(catalog.map(({ id }) => [id, { level: id === 'a' ? 47 : 100, elite: 17, star_level: 30, revision: 1 }])) }])
  await render()
  const select = () => wrapper.get('.current-sort-field select')
  expect(select().findAll('option').map(option => option.text())).toEqual(['默认', '品质', '等级', '阶级', '星级'])
  expect(select().element.value).toBe('default')
  expect(cardNames()).toEqual(['c', 'a', 'b'])
  expect(wrapper.find('.current-sort-direction').exists()).toBe(false)
  await select().setValue('level')
  expect(cardNames()).toEqual(['b', 'c', 'a'])
  expect(wrapper.get('.current-sort-direction').text()).toBe('从高到低')
  expect(wrapper.get('.current-favorite-sort').element.disabled).toBe(true)
  await wrapper.get('.current-sort-direction').trigger('click')
  expect(cardNames()).toEqual(['a', 'b', 'c'])
  expect(wrapper.get('.current-sort-direction').attributes('aria-label')).toContain('当前从低到高')
  expect(JSON.parse(localStorage.getItem(sortKey))).toEqual({ mode: 'level', direction: 'asc' })
  wrapper.unmount(); await render()
  expect(select().element.value).toBe('level')
  expect(wrapper.get('.current-sort-direction').text()).toBe('从低到高')
  await select().setValue('default')
  expect(cardNames()).toEqual(['c', 'a', 'b'])
  expect(wrapper.get('.current-favorite-sort').element.disabled).toBe(false)
  expect(wrapper.get('.current-favorite-sort').attributes('aria-pressed')).toBe('true')
  expect(localStorage.getItem(favoriteKey)).toBe('true')
  expect(api.putOperatorOrganization).not.toHaveBeenCalled(); noGrowthWrites()
})

it.each([
  ['rarity', ['c', 'a', 'b'], ['b', 'a', 'c']],
  ['level', ['a', 'c', 'b'], ['b', 'c', 'a']],
  ['elite', ['b', 'c', 'a'], ['a', 'c', 'b']],
  ['star', ['c', 'a', 'b'], ['b', 'a', 'c']],
].flatMap(([mode, asc, desc]) => ['如鸢', '代号鸢'].map(game => [mode, game, asc, desc])))('%s 排序在 %s 按完整筛选结果升降序，不改分类，切默认恢复', async (mode, game, asc, desc) => {
  vi.spyOn(activeAccount, 'gameFor').mockReturnValue(game)
  api.listOperatorAccounts.mockResolvedValue([{ id: 'acc', name: 'acc', game }])
  api.getOperatorCatalog.mockResolvedValue({ operators: catalog.map((entry, index) => ({ ...entry, rarity: [4, 5, 3][index], games: ['如鸢', '代号鸢'] })) })
  api.getOperatorCurrent.mockResolvedValue([{ entries: {
    a: { level: 47, elite: 17, star_level: 13, revision: 1 },
    b: { level: 100, elite: 6, star_level: 19, revision: 1 },
    c: { level: 60, elite: 12, star_level: 7, revision: 1 },
  } }])
  organization.pinned_ids = ['a']
  organization.status_order = ['skip', 'graduated', 'active', 'discarded']
  const saved = structuredClone(organization)
  await render()
  expect(cardNames()).toEqual(['a', 'c', 'b'])
  const select = wrapper.get('.current-sort-field select')
  await select.setValue(mode)
  expect(cardNames()).toEqual(desc)
  await wrapper.get('.current-sort-direction').trigger('click')
  expect(cardNames()).toEqual(asc)
  const search = wrapper.get('#operator-panel-current .current-filter-search input')
  await search.setValue('b')
  await select.setValue('default')
  expect(search.element.value).toBe('b'); expect(cardNames()).toEqual(['b'])
  await select.setValue(mode)
  expect(search.element.value).toBe('b'); expect(cardNames()).toEqual(['b'])
  await search.setValue('')
  expect(cardNames()).toEqual(asc)
  await wrapper.get('#operator-panel-current .status-graduated').trigger('click')
  await select.setValue('default')
  expect(cardNames()).toEqual(['b'])
  expect(wrapper.get('#operator-panel-current .status-graduated').attributes('aria-pressed')).toBe('true')
  await wrapper.get('#operator-panel-current .status-all').trigger('click')
  expect(cardNames()).toEqual(['a', 'c', 'b'])
  expect(organization).toEqual(saved)
  expect(api.putOperatorOrganization).not.toHaveBeenCalled(); noGrowthWrites()
  await wrapper.get('#operator-tab-catalog').trigger('click'); await flushPromises()
  expect(wrapper.get('#operator-panel-catalog').find('.current-sort-controls').exists()).toBe(false)
})

it.each(['level', 'elite'])('%s 经过页面归一化后仍区分缺失值和有效零值', async mode => {
  api.getOperatorCurrent.mockResolvedValue([{ entries: {
    a: { level: 3, elite: 3, star_level: 13, revision: 1 },
    b: { level: null, star_level: 19, revision: 1 },
    c: { level: 0, elite: 0, star_level: 7, revision: 1 },
  } }])
  await render()
  await wrapper.get('.current-sort-field select').setValue(mode)
  expect(cardNames()).toEqual(['a', 'c', 'b'])
  await wrapper.get('.current-sort-direction').trigger('click')
  expect(cardNames()).toEqual(['c', 'a', 'b'])
  expect(api.putOperatorOrganization).not.toHaveBeenCalled(); noGrowthWrites()
})

it('切账号独立读取排序偏好，加载中可操作，迟到资料不重置当前偏好', async () => {
  const sortA = 'yuanhub:operator-workbench:sort:acc:如鸢'
  const sortB = 'yuanhub:operator-workbench:sort:b:如鸢'
  localStorage.setItem(sortA, JSON.stringify({ mode: 'star', direction: 'asc' }))
  localStorage.setItem(sortB, JSON.stringify({ mode: 'elite', direction: 'desc' }))
  await render()
  expect(wrapper.get('.current-sort-field select').element.value).toBe('star')
  const pending = deferred(); api.getOperatorCurrent.mockReturnValueOnce(pending.promise)
  activeAccount.id = 'b'; await flushPromises()
  expect(wrapper.get('.current-sort-field select').element.value).toBe('elite')
  expect(wrapper.get('.current-sort-direction').text()).toBe('从高到低')
  await wrapper.get('.current-sort-direction').trigger('click')
  activeAccount.id = 'acc'; await flushPromises()
  pending.resolve([{ entries: {} }]); await flushPromises()
  expect(wrapper.get('.current-sort-field select').element.value).toBe('star')
  expect(wrapper.get('.current-sort-direction').text()).toBe('从低到高')
  expect(JSON.parse(localStorage.getItem(sortA))).toEqual({ mode: 'star', direction: 'asc' })
  expect(JSON.parse(localStorage.getItem(sortB))).toEqual({ mode: 'elite', direction: 'asc' })
  expect(api.putOperatorOrganization).not.toHaveBeenCalled(); noGrowthWrites()
})

it.each(['{broken', 'null', '[]', '{"mode":"name","direction":"desc"}', '{"mode":"star","direction":"up"}', '{"mode":"level"}'])('非法排序偏好 %s 回退默认，空名册仍保留选项', async raw => {
  localStorage.setItem('yuanhub:operator-workbench:sort:acc:如鸢', raw)
  api.getOperatorCurrent.mockResolvedValue([])
  await render()
  expect(wrapper.get('.current-sort-field select').element.value).toBe('default')
  expect(wrapper.find('.current-sort-direction').exists()).toBe(false)
  expect(wrapper.text()).toContain('暂无已招募的密探养成记录')
  await wrapper.get('.current-sort-field select').setValue('rarity')
  expect(wrapper.get('.current-sort-direction').text()).toBe('从高到低')
})

it('排序偏好存储不可用时回退默认，仍可在本次会话切换排序', async () => {
  const read = localStorage.getItem.bind(localStorage)
  const write = localStorage.setItem.bind(localStorage)
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(key => {
    if (key.startsWith('yuanhub:operator-workbench:sort:')) throw new Error('storage blocked')
    return read(key)
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
    if (key.startsWith('yuanhub:operator-workbench:sort:')) throw new Error('storage blocked')
    return write(key, value)
  })
  await render()
  expect(wrapper.get('.current-sort-field select').element.value).toBe('default')
  await wrapper.get('.current-sort-field select').setValue('star')
  await wrapper.get('.current-sort-direction').trigger('click')
  expect(wrapper.get('.current-sort-field select').element.value).toBe('star')
  expect(wrapper.get('.current-sort-direction').text()).toBe('从低到高')
  expect(api.putOperatorOrganization).not.toHaveBeenCalled(); noGrowthWrites()
})

it('养老密探置顶跨越养成中，取消后恢复默认顺序，状态筛选仍排除不匹配密探', async () => {
  await render(); expect(cardNames()).toEqual(['a', 'b', 'c'])
  expect(wrapper.get('.operator-organization').element.closest('.operator-filter-dossier')).not.toBeNull()
  expect(wrapper.find('.current-tag-filter').exists()).toBe(false)
  expect(wrapper.get('.current-organization-toggle').element.closest('.current-filter-tools')).not.toBeNull()
  await card('c').get('[aria-label="置顶c"]').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['c', 'a', 'b'])
  await wrapper.get('#operator-panel-current .current-status-filter .status-growing').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['a'])
  await wrapper.get('#operator-panel-current .current-status-filter .status-all').trigger('click'); await flushPromises()
  await card('c').get('[aria-label="取消置顶c"]').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['a', 'b', 'c']); noGrowthWrites()
})

it('尚无密探时也可在现有筛选区设置分类，无需独立工具卡片', async () => {
  api.getOperatorCurrent.mockResolvedValue([])
  await render()
  expect(wrapper.get('.operator-organization').element.closest('.operator-filter-dossier')).not.toBeNull()
  await editClassification()
  expect(wrapper.get('[data-tag-name]').element.value).toBe('草稿标签')
  expect(api.putOperatorOrganization).not.toHaveBeenCalled()
})

it('云端分组顺序刷新回读生效；置顶始终优先，未开启弃置入口', async () => {
  organization.status_order = ['skip', 'graduated', 'active', 'discarded']; organization.pinned_ids = ['b']
  await render(); expect(cardNames()).toEqual(['b', 'c', 'a'])
  expect(wrapper.find('#operator-panel-current .current-status-filter .status-discarded').exists()).toBe(false)
  expect(wrapper.findAll('#operator-panel-current .current-status-filter button').map(node => node.text().replace(/\d/g, ''))).toEqual(['全部', '养老中', '已毕业', '养成中'])
  expect(api.putOperatorOrganization).not.toHaveBeenCalled(); noGrowthWrites()
})

it('标签筛选与状态筛选取交集，清除筛选保留标签与置顶，单卡标签独立保存', async () => {
  organization.tags = [{ id: 'team', name: '主力', operator_ids: ['a', 'c'] }]
  await render()
  const tags = wrapper.get('.current-tag-filter')
  expect(tags.classes()).toContain('mf-filter')
  expect(tags.element.parentElement.classList.contains('pf-row')).toBe(true)
  expect(tags.get('button').text()).toBe('全部3')
  await tags.findAll('button').find(node => node.text() === '主力2').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['a', 'c'])
  await wrapper.get('#operator-panel-current .current-status-filter .status-graduated').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual([]); expect(wrapper.text()).toContain('标签「主力」')
  await wrapper.findAll('button').find(node => node.text() === '清除筛选').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['a', 'b', 'c'])
  await card('b').get('.organization-tag-options input').setValue(true); await flushPromises()
  expect(api.putOperatorOrganization).toHaveBeenCalledWith('acc', expect.objectContaining({ tags: [{ id: 'team', name: '主力', operator_ids: ['a', 'c', 'b'] }] }))
  expect(card('b').text()).toContain('主力'); noGrowthWrites()
})

async function editClassification() {
  const manager = wrapper.get('.operator-organization')
  if (wrapper.get('.current-organization-toggle').attributes('aria-expanded') !== 'true') await wrapper.get('.current-organization-toggle').trigger('click')
  await manager.findAll('button').find(button => button.text() === '新增标签').trigger('click')
  await manager.get('[data-tag-name]').setValue('草稿标签')
  expect(wrapper.get('.current-organization-toggle').text()).toContain('未保存')
  return manager
}

it('分类草稿切账号需要确认，取消保留输入，确认后才允许切换', async () => {
  await render(); await editClassification()
  const toggle = wrapper.get('.current-organization-toggle')
  expect(toggle.attributes('aria-controls')).toBe(wrapper.get('.organization-settings').attributes('id'))
  await toggle.trigger('click')
  expect(toggle.attributes('aria-expanded')).toBe('false'); expect(toggle.text()).toContain('未保存')
  await toggle.trigger('click')
  expect(wrapper.get('[data-tag-name]').element.value).toBe('草稿标签')
  const context = wrapper.getComponent(DataAccountContextBar)
  dialog.confirm.mockResolvedValueOnce(false)
  expect(await context.props('beforeSwitch')('b')).toBe(false)
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '放弃未保存的分类设置？', message: expect.stringContaining('分类设置尚未保存') }))
  expect(wrapper.get('[data-tag-name]').element.value).toBe('草稿标签')
  expect(activeAccount.id).toBe('acc')
  dialog.confirm.mockResolvedValueOnce(true)
  expect(await context.props('beforeSwitch')('b')).toBe(true)
  expect(api.putOperatorOrganization).not.toHaveBeenCalled(); noGrowthWrites()
})

it('分类确认期间账号上下文改变不授权新的切换，旧草稿不会进入新账号', async () => {
  await render(); await editClassification()
  const confirmation = deferred(); dialog.confirm.mockReturnValueOnce(confirmation.promise)
  const allowed = wrapper.getComponent(DataAccountContextBar).props('beforeSwitch')('b')
  activeAccount.id = 'b'; await flushPromises()
  confirmation.resolve(true); expect(await allowed).toBe(false)
  expect(wrapper.find('[data-tag-name]').exists()).toBe(false)
  expect(api.putOperatorOrganization).not.toHaveBeenCalled()
})

it('分类正在保存时禁止切账号，失败后草稿保留且恢复确认流程', async () => {
  await render(); const manager = await editClassification()
  const pending = deferred(); api.putOperatorOrganization.mockReturnValueOnce(pending.promise)
  await manager.get('form').trigger('submit')
  const context = wrapper.getComponent(DataAccountContextBar)
  expect(context.props('switchDisabled')).toBe(true)
  expect(await context.props('beforeSwitch')('b')).toBe(false)
  expect(dialog.confirm).not.toHaveBeenCalled()
  pending.reject(new Error('offline')); await flushPromises()
  expect(context.props('switchDisabled')).toBe(false)
  expect(wrapper.get('[data-tag-name]').element.value).toBe('草稿标签')
  dialog.confirm.mockResolvedValueOnce(false)
  expect(await context.props('beforeSwitch')('b')).toBe(false)
})

it('未保存分类触发刷新离开保护，放弃修改后解除且卸载清理监听', async () => {
  await render(); const manager = await editClassification()
  const dirtyUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(dirtyUnload); expect(dirtyUnload.defaultPrevented).toBe(true)
  await manager.findAll('button').find(button => button.text() === '放弃修改').trigger('click')
  const cleanUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(cleanUnload); expect(cleanUnload.defaultPrevented).toBe(false)
  await editClassification(); wrapper.unmount()
  const disposedUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(disposedUnload); expect(disposedUnload.defaultPrevented).toBe(false)
  wrapper = null
})

const clickPageButton = async text => {
  await wrapper.findAll('button').find(button => button.text() === text).trigger('click')
  await flushPromises()
}
async function previewClassification(content = { ...emptyOperatorOrganization(), pinned_ids: ['c'], tags: [{ id: 'team', name: '主力', operator_ids: ['a', 'c'] }] }, game = '如鸢') {
  if (!wrapper.find('.archive-workspace').exists()) await clickPageButton('导入/导出 JSON')
  if (!wrapper.find('#operator-import-json').exists()) await clickPageButton('JSON 备份导入')
  await wrapper.get('#operator-import-json').setValue(JSON.stringify(operatorOrganizationBackup(content, game)))
  await clickPageButton('校验并预览分类')
}

it('分类备份统一从 JSON 入口识别，预览无写入，确认后只保存当前账号分类', async () => {
  await render(); await previewClassification()
  expect(wrapper.find('.organization-backup').exists()).toBe(false)
  expect(wrapper.get('.organization-import-preview').text()).toContain('1 位置顶 · 1 个标签')
  expect(wrapper.get('.organization-import-preview').text()).toContain('主力')
  expect(api.putOperatorOrganization).not.toHaveBeenCalled()
  await clickPageButton('确认恢复分类')
  expect(api.putOperatorOrganization).toHaveBeenCalledWith('acc', expect.objectContaining({ expected_revision: 0, pinned_ids: ['c'] }))
  expect(wrapper.find('.organization-import-preview').exists()).toBe(false)
  expect(wrapper.text()).toContain('分类已恢复并保存到当前账号')
  expect(cardNames()).toEqual(['c', 'a', 'b']); noGrowthWrites()
})

it('分类导入拒绝错误游戏与未知密探；编辑 JSON 使旧预览失效', async () => {
  await render(); await previewClassification(emptyOperatorOrganization(), '代号鸢')
  expect(wrapper.get('#operator-import-error').text()).toContain('游戏版本')
  expect(wrapper.find('.organization-import-preview').exists()).toBe(false)
  await previewClassification({ ...emptyOperatorOrganization(), pinned_ids: ['unknown'] })
  expect(wrapper.get('#operator-import-error').text()).toContain('未收录的密探')
  await previewClassification()
  await wrapper.get('#operator-import-json').setValue('{}')
  expect(wrapper.find('.organization-import-preview').exists()).toBe(false)
  expect(api.putOperatorOrganization).not.toHaveBeenCalled(); noGrowthWrites()
})

it('恢复分类先确认未保存草稿，取消或保存失败保留草稿与预览，成功后更新编辑器', async () => {
  await render(); await editClassification(); await previewClassification()
  dialog.confirm.mockResolvedValueOnce(false)
  await clickPageButton('确认恢复分类')
  expect(api.putOperatorOrganization).not.toHaveBeenCalled()
  expect(wrapper.get('[data-tag-name]').element.value).toBe('草稿标签')
  api.putOperatorOrganization.mockRejectedValueOnce(new Error('offline'))
  await clickPageButton('确认恢复分类')
  expect(wrapper.get('[data-tag-name]').element.value).toBe('草稿标签')
  expect(wrapper.find('.organization-import-preview').exists()).toBe(true)
  expect(wrapper.get('.import-error').text()).toContain('offline')
  await clickPageButton('确认恢复分类')
  expect(wrapper.get('[data-tag-name]').element.value).toBe('主力')
  expect(wrapper.get('.current-organization-toggle').text()).not.toContain('未保存')
  noGrowthWrites()
})

it('恢复确认等待期间切换账号使旧预览失效，不会写入新账号', async () => {
  await render(); await editClassification(); await previewClassification()
  const confirmation = deferred(); dialog.confirm.mockReturnValueOnce(confirmation.promise)
  await wrapper.get('.organization-import-preview button').trigger('click')
  activeAccount.id = 'b'; await flushPromises()
  confirmation.resolve(true); await flushPromises()
  expect(wrapper.find('.organization-import-preview').exists()).toBe(false)
  expect(api.putOperatorOrganization).not.toHaveBeenCalled()
})

it('分类恢复冲突保留预览，重新读取后必须重新预览当前版本', async () => {
  await render(); await previewClassification()
  api.putOperatorOrganization.mockRejectedValueOnce(Object.assign(new Error('版本冲突'), { status: 409 }))
  await clickPageButton('确认恢复分类')
  expect(wrapper.find('.organization-import-preview').exists()).toBe(true)
  organization.revision = 2
  await wrapper.findAll('.import-error button').find(button => button.text() === '重新读取分类').trigger('click'); await flushPromises()
  expect(wrapper.get('.organization-import-preview button').element.disabled).toBe(true)
  expect(wrapper.get('.organization-import-preview').text()).toContain('重新校验并预览')
  await clickPageButton('校验并预览分类'); await clickPageButton('确认恢复分类')
  expect(api.putOperatorOrganization).toHaveBeenLastCalledWith('acc', expect.objectContaining({ expected_revision: 2 }))
  noGrowthWrites()
})

it('JSON 区分类导出只包含当前账号已保存分类，不包含管理草稿', async () => {
  organization.pinned_ids = ['c']
  await render(); await editClassification(); await clickPageButton('导入/导出 JSON')
  let blob
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(value => { blob = value; return 'blob:organization' })
    static revokeObjectURL = vi.fn()
  })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  try {
    await clickPageButton('导出当前账号分类')
    const text = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsText(blob) })
    expect(JSON.parse(text)).toEqual(operatorOrganizationBackup({ ...emptyOperatorOrganization(), pinned_ids: ['c'] }, '如鸢'))
    expect(api.exportOperator).not.toHaveBeenCalled(); expect(api.putOperatorOrganization).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals(); click.mockRestore() }
})

it('现有文件选择入口读取分类 JSON，仅预览且迟到文件不能跨账号填入', async () => {
  await render(); await clickPageButton('导入/导出 JSON'); await clickPageButton('JSON 备份导入')
  const readers = []
  vi.stubGlobal('FileReader', class { constructor() { readers.push(this) } readAsText() {} })
  try {
    const input = wrapper.get('.backup-import input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['{}'], 'classification.json', { type: 'application/json' })] })
    await input.trigger('change')
    readers[0].result = JSON.stringify(operatorOrganizationBackup({ ...emptyOperatorOrganization(), pinned_ids: ['c'] }, '如鸢'))
    readers[0].onload(); await flushPromises(); await clickPageButton('校验并预览分类')
    expect(wrapper.get('.organization-import-preview').text()).toContain('1 位置顶')
    expect(api.putOperatorOrganization).not.toHaveBeenCalled()
    await input.trigger('change')
    activeAccount.id = 'b'; await flushPromises()
    readers[1].result = readers[0].result; readers[1].onload(); await flushPromises()
    expect(wrapper.find('.organization-import-preview').exists()).toBe(false)
    expect(api.putOperatorOrganization).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals() }
})


it('自动计算未授权不展示也不请求，授予后可用，撤销后忽略迟到结果', async () => {
  await render()
  expect(wrapper.find('[aria-label="当前账号自动补全面板"]').exists()).toBe(false)
  expect(api.getCurrentOperatorPanels).not.toHaveBeenCalled()
  expect(api.previewOperatorPanel).not.toHaveBeenCalled()
  const pending = deferred()
  api.getCurrentOperatorPanels.mockReturnValue(pending.promise)
  auth.adminAccess = { permissions: ['operator_panel:use'] }
  await flushPromises()
  expect(wrapper.find('[aria-label="当前账号自动补全面板"]').exists()).toBe(true)
  await vi.waitFor(() => expect(api.getCurrentOperatorPanels).toHaveBeenCalled())
  auth.adminAccess = { permissions: [] }
  await flushPromises()
  pending.resolve({ a: { status: 'calculated', attack: 123456, hp: 654321 } })
  await flushPromises()
  expect(wrapper.find('[aria-label="当前账号自动补全面板"]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('123,456')
  noGrowthWrites()
})

it('养成手机筛选弹层先预览标签交集，确认后列表一致且取消标签恢复结果', async () => {
  organization.tags = [{ id: 'team', name: '主力', operator_ids: ['a', 'c'] }]
  await render()
  const tools = wrapper.get('.growth-overview-filters')
  await tools.get('.catalog-filter-trigger').trigger('click'); await flushPromises()
  const sheet = tools.findComponent({ name: 'CatalogFilterSheet' })
  const filters = sheet.findComponent({ name: 'OperatorFilterDossier' })
  filters.vm.$emit('update:tagFilter', 'team'); await flushPromises()
  expect(document.querySelector('.catalog-filter-sheet .apply').textContent).toContain('查看 2 位密探')
  expect(cardNames()).toEqual(['a', 'b', 'c'])
  document.querySelector('.catalog-filter-sheet .apply').click(); await flushPromises()
  expect(cardNames()).toEqual(['a', 'c'])
  await tools.get('[aria-label="取消主力筛选"]').trigger('click'); await flushPromises()
  expect(cardNames()).toEqual(['a', 'b', 'c'])
  expect(api.putOperatorOrganization).not.toHaveBeenCalled()
  noGrowthWrites()
})
