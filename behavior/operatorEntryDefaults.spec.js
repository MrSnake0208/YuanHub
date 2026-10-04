import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import OperatorPage from '../src/pages/operator/index.vue'
import * as operatorApi from '../src/api/operator.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { getCurrentStarLoadout, putCurrentStarLoadout } from '../src/api/starLoadout.js'
import { listAgentFavorites } from '../src/api/inventory.js'
import { starLoadoutPresetStore } from '../src/domain/starLoadoutPresets.js'
import { auth } from '../src/store/auth.js'

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
  auth.isLoggedIn = true
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

const wrappers = new Set()
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers.clear() })
function renderPage(options = {}) {
  const wrapper = mount(OperatorPage, { ...options, global: {
    stubs: { RouterLink: true, IslandSidebar: true, SiteFooter: true, AccountWorkspace: true, DataAccountContextBar: true,
      OperatorShareManager: true, OperatorGrowthTracker: true, StarLoadoutEditor: true, StarLoadoutModal: true },
    directives: { reveal: () => {} },
  } })
  wrappers.add(wrapper)
  return wrapper
}
async function openEditor(existing, catalog = operator) {
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [catalog] })
  operatorApi.getOperatorCurrent.mockResolvedValue(existing ? [{ entries: { op: existing } }] : [])
  const wrapper = renderPage()
  await flushPromises()
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('.editor-panel').exists()).toBe(true)
  return wrapper
}
const growthValues = wrapper => wrapper.findAll('.level-row input').map(input => input.element.value)
const pickStar = (wrapper, label) => wrapper.findAll('.star-groups button').find(button => button.text() === label).trigger('click')

it('空档案引导出现在默认图鉴筛选前，养成筛选不占用首屏', async () => {
  const wrapper = renderPage()
  await flushPromises()
  const guide = wrapper.get('.operator-entry-guide')
  expect(guide.text()).toContain('还没有密探档案')
  expect(guide.text()).toContain('补录一位密探')
  expect(guide.element.compareDocumentPosition(wrapper.get('.mf-search').element) & 4).toBe(4)
  expect(wrapper.findComponent({ name: 'OperatorFilterDossier' }).exists()).toBe(false)
})

it.each([
  ['logged-out', '登录后可维护'],
  ['no-account', '创建并选择'],
  ['unowned', '暂无可展示的已招募'],
  ['error', '读取失败'],
])('录入引导区分%s', async (state, text) => {
  if (state === 'logged-out') auth.isLoggedIn = false
  if (state === 'no-account') operatorApi.listOperatorAccounts.mockResolvedValue([])
  if (state === 'unowned') operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: { level: 90, elite: 15, star_level: 0 } } }])
  if (state === 'error') operatorApi.getOperatorCurrent.mockRejectedValue(new Error('synthetic read error'))
  const wrapper = renderPage()
  await flushPromises()
  expect(wrapper.get('.operator-entry-guide').text()).toContain(text)
  if (state === 'error') {
    expect(wrapper.get('.operator-entry-guide').text()).not.toContain('首次建档')
    operatorApi.getOperatorCurrent.mockResolvedValue([])
    await wrapper.get('.operator-entry-guide button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.operator-entry-guide').text()).toContain('还没有密探档案')
  }
})

it('未完成读取时显示加载，不显示空档案录入动作', async () => {
  let resolve
  operatorApi.getOperatorCurrent.mockImplementation(() => new Promise(done => { resolve = done }))
  const wrapper = renderPage()
  await flushPromises()
  expect(wrapper.get('.operator-entry-guide').text()).toContain('正在读取')
  expect(wrapper.get('.operator-entry-guide').text()).not.toContain('首次建档')
  resolve([])
  await flushPromises()
})

it('已有密探时隐藏首次引导，筛选无结果不会误报空档案', async () => {
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: { level: 90, elite: 15, star_level: 7 } } }])
  const wrapper = renderPage()
  await flushPromises()
  expect(wrapper.find('.operator-entry-guide').exists()).toBe(false)
  expect(wrapper.findComponent({ name: 'OperatorFilterDossier' }).exists()).toBe(true)
  expect(wrapper.findAll('.operator-tabs .admin-link').some(link => link.attributes('to')?.includes('mode=supplement'))).toBe(true)
  await wrapper.get('.mf-search').setValue('不存在的角色')
  expect(wrapper.find('.operator-entry-guide').exists()).toBe(false)
})

it('单角色入口复用图鉴并聚焦搜索，目录版本保持完整可复制原值', async () => {
  const version = 'catalog-release-opaque-not-a-date-20261005-sha123456789'
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [operator], catalog_version: version })
  const wrapper = renderPage({ attachTo: document.body })
  await flushPromises()
  await wrapper.get('.operator-entry-guide button').trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('.mf-search').element)
  expect(wrapper.get('[aria-label="目录版本，可选中复制"]').element.value).toBe(version)
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

const decimalCatalog = { ...operator, oddity_schema: {
  attack: { name: '攻击力', max: 300 }, hp: { name: '生命值', max: 1560 }, special: { name: '增伤值', max: 9 },
} }
const decimalEntry = { level: 90, elite: 15, starLevel: 8, revision: 3,
  combat_stats: { oddities: { attack: { current: 10 }, hp: { current: 20 }, special: { current: 3.2 } } },
}

it.each(['攻击力', '生命值'])('卡片%s奇闻快捷入口仍拒绝小数并保留草稿', async label => {
  const wrapper = await openEditor(decimalEntry, decimalCatalog)
  await wrapper.get('.editor-cancel').trigger('click')
  await flushPromises()
  await wrapper.findAll('[role="tab"]').find(tab => tab.text() === '养成总览').trigger('click')
  await flushPromises()
  const input = wrapper.get('[aria-label="测试密探奇闻属性' + label + '"]')
  await input.setValue('0.5')
  await wrapper.get('.agent-ledger-card .ledger-card-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(input.element.value).toBe('0.5')
  expect(wrapper.get('.agent-ledger-card').text()).toContain('必须填写整数')
  wrapper.unmount()
})

it('后端字段错误保留第三项草稿并关联错误提示', async () => {
  const wrapper = await openEditor(decimalEntry, decimalCatalog)
  const input = wrapper.findAll('.oddity-field input')[2]
  await input.setValue('0.5')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(Object.assign(new Error('超过图鉴上限'), {
    payload: { error: { code: 'invalid_combat_stats', field_path: 'combat_stats.oddities.special.current' } },
  }))
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(input.element.value).toBe('0.5')
  expect(input.attributes('aria-invalid')).toBe('true')
  expect(wrapper.get('#operator-oddity-error').text()).toContain('超过图鉴上限')
  wrapper.unmount()
})

it('第三项小数回显、逐步输入与粘贴提交，接口拒绝保留草稿', async () => {
  const wrapper = await openEditor(decimalEntry, decimalCatalog)
  const input = wrapper.findAll('.oddity-field input')[2]
  expect(input.element.value).toBe('3.2')
  await input.setValue('0')
  await input.setValue('0.')
  await input.setValue('0.5')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('最多一位小数'))
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({
    expected_revision: 3, combat_stats: expect.objectContaining({ oddities: {
      attack: { current: 10 }, hp: { current: 20 }, special: { current: 0.5 },
    } }),
  }) }))
  expect(input.element.value).toBe('0.5')
  expect(wrapper.get('.editor-action-status').text()).toContain('最多一位小数')
  await input.setValue('0.50')
  expect(Number(input.element.value)).toBe(0.5)
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.combat_stats.oddities.special.current).toBe(0.5)
  wrapper.unmount()
})

it('保存后关闭重开和重新读取仍保留第三项小数', async () => {
  const saved = { ...decimalEntry, revision: 4, combat_stats: { oddities: {
    attack: { current: 10 }, hp: { current: 20 }, special: { current: 0.5 },
  } } }
  const wrapper = await openEditor(decimalEntry, decimalCatalog)
  await wrapper.findAll('.oddity-field input')[2].setValue('0.5')
  operatorApi.patchOperatorCurrent.mockResolvedValueOnce(saved)
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(wrapper.get('.editor-action-status').text()).toContain('养成资料已保存')
  await wrapper.get('.editor-cancel').trigger('click')
  await flushPromises()
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.oddity-field input')[2].element.value).toBe('0.5')
  wrapper.unmount()
  const reopened = await openEditor(saved, decimalCatalog)
  expect(reopened.findAll('.oddity-field input')[2].element.value).toBe('0.5')
  reopened.unmount()
})

it.each([
  [2, '0.55', '最多一位小数'], [2, '-0.5', '非负'], [2, '9.1', '上限'],
  [0, '0.5', '整数'], [1, '0.5', '整数'],
])('非法奇闻输入保留草稿并定位字段 %#', async (index, value, message) => {
  const wrapper = await openEditor(decimalEntry, decimalCatalog)
  const input = wrapper.findAll('.oddity-field input')[index]
  await input.setValue(value)
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(input.element.value).toBe(value)
  expect(input.attributes('aria-invalid')).toBe('true')
  expect(wrapper.get('.editor-action-status').text()).toContain(message)
  wrapper.unmount()
})

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

it.each([[100, 17], [90, 15]])('单个密探练度预设 %i+%i 可切换，只填草稿且保留奇闻与化极', async (level, elite) => {
  const oddities = { attack: { current: 10 }, hp: { current: 20 }, special: { current: 7 } }
  const wrapper = await openEditor({ level: 80, elite: 12, starLevel: 8, combat_stats: { oddities } })
  const preset = targetLevel => wrapper.findAll('.editor-growth-preset').find(button => button.text().startsWith(`${targetLevel}级`))
  await preset(level === 100 ? 90 : 100).trigger('click')
  await preset(level).trigger('click')
  await flushPromises()
  expect(growthValues(wrapper)).toEqual([String(level), String(elite)])
  expect(wrapper.findAll('.oddity-field input').map(input => input.element.value)).toEqual(['10', '20', '7'])
  expect(wrapper.get('.editor-action-status').text()).toContain('请确认后保存')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
  expect(putCurrentStarLoadout).not.toHaveBeenCalled()
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent).toHaveBeenCalledWith(expect.objectContaining({
    patch: expect.objectContaining({ level, elite, star_level: 8, combat_stats: expect.objectContaining({ oddities }) }),
  }))
  wrapper.unmount()
})
