import { getMailboxDailyStatus } from '../src/api/mailboxReserve.js'
import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import TodayPage from '../src/pages/today/index.vue'
import RewardEntryWorkspace from '../src/components/inventory/RewardEntryWorkspace.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { getOperatorCurrent } from '../src/api/operator.js'
import { getCurrent, importInventory } from '../src/api/inventory.js'
import { getRewardCatalog } from '../src/api/rewardCatalog.js'
import { getDrawResources, recordDrawResources } from '../src/api/drawResources.js'
import { getTrainingWorkspace } from '../src/api/operatorPlanner.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { dialog } from '../src/utils/dialog.js'
import { deferred } from '../test-support/factories.js'
import { installViewport } from '../test-support/viewport.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, accessToken: 'test-only', userInfo: { id: 'owner' } }) }
})
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCurrent: vi.fn(), getOperatorCatalog: vi.fn(async () => ({ operators: [] })) }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), importInventory: vi.fn(), listRecords: vi.fn(), previewRewardAnnotations: vi.fn(), annotateRewards: vi.fn() }))
vi.mock('../src/api/rewardCatalog.js', () => ({ getRewardCatalog: vi.fn() }))
vi.mock('../src/api/drawResources.js', () => ({ getDrawResources: vi.fn(), recordDrawResources: vi.fn() }))
vi.mock('../src/api/operatorPlanner.js', () => ({ getTrainingWorkspace: vi.fn(), putTrainingWorkspace: vi.fn() }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/todayPreferences.js', () => ({ getTodayPreferences: vi.fn(async mode => ({ layout_mode: mode, schema_version: 1, version: 0, hidden_modules: [] })), saveTodayPreferences: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const accounts = [{ id: 'a', name: '测试大号', game: '代号鸢' }, { id: 'b', name: '测试小号', game: '如鸢' }]
const receipt = { accepted: 1, duplicates: 0, history_only: 0, superseded: 0, warnings: [] }
const panel = () => document.querySelector('#reward-entry-panel')
const bodyButton = text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text)
async function click(element) { expect(element).toBeTruthy(); element.click(); await flushPromises() }
async function input(element, value) { element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises() }
async function closeRecord() { await click(panel().querySelector('.close-button')) }
async function addReward(wrapper) {
  await wrapper.get('.today-record').trigger('click'); await flushPromises()
  await click(document.querySelector('[aria-label^="添加白金币"]'))
  await input(document.querySelector('[aria-label="白金币数量"]'), '25')
}
async function switchAccount(wrapper, id = 'b') {
  await wrapper.get('.account-switcher .context-selector').trigger('click'); await flushPromises()
  await click(document.querySelector(`[data-account-id="${id}"]`))
}
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: TodayPage }, { path: '/:pathMatch(.*)*', component: { template: '<p>其他页面</p>' } }
  ] })
  await router.push('/'); await router.isReady()
  const wrapper = mount({ template: '<router-view />' }, { attachTo: document.body, global: {
    plugins: [createPinia(), router], stubs: {
      IslandSidebar: true, TutorialEntry: true, OnboardingGuide: true, TodayPreferencesPanel: true,
      TodayHighlights: true, TodaySubscriptionSummary: true, TodayTrainingPlans: true,
      TodayActivitySummary: true, TodayPrivateItems: true
    }
  } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  vi.clearAllMocks()
  installViewport(390)
  auth.isLoggedIn = true; auth.accessToken = 'test-only'; auth.userInfo = { id: 'owner' }
  activeAccount.clear()
  listAccounts.mockResolvedValue(accounts)
  getOperatorCurrent.mockResolvedValue({ entries: {} })
  getCurrent.mockResolvedValue([])
  getCurrentStarState.mockResolvedValue({ inventory: [] })
  getRewardCatalog.mockResolvedValue([{ id: 'baijinbi', entity_type: 'item', name: '白金币', rarity: 3 }])
  getTrainingWorkspace.mockImplementation(async account => ({ account_id: account, schema_version: 1, revision: 0, plans: [], active_plan_id: null }))
  importInventory.mockResolvedValue(receipt)
  getDrawResources.mockImplementation(async account => ({ account_id: account, game: accounts.find(row => row.id === account).game, inventory_revision: 7, balances: { baijinbi: 4000, fuchuan: 20, tianjifuchuan: 0, zhuyu: 3 } }))
  recordDrawResources.mockImplementation(async body => ({ account_id: body.account_id, record_id: `yuanhub:draw:${body.operation_id}`, entries: [] }))
  dialog.confirm.mockResolvedValue(true)
})

it('首次浏览只读，不挂载录入器；记一笔位于自定义首页前并保留账号区域', async () => {
  const { wrapper } = await render()
  expect(wrapper.get('.today-actions').findAll('button').map(button => button.text())).toEqual(['记一笔'])
  expect(wrapper.get('[aria-label="自定义首页"]').attributes('aria-haspopup')).toBe('dialog')
  expect(wrapper.get('.lobby-context').text()).toContain('测试大号')
  expect(wrapper.findComponent(RewardEntryWorkspace).exists()).toBe(false)
  expect(getRewardCatalog).not.toHaveBeenCalled()
  expect(getDrawResources).not.toHaveBeenCalled()
  expect(importInventory).not.toHaveBeenCalled()
  expect(recordDrawResources).not.toHaveBeenCalled()
})

it.each(['guest', 'empty', 'accounts-loading', 'accounts-error', 'inventory-error'])('%s 不允许误记账，显示现有引导或失败提示', async state => {
  if (state === 'guest') auth.isLoggedIn = false
  if (state === 'empty') listAccounts.mockResolvedValue([])
  if (state === 'accounts-loading') listAccounts.mockReturnValue(deferred().promise)
  if (state === 'accounts-error') listAccounts.mockRejectedValue(new Error('账号读取失败'))
  if (state === 'inventory-error') getCurrent.mockRejectedValue(new Error('库存读取失败'))
  const { wrapper } = await render()
  if (state === 'guest') expect(wrapper.find('.today-record').exists()).toBe(false)
  else expect(wrapper.get('.today-record').element.disabled).toBe(true)
  expect(wrapper.findComponent(RewardEntryWorkspace).exists()).toBe(false)
  expect(importInventory).not.toHaveBeenCalled()
})

it('库存读取失败重试恢复，星石失败不阻止已有库存记账', async () => {
  getCurrent.mockRejectedValueOnce(new Error('库存读取失败'))
  getCurrentStarState.mockRejectedValue(new Error('星石读取失败'))
  const { wrapper } = await render()
  expect(wrapper.get('.today-record').element.disabled).toBe(true)
  await wrapper.get('.today-alert button').trigger('click'); await flushPromises()
  expect(wrapper.get('.today-record').element.disabled).toBe(false)
  await addReward(wrapper)
  expect(panel().textContent).toContain('测试大号')
  expect(bodyButton('获得').getAttribute('aria-pressed')).toBe('true')
})

it('首页获得写入当前账号，成功刷新资料，关闭恢复入口焦点且不跳转', async () => {
  const { wrapper, router } = await render()
  expect(wrapper.find('.data-onboarding').exists()).toBe(true)
  await addReward(wrapper)
  getCurrent.mockResolvedValue([{ account_id: 'a', entity_type: 'item', entries: { baijinbi: { count: 25 } } }])
  const reads = getCurrent.mock.calls.length
  await click(document.querySelector('.preview-button'))
  expect(importInventory).toHaveBeenCalledTimes(1)
  expect(importInventory.mock.lastCall[0].records[0]).toMatchObject({ account_id: 'a', record_type: 'reward_delta', entries: [{ id: 'baijinbi', count: 25 }] })
  expect(getCurrent.mock.calls.length).toBe(reads + 1)
  expect(panel().textContent).toContain('奖励已入簿')
  expect(wrapper.find('.data-onboarding').exists()).toBe(false)
  await closeRecord()
  expect(panel()).toBeNull()
  expect(document.activeElement).toBe(wrapper.get('.today-record').element)
  expect(router.currentRoute.value.path).toBe('/')
})

it.each(['使用', '兑换'])('首页%s接入原命令与当前账号，重复提交被拦截，成功后刷新', async operation => {
  const { wrapper } = await render()
  await wrapper.get('.today-record').trigger('click'); await flushPromises()
  await click(bodyButton(operation))
  await input(document.querySelector('[aria-label="符传数量"]'), '2')
  const pending = deferred()
  recordDrawResources.mockReturnValueOnce(pending.promise)
  await click(bodyButton('确认记账'))
  expect(recordDrawResources).toHaveBeenCalledTimes(1)
  const [body, owner] = recordDrawResources.mock.lastCall
  expect(body).toMatchObject({ account_id: 'a', game: '代号鸢', action: operation === '使用' ? 'use' : 'exchange', quantity: 2, expected_inventory_revision: 7 })
  expect(owner).toBe('owner')
  expect(wrapper.get('.account-switcher .context-selector').element.disabled).toBe(true)
  await click(bodyButton('正在记账…'))
  expect(recordDrawResources).toHaveBeenCalledTimes(1)
  const reads = getCurrent.mock.calls.length
  pending.resolve({ account_id: 'a', record_id: `yuanhub:draw:${body.operation_id}`, entries: [] }); await flushPromises()
  expect(getCurrent.mock.calls.length).toBe(reads + 1)
  expect(panel().textContent).toContain('已记录')
  expect(wrapper.get('.account-switcher .context-selector').element.disabled).toBe(false)
})

it('未知获得结果锁定关闭/切号/离开，原文档重试确认成功后解锁', async () => {
  const { wrapper, router } = await render()
  await addReward(wrapper)
  importInventory.mockRejectedValueOnce(new Error('网络中断'))
  await click(document.querySelector('.preview-button'))
  const documentBody = JSON.stringify(importInventory.mock.lastCall[0])
  expect(wrapper.get('.account-switcher .context-selector').element.disabled).toBe(true)
  await closeRecord()
  expect(panel()).not.toBeNull()
  await router.push('/away'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/')
  await click(bodyButton('原样重试补录'))
  expect(importInventory).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(importInventory.mock.lastCall[0])).toBe(documentBody)
  expect(wrapper.get('.account-switcher .context-selector').element.disabled).toBe(false)
})

it('关闭保留获得草稿；取消切号保留输入，确认切号后使用新账号且清空旧草稿', async () => {
  const { wrapper } = await render()
  await addReward(wrapper); await closeRecord()
  dialog.confirm.mockResolvedValueOnce(false)
  await switchAccount(wrapper)
  expect(activeAccount.id).toBe('a')
  await wrapper.get('.today-record').trigger('click'); await flushPromises()
  expect(document.querySelector('[aria-label="白金币数量"]').value).toBe('25')
  await closeRecord(); await switchAccount(wrapper)
  expect(activeAccount.id).toBe('b')
  await wrapper.get('.today-record').trigger('click'); await flushPromises()
  expect(document.querySelector('.basket-list')).toBeNull()
  await addReward(wrapper)
  expect(panel().textContent).toContain('测试小号')
  await click(document.querySelector('.preview-button'))
  expect(importInventory.mock.lastCall[0].records[0].account_id).toBe('b')
})

it('获得草稿在离开首页前确认，拒绝时继续留在原弹窗', async () => {
  const { wrapper, router } = await render()
  await addReward(wrapper)
  dialog.confirm.mockResolvedValueOnce(false)
  await router.push('/away'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/')
  expect(document.querySelector('[aria-label="白金币数量"]').value).toBe('25')
  await router.push('/away'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/away')
  expect(panel()).toBeNull()
})

it('使用草稿关闭前确认，拒绝保留数量；取消交易确认不写入', async () => {
  const { wrapper } = await render()
  await wrapper.get('.today-record').trigger('click'); await flushPromises()
  await click(bodyButton('使用'))
  await input(document.querySelector('[aria-label="符传数量"]'), '3')
  dialog.confirm.mockResolvedValueOnce(false)
  await closeRecord()
  expect(document.querySelector('[aria-label="符传数量"]').value).toBe('3')
  dialog.confirm.mockResolvedValueOnce(false)
  await click(bodyButton('确认记账'))
  expect(recordDrawResources).not.toHaveBeenCalled()
  expect(wrapper.get('.account-switcher .context-selector').element.disabled).toBe(false)
  await closeRecord()
  expect(panel()).toBeNull()
  expect(document.activeElement).toBe(wrapper.get('.today-record').element)
})

it('库存读取完成前禁用入口；账号被清空后卸载草稿，迟到目录不恢复录入', async () => {
  const inventory = deferred()
  getCurrent.mockReturnValueOnce(inventory.promise)
  const { wrapper } = await render()
  expect(wrapper.get('.today-record').element.disabled).toBe(true)
  inventory.resolve([]); await flushPromises()
  expect(wrapper.get('.today-record').element.disabled).toBe(false)
  const catalog = deferred()
  getRewardCatalog.mockReturnValueOnce(catalog.promise)
  await wrapper.get('.today-record').trigger('click'); await flushPromises()
  expect(panel().textContent).toContain('正在准备奖励目录')
  activeAccount.clear(); await flushPromises()
  catalog.resolve([{ id: 'baijinbi', entity_type: 'item', name: '白金币', rarity: 3 }]); await flushPromises()
  expect(panel()).toBeNull()
  expect(wrapper.get('.today-record').element.disabled).toBe(true)
  expect(importInventory).not.toHaveBeenCalled()
})

it('切号确认期间身份失效，迟到确认不激活目标账号', async () => {
  const { wrapper } = await render()
  await addReward(wrapper); await closeRecord()
  const confirmation = deferred()
  dialog.confirm.mockReturnValueOnce(confirmation.promise)
  await switchAccount(wrapper)
  auth.isLoggedIn = false; auth.userInfo = null; auth.accessToken = ''; await flushPromises()
  confirmation.resolve(true); await flushPromises()
  expect(activeAccount.id).not.toBe('b')
  expect(wrapper.find('.today-record').exists()).toBe(false)
  expect(importInventory).not.toHaveBeenCalled()
})

it('同一用户令牌续期保留在途记录，回执仍可确认且不会重建账号', async () => {
  const { wrapper } = await render()
  await addReward(wrapper)
  const pending = deferred()
  importInventory.mockReturnValueOnce(pending.promise)
  await click(document.querySelector('.preview-button'))
  const editor = panel(), accountReads = listAccounts.mock.calls.length
  auth.accessToken = 'renewed-test-token'; await flushPromises()
  expect(panel()).toBe(editor)
  expect(listAccounts.mock.calls.length).toBe(accountReads)
  expect(wrapper.get('.account-switcher .context-selector').element.disabled).toBe(true)
  pending.resolve(receipt); await flushPromises()
  expect(panel().textContent).toContain('奖励已入簿')
  expect(importInventory).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.account-switcher .context-selector').element.disabled).toBe(false)
})

it.each(['account', 'identity', 'unmount'])('%s 变化后迟到的获得回执不刷新新上下文或恢复旧弹窗', async change => {
  const { wrapper } = await render()
  await addReward(wrapper)
  const pending = deferred()
  importInventory.mockReturnValueOnce(pending.promise)
  await click(document.querySelector('.preview-button'))
  if (change === 'account') activeAccount.set('b')
  if (change === 'identity') { auth.userInfo = { id: 'other-owner' }; auth.accessToken = 'other-token' }
  if (change === 'unmount') wrapper.unmount()
  await flushPromises()
  const reads = getCurrent.mock.calls.length
  pending.resolve(receipt); await flushPromises()
  expect(getCurrent.mock.calls.length).toBe(reads)
  expect(panel()).toBeNull()
  expect(document.querySelector('.result')).toBeNull()
})

vi.mock('../src/api/mailboxReserve.js', () => ({ getMailboxDailyStatus: vi.fn(async () => ({ monthly_claimed: false, monthly_coins: null })) }))
beforeEach(() => { getMailboxDailyStatus.mockResolvedValue({ monthly_claimed: false, monthly_coins: null }) })
