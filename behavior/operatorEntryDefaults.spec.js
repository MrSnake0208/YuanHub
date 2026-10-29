import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, flushPromises } from '@vue/test-utils'
import OperatorPage from '../src/pages/operator/index.vue'
import * as relationshipApi from '../src/api/operatorRelationships.js'
import * as operatorApi from '../src/api/operator.js'
import * as accountShareApi from '../src/api/accountShare.js'
import { updateAccount } from '../src/api/accounts.js'
import * as plannerApi from '../src/api/operatorPlanner.js'
import { PLANNER_RULES } from '../src/data/cultivationPlanner.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { getCurrentStarLoadout, putCurrentStarLoadout } from '../src/api/starLoadout.js'
import { getCurrent as getInventoryCurrent, listAgentFavorites, listRecords } from '../src/api/inventory.js'
import { starLoadoutPresetStore } from '../src/domain/starLoadoutPresets.js'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { subscribeAccountEvents } from '../src/store/accountEvents.js'
import { dialog } from '../src/utils/dialog.js'
import * as features from '../src/config/features.js'
import { installViewport } from '../test-support/viewport.js'

const navigation = vi.hoisted(() => ({ query: {}, path: '/operator', push: vi.fn().mockResolvedValue(), replace: vi.fn().mockResolvedValue() }))
vi.mock('vue-router', async importOriginal => ({
  ...await importOriginal(),
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  useRoute: () => navigation,
  onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {},
}))
vi.mock('../src/api/operator.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/inventory.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, getCurrent: vi.fn(), listAgentFavorites: vi.fn(), listRecords: vi.fn() }
})
vi.mock('../src/api/operatorPlanner.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/operatorRelationships.js', () => ({ getRelationshipCatalog: vi.fn(), getRelationships: vi.fn(), patchRelationships: vi.fn() }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/accountShare.js', () => ({ getAccountShare: vi.fn(), setAccountShareScope: vi.fn(), regenerateAccountShare: vi.fn(), revokeAccountShare: vi.fn() }))
vi.mock('../src/api/accounts.js', async importOriginal => ({ ...await importOriginal(), updateAccount: vi.fn() }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn(), putCurrentStarLoadout: vi.fn() }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true }) }
})
vi.mock('../src/store/activeAccount.js', async importOriginal => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return { ...actual, activeAccount: reactive({
    id: 'acc', gameFor: () => '如鸢', set: vi.fn(), setGame: vi.fn(), syncAccounts: vi.fn(),
  }) }
})
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: vi.fn(() => () => {}) }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() } }))

const operator = { id: 'op', name: '测试密探', rarity: 4, games: ['如鸢'] }
beforeEach(() => {
  vi.clearAllMocks()
  navigation.query = {}
  navigation.push.mockResolvedValue()
  navigation.replace.mockResolvedValue()
  auth.isLoggedIn = true
  auth.adminAccess = { permissions: ['operator_panel:use', 'operator_relationship:use'] }
  activeAccount.id = 'acc'
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [operator] })
  operatorApi.listOperatorAccounts.mockResolvedValue([{ id: 'acc', name: '测试账号', game: '如鸢' }])
  operatorApi.getOperatorCurrent.mockResolvedValue([])
  operatorApi.getOperatorAnnotations.mockResolvedValue({ items: [] })
  operatorApi.listOperatorScanReviews.mockResolvedValue({ items: [] })
  listAgentFavorites.mockResolvedValue({ agent_ids: [] })
  getInventoryCurrent.mockResolvedValue([])
  getCurrentStarState.mockResolvedValue({ generation: 0, entries: [] })
  getCurrentStarLoadout.mockResolvedValue({ generation: 0, revision: 0, loadouts: {} })
  vi.spyOn(starLoadoutPresetStore, 'load').mockResolvedValue()
  const media = new EventTarget()
  media.matches = false
  vi.stubGlobal('matchMedia', vi.fn(() => media))
})

it('今日历练的完整规划链接直接打开已启用的养成页签', async () => {
  navigation.query = { tab: 'tracking' }
  const wrapper = renderPage(); await flushPromises()
  expect(wrapper.get('#operator-tab-tracking').attributes('aria-selected')).toBe('true')
})

it('今日历练链接不会绕过养成规划功能开关', async () => {
  vi.spyOn(features, 'isFeatureEnabled').mockReturnValue(false)
  navigation.query = { tab: 'tracking' }
  const wrapper = renderPage(); await flushPromises()
  expect(wrapper.find('#operator-tab-tracking').exists()).toBe(false)
  expect(wrapper.find('#operator-panel-tracking').exists()).toBe(false)
})

const wrappers = new Set()
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers.clear(); vi.useRealTimers() })
function renderPage(options = {}, stubs = {}) {
  const wrapper = mount(OperatorPage, { ...options, global: { plugins: [createPinia()],
    stubs: { OnboardingGuide: true, RouterLink: true, IslandSidebar: true, SiteFooter: true, AccountWorkspace: true, DataAccountContextBar: true,
      OperatorShareManager: true, OperatorGrowthTracker: { name: 'OperatorGrowthTracker', props: ['currentEntries'], template: '<div />' }, StarLoadoutEditor: true, StarLoadoutModal: true, ...stubs },
    directives: { reveal: () => {} },
  } })
  wrappers.add(wrapper)
  return wrapper
}
async function openEditor(existing, catalog = operator, stubs = {}, options = {}) {
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [catalog] })
  operatorApi.getOperatorCurrent.mockResolvedValue(existing ? [{ entries: { op: existing } }] : [])
  const wrapper = renderPage(options, stubs)
  await flushPromises()
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('.editor-panel').exists()).toBe(true)
  return wrapper
}

it('密探重置入口绑定已保存账号；编辑有草稿时阻止重置且不丢弃草稿', async () => {
  const wrapper = await openEditor({ level: 40, elite: 2, star_level: 1 }, operator, { OperatorResetDialog: { props: ['accountId', 'accountName', 'entry'], template: '<div data-test="reset-dialog">{{accountId}} {{accountName}} {{entry.name}}</div>' } })
  const button = wrapper.findAll('button').find(item => item.text() === '鞭子重置 / 记录')
  await wrapper.get('.num-fields input').setValue('41')
  expect(button.attributes('disabled')).toBeDefined()
  await button.trigger('click')
  expect(wrapper.find('[data-test="reset-dialog"]').exists()).toBe(false)
  expect(wrapper.get('.num-fields input').element.value).toBe('41')
  await wrapper.get('.num-fields input').setValue('40')
  await button.trigger('click'); await flushPromises()
  expect(wrapper.get('[data-test="reset-dialog"]').text()).toContain('acc 测试账号 测试密探')
  activeAccount.id = 'other'; await flushPromises()
  expect(wrapper.find('[data-test="reset-dialog"]').exists()).toBe(false)
})
async function openCardStarEditor(existing, catalog = { ...operator, rarity: 4 }) {
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [catalog] })
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: existing } }])
  const wrapper = renderPage()
  await flushPromises()
  await wrapper.get('#operator-tab-current').trigger('click'); await flushPromises()
  await wrapper.get('.ledger-huaji-value').trigger('click')
  return wrapper
}
const growthValues = wrapper => wrapper.findAll('.level-row input[type="number"]').map(input => input.element.value)
const pickStar = (wrapper, label) => wrapper.findAll('.star-groups button').find(button => button.text() === label).trigger('click')

it.each([true, false])('连续打开不同密探时旧请求不清空最新编辑器（旧请求先返回：%s）', async olderFirst => {
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [operator, { ...operator, id: 'other', name: '另一密探' }] })
  const wrapper = renderPage()
  await flushPromises()
  let resolveFirst, resolveSecond
  getCurrentStarState.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve }))
  getCurrentStarState.mockReturnValueOnce(new Promise(resolve => { resolveSecond = resolve }))
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click')
  expect(wrapper.get('[aria-label="编辑测试密探"]').element.disabled).toBe(true)
  expect(wrapper.get('.operator-editor-open-status').text()).toContain('正在读取')
  await wrapper.get('[aria-label="编辑另一密探"]').trigger('click')
  if (olderFirst) { resolveFirst({ generation: 0, entries: [] }); await flushPromises() }
  resolveSecond({ generation: 0, entries: [] })
  await flushPromises()
  if (!olderFirst) { resolveFirst({ generation: 0, entries: [] }); await flushPromises() }
  expect(wrapper.find('.page-operator').exists()).toBe(true)
  expect(wrapper.get('.editor-panel h3').text()).toContain('另一密探')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it.each(['account', 'unmount'])('打开编辑期间%s后迟到响应不再打开编辑器', async change => {
  operatorApi.listOperatorAccounts.mockResolvedValue([{ id: 'acc', name: '账号A', game: '如鸢' }, { id: 'other', name: '账号B', game: '如鸢' }])
  const wrapper = renderPage(); await flushPromises()
  let resolveRead
  getCurrentStarState.mockReturnValueOnce(new Promise(resolve => { resolveRead = resolve }))
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click')
  if (change === 'account') { activeAccount.id = 'other'; await flushPromises() }
  else wrapper.unmount()
  resolveRead({ generation: 0, entries: [] }); await flushPromises()
  expect(wrapper.find('.editor-panel').exists()).toBe(false)
  if (change === 'account') expect(wrapper.find('.operator-editor-open-status').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it('打开编辑失败有可见提示，再次打开可恢复且不写云端', async () => {
  const wrapper = renderPage()
  await flushPromises()
  getCurrentStarState.mockRejectedValueOnce(new Error('星石读取失败'))
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click'); await flushPromises()
  expect(wrapper.find('.editor-panel').exists()).toBe(false)
  expect(wrapper.get('.operator-editor-open-status[role="alert"]').text()).toContain('星石读取失败')
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click'); await flushPromises()
  expect(wrapper.find('.editor-panel').exists()).toBe(true)
  expect(wrapper.find('.operator-editor-open-status').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it('编辑等级时保留修为，最终有效等级提交后才校正，清空不当作零', async () => {
  const wrapper = await openEditor({ level: 100, elite: 17, starLevel: 1 })
  const level = wrapper.findAll('.level-row input[type="number"]')[0]
  await level.setValue('')
  expect(growthValues(wrapper)).toEqual(['', '17'])
  level.element.value = '9'; await level.trigger('input')
  expect(growthValues(wrapper)).toEqual(['9', '17'])
  level.element.value = '90'; await level.trigger('input')
  expect(growthValues(wrapper)).toEqual(['90', '17'])
  await level.trigger('change')
  expect(growthValues(wrapper)).toEqual(['90', '15'])
  expect(wrapper.get('.editor-action-status').text()).toContain('15')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it('奇闻单项拉满只填选中字段，缺上限不可用，取消不写云端', async () => {
  const wrapper = await openEditor({ level: 90, elite: 15, starLevel: 1,
    combat_stats: { oddities: { attack: { current: 12 }, hp: { current: 34 }, special: { current: 1.2 } } },
  }, { ...operator, oddity_schema: { attack: { max: 300 }, hp: { max: 1560 }, special: { max: null } } })
  const fields = wrapper.findAll('.oddity-field')
  await fields[0].get('button').trigger('click')
  expect(fields.map(field => field.get('input').element.value)).toEqual(['300', '34', '1.2'])
  expect(fields[2].get('button').element.disabled).toBe(true)
  expect(growthValues(wrapper)).toEqual(['90', '15'])
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  dialog.confirm.mockResolvedValueOnce(true)
  await wrapper.get('.editor-cancel').trigger('click'); await flushPromises()
  expect(wrapper.find('.editor-panel').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it('第三项奇闻单项拉满保留小数并沿用原保存接口', async () => {
  const wrapper = await openEditor({ level: 90, elite: 15, starLevel: 1 }, { ...operator,
    oddity_schema: { attack: { max: 300 }, hp: { max: 1560 }, special: { name: '增伤值', max: 5.5 } },
  })
  await wrapper.get('[aria-label="增伤值拉满"]').trigger('click')
  expect(wrapper.get('[data-oddity-key="special"]').element.value).toBe('5.5')
  operatorApi.patchOperatorCurrent.mockResolvedValueOnce({ level: 90, elite: 15, star_level: 1, revision: 2 })
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({
    combat_stats: expect.objectContaining({ oddities: { attack: { current: 0 }, hp: { current: 0 }, special: { current: 5.5 } } }),
  }) }))
})

it('面板来源默认保留过期手填，切换和养成变动均不删除原值', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  operatorApi.previewOperatorPanel.mockResolvedValue({ status: 'calculated', attack: 1000, hp: 2000 })
  operatorApi.getCurrentOperatorPanels.mockResolvedValue({ op: { status: 'calculated', attack: 1000, hp: 2000 } })
  const stored = { manual_attack: 9000, manual_hp: 30000, observed_status: 'stale' }
  const wrapper = await openEditor({ level: 50, elite: 7, star_level: 7, revision: 2, combat_stats: stored })
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  const source = wrapper.get('[aria-label="密探面板来源"]')
  expect(source.element.value).toBe('follow')
  expect(wrapper.get('.editor-panel-notice').text()).toContain('面板待核对')
  expect(wrapper.get('.editor-head-live').text()).toContain('9,000')
  expect(wrapper.get('.editor-panel-comparison').text()).toContain('自动 1,000')
  await source.setValue('auto')
  expect(wrapper.get('.editor-head-live').text()).toContain('攻击力 1,000')
  await wrapper.findAll('.level-row input[type="number"]')[0].setValue('51')
  expect(source.element.value).toBe('auto')
  expect(wrapper.get('.editor-head-live').text()).toContain('9,000')
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  expect(wrapper.get('.editor-head-live').text()).toContain('攻击力 1,000')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.combat_stats).toMatchObject({
    manual_attack: 9000, manual_hp: 30000, display_mode: { attack: 'auto', hp: 'auto' }
  })
  await source.setValue('follow')
  expect(wrapper.get('.editor-head-live').text()).toContain('9,000')
  await source.setValue('manual')
  operatorApi.patchOperatorCurrent.mockImplementationOnce(async ({ patch }) => ({ ...patch, revision: 3 }))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  await vi.advanceTimersByTimeAsync(850); await flushPromises()
  expect(wrapper.find('.editor-panel').exists()).toBe(false)
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="密探面板来源"]').element.value).toBe('manual')
  expect(wrapper.get('.editor-head-live').text()).toContain('9,000')
})

it('账号关闭补全保留缺失值，单密探显式自动仍可用且不伪造手填', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  operatorApi.listOperatorAccounts.mockResolvedValue([{ id: 'acc', name: 'test', game: '如鸢', operator_panel_auto_fill: false }])
  operatorApi.previewOperatorPanel.mockResolvedValue({ status: 'calculated', attack: 1000, hp: 2000 })
  const wrapper = await openEditor({ level: 50, elite: 7, star_level: 7, revision: 2, combat_stats: { manual_hp: 30000 } })
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  expect(wrapper.get('.editor-head-live').text()).toContain('生命力 30,000，攻击力 —')
  await wrapper.get('[aria-label="密探面板来源"]').setValue('auto')
  expect(wrapper.get('.editor-head-live').text()).toContain('生命力 2,000，攻击力 1,000')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.combat_stats).toMatchObject({
    manual_attack: null, manual_hp: 30000, display_mode: { attack: 'auto', hp: 'auto' }
  })
})

it('账号自动补全失败保持原设置，成功仅保存账号偏好', async () => {
  const wrapper = renderPage(); await flushPromises()
  const toggle = wrapper.get('[aria-label="当前账号自动补全面板"]')
  expect(toggle.attributes('aria-checked')).toBe('true')
  updateAccount.mockRejectedValueOnce(new Error('synthetic preference failure'))
  await toggle.trigger('click'); await flushPromises()
  expect(toggle.attributes('aria-checked')).toBe('true')
  expect(wrapper.get('.panel-preference-notice').attributes('role')).toBe('alert')
  updateAccount.mockResolvedValueOnce({ id: 'acc', name: 'test', game: '如鸢', operator_panel_auto_fill: false })
  await toggle.trigger('click'); await flushPromises()
  expect(updateAccount).toHaveBeenLastCalledWith('acc', { operator_panel_auto_fill: false })
  expect(toggle.attributes('aria-checked')).toBe('false')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(putCurrentStarLoadout).not.toHaveBeenCalled()
})

it('账号偏好保存中切换账号，迟到响应不改变新账号的设置', async () => {
  operatorApi.listOperatorAccounts.mockResolvedValue([
    { id: 'acc', name: 'A', game: '如鸢' }, { id: 'other', name: 'B', game: '如鸢' }
  ])
  const wrapper = renderPage(); await flushPromises()
  let resolve
  updateAccount.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await wrapper.get('[aria-label="当前账号自动补全面板"]').trigger('click')
  activeAccount.id = 'other'; await flushPromises()
  resolve({ id: 'acc', name: 'A', game: '如鸢', operator_panel_auto_fill: false }); await flushPromises()
  expect(wrapper.get('[aria-label="当前账号自动补全面板"]').attributes('aria-checked')).toBe('true')
  expect(wrapper.find('.panel-preference-notice').exists()).toBe(false)
  expect(updateAccount).toHaveBeenCalledTimes(1)
})

it.each([null, 'auto'])('卡片遵循手填优先，保存不伪造手填或丢失另一项偏好：hp=%s', async hpMode => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  operatorApi.getCurrentOperatorPanels.mockResolvedValue({ op: { status: 'calculated', attack: 1000, hp: 2000 } })
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: {
    level: 50, elite: 7, star_level: 7, revision: 2,
    combat_stats: { observed_attack: 123, manual_attack: 9000, manual_hp: null, observed_status: 'stale', display_mode: { attack: null, hp: hpMode } }
  } } }])
  const wrapper = renderPage(); await flushPromises()
  await wrapper.get('#operator-tab-current').trigger('click'); await flushPromises()
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  expect(wrapper.get('input[aria-label="测试密探攻击力"]').element.value).toBe('9000')
  expect(wrapper.get('input[aria-label="测试密探生命力"]').element.value).toBe('2000')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  await wrapper.get('input[aria-label="测试密探攻击力"]').setValue('9500')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.agent-ledger-card .ledger-card-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.combat_stats).toMatchObject({
    manual_attack: 9500, manual_hp: null, display_mode: { attack: 'manual', hp: hpMode }
  })
  expect(wrapper.get('input[aria-label="测试密探攻击力"]').element.value).toBe('9500')
})

it('底栏按真实草稿和保存结果反馈，失败保留输入，保存后再改不沿用成功提示', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const wrapper = await openEditor({ level: 50, elite: 7, star_level: 7, revision: 2 })
  const status = () => wrapper.get('.editor-action-status').text()
  const level = wrapper.findAll('.level-row input[type="number"]')[0]
  expect(status()).toBe('尚未修改')
  expect(wrapper.get('.editor-save').element.disabled).toBe(true)
  await level.setValue('60')
  expect(status()).toContain('有未保存的修改')
  expect(wrapper.get('.editor-save').element.disabled).toBe(false)
  await level.setValue('50')
  expect(status()).toBe('尚未修改')
  expect(wrapper.get('.editor-save').element.disabled).toBe(true)
  await level.setValue('60')
  let rejectSave
  operatorApi.patchOperatorCurrent.mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject }))
  await wrapper.get('.editor-save').trigger('click')
  expect(status()).toBe('正在保存到云端…')
  rejectSave(new Error('synthetic save failure'))
  await flushPromises()
  expect(status()).toContain('synthetic save failure')
  expect(level.element.value).toBe('60')
  operatorApi.patchOperatorCurrent.mockResolvedValueOnce({ level: 60, elite: 7, star_level: 7, revision: 3 })
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(status()).toBe('养成资料已保存')
  expect(wrapper.get('.editor-save').element.disabled).toBe(true)
  await level.setValue('61')
  expect(status()).toContain('有未保存的修改')
  expect(wrapper.get('.editor-save').element.disabled).toBe(false)
  wrapper.unmount()
  vi.clearAllTimers()
})

it('编辑分区导航保留两套命盘、养成和星石草稿，统一交给原保存流程', async () => {
  getCurrentStarState.mockResolvedValue({ generation: 0, entries: [{ instance_id: 'stone-a', kind: 'main', name: '天府', level: 10 }] })
  const wrapper = await openEditor({ level: 50, elite: 7, star_level: 7, revision: 2 }, {
    ...operator, rarity: 4, discs: [{ ot_name: '测试命盘甲', color: '金' }, { ot_name: '测试命盘乙', color: '紫' }],
  }, { StarLoadoutEditor: false }, { attachTo: document.body })
  expect(wrapper.get('#operator-editor-growth').isVisible()).toBe(true)
  expect(wrapper.get('#operator-editor-discs').isVisible()).toBe(false)
  expect(wrapper.get('#operator-editor-stars').isVisible()).toBe(false)
  const starEditor = wrapper.getComponent({ name: 'StarLoadoutEditor' })
  const initialStarEditor = starEditor.vm.$
  await wrapper.findAll('.level-row input[type="number"]')[0].setValue('60')
  await wrapper.get('[aria-controls="operator-editor-discs"]').trigger('click')
  expect(wrapper.get('#operator-editor-growth').isVisible()).toBe(false)
  expect(wrapper.get('#operator-editor-discs').isVisible()).toBe(true)
  expect(wrapper.get('.disc-loadout-name input').element.value).toBe('')
  expect(wrapper.get('.disc-loadout-name input').attributes('placeholder')).toBe('选择命盘后自动命名')
  await wrapper.findAll('.disc-option input')[0].setValue(true)
  expect(wrapper.findAll('.disc-selected-check')).toHaveLength(1)
  expect(wrapper.get('.disc-option.on').text()).toBe('测试命盘甲')
  expect(wrapper.get('.disc-loadout-name input').element.value).toBe('测试命盘甲')
  await wrapper.get('.disc-loadout-name input').setValue('命盘一草稿')
  await wrapper.get('#disc-loadout-tab-1').trigger('click')
  expect(wrapper.findAll('.disc-selected-check')).toHaveLength(0)
  await wrapper.findAll('.disc-option input')[1].setValue(true)
  expect(wrapper.get('.disc-option.on').text()).toBe('测试命盘乙')
  await wrapper.get('.disc-loadout-name input').setValue('命盘二草稿')
  await wrapper.get('[aria-controls="operator-editor-stars"]').trigger('click')
  expect(wrapper.get('#operator-editor-stars').isVisible()).toBe(true)
  expect(wrapper.get('#operator-editor-discs').isVisible()).toBe(false)
  await starEditor.get('.star-candidate').trigger('click')
  await starEditor.get('.star-query input').setValue('天府')
  await wrapper.get('[aria-controls="operator-editor-growth"]').trigger('click')
  await wrapper.get('[aria-controls="operator-editor-discs"]').trigger('click')
  await wrapper.get('#disc-loadout-tab-0').trigger('click')
  expect(wrapper.get('.disc-loadout-name input').element.value).toBe('命盘一草稿')
  expect(wrapper.findAll('.disc-option input').map(input => input.element.checked)).toEqual([true, false])
  expect(growthValues(wrapper)).toEqual(['60', '7'])
  expect(wrapper.getComponent({ name: 'StarLoadoutEditor' }).vm.$).toBe(initialStarEditor)
  expect(starEditor.props('draftLoadouts').op.main1).toBe('stone-a')
  expect(starEditor.get('.star-query input').element.value).toBe('天府')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(putCurrentStarLoadout).not.toHaveBeenCalled()
  operatorApi.patchOperatorCurrent.mockResolvedValueOnce({ level: 60, elite: 7, star_level: 7, revision: 3 })
  putCurrentStarLoadout.mockResolvedValueOnce({ generation: 0, revision: 1, loadouts: { op: { main1: 'stone-a' } } })
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  const patch = operatorApi.patchOperatorCurrent.mock.lastCall[0].patch
  expect(patch).toMatchObject({ level: 60, elite: 7, expected_revision: 2 })
  expect(patch.disc_loadouts.map(loadout => ({ name: loadout.name, discs: loadout.discs.map(disc => disc.ot_name) }))).toEqual([
    { name: '命盘一草稿', discs: ['测试命盘甲'] }, { name: '命盘二草稿', discs: ['测试命盘乙'] },
  ])
  expect(putCurrentStarLoadout).toHaveBeenCalledWith('acc', expect.objectContaining({ loadouts: expect.objectContaining({ op: expect.objectContaining({ main1: 'stone-a' }) }) }))
})

it.each([
  ['旧星级与单套命盘', { star_level: 19, discs: [{ ot_name: '测试命盘甲' }] }, [['测试命盘甲'], []]],
  ['独立化极与两套命盘', { huaji: { owned: true, stage: 19, awakened: false }, disc_loadouts: [
    { id: 'disc_1', discs: [{ ot_name: '测试命盘甲' }, { ot_name: '测试命盘乙' }] },
    { id: 'disc_2', discs: [{ ot_name: '测试命盘丙' }] },
  ] }, [['测试命盘甲', '测试命盘乙'], ['测试命盘丙']]],
])('养成清单先于档案加载时不缓存空草稿，图鉴保留%s', async (_, growth, expectedDiscs) => {
  localStorage.setItem('operator-tabs', 'tracking')
  let resolveCurrent
  const pending = new Promise(resolve => { resolveCurrent = resolve })
  operatorApi.getOperatorCurrent.mockReturnValue(pending)
  operatorApi.getOperatorGrowthTargets.mockResolvedValue({ items: [] })
  plannerApi.getTrainingWorkspace.mockResolvedValue({
    schema_version: 1, account_id: 'acc', revision: 1, active_plan_id: 'plan',
    plans: [{ id: 'plan', name: '测试清单', source: 'custom', operator_ids: ['op'], excluded_operator_ids: [],
      targets: { op: { level: 100, elite: 17, star_level: 19 } } }],
  })
  plannerApi.getStaminaSchedule.mockResolvedValue({
    schema_version: 1, rules_version: PLANNER_RULES.version, account_id: 'acc', revision: 0,
  })
  listRecords.mockResolvedValue({ items: [] })
  const wrapper = renderPage({}, { OperatorGrowthTracker: false, PlannerExactOptimizer: true })
  await vi.dynamicImportSettled()
  await flushPromises()
  expect(wrapper.get('.growth-current-star').text()).toBe('未拥有')
  const pendingRemark = wrapper.get('.growth-card-remark textarea')
  expect(pendingRemark.element.disabled).toBe(true)
  // Even a synthetic input must not create a draft from the placeholder row.
  pendingRemark.element.value = '加载前输入'
  pendingRemark.element.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
  expect(wrapper.find('.growth-card-remark .ledger-card-save').exists()).toBe(false)

  resolveCurrent([{ entries: { op: { level: 50, elite: 7, ...growth } } }])
  await flushPromises()
  expect(wrapper.get('.growth-card-remark textarea').element.disabled).toBe(false)
  expect(wrapper.get('.growth-card-remark textarea').element.value).toBe('')
  expect(wrapper.get('.growth-current-star').text()).toBe('4 星 · 0 节点')
  await wrapper.get('#operator-tab-current').trigger('click')
  await flushPromises()
  expect(wrapper.get('.ledger-huaji-value').attributes('aria-label')).toBe('化极：4 星 · 0 节点')
  expect(wrapper.get('.ledger-huaji-value').text()).not.toContain('未拥有')
  expect(wrapper.get('input[aria-label="等级"]').element.value).toBe('50')
  expect(wrapper.get('input[aria-label="修为"]').element.value).toBe('7')
  for (const [index, label] of ['一', '二'].entries()) {
    expect(wrapper.get('[aria-label="编辑命盘' + label + '"]').findAll('.disc-term').map(disc => disc.text())).toEqual(expectedDiscs[index])
  }
  expect(wrapper.find('.ledger-card-save').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
  expect(operatorApi.putOperatorGrowthTarget).not.toHaveBeenCalled()
  expect(plannerApi.putTrainingWorkspace).not.toHaveBeenCalled()
})

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

async function openTrackingLedger(current) {
  localStorage.setItem('operator-tabs', 'tracking')
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: current } }])
  const wrapper = renderPage()
  await flushPromises()
  await wrapper.get('#operator-tab-current').trigger('click')
  await flushPromises()
  return wrapper
}

async function refreshFromTracker(wrapper) {
  wrapper.getComponent({ name: 'OperatorGrowthTracker' }).vm.$emit('refresh-operators')
  await flushPromises()
}

const snapshotCurrent = () => ({
  level: 50, elite: 7, revision: 3, huaji: { owned: true, stage: 19, awakened: false },
  discs: [{ ot_name: '旧命盘' }], combat_stats: { manual_attack: 111, manual_hp: 1111 },
})
const refreshedCurrent = () => ({
  level: 55, elite: 8, revision: 4, huaji: { owned: true, stage: 20, awakened: false },
  disc_loadouts: [
    { id: 'disc_1', discs: [{ ot_name: '新命盘甲' }] },
    { id: 'disc_2', discs: [{ ot_name: '新命盘乙' }] },
  ], combat_stats: { manual_attack: 222, manual_hp: 2222 },
})

it('清单触发全量刷新时，干净草稿采用最新独立化极、双命盘与手动面板', async () => {
  const wrapper = await openTrackingLedger(snapshotCurrent())
  expect(wrapper.get('input[aria-label="等级"]').element.value).toBe('50')
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: refreshedCurrent() } }])
  await refreshFromTracker(wrapper)
  expect(wrapper.get('input[aria-label="等级"]').element.value).toBe('55')
  expect(wrapper.get('input[aria-label="修为"]').element.value).toBe('8')
  expect(wrapper.get('.ledger-huaji-value').attributes('aria-label')).toBe('化极：4 星 · 1 节点')
  expect(wrapper.get('[aria-label="编辑命盘一"] .disc-term').text()).toBe('新命盘甲')
  expect(wrapper.get('[aria-label="编辑命盘二"] .disc-term').text()).toBe('新命盘乙')
  expect(wrapper.get('input[aria-label="测试密探攻击力"]').element.value).toBe('222')
  expect(wrapper.get('input[aria-label="测试密探生命力"]').element.value).toBe('2222')
  expect(wrapper.find('.agent-ledger-card .ledger-card-save').exists()).toBe(false)
  await wrapper.get('input[aria-label="等级"]').setValue('56')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic failure'))
  await wrapper.get('.agent-ledger-card .ledger-card-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch).toMatchObject({
    expected_revision: 4, level: 56, elite: 8,
    disc_loadouts: [{ discs: [{ ot_name: '新命盘甲' }] }, { discs: [{ ot_name: '新命盘乙' }] }],
    combat_stats: { manual_attack: 222, manual_hp: 2222 },
  })
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.combat_stats).not.toHaveProperty('observed_inputs')
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.combat_stats).not.toHaveProperty('combat_input_signature')
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch).not.toHaveProperty('huaji')
})

it('全量刷新保留真正未保存编辑，并用编辑开始时的 revision 防止旧字段覆盖新档案', async () => {
  const wrapper = await openTrackingLedger(snapshotCurrent())
  await wrapper.get('input[aria-label="等级"]').setValue('60')
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: refreshedCurrent() } }])
  await refreshFromTracker(wrapper)
  expect(wrapper.get('input[aria-label="等级"]').element.value).toBe('60')
  expect(wrapper.get('[aria-label="编辑命盘一"] .disc-term').text()).toBe('旧命盘')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('档案版本已更新'))
  await wrapper.get('.agent-ledger-card .ledger-card-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch).toMatchObject({ expected_revision: 3, level: 60 })
  expect(wrapper.get('input[aria-label="等级"]').element.value).toBe('60')
  expect(wrapper.find('.agent-ledger-card .ledger-card-save').exists()).toBe(true)
  await wrapper.get('.agent-ledger-card .ledger-card-cancel').trigger('click')
  await flushPromises()
  expect(wrapper.get('input[aria-label="等级"]').element.value).toBe('55')
  expect(wrapper.get('[aria-label="编辑命盘一"] .disc-term').text()).toBe('新命盘甲')
  expect(wrapper.find('.agent-ledger-card .ledger-card-save').exists()).toBe(false)
})

it('档案删除后重新出现时不复用之前的编辑草稿或面板', async () => {
  const wrapper = await openTrackingLedger(snapshotCurrent())
  await wrapper.get('input[aria-label="等级"]').setValue('60')
  operatorApi.getOperatorCurrent.mockResolvedValue([])
  await refreshFromTracker(wrapper)
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: refreshedCurrent() } }])
  await refreshFromTracker(wrapper)
  expect(wrapper.get('input[aria-label="等级"]').element.value).toBe('55')
  expect(wrapper.get('input[aria-label="测试密探攻击力"]').element.value).toBe('222')
  expect(wrapper.find('.agent-ledger-card .ledger-card-save').exists()).toBe(false)
})

it.each([false, true])('化极 SSE 同步独立 huaji 且保留未保存编辑与版本保护：dirty=%s', async dirty => {
  const wrapper = await openTrackingLedger(snapshotCurrent())
  if (dirty) await wrapper.get('input[aria-label="等级"]').setValue('60')
  const event = { event: 'operator-upgrade', data: { account_id: 'acc', transaction_id: 'huaji-tx',
    operator_id: 'op', dimension: 'huaji', from: 19, to: 20, operator_revision: 4 } }
  const handler = subscribeAccountEvents.mock.calls.at(-1)[0]
  handler(event)
  await flushPromises()
  expect(wrapper.get('.ledger-huaji-value').attributes('aria-label')).toBe(dirty ? '化极：4 星 · 0 节点' : '化极：4 星 · 1 节点')
  const current = wrapper.getComponent({ name: 'OperatorGrowthTracker' }).props('currentEntries')[0]
  expect(current).toMatchObject({ starLevel: 20, revision: 4, huaji: { owned: true, stage: 20, awakened: false } })
  handler(event)
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
  if (!dirty) await wrapper.get('input[aria-label="等级"]').setValue('51')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic failure'))
  await wrapper.get('.agent-ledger-card .ledger-card-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.expected_revision).toBe(dirty ? 3 : 4)
})

it.each(['快照', '装配'])('较早星石快照迟到时不能覆盖较新的%s结果或关闭编辑器', async kind => {
  const wrapper = await openTrackingLedger(snapshotCurrent())
  const oldState = deferred()
  const oldLoadout = deferred()
  getCurrentStarState.mockReturnValueOnce(oldState.promise)
  getCurrentStarLoadout.mockReturnValueOnce(oldLoadout.promise)
  await refreshFromTracker(wrapper)
  expect(wrapper.get('.agent-ledger-card').isVisible()).toBe(true)
  const stone = { instance_id: 'new-stone', kind: 'main', name: '新星石', level: 10 }
  getCurrentStarState.mockResolvedValue({ generation: 2, entries: [stone] })
  getCurrentStarLoadout.mockResolvedValue({ generation: 2, revision: 5, loadouts: { op: { main1: 'new-stone' } } })
  if (kind === '装配') {
    await wrapper.get('.ledger-stones .stone-slot').trigger('click')
    await flushPromises()
  } else await refreshFromTracker(wrapper)
  const modal = wrapper.getComponent({ name: 'StarLoadoutModal' })
  expect(modal.props('open')).toBe(kind === '装配')
  expect(wrapper.get('.ledger-stones .stone-slot').text()).toContain('新星石')
  oldState.resolve({ generation: 1, entries: [] })
  oldLoadout.resolve({ generation: 1, revision: 0, loadouts: {} })
  await flushPromises()
  expect(modal.props('open')).toBe(kind === '装配')
  expect(modal.props('inventoryEntries')).toEqual([stone])
  expect(modal.props('draftLoadouts').op.main1).toBe('new-stone')
  expect(wrapper.get('.ledger-stones .stone-slot').text()).toContain('新星石')
})

it('星石装配保存成功后，保存前发出的快照不能恢复旧佩戴', async () => {
  const stone = { instance_id: 'stone-a', kind: 'main', name: '已保存星石', level: 10 }
  getCurrentStarState.mockResolvedValue({ generation: 0, entries: [stone] })
  const wrapper = await openTrackingLedger(snapshotCurrent())
  await wrapper.get('.ledger-stones .stone-slot').trigger('click')
  await flushPromises()
  const modal = wrapper.getComponent({ name: 'StarLoadoutModal' })
  modal.vm.$emit('update:draft-loadouts', { op: { main1: 'stone-a' } })
  const oldState = deferred()
  const oldLoadout = deferred()
  getCurrentStarState.mockReturnValueOnce(oldState.promise)
  getCurrentStarLoadout.mockReturnValueOnce(oldLoadout.promise)
  await refreshFromTracker(wrapper)
  putCurrentStarLoadout.mockResolvedValueOnce({ generation: 0, revision: 1, loadouts: { op: { main1: 'stone-a' } } })
  modal.vm.$emit('request-close')
  await flushPromises()
  expect(putCurrentStarLoadout).toHaveBeenCalledWith('acc', expect.objectContaining({
    expected_revision: 0, expected_generation: 0, loadouts: expect.objectContaining({ op: expect.objectContaining({ main1: 'stone-a' }) }),
  }))
  expect(modal.props('open')).toBe(false)
  oldState.resolve({ generation: 0, entries: [stone] })
  oldLoadout.resolve({ generation: 0, revision: 0, loadouts: {} })
  await flushPromises()
  expect(wrapper.get('.ledger-stones .stone-slot').text()).toContain('已保存星石')
})

it.each([390, 1440])('真实密探完整编辑器跨双端布局保留草稿、焦点和唯一面板：%ipx', async width => {
  const viewport = installViewport(width)
  const wrapper = await openEditor()
  document.body.append(wrapper.element)
  const panel = wrapper.get('.editor-panel').element
  const input = wrapper.findAll('.level-row input[type="number"]')[0]
  await input.setValue('37')
  input.element.focus()
  const reads = operatorApi.getOperatorCurrent.mock.calls.length
  for (const next of [640, 641, 767, 768, 900, 1080, 1081, 320, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.findAll('.editor-panel')).toHaveLength(1)
    expect(wrapper.get('.editor-panel').element).toBe(panel)
    expect(input.element.value).toBe('37')
    expect(document.activeElement).toBe(input.element)
    expect(operatorApi.getOperatorCurrent).toHaveBeenCalledTimes(reads)
    expect(operatorApi.importOperator).not.toHaveBeenCalled()
    expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  }
})

it('空档案引导出现在默认图鉴筛选前，养成筛选不占用首屏', async () => {
  const wrapper = renderPage({ attachTo: document.body })
  await flushPromises()
  const guide = wrapper.get('.operator-entry-guide')
  expect(guide.text()).toContain('还没有密探档案')
  expect(guide.text()).toContain('补录一位密探')
  expect(guide.element.compareDocumentPosition(wrapper.get('.catalog-tools input[type="search"]').element) & 4).toBe(4)
  expect(wrapper.getComponent({ name: 'OperatorFilterDossier' }).props('contextLabel')).toBe('密探图鉴')
  expect(wrapper.find('#operator-panel-current .operator-filter-dossier').exists()).toBe(false)
  expect(wrapper.get('.operator-tabs').isVisible()).toBe(false)
  expect(wrapper.get('.catalog-tools input[type="search"]').isVisible()).toBe(false)
  await guide.findAll('button').find(button => button.text() === '从图鉴补录一位密探').trigger('click')
  await flushPromises()
  expect(wrapper.get('.operator-tabs').isVisible()).toBe(true)
  expect(wrapper.get('.catalog-tools input[type="search"]').isVisible()).toBe(true)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it('工作区方向键不切换视图，即将上线仍只打开说明', async () => {
  vi.spyOn(features, 'isFeatureEnabled').mockReturnValue(false)
  const wrapper = renderPage({ attachTo: document.body })
  await flushPromises()
  await wrapper.findAll('.operator-entry-guide button').find(button => button.text() === '从图鉴补录一位密探').trigger('click')
  const catalog = wrapper.get('#operator-tab-catalog')
  const current = wrapper.get('#operator-tab-current')
  catalog.element.focus()
  await catalog.trigger('keydown', { key: 'ArrowRight' })
  expect(document.activeElement).toBe(current.element)
  expect(catalog.attributes('aria-selected')).toBe('true')
  expect(wrapper.get('#operator-panel-catalog').isVisible()).toBe(true)
  const preview = wrapper.get('.tool-workspace-tabs [aria-haspopup="dialog"]')
  expect(preview.attributes('role')).toBeUndefined()
  await preview.trigger('click')
  expect(dialog.alert).toHaveBeenCalledWith(expect.objectContaining({ title: '养成规划' }))
  expect(catalog.attributes('aria-selected')).toBe('true')
  await current.trigger('click')
  await flushPromises()
  expect(current.attributes('aria-selected')).toBe('true')
  expect(current.attributes('aria-controls')).toBe('operator-panel-current')
  expect(wrapper.get('#operator-panel-current').attributes('aria-labelledby')).toBe('operator-tab-current')
  expect(wrapper.get('#operator-panel-current').isVisible()).toBe(true)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it('图鉴工具头显示筛选结果与全量招募数量，搜索不改变招募统计', async () => {
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [operator, { ...operator, id: 'other', name: '另一位密探' }] })
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: { level: 90, elite: 15, star_level: 1 } } }])
  const wrapper = renderPage()
  await flushPromises()
  const tools = wrapper.get('.catalog-tools')
  const summary = wrapper.get('.roster-summary')
  expect(tools.getComponent({ name: 'OperatorFilterDossier' }).props('statusLabel')).toBe('招募状态')
  expect(summary.get('.roster-owned').text()).toBe('已招募 1 / 2 位')
  expect(summary.text()).toContain('50%')
  const counts = () => tools.findAll('[aria-label="按招募状态筛选密探图鉴"] small').map(item => item.text())
  expect(tools.get('.current-filter-result').text()).toBe('2 / 2 位')
  expect(counts()).toEqual(['2', '1', '1'])
  await tools.get('input[type="search"]').setValue('另一位')
  expect(summary.get('.roster-owned').text()).toBe('已招募 1 / 2 位')
  expect(tools.get('.current-filter-result').text()).toBe('1 / 2 位')
  expect(counts()).toEqual(['2', '1', '1'])
  await tools.get('[aria-label="按招募状态筛选密探图鉴"] button:nth-child(2)').trigger('click')
  expect(tools.get('.current-filter-result').text()).toBe('0 / 2 位')
  expect(tools.get('[aria-label="按招募状态筛选密探图鉴"] button:nth-child(2)').attributes('aria-pressed')).toBe('true')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it.each(['2026-10-17T03:04:05Z', ''])('精简页头仍可从帮助查看更新时间及复制完整目录版本：%s', async version => {
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [operator], catalog_version: version })
  const wrapper = renderPage({ attachTo: document.body })
  await flushPromises()
  const help = wrapper.get('.roster-header .compact-tool-help')
  expect(wrapper.find('.compact-tool-help-content').exists()).toBe(false)
  await help.trigger('click')
  const content = wrapper.get('.compact-tool-help-content')
  expect(content.text()).toContain('图鉴更新于 ' + (version || '本地兜底'))
  expect(content.attributes('id')).toBe(help.attributes('aria-controls'))
  await help.trigger('click')
  expect(wrapper.find('.compact-tool-help-content').exists()).toBe(false)
  const filters = wrapper.get('.catalog-tools')
  await filters.get('.dossier-more').trigger('click')
  expect(filters.get('.catalog-version-value').element.value).toBe(version || '本地兜底')
  expect(filters.get('.catalog-version-value').attributes('readonly')).toBeDefined()
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it('分享状态统一在顶部入口，弹窗保留复制且状态仍跟随当前账号', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const writeText = vi.fn().mockResolvedValue()
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: { level: 90, elite: 15, star_level: 1 } } }])
  operatorApi.listOperatorAccounts.mockResolvedValue([
    { id: 'acc', name: '测试账号', game: '如鸢' },
    { id: 'other-acc', name: '另一个账号', game: '如鸢' },
  ])
  accountShareApi.getAccountShare.mockImplementation(async id => ({
    active: id === 'acc',
    share_code: id === 'acc' ? 'test-code' : '', scopes: id === 'acc' ? ['operator'] : [],
  }))
  const wrapper = renderPage({ attachTo: document.body }, { AccountWorkspace: false, OperatorShareManager: false })
  await flushPromises()
  const header = wrapper.get('.roster-header')
  const share = header.get('.roster-share')
  expect(share.text()).toContain('分享 BOX')
  expect(share.text()).toContain('已开启')
  expect(share.get('small').classes()).toContain('is-sharing')
  expect(share.attributes('aria-expanded')).toBe('false')
  expect(header.get('.roster-view-box').element.tagName).toBe('BUTTON')
  expect(header.get('.roster-view-box').attributes('aria-haspopup')).toBe('dialog')
  expect(header.get('.tool-more-content').text()).not.toMatch(/分享|查看他人/)
  expect(header.text()).not.toContain('管理当前账号的密探档案')
  const content = wrapper.get('#operator-panel-catalog').html()
  const modal = new DOMWrapper(document.getElementById('operator-share-dialog'))
  expect(modal.isVisible()).toBe(false)
  share.element.focus()
  await share.trigger('click')
  expect(modal.isVisible()).toBe(true)
  expect(modal.text()).toContain('测试账号')
  expect(wrapper.get('#operator-account-workspace').isVisible()).toBe(false)
  expect(share.attributes('aria-expanded')).toBe('true')
  await modal.get('[aria-label="复制密探 BOX链接"]').trigger('click'); await flushPromises()
  expect(writeText).toHaveBeenCalledExactlyOnceWith(window.location.origin + '/operator/share/test-code')
  await modal.get('[aria-label="关闭分享弹窗"]').trigger('click'); await flushPromises()
  expect(modal.isVisible()).toBe(false)
  expect(share.attributes('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(share.element)
  expect(wrapper.get('#operator-panel-catalog').html()).toBe(content)
  expect(accountShareApi.getAccountShare).toHaveBeenCalledTimes(1)
  await wrapper.get('#operator-tab-current').trigger('click'); await flushPromises()
  expect(wrapper.get('.current-status-summary').text()).toContain('养成中')
  expect(wrapper.get('#operator-panel-current').text()).not.toMatch(/分享中|未开启|未分享/)
  await share.trigger('click')
  expect(accountShareApi.getAccountShare).toHaveBeenCalledTimes(1)
  await modal.get('[aria-label="关闭分享弹窗"]').trigger('click')
  activeAccount.id = 'other-acc'
  await flushPromises()
  expect(accountShareApi.getAccountShare).toHaveBeenLastCalledWith('other-acc')
  expect(share.text()).toContain('未开启')
  expect(share.get('small').classes()).not.toContain('is-sharing')
  expect(share.text()).not.toContain('已开启')
  await share.trigger('click')
  expect(modal.text()).toContain('另一个账号')
  expect(modal.find('input[readonly]').exists()).toBe(false)
  expect(accountShareApi.setAccountShareScope).not.toHaveBeenCalled()
  expect(accountShareApi.regenerateAccountShare).not.toHaveBeenCalled()
  expect(accountShareApi.revokeAccountShare).not.toHaveBeenCalled()
})

it('JSON 仍从更多打开，分享弹窗不改写导入草稿或导出范围', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  accountShareApi.getAccountShare.mockResolvedValue({ active: false, scopes: [] })
  const wrapper = renderPage({ attachTo: document.body }, { AccountWorkspace: false, OperatorShareManager: false })
  await flushPromises()
  const more = wrapper.get('.roster-header .tool-more')
  const trigger = more.get('summary')
  expect(more.element.open).toBe(false)
  await trigger.trigger('click')
  expect(more.element.open).toBe(true)
  await wrapper.get('.archive-toggle').trigger('click')
  expect(more.element.open).toBe(false)
  expect(document.activeElement).toBe(trigger.element)
  const workspace = wrapper.get('#operator-account-workspace')
  expect(workspace.isVisible()).toBe(true)
  expect(workspace.get('.export-submit').text()).toContain('导出密探档案')
  await workspace.get('.archive-import').trigger('click')
  const input = wrapper.get('.backup-import textarea')
  await input.setValue('{"draft":"保留"}')
  const before = workspace.html()
  await wrapper.get('.roster-share').trigger('click')
  expect(document.querySelector('#operator-share-dialog .archive-workspace')).toBeNull()
  await new DOMWrapper(document.querySelector('#operator-share-dialog [aria-label="关闭分享弹窗"]')).trigger('click')
  expect(workspace.html()).toBe(before)
  expect(input.element.value).toBe('{"draft":"保留"}')
  await wrapper.get('.archive-toggle').trigger('click')
  expect(workspace.isVisible()).toBe(false)
  expect(wrapper.find('.backup-import').exists()).toBe(false)
})

it('更多筛选仅统计高级条件，关闭面板仍保留条件与结果', async () => {
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: { level: 90, elite: 15, star_level: 1 } } }])
  const wrapper = renderPage({ attachTo: document.body })
  await flushPromises()
  const panel = wrapper.get('.catalog-tools')
  const more = panel.get('.dossier-more')
  expect(more.text()).toBe('更多筛选')
  await wrapper.get('.catalog-tools input[type="search"]').setValue('不存在')
  expect(more.text()).toBe('更多筛选')
  await more.trigger('click')
  expect(panel.get('.dossier-extra').isVisible()).toBe(true)
  await panel.get('.rarity-filter button:last-child').trigger('click')
  await panel.get('[aria-label="启用等级筛选"]').setValue(true)
  expect(more.text()).toBe('更多筛选 · 2')
  const before = wrapper.get('.catalog-tools').element.nextElementSibling.textContent
  await more.trigger('click')
  expect(panel.get('.dossier-extra').isVisible()).toBe(false)
  expect(more.text()).toBe('更多筛选 · 2')
  expect(panel.get('[aria-label="启用等级筛选"]').element.checked).toBe(true)
  expect(wrapper.get('.catalog-tools').element.nextElementSibling.textContent).toBe(before)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
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
    await wrapper.findAll('.operator-entry-guide button').find(button => button.text() === '重试').trigger('click')
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
  await wrapper.get('.operator-tabs button:nth-child(2)').trigger('click')
  await flushPromises()
  expect(wrapper.findComponent({ name: 'OperatorFilterDossier' }).exists()).toBe(true)
  await wrapper.get('.operator-tabs button:first-child').trigger('click')
  expect(wrapper.get('.catalog-tools .catalog-entry').attributes('to')).toContain('mode=supplement')
  await wrapper.get('.catalog-tools input[type="search"]').setValue('不存在的角色')
  expect(wrapper.find('.operator-entry-guide').exists()).toBe(false)
  expect(wrapper.text()).toContain('没有符合条件的密探')
  await wrapper.findAll('button').find(button => button.text() === '清除筛选').trigger('click')
  await flushPromises()
  expect(wrapper.get('.catalog-tools input[type="search"]').element.value).toBe('')
  expect(wrapper.findAll('.slot')).toHaveLength(1)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it('单角色入口复用图鉴并聚焦搜索，目录版本保持完整可复制原值', async () => {
  const version = 'catalog-release-opaque-not-a-date-20261005-sha123456789'
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [operator], catalog_version: version })
  const wrapper = renderPage({ attachTo: document.body })
  await flushPromises()
  await wrapper.findAll('.operator-entry-guide button').find(button => button.text() === '从图鉴补录一位密探').trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('.catalog-tools input[type="search"]').element)
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
  document.body.append(wrapper.element)
  const input = wrapper.findAll('.oddity-field input')[index]
  await input.setValue(value)
  await wrapper.get('#operator-editor-tab-discs').trigger('click')
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(wrapper.get('#operator-editor-tab-growth').attributes('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(input.element)
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
    accountId: 'acc', operatorId: 'op', patch: expect.objectContaining({ level: 1, elite: 1, huaji: { owned: true, stage: 1, awakened: null } }),
  }))
})

it.each(['1星', '5星'])('已有零值保留到选择%s，切回未拥有不清空养成', async label => {
  const wrapper = await openEditor({ level: 0, elite: 0, starLevel: 0 }, { ...operator, rarity: 4 })
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
      level: expectedGrowth[0], elite: expectedGrowth[1],
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
    patch: expect.objectContaining({ level, elite, combat_stats: expect.objectContaining({ oddities }) }),
  }))
  wrapper.unmount()
})

it('隐密不展示五星或觉醒按钮，历史异常可以仅编辑其它字段', async () => {
  const wrapper = await openEditor({ level: 80, elite: 12, starLevel: 31, huaji: { owned: true, stage: null, awakened: null } }, { ...operator, rarity: 3 })
  expect(wrapper.findAll('.star-groups button').map(button => button.text())).not.toContain('5星')
  expect(wrapper.find('.editor-awakening [role="switch"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('历史化极待复核')
  await wrapper.findAll('.level-row input[type="number"]')[0].setValue('90')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  expect(operatorApi.patchOperatorCurrent).toHaveBeenCalledTimes(1)
  const patch = operatorApi.patchOperatorCurrent.mock.calls[0][0].patch
  expect(patch.level).toBe(90)
  expect(patch).not.toHaveProperty('star_level')
  expect(patch).not.toHaveProperty('huaji')
})

it('五星觉醒默认关闭，主动开启才提交觉醒事实', async () => {
  const wrapper = await openEditor({ level: 80, elite: 12, starLevel: 25, huaji: { owned: true, stage: 25, awakened: null } }, { ...operator, rarity: 4 })
  const awakening = wrapper.get('.editor-awakening [role="switch"]')
  expect(wrapper.find('.star-groups [role="switch"]').exists()).toBe(false)
  expect(awakening.text()).toContain('未觉醒')
  expect(awakening.attributes('aria-checked')).toBe('false')
  expect(wrapper.get('.editor-awakening').text()).not.toContain('待确认')
  await awakening.trigger('click')
  expect(awakening.attributes('aria-checked')).toBe('true')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click')
  await flushPromises()
  const patch = operatorApi.patchOperatorCurrent.mock.calls[0][0].patch
  expect(patch.huaji).toEqual({ owned: true, stage: 25, awakened: true })
  expect(patch).not.toHaveProperty('star_level')
})

it('低星不显示觉醒入口，历史觉醒归一为五星', async () => {
  const wrapper = await openEditor({ level: 80, elite: 12, starLevel: 19, huaji: { owned: true, stage: 19, awakened: null } }, { ...operator, rarity: 4 })
  expect(wrapper.find('.editor-awakening [role="switch"]').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  wrapper.unmount()
  const old = await openEditor({ level: 80, elite: 12, starLevel: 31, revision: 3, huaji: { owned: true, stage: null, awakened: true } }, { ...operator, rarity: 4 })
  expect(old.findAll('.star-pill.on').map(pill => pill.text())).toContain('5星')
  expect(old.get('.editor-awakening [role="switch"]').attributes('aria-checked')).toBe('true')
  await pickStar(old, '5星')
  await old.findAll('.level-row input[type="number"]')[0].setValue('90')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await old.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.level).toBe(90)
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch).not.toHaveProperty('huaji')
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch).not.toHaveProperty('star_level')
})

it.each([null, false, true])('独立觉醒开关保留已存%s，打开或保存其它字段不改写觉醒事实', async awakened => {
  const wrapper = await openEditor({ level: 80, elite: 12, starLevel: 25, huaji: { owned: true, stage: 25, awakened } }, { ...operator, rarity: 4 })
  expect(wrapper.get('.editor-awakening [role="switch"]').attributes('aria-checked')).toBe(String(awakened === true))
  expect(wrapper.find('.star-card select').exists()).toBe(false)
  await wrapper.findAll('.level-row input[type="number"]')[0].setValue('90')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch).not.toHaveProperty('huaji')
})

it('新档案觉醒默认关闭，到五星才可开启，关闭后只保存stage25+false', async () => {
  const wrapper = await openEditor(null, { ...operator, rarity: 4 })
  expect(wrapper.find('.editor-awakening [role="switch"]').exists()).toBe(false)
  await pickStar(wrapper, '1星')
  expect(wrapper.find('.editor-awakening [role="switch"]').exists()).toBe(false)
  await pickStar(wrapper, '5星')
  const awakening = wrapper.get('.editor-awakening [role="switch"]')
  expect(awakening.element.disabled).toBe(false)
  expect(awakening.attributes('aria-checked')).toBe('false')
  await awakening.trigger('click')
  expect(awakening.attributes('aria-checked')).toBe('true')
  await awakening.trigger('click')
  expect(awakening.attributes('aria-checked')).toBe('false')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.huaji).toEqual({ owned: true, stage: 25, awakened: false })
  expect(operatorApi.previewOperatorUpgrade).not.toHaveBeenCalled()
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
})

it('降星时清除新开启及历史觉醒事实', async () => {
  const wrapper = await openEditor({ level: 80, elite: 12, starLevel: 25, huaji: { owned: true, stage: 25, awakened: null } }, { ...operator, rarity: 4 })
  await wrapper.get('.editor-awakening [role="switch"]').trigger('click')
  await pickStar(wrapper, '4星')
  expect(wrapper.find('.editor-awakening [role="switch"]').exists()).toBe(false)
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.huaji).toEqual({ owned: true, stage: 19, awakened: false })
  wrapper.unmount()
  const old = await openEditor({ level: 80, elite: 12, starLevel: 31, huaji: { owned: true, stage: null, awakened: true } }, { ...operator, rarity: 4 })
  await pickStar(old, '4星')
  expect(old.find('.editor-awakening [role="switch"]').exists()).toBe(false)
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await old.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.huaji).toEqual({ owned: true, stage: 19, awakened: false })
})

it('SP历史觉醒在人工降星时清除', async () => {
  const wrapper = await openEditor({ level: 80, elite: 12, starLevel: 2, huaji: { owned: true, stage: 7, awakened: true } }, { ...operator, rarity: 5, spOf: 'base' })
  await pickStar(wrapper, '3星')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.huaji).toEqual({ owned: true, stage: 13, awakened: false })
})

it('觉醒衔接：补录stage与觉醒后的面板观测使用同一组独立事实', async () => {
  const wrapper = await openEditor({ level: 80, elite: 12, starLevel: 31, huaji: { owned: true, stage: null, awakened: true } }, { ...operator, rarity: 4 })
  await pickStar(wrapper, '5星')
  await wrapper.get('[aria-label="校正攻击力，清空后按面板来源显示"]').setValue('1000')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  const patch = operatorApi.patchOperatorCurrent.mock.lastCall[0].patch
  expect(patch.combat_stats.observed_inputs.huaji).toEqual({ owned: true, stage: 25, awakened: true })
  expect(patch.combat_stats.combat_input_signature).toContain('"stage":25')
})

it.each([
  [25, 25, null, '5'],
  [25, 25, false, '5'],
  [25, 25, true, '已觉醒'],
  [31, null, true, '已觉醒'],
])('五星/觉醒卡片直接显示已录入状态，不重复要求确认：%s/%s/%s', async (starLevel, stage, awakened, label) => {
  const current = { level: 100, elite: 17, starLevel, revision: 3, huaji: { owned: true, stage, awakened } }
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [{ ...operator, rarity: 4 }] })
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: current } }])
  const wrapper = renderPage(); await flushPromises()
  await wrapper.get('#operator-tab-current').trigger('click'); await flushPromises()
  const value = wrapper.get('.ledger-huaji-value')
  const row = value.element.parentElement
  expect(row.querySelector('.ledger-grow-label').textContent).toContain('化极')
  expect(row.querySelector('.ledger-grow-label button').textContent).toBe('历程')
  expect(value.text()).toBe(label)
  expect(value.attributes('aria-label')).toBe('化极：' + (awakened ? '已觉醒' : '5 星'))
  expect(row.querySelector('.ledger-next-action:not(.ledger-heart-stock)')).toBeNull()
  expect(row.querySelector('.ledger-heart-stock') !== null).toBe(!awakened && stage === 25)
  expect(row.textContent).not.toContain('觉醒待确认')
  await value.trigger('click')
  expect(wrapper.find('.ledger-star-popover').exists()).toBe(true)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.previewOperatorUpgrade).not.toHaveBeenCalled()
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
  expect(current.huaji).toEqual({ owned: true, stage, awakened })
})

it.each([
  [390, null, 39], [1440, false, 120], [390, false, 0], [1440, null, 100],
])('五星未觉醒保留本密探心纸库存与参考需求：%ipx/%s/%i', async (width, awakened, count) => {
  installViewport(width)
  getInventoryCurrent.mockImplementation(async ({ entityType }) => entityType === 'agent'
    ? [{ entity_type: 'agent', entries: { op: { count }, other: { count: 999 } } }] : [])
  const wrapper = await openCardStarEditor({ level: 100, elite: 17, starLevel: 25,
    huaji: { owned: true, stage: 25, awakened } })
  const stock = wrapper.get('.ledger-heart-stock')
  expect(stock.text()).toBe(`${count}/100`)
  expect(stock.attributes('aria-label')).toContain('心纸库存/觉醒参考需求')
  expect(getInventoryCurrent).toHaveBeenCalledWith({ accountId: 'acc', entityType: 'agent' })
  await wrapper.get('.ledger-huaji-value').trigger('click')
  expect(stock.attributes('aria-expanded')).toBe('false')
  await stock.trigger('click')
  expect(stock.attributes('aria-expanded')).toBe('true')
  expect(wrapper.get('.ledger-star-popover').text()).toContain('觉醒需 100 心纸')
  expect(wrapper.get('.ledger-star-popover').text()).toContain('1 个装金玻璃')
  expect(wrapper.get('.ledger-star-popover').text()).toContain('不扣库存')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.previewOperatorUpgrade).not.toHaveBeenCalled()
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
})

it.each([
  [{ rarity: 4 }, 24, null], [{ rarity: 4 }, 25, true], [{ rarity: 4 }, null, null],
  [{ rarity: 3 }, 24, null], [{ rarity: 5, spOf: 'base' }, 25, null],
  [{ rarity: 4, huajiCapabilities: { awakening_supported: false } }, 25, null],
])('心纸觉醒参考不用于低星、已觉醒、未知或不支持的密探 %#', async (catalog, stage, awakened) => {
  const wrapper = await openCardStarEditor({ level: 100, elite: 17, starLevel: stage ?? 31,
    huaji: { owned: true, stage, awakened } }, { ...operator, ...catalog })
  expect(wrapper.find('.ledger-heart-stock').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.previewOperatorUpgrade).not.toHaveBeenCalled()
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
})

it('五星心纸加载中显示未知，库存返回后更新数量', async () => {
  let resolve
  const pending = new Promise(yes => { resolve = yes })
  getInventoryCurrent.mockImplementation(({ entityType }) => entityType === 'agent' ? pending : Promise.resolve([]))
  const wrapper = await openCardStarEditor({ level: 100, elite: 17, starLevel: 25,
    huaji: { owned: true, stage: 25, awakened: false } })
  expect(wrapper.get('.ledger-heart-stock').text()).toBe('—/100')
  resolve([{ entity_type: 'agent', entries: { op: { count: 39 } } }])
  await flushPromises()
  expect(wrapper.get('.ledger-heart-stock').text()).toBe('39/100')
})

it('五星心纸读取失败保留未知，不显示为零库存', async () => {
  getInventoryCurrent.mockRejectedValue(new Error('库存读取失败'))
  const wrapper = await openCardStarEditor({ level: 100, elite: 17, starLevel: 25,
    huaji: { owned: true, stage: 25, awakened: false } })
  expect(wrapper.get('.ledger-heart-stock').text()).toBe('—/100')
})

it.each([false, null])('觉醒衔接：五星卡片%s通过完整编辑的星级入口记录觉醒，不预览扣库', async awakened => {
  const current = { level: 100, elite: 17, starLevel: 25, revision: 3, huaji: { owned: true, stage: 25, awakened } }
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [{ ...operator, rarity: 4 }] })
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: current } }])
  const wrapper = renderPage({ attachTo: document.body }); await flushPromises()
  await wrapper.get('#operator-tab-current').trigger('click'); await flushPromises()
  await wrapper.get('.ledger-full-edit').trigger('click'); await flushPromises()
  expect(wrapper.get('.editor-awakening [role="switch"]').attributes('aria-checked')).toBe('false')
  await wrapper.get('.editor-awakening [role="switch"]').trigger('click')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.previewOperatorUpgrade).not.toHaveBeenCalled()
  operatorApi.patchOperatorCurrent.mockResolvedValueOnce({ ...current, revision: 4, huaji: { ...current.huaji, awakened: true } })
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch).toMatchObject({ expected_revision: 3, reason: 'manual_correction', huaji: { owned: true, stage: 25, awakened: true } })
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('已觉醒')
  expect(wrapper.get('.ledger-huaji-value').element.parentElement.querySelector('.ledger-next-action')).toBeNull()
})

it('觉醒衔接：stage24→25沿用原扣库预览与执行，五星后不追加确认入口', async () => {
  const current = { level: 100, elite: 17, starLevel: 24, revision: 3, huaji: { owned: true, stage: 24, awakened: null } }
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [{ ...operator, rarity: 4 }] })
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: current } }])
  operatorApi.previewOperatorUpgrade.mockResolvedValueOnce({ available: true, from: 24, to: 25, operator_revision: 3, inventory_revision: 8, preview_token: 'synthetic-preview',
    requirements: [{ entity_type: 'agent', id: 'op', required: 80, balance_after: 0 }] })
  operatorApi.executeOperatorUpgrade.mockResolvedValueOnce({ operator: { ...current, star_level: 25, revision: 4, huaji: { ...current.huaji, stage: 25 } }, consumed: [{ entity_type: 'agent', id: 'op', balance_after: 0 }] })
  const wrapper = renderPage(); await flushPromises()
  await wrapper.get('#operator-tab-current').trigger('click'); await flushPromises()
  wrapper.get('.ledger-huaji-value').element.nextElementSibling.click(); await flushPromises()
  expect(operatorApi.previewOperatorUpgrade).toHaveBeenCalledWith(expect.objectContaining({ dimension: 'huaji', target: 25, expectedOperatorRevision: 3 }))
  const execute = wrapper.findAll('.ledger-upgrade-popover button').find(button => button.text().includes('确认提升并扣除库存'))
  await execute.trigger('click'); await flushPromises()
  expect(operatorApi.executeOperatorUpgrade).toHaveBeenCalledTimes(1)
  expect(operatorApi.executeOperatorUpgrade.mock.lastCall[0]).toMatchObject({ dimension: 'huaji', target: 25 })
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('5')
  expect(wrapper.get('.ledger-huaji-value').element.parentElement.querySelector('.ledger-next-action:not(.ledger-heart-stock)')).toBeNull()
  expect(wrapper.get('.ledger-heart-stock').text()).toBe('0/100')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it.each([
  [25, 25, null],
  [25, 25, false],
  [19, 19, null],
  [31, null, true],
])('快捷觉醒：保存stage25+true且不重写既有面板观测：%s/%s/%s', async (starLevel, stage, awakened) => {
  const current = { level: 100, elite: 17, starLevel, revision: 3, huaji: { owned: true, stage, awakened }, combat_stats: { manual_attack: 1000 } }
  const wrapper = await openCardStarEditor(current)
  await wrapper.get('[aria-label="快捷设置星级与觉醒"]').setValue('awakening')
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('已觉醒')
  expect(wrapper.get('.ledger-huaji-value').attributes('aria-label')).toBe('化极：已觉醒')
  expect(wrapper.get('.ledger-huaji-value').element.parentElement.querySelector('.ledger-next-action')).toBeNull()
  expect(wrapper.find('.awakening-panel').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  if (awakened === true) {
    expect(wrapper.find('.ledger-card-save').exists()).toBe(false)
    expect(operatorApi.previewOperatorUpgrade).not.toHaveBeenCalled()
    expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
    return
  }
  operatorApi.patchOperatorCurrent.mockResolvedValueOnce({ ...current, starLevel: 25, revision: 4, huaji: { owned: true, stage: 25, awakened: true } })
  await wrapper.get('.ledger-card-save').trigger('click'); await flushPromises()
  const patch = operatorApi.patchOperatorCurrent.mock.lastCall[0].patch
  expect(patch).toMatchObject({ expected_revision: 3, reason: 'manual_correction', level: 100, elite: 17, huaji: { owned: true, stage: 25, awakened: true } })
  expect(patch).not.toHaveProperty('star_level')
  expect(patch.combat_stats.manual_attack).toBe(1000)
  expect(patch.combat_stats).not.toHaveProperty('observed_inputs')
  expect(patch.combat_stats).not.toHaveProperty('combat_input_signature')
  expect(operatorApi.previewOperatorUpgrade).not.toHaveBeenCalled()
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('已觉醒')
  expect(wrapper.find('.ledger-card-save').exists()).toBe(false)
  await wrapper.get('.ledger-huaji-value').trigger('click')
  expect(wrapper.get('[aria-label="快捷设置星级与觉醒"]').element.value).toBe('awakening')
})

it.each([null, true])('快捷觉醒：主动选择五星明确记录未觉醒，原值%s', async awakened => {
  const current = { level: 100, elite: 17, starLevel: 25, revision: 3, huaji: { owned: true, stage: 25, awakened } }
  const wrapper = await openCardStarEditor(current)
  await wrapper.get('[aria-label="快捷设置星级与觉醒"]').setValue('5')
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('5')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  operatorApi.patchOperatorCurrent.mockResolvedValueOnce({ ...current, revision: 4, huaji: { owned: true, stage: 25, awakened: false } })
  await wrapper.get('.ledger-card-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.huaji).toEqual({ owned: true, stage: 25, awakened: false })
  await wrapper.get('.ledger-huaji-value').trigger('click')
  expect(wrapper.get('[aria-label="快捷设置星级与觉醒"]').element.value).toBe('5')
  expect(wrapper.find('.ledger-card-save').exists()).toBe(false)
})

it.each([null, true])('快捷觉醒：取消恢复原星级与觉醒三态，不写入%s', async awakened => {
  const current = { level: 100, elite: 17, starLevel: 25, revision: 3, huaji: { owned: true, stage: 25, awakened } }
  const wrapper = await openCardStarEditor(current)
  await wrapper.get('[aria-label="快捷设置星级与觉醒"]').setValue(awakened ? '5' : 'awakening')
  await wrapper.get('.ledger-card-cancel').trigger('click')
  expect(wrapper.get('.ledger-huaji-value').text()).toBe(awakened ? '已觉醒' : '5')
  expect(wrapper.find('.ledger-card-save').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  await wrapper.get('.ledger-huaji-value').trigger('click')
  expect(wrapper.get('[aria-label="快捷设置星级与觉醒"]').element.value).toBe(awakened ? 'awakening' : '5')
  expect(current.huaji.awakened).toBe(awakened)
})

it.each([null, false, true])('快捷觉醒：仅打开或修改其它养成字段不改写已存%s', async awakened => {
  const current = { level: 90, elite: 15, starLevel: 25, revision: 3, huaji: { owned: true, stage: 25, awakened } }
  const wrapper = await openCardStarEditor(current)
  expect(wrapper.find('.ledger-card-save').exists()).toBe(false)
  await wrapper.get('.ledger-inline-input').setValue('91')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.ledger-card-save').trigger('click'); await flushPromises()
  const patch = operatorApi.patchOperatorCurrent.mock.lastCall[0].patch
  expect(patch.level).toBe(91)
  expect(patch).not.toHaveProperty('huaji')
  expect(current.huaji.awakened).toBe(awakened)
})

it.each([
  [{ ...operator, rarity: 3 }, 7, 7, false],
  [{ ...operator, rarity: 5, sp_of: 'base' }, 2, 7, true],
  [{ ...operator, rarity: 4, huaji_capabilities: { awakening_supported: false } }, 7, 7, true],
])('快捷觉醒：不支持的密探不提供入口，星级校正保留历史事实 %#', async (catalog, starLevel, stage, awakened) => {
  const current = { level: 90, elite: 15, starLevel, revision: 3, huaji: { owned: true, stage, awakened } }
  const wrapper = await openCardStarEditor(current, catalog)
  const select = wrapper.get('[aria-label="快捷设置星级与觉醒"]')
  expect(select.find('option[value="awakening"]').exists()).toBe(false)
  await select.setValue('3')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.ledger-card-save').trigger('click'); await flushPromises()
  const huaji = operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.huaji
  expect(huaji.stage).toBe(13)
  if (awakened) expect(huaji).not.toHaveProperty('awakened')
  else expect(huaji.awakened).toBe(false)
})

it.each([500, 409])('快捷觉醒：保存失败%s保留草稿与版本，取消后恢复原记录', async status => {
  const current = { level: 100, elite: 17, starLevel: 25, revision: 3, huaji: { owned: true, stage: 25, awakened: null } }
  const wrapper = await openCardStarEditor(current)
  await wrapper.get('[aria-label="快捷设置星级与觉醒"]').setValue('awakening')
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(Object.assign(new Error('synthetic save failure'), { status }))
  await wrapper.get('.ledger-card-save').trigger('click'); await flushPromises()
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('已觉醒')
  expect(wrapper.find('.ledger-card-save').exists()).toBe(true)
  expect(operatorApi.patchOperatorCurrent).toHaveBeenCalledTimes(1)
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch.expected_revision).toBe(3)
  expect(current.huaji.awakened).toBeNull()
  expect(wrapper.find('.ledger-submit-overlay.error').exists()).toBe(true)
  await wrapper.get('.ledger-card-cancel').trigger('click')
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('5')
  expect(wrapper.find('.ledger-card-save').exists()).toBe(false)
  expect(wrapper.find('.ledger-submit-overlay').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).toHaveBeenCalledTimes(1)
})


it.each([null, false])('快捷扣料觉醒：五星%s预览只读，确认保留stage25并同步扣料，重复点击只执行一次', async awakened => {
  const current = { level: 100, elite: 17, starLevel: 25, revision: 3, huaji: { owned: true, stage: 25, awakened } }
  getInventoryCurrent.mockImplementation(async ({ entityType }) => entityType === 'agent'
    ? [{ entity_type: 'agent', entries: { op: { count: 120 } } }]
    : [{ entity_type: 'item', entries: { zhuangjinboli: { count: 1 } } }])
  operatorApi.previewOperatorUpgrade.mockResolvedValueOnce({ dimension: 'awakening', available: true, from: 0, to: 1,
    operator_revision: 3, inventory_revision: 8, preview_token: 'awake-preview', requirements: [
      { entity_type: 'agent', id: 'op', required: 100, owned: 120, balance_after: 20 },
      { entity_type: 'item', id: 'zhuangjinboli', required: 1, owned: 1, balance_after: 0 },
    ] })
  let resolve
  operatorApi.executeOperatorUpgrade.mockImplementationOnce(() => new Promise(yes => { resolve = yes }))
  const wrapper = await openCardStarEditor(current, { ...operator, rarity: 4, huajiCapabilities: { awakening_upgrade_supported: true } })
  expect(wrapper.get('.ledger-heart-stock').text()).toBe('120/100')
  await wrapper.get('.ledger-heart-stock').trigger('click'); await flushPromises()
  expect(operatorApi.previewOperatorUpgrade).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc', dimension: 'awakening', target: 1, expectedOperatorRevision: 3 }))
  expect(wrapper.get('.ledger-upgrade-popover').text()).toContain('觉醒')
  expect(wrapper.get('.ledger-upgrade-popover').text()).toContain('装金玻璃')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
  const confirm = wrapper.findAll('.ledger-upgrade-popover button').find(button => button.text() === '确认觉醒并扣除库存')
  await confirm.trigger('click')
  await confirm.trigger('click')
  expect(operatorApi.executeOperatorUpgrade).toHaveBeenCalledTimes(1)
  expect(operatorApi.executeOperatorUpgrade.mock.lastCall[0]).toMatchObject({ dimension: 'awakening', target: 1, expectedOperatorRevision: 3, expectedInventoryRevision: 8, previewToken: 'awake-preview' })
  resolve({ transaction_id: 'awake-tx', operator: { ...current, star_level: 25, revision: 4, huaji: { ...current.huaji, awakened: true } }, consumed: [
    { entity_type: 'agent', id: 'op', balance_after: 20 }, { entity_type: 'item', id: 'zhuangjinboli', balance_after: 0 },
  ] })
  await flushPromises()
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('已觉醒')
  expect(wrapper.find('.ledger-heart-stock').exists()).toBe(false)
  expect(wrapper.find('.ledger-upgrade-popover').exists()).toBe(false)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it.each(['op', 'zhuangjinboli'])('快捷扣料觉醒：%s不足时展示缺口且不能确认', async missing => {
  const current = { level: 100, elite: 17, starLevel: 25, revision: 3, huaji: { owned: true, stage: 25, awakened: false } }
  operatorApi.previewOperatorUpgrade.mockResolvedValueOnce({ dimension: 'awakening', available: false, from: 0, to: 1,
    operator_revision: 3, inventory_revision: 8, preview_token: 'lack-preview', requirements: [
      { entity_type: 'agent', id: 'op', required: 100, owned: missing === 'op' ? 99 : 100, balance_after: missing === 'op' ? -1 : 0 },
      { entity_type: 'item', id: 'zhuangjinboli', required: 1, owned: missing === 'zhuangjinboli' ? 0 : 1, balance_after: missing === 'zhuangjinboli' ? -1 : 0 },
    ] })
  const wrapper = await openCardStarEditor(current, { ...operator, rarity: 5, huajiCapabilities: { awakeningUpgradeSupported: true } })
  await wrapper.get('.ledger-heart-stock').trigger('click'); await flushPromises()
  expect(wrapper.get('.ledger-upgrade-popover .is-lack').text()).toContain(missing === 'op' ? '心纸' : '装金玻璃')
  expect(wrapper.findAll('.ledger-upgrade-popover button').some(button => button.text().includes('确认'))).toBe(false)
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('5')
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})


const awakeningCurrent = () => ({ level: 100, elite: 17, starLevel: 25, revision: 3, huaji: { owned: true, stage: 25, awakened: false } })
const awakeningPreview = () => ({ dimension: 'awakening', available: true, from: 0, to: 1, operator_revision: 3,
  inventory_revision: 8, preview_token: 'awake-preview', requirements: [
    { entity_type: 'agent', id: 'op', required: 100, owned: 100, balance_after: 0 },
    { entity_type: 'item', id: 'zhuangjinboli', required: 1, owned: 1, balance_after: 0 },
  ] })
const awakeningCatalog = { ...operator, rarity: 4, huajiCapabilities: { awakening_upgrade_supported: true } }
const awakeningConfirm = wrapper => wrapper.findAll('.ledger-upgrade-popover button').find(button => button.text() === '确认觉醒并扣除库存')

it.each(['operator_state_stale', 'inventory_state_stale'])('快捷扣料觉醒：%s刷新预览后要求再次确认，不自动重扣', async code => {
  const current = awakeningCurrent()
  operatorApi.previewOperatorUpgrade.mockResolvedValue(awakeningPreview())
  operatorApi.executeOperatorUpgrade.mockRejectedValueOnce(Object.assign(new Error('stale'), { code }))
  const wrapper = await openCardStarEditor(current, awakeningCatalog)
  await wrapper.get('.ledger-heart-stock').trigger('click'); await flushPromises()
  await awakeningConfirm(wrapper).trigger('click'); await flushPromises()
  expect(operatorApi.executeOperatorUpgrade).toHaveBeenCalledTimes(1)
  expect(operatorApi.previewOperatorUpgrade).toHaveBeenCalledTimes(2)
  expect(awakeningConfirm(wrapper).exists()).toBe(true)
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('5')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it('快捷扣料觉醒：服务错误保留状态，重试沿用同一幂等键', async () => {
  const current = awakeningCurrent()
  operatorApi.previewOperatorUpgrade.mockResolvedValue(awakeningPreview())
  operatorApi.executeOperatorUpgrade.mockRejectedValue(new Error('synthetic failure'))
  const wrapper = await openCardStarEditor(current, awakeningCatalog)
  await wrapper.get('.ledger-heart-stock').trigger('click'); await flushPromises()
  await awakeningConfirm(wrapper).trigger('click'); await flushPromises()
  await awakeningConfirm(wrapper).trigger('click'); await flushPromises()
  expect(operatorApi.executeOperatorUpgrade.mock.calls[1][0].idempotencyKey).toBe(operatorApi.executeOperatorUpgrade.mock.calls[0][0].idempotencyKey)
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('5')
  expect(wrapper.find('.ledger-upgrade-popover').exists()).toBe(true)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})

it.each(['preview', 'execute'])('快捷扣料觉醒：%s响应迟到不更新新账号', async phase => {
  const current = awakeningCurrent()
  let resolve
  const pending = new Promise(yes => { resolve = yes })
  operatorApi.previewOperatorUpgrade.mockResolvedValue(awakeningPreview())
  if (phase === 'preview') operatorApi.previewOperatorUpgrade.mockReturnValueOnce(pending)
  else operatorApi.executeOperatorUpgrade.mockReturnValueOnce(pending)
  const wrapper = await openCardStarEditor(current, awakeningCatalog)
  await wrapper.get('.ledger-heart-stock').trigger('click'); await flushPromises()
  if (phase === 'execute') await awakeningConfirm(wrapper).trigger('click')
  activeAccount.id = 'account-b'; await flushPromises()
  resolve(phase === 'preview' ? awakeningPreview() : { transaction_id: 'old-account',
    operator: { ...current, huaji: { ...current.huaji, awakened: true }, revision: 4 }, consumed: [{ entity_type: 'agent', id: 'op', balance_after: 0 }] })
  await flushPromises()
  expect(wrapper.find('.ledger-upgrade-popover').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('已提升并扣除库存')
  expect(wrapper.get('.agent-ledger-card').text()).not.toContain('已觉醒')
  expect(operatorApi.executeOperatorUpgrade).toHaveBeenCalledTimes(phase === 'execute' ? 1 : 0)
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
})


it.each([24, 25])('快捷觉醒通知：同步stage%s的状态与两种库存，重复通知不写库，其他账号通知忽略', async stage => {
  const current = { ...awakeningCurrent(), starLevel: stage, huaji: { owned: true, stage, awakened: false } }
  getInventoryCurrent.mockImplementation(async ({ entityType }) => entityType === 'agent'
    ? [{ entity_type: 'agent', entries: { op: { count: 120 } } }]
    : [{ entity_type: 'item', entries: { zhuangjinboli: { count: 1 } } }])
  const wrapper = await openCardStarEditor(current, awakeningCatalog)
  const event = { event: 'operator-upgrade', data: { account_id: 'acc', transaction_id: 'other-tab-awake',
    operator_id: 'op', dimension: 'awakening', from: 0, to: 1, operator_revision: 4, inventory_revision: 9,
    consumed: [{ entity_type: 'agent', id: 'op', balance_after: 20 }, { entity_type: 'item', id: 'zhuangjinboli', balance_after: 0 }],
  } }
  const handler = subscribeAccountEvents.mock.calls.at(-1)[0]
  handler({ ...event, data: { ...event.data, account_id: 'account-b' } }); await flushPromises()
  expect(wrapper.get('.ledger-huaji-value').text()).not.toBe('已觉醒')
  handler(event); await flushPromises()
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('已觉醒')
  expect(wrapper.find('.ledger-heart-stock').exists()).toBe(false)
  handler(event); await flushPromises()
  expect(wrapper.get('.ledger-huaji-value').text()).toBe('已觉醒')
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  // 人工校正回五星不扣料，库存应保留事件回传余额。
  await wrapper.get('[aria-label="快捷设置星级与觉醒"]').setValue('5')
  expect(wrapper.get('.ledger-heart-stock').text()).toBe('20/100')
})


it.each(['catalog', 'current', 'tracking'])('查看他人 BOX 全流程后保留名册 %s 标签、筛选、实例、账号及滚动', async tab => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(560)
  operatorApi.getOperatorCurrent.mockResolvedValue([{ entries: { op: { level: 90, elite: 15, star_level: 1 } } }])
  operatorApi.viewOperatorShare.mockResolvedValue({ game: '如鸢', entries: { op: { level: 50 } } })
  const wrapper = renderPage({ attachTo: document.body })
  await flushPromises()
  const search = wrapper.get('.catalog-tools input[type="search"]')
  await search.setValue('测试密探')
  await wrapper.get('.catalog-tools .dossier-more').trigger('click')
  await wrapper.get('.catalog-tools .rarity-filter button:last-child').trigger('click')
  await wrapper.get('#operator-tab-' + tab).trigger('click'); await flushPromises()
  const catalog = wrapper.get('#operator-panel-catalog').element
  const before = catalog.innerHTML
  const selected = wrapper.get('#operator-tab-' + tab)
  const entry = wrapper.get('.roster-view-box')
  entry.element.focus()
  navigation.push.mockClear(); navigation.replace.mockClear()
  await entry.trigger('click'); await flushPromises()
  expect(entry.attributes('aria-expanded')).toBe('true')
  const modal = new DOMWrapper(document.getElementById('operator-box-viewer'))
  await modal.get('input').setValue('https://yuan.example/operator/share/test-code')
  await modal.get('form').trigger('submit'); await flushPromises()
  expect(modal.get('article[role="listitem"]').text()).toContain('测试密探')
  await modal.get('[aria-label="关闭查看他人 BOX"]').trigger('click'); await flushPromises()
  expect(document.getElementById('operator-box-viewer')).toBeNull()
  expect(entry.attributes('aria-expanded')).toBe('false')
  expect(selected.attributes('aria-selected')).toBe('true')
  expect(wrapper.get('#operator-panel-catalog').element).toBe(catalog)
  expect(catalog.innerHTML).toBe(before)
  expect(search.element.value).toBe('测试密探')
  expect(document.activeElement).toBe(entry.element)
  expect(window.scrollTo).toHaveBeenLastCalledWith(0, 560)
  expect(activeAccount.id).toBe('acc')
  expect(activeAccount.set).not.toHaveBeenCalled()
  expect(navigation.push).not.toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled()
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
  expect(operatorApi.putOperatorGrowthTarget).not.toHaveBeenCalled()
})


it('90级突破独立读回，改等级再返回保留明确选择，不重签旧观测', async () => {
  const wrapper = await openEditor({ level: 90, elite: 15, revision: 7, level_breakthrough_stage: 9,
    huaji: { owned: true, stage: 1, awakened: false }, combat_stats: { observed_attack: 1234,
      observed_status: 'unverified', observed_inputs: { level: 90, level_breakthrough_stage: null } } })
  const checkbox = () => wrapper.get('.editor-panel .level-breakthrough-check input')
  expect(checkbox().element.checked).toBe(true)
  await checkbox().setValue(false)
  await wrapper.get('.editor-panel .level-row input[max="100"]').setValue(91)
  expect(wrapper.find('.editor-panel .level-breakthrough-check').exists()).toBe(false)
  await wrapper.get('.editor-panel .level-row input[max="100"]').setValue(90)
  expect(checkbox().element.checked).toBe(false)
  expect(checkbox().element.indeterminate).toBe(false)
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  const patch = operatorApi.patchOperatorCurrent.mock.lastCall[0].patch
  expect(patch).toMatchObject({ level: 90, level_breakthrough_stage: 8, expected_revision: 7 })
  expect(patch.combat_stats).not.toHaveProperty('observed_inputs')
  expect(patch.combat_stats).not.toHaveProperty('combat_input_signature')
  expect(operatorApi.executeOperatorUpgrade).not.toHaveBeenCalled()
})

it.each([undefined, 'base'])('历史未知突破在标签/等级切换后仍未知，普通/SP保存不推断', async spOf => {
  const wrapper = await openEditor({ level: 90, elite: 15, revision: 3, level_breakthrough_stage: null,
    huaji: { owned: true, stage: null, awakened: null } }, { ...operator, sp_of: spOf })
  const level = wrapper.get('.editor-panel .level-row input[max="100"]')
  expect(wrapper.get('.level-breakthrough-check input').element.indeterminate).toBe(true)
  await level.setValue(89)
  expect(wrapper.find('.level-breakthrough-check').exists()).toBe(false)
  await level.setValue(90)
  await wrapper.get('#operator-editor-tab-discs').trigger('click')
  await wrapper.get('#operator-editor-tab-growth').trigger('click')
  expect(wrapper.get('.level-breakthrough-check').text()).toContain('待核对')
  expect(wrapper.get('.level-breakthrough-check input').element.indeterminate).toBe(true)
  operatorApi.patchOperatorCurrent.mockRejectedValueOnce(new Error('synthetic save failure'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch).toMatchObject({ level: 90, level_breakthrough_stage: null })
  expect(operatorApi.patchOperatorCurrent.mock.lastCall[0].patch).not.toHaveProperty('huaji')
})

it('只修改星石也会在取消时确认，拒绝放弃保留原草稿', async () => {
  getCurrentStarState.mockResolvedValue({ generation: 0, entries: [{ instance_id: 'stone-a', kind: 'main', name: '天府', level: 10 }] })
  const wrapper = await openEditor({ level: 90, elite: 15, star_level: 1 })
  expect(wrapper.get('.editor-save').element.disabled).toBe(true)
  const starEditor = wrapper.getComponent({ name: 'StarLoadoutEditor' })
  starEditor.vm.$emit('update:draft-loadouts', { op: { main1: 'stone-a' } })
  await flushPromises()
  expect(wrapper.get('.editor-save').element.disabled).toBe(false)
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('.editor-cancel').trigger('click'); await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledOnce()
  expect(wrapper.find('.editor-panel').exists()).toBe(true)
  expect(starEditor.props('draftLoadouts').op.main1).toBe('stone-a')
  expect(operatorApi.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(putCurrentStarLoadout).not.toHaveBeenCalled()
})


it('信赖与传闻在名册内懒加载，草稿阻止取消的页签切换', async () => {
  operatorApi.getOperatorCurrent.mockResolvedValue([{ account_id: 'acc', game: '如鸢', entries: { op: { elite: 1, level: 1, star_level: 1, huaji: { owned: true, stage: 1, awakened: false } } } }])
  relationshipApi.getRelationshipCatalog.mockResolvedValue({ game: '如鸢', version: 'test', operators: {} })
  relationshipApi.getRelationships.mockResolvedValue({ account_id: 'acc', game: '如鸢', catalog_version: 'test', revision: 0, entries: {} })
  const wrapper = renderPage(); await flushPromises()
  await wrapper.get('#operator-tab-current').trigger('click'); await flushPromises()
  expect(relationshipApi.getRelationships).not.toHaveBeenCalled()
  await wrapper.get('#operator-tab-relationships').trigger('click'); await flushPromises()
  expect(wrapper.get('#operator-tab-relationships').attributes('aria-selected')).toBe('true')
  expect(wrapper.get('#operator-panel-relationships').text()).toContain('信赖与传闻')
  expect(relationshipApi.getRelationships).toHaveBeenCalledWith('acc')
  const panel = wrapper.get('#operator-panel-relationships')
  expect(panel.findAll('.operator-filter-dossier')).toHaveLength(1)
  expect(panel.find('.relationships-summary').exists()).toBe(false)
  expect(panel.find('.relationships-filters').exists()).toBe(false)
  await panel.get('input[type="search"]').setValue('不存在的密探')
  expect(panel.findAll('.relationship-card')).toHaveLength(0)
  expect(panel.text()).toContain('没有符合筛选的密探')
  expect(wrapper.get('#operator-panel-current input[type="search"]').element.value).toBe('不存在的密探')
  await panel.get('.current-filter-reset').trigger('click')
  expect(panel.findAll('.relationship-card')).toHaveLength(1)
  expect(panel.find('.relationships-exchange').exists()).toBe(false)
  const backupEntry = wrapper.findAll('.tool-more button').find(button => button.text() === '信赖与传闻备份')
  expect(backupEntry).toBeTruthy()
  await backupEntry.trigger('click'); await flushPromises()
  const backupDialog = new DOMWrapper(document.body)
  expect(backupDialog.get('[role="dialog"]').text()).toContain('信赖与传闻备份')
  await backupDialog.get('[aria-label="关闭信赖备份"]').trigger('click'); await flushPromises()
  const edit = panel.find('.relationship-edit')
  expect(edit).toBeTruthy()
  await edit.trigger('click'); await flushPromises()
  await new DOMWrapper(document.body).get('.relationship-editor input').setValue('100')
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('#operator-tab-current').trigger('click'); await flushPromises()
  expect(wrapper.get('#operator-tab-relationships').attributes('aria-selected')).toBe('true')
  dialog.confirm.mockResolvedValueOnce(true)
  await wrapper.get('#operator-tab-current').trigger('click'); await flushPromises()
  expect(wrapper.get('#operator-tab-current').attributes('aria-selected')).toBe('true')
})


it.each([
  ['普通用户', true, []],
  ['内测用户', true, ['unrelated:beta']],
  ['历史使用角色', true, []],
  ['未登录的旧权限缓存', false, ['operator_relationship:use']],
])('%s 的旧页签和链接不会挂载信赖与传闻或发起请求', async (_, loggedIn, permissions) => {
  auth.isLoggedIn = loggedIn
  auth.adminAccess = { roles: ['ARCHIVE_USER', 'OPERATOR_PANEL_USER'], permissions }
  localStorage.setItem('operator-tabs', 'relationships')
  navigation.query = { tab: 'relationships' }
  const wrapper = renderPage(); await flushPromises()
  expect(wrapper.find('#operator-tab-relationships').exists()).toBe(false)
  expect(wrapper.find('#operator-panel-relationships').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('信赖与传闻备份')
  expect(wrapper.get('#operator-tab-catalog').attributes('aria-selected')).toBe('true')
  expect(relationshipApi.getRelationshipCatalog).not.toHaveBeenCalled()
  expect(relationshipApi.getRelationships).not.toHaveBeenCalled()
  expect(relationshipApi.patchRelationships).not.toHaveBeenCalled()
})

it('管理员信赖权限撤销时卸载面板并返回图鉴', async () => {
  relationshipApi.getRelationshipCatalog.mockResolvedValue({ game: '如鸢', version: 'test', operators: {} })
  relationshipApi.getRelationships.mockResolvedValue({ account_id: 'acc', game: '如鸢', revision: 0, entries: {} })
  const wrapper = renderPage(); await flushPromises()
  await wrapper.get('#operator-tab-relationships').trigger('click'); await flushPromises()
  expect(relationshipApi.getRelationships).toHaveBeenCalledWith('acc')
  auth.adminAccess = { permissions: [] }
  await flushPromises()
  expect(wrapper.find('#operator-tab-relationships').exists()).toBe(false)
  expect(wrapper.find('#operator-panel-relationships').exists()).toBe(false)
  expect(wrapper.get('#operator-tab-catalog').attributes('aria-selected')).toBe('true')
  expect(relationshipApi.patchRelationships).not.toHaveBeenCalled()
})
