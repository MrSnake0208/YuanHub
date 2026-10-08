import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import OnboardingGuide from '../src/components/OnboardingGuide.vue'
import OperatorPage from '../src/pages/operator/index.vue'
import QuickPage from '../src/pages/operator/quick.vue'
import ProfilePage from '../src/pages/user/profile.vue'
import InventoryPage from '../src/pages/inventory/index.vue'
import TodayPage from '../src/pages/today/index.vue'
import AppDialog from '../src/components/AppDialog.vue'
import { useOnboardingStore, onboardingStorageKey } from '../src/stores/onboarding.js'
import { initializeOnboardingTour, startOnboardingTask, refreshTutorialBusiness } from '../src/utils/onboardingTour.js'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import * as accountsApi from '../src/api/accounts.js'
import * as connectionApi from '../src/api/openApi.js'
import * as operatorApi from '../src/api/operator.js'
import * as inventoryApi from '../src/api/inventory.js'
import * as starApi from '../src/api/starState.js'
import { starLoadoutPresetStore } from '../src/domain/starLoadoutPresets.js'
import { operatorCurrentRead, publishOperatorCurrentRead } from '../src/utils/operatorEvents.js'
import { accountListChange } from '../src/store/accountList.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn() }))
vi.mock('../src/api/operator.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/inventory.js', async importOriginal => ({ ...(await importOriginal()), getCurrent: vi.fn(), importInventory: vi.fn(), getCatalog: vi.fn(), listRecords: vi.fn(), getAcquired: vi.fn(), listAgentFavorites: vi.fn().mockResolvedValue({ agent_ids: [] }) }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn().mockResolvedValue({ generation: 0, entries: [] }) }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn().mockResolvedValue({ generation: 0, revision: 0, loadouts: {} }), putCurrentStarLoadout: vi.fn() }))
vi.mock('../src/api/openApi.js', () => ({
  getConnectionFirstSync: vi.fn(), getOpenApiPermissions: vi.fn().mockResolvedValue([]), getOpenApiTokens: vi.fn().mockResolvedValue([]),
  generateOpenApiToken: vi.fn(), getOpenApiTokenSecret: vi.fn(), updateOpenApiTokenScopes: vi.fn(), deleteOpenApiToken: vi.fn()
}))
vi.mock('../src/api/request.js', () => ({ avatarUrl: value => value || '' }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  const auth = reactive({ accessToken: 'synthetic-token', userInfo: { id: 'owner' }, get isLoggedIn() { return !!this.accessToken } })
  return { auth }
})
vi.mock('../src/store/beta.js', () => ({ beta: { canUseBetaFeatures: true, loadMe: () => Promise.resolve(), campaign: { accessMode: 'OPEN' } } }))
const eventCallbacks = vi.hoisted(() => new Set())
vi.mock('../src/store/accountEvents.js', () => ({ setInventoryToastFavoriteAgentIds: vi.fn(), subscribeAccountEvents: listener => { eventCallbacks.add(listener); return () => eventCallbacks.delete(listener) } }))

let accounts, current, stock, host
const account = { id: 'acc', name: '真实组件测试账号', game: '如鸢' }
const entry = { star_level: 1, level: 25, elite: 3 }
const stored = () => [{ account_id: 'acc', game: '如鸢', entries: { op: { ...entry } } }]
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

beforeEach(() => {
  if (dialog._state.visible) dialog._cancel()
  vi.clearAllMocks()
  connectionApi.getOpenApiTokens.mockResolvedValue([])
  connectionApi.getConnectionFirstSync.mockImplementation(async id => ({ connection_id: id, account_id: 'acc', synced: false, data_type: 'inventory' }))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } })
  Element.prototype.scrollIntoView = vi.fn()
  auth.accessToken = 'synthetic-token'; auth.userInfo = { id: 'owner' }
  accounts = [{ ...account }]; current = []
  stock = []
  inventoryApi.getCurrent.mockImplementation(async () => stock)
  inventoryApi.importInventory.mockImplementation(async doc => {
    stock = [{ account_id: 'acc', entity_type: 'item', full_baseline_at: doc.records[0].effective_at || doc.records[0].effectiveAt, entries: {} }]
    return { accepted: 1, duplicates: 0 }
  })
  inventoryApi.getCatalog.mockResolvedValue({ entities: [] })
  inventoryApi.listRecords.mockResolvedValue({ items: [], next_cursor: null })
  inventoryApi.getAcquired.mockResolvedValue({ acquired: {} })
  starApi.getCurrentStarState.mockResolvedValue({ inventory: [] })
  window.scrollTo = vi.fn()
  activeAccount.set('acc'); activeAccount.games = {}; activeAccount.syncAccounts(accounts)
  operatorCurrentRead.value = null; accountListChange.value = null
  accountsApi.listAccounts.mockImplementation(async () => accounts.map(item => ({ ...item })))
  accountsApi.createAccount.mockImplementation(async (name, game) => { const created = { id: 'acc', name, game }; accounts.push(created); return created })
  operatorApi.listOperatorAccounts.mockImplementation(() => accountsApi.listAccounts())
  operatorApi.getOperatorCurrent.mockImplementation(async () => current)
  operatorApi.getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'op', name: '测试密探', rarity: 3, games: ['如鸢'] }] })
  operatorApi.getOperatorAnnotations.mockResolvedValue({ items: [] })
  operatorApi.listOperatorScanReviews.mockResolvedValue({ items: [] })
  operatorApi.importOperator.mockImplementation(async doc => {
    current = [{ account_id: 'acc', game: '如鸢', entries: Object.fromEntries(doc.records[0].entries.map(item => [item.id, { star_level: item.starLevel, level: item.level, elite: item.elite }])) }]
    return { accepted: 1 }
  })
  vi.spyOn(starLoadoutPresetStore, 'load').mockResolvedValue()
  vi.stubGlobal('matchMedia', vi.fn(() => Object.assign(new EventTarget(), { matches: false })))
})
afterEach(() => { host?.unmount(); host = null })

async function render(path = '/', pinia = createPinia()) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'today', component: TodayPage },
    { path: '/operator', component: OperatorPage }, { path: '/operator/quick', component: QuickPage },
    { path: '/user/profile', component: ProfilePage },
    { path: '/login', component: { template: '<main>真实登录入口</main>' } },
    { path: '/inventory', component: InventoryPage },
    { path: '/star', component: { template: '<main>真实星石业务入口</main>' } },
    { path: '/changelog', component: { template: '<main>帮助页</main>' } },
    { path: '/operator/share', component: { template: '<main />' } }
  ] })
  await router.push(path); await router.isReady()
  host = mount(defineComponent({ components: { OnboardingGuide, AppDialog }, setup() {
    let stop
    onMounted(() => { stop = initializeOnboardingTour(router) })
    onBeforeUnmount(() => stop?.())
    return {}
  }, template: '<OnboardingGuide /><RouterView /><AppDialog />' }), {
    attachTo: document.body, global: { plugins: [pinia, router], directives: { reveal: () => {} }, stubs: {
      IslandSidebar: true, SiteFooter: true, BetaNotice: true, OperatorShareManager: true,
      OperatorGrowthTracker: true, StarLoadoutEditor: true, StarLoadoutModal: true, TodayActivitySummary: true, TodaySubscriptionSummary: true, RewardEntryWorkspace: true
    } }
  })
  await flushPromises()
  return { router, store: useOnboardingStore(pinia) }
}
const guide = () => document.querySelector('.tutorial-guide')
const clickText = async text => {
  const button = [...guide().querySelectorAll('button, a')].find(item => item.textContent === text)
  expect(button, text).toBeTruthy(); button.click(); await flushPromises()
}
async function begin(router, store) {
  store.openTasks(); await nextTick()
  await startOnboardingTask(router, 'operator-first-entry'); await flushPromises()
}
async function enterQuick() {
  const link = [...host.findAll('.operator-entry-guide a')].find(item => item.text() === '开始录入密探')
  await link.trigger('click'); await flushPromises()
  expect(host.findComponent(QuickPage).exists()).toBe(true)
}
async function selectAndSave() {
  const page = host.findComponent(QuickPage)
  await page.get('.op-check').setValue(true)
  const fields = page.findAll('.batch-bar input[type="number"]')
  await fields[0].setValue(25); await fields[1].setValue(3)
  await page.get('.wiz-actions .primary').trigger('click'); await flushPromises()
  expect(document.querySelector('.dialog-title').textContent).toContain('确认保存本页')
  document.querySelector('.dlg-btn.primary').click(); await flushPromises()
}

it('首次邀请可直接使用，不写数据、不标完成、不刷新骚扰；仍可手动开始', async () => {
  const { store } = await render()
  const invitation = host.get('.tool-task-prompt')
  expect(invitation.text()).toContain('跟着做一次')
  await invitation.findAll('button').find(button => button.text() === '直接使用 / 暂时关闭').trigger('click')
  expect(guide()).toBeNull(); expect(store.tutorialCompleted).toBe(false)
  expect(host.get('.tool-task-prompt').find('h2').exists()).toBe(false)
  expect(host.get('.tool-task-prompt').text()).toContain('重新进入 / 继续实操教程')
  expect(store.disableAutoGuide).toBe(false)
  host.unmount(); await render()
  expect(guide()).toBeNull()
  useOnboardingStore().openTasks(); await nextTick()
  expect(guide().textContent).toContain('录入第一位密探')
  expect(accountsApi.createAccount).not.toHaveBeenCalled()
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
})

it('真实名册入口→真实快捷录入→真实确认→服务端读回，自动完成并留下可用档案', async () => {
  const { router, store } = await render(); await begin(router, store)
  expect(store.waitingFor).toBe('operator_saved')
  expect(guide().textContent).not.toMatch(/下一步|完成教程/)
  await enterQuick()
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
  await selectAndSave()
  expect(operatorApi.importOperator).toHaveBeenCalledTimes(1)
  expect(current[0].entries.op).toEqual(entry)
  expect(store.tutorialCompleted).toBe(true)
  expect(store.completedTasks['operator-first-entry']).toMatchObject({ accountId: 'acc', operatorId: 'op', ownerId: 'owner' })
  expect(guide().textContent).toContain('录入结果已验证')
})

it('真实账号表单创建是前置，创建成功自动转为等待密探，不替用户填数据', async () => {
  accounts = []; activeAccount.clear()
  const { router, store } = await render(); await begin(router, store)
  expect(store.waitingFor).toBe('account_created')
  await clickText('去创建游戏账号')
  await host.get('[data-tour="account-create"]').trigger('click'); await flushPromises()
  const panel = document.querySelector('.account-panel')
  expect(panel.querySelector('.tutorial-exit')).toBeTruthy()
  expect(panel.querySelector('.name-field input').value).toBe('')
  const input = panel.querySelector('.name-field input'); input.value = '我的游戏账号'; input.dispatchEvent(new Event('input', { bubbles: true }))
  const radio = panel.querySelector('input[value="如鸢"]'); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
  panel.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises()
  expect(accountsApi.createAccount).toHaveBeenCalledWith('我的游戏账号', '如鸢')
  expect(store.waitingFor).toBe('operator_saved'); expect(store.tutorialCompleted).toBe(false)
  expect(accounts).toHaveLength(1)
})

it('保存失败留在真实任务，草稿和真实错误保留；Esc只退出教程', async () => {
  const { router, store } = await render(); await begin(router, store); await enterQuick()
  operatorApi.importOperator.mockRejectedValueOnce(new Error('保存失败测试'))
  await selectAndSave()
  expect(store.waitingFor).toBe('operator_saved'); expect(store.tutorialCompleted).toBe(false)
  expect(host.findComponent(QuickPage).text()).toContain('保存失败测试')
  const input = host.findComponent(QuickPage).get('.op-check')
  expect(input.element.checked).toBe(true)
  input.element.focus(); input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(guide()).toBeNull(); expect(input.element.checked).toBe(true)
  expect(store.status).toBe('paused'); expect(current).toEqual([])
})

it('仅成功保存响应不算完成；读回失败不伪造成果，重读实际数据才能结束', async () => {
  const { router, store } = await render(); await begin(router, store); await enterQuick()
  operatorApi.importOperator.mockImplementationOnce(async () => {
    current = stored(); operatorApi.getOperatorCurrent.mockRejectedValueOnce(new Error('读回失败'))
    return { accepted: 1 }
  })
  await selectAndSave()
  expect(store.tutorialCompleted).toBe(false)
  expect(host.findComponent(QuickPage).text()).toContain('读回失败')
  await refreshTutorialBusiness(); await flushPromises()
  expect(store.tutorialCompleted).toBe(true)
})

it('真实快捷录入允许空页继续，但空保存不能完成教学', async () => {
  const { router, store } = await render(); await begin(router, store); await enterQuick()
  for (let i = 0; i < 6; i++) { await host.findComponent(QuickPage).get('.wiz-actions .primary').trigger('click'); await flushPromises() }
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
  expect(store.tutorialCompleted).toBe(false); expect(store.waitingFor).toBe('operator_saved')
})

it('刷新重新读取真实成果，已有账号与密探直接跳过，无业务写入', async () => {
  const { router, store } = await render(); await begin(router, store)
  expect(store.waitingFor).toBe('operator_saved')
  host.unmount(); current = stored()
  const restored = await render('/operator')
  expect(restored.store.tutorialCompleted).toBe(true)
  expect(guide().textContent).toContain('录入结果已验证')
  expect(accountsApi.createAccount).not.toHaveBeenCalled(); expect(operatorApi.importOperator).not.toHaveBeenCalled()
})

it('读取账号失败不算无账号，不诱导重复创建；错误期间随时退出', async () => {
  const { router, store } = await render()
  accountsApi.listAccounts.mockRejectedValue(new Error('账号读取失败'))
  await begin(router, store)
  expect(store.waitingFor).toBe('read_error')
  expect(guide().textContent).not.toContain('去创建游戏账号')
  await clickText('退出引导')
  expect(store.tutorialCompleted).toBe(false); expect(guide()).toBeNull()
})

it('账号创建中按钮与键盘退出可达，既不清草稿也不取消已提交请求', async () => {
  accounts = []; activeAccount.clear()
  const { router, store } = await render(); await begin(router, store); await clickText('去创建游戏账号')
  await host.get('[data-tour="account-create"]').trigger('click'); await flushPromises()
  const panel = document.querySelector('.account-panel'), input = panel.querySelector('.name-field input')
  input.value = '未保存草稿'; input.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
  const pending = deferred(); accountsApi.createAccount.mockReturnValueOnce(pending.promise)
  panel.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises()
  expect(panel.querySelector('button[type="submit"]').disabled).toBe(true)
  panel.querySelector('.tutorial-exit').focus()
  panel.querySelector('.tutorial-exit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(guide()).toBeNull(); expect(panel.isConnected).toBe(true); expect(input.value).toBe('未保存草稿')
  expect(store.tutorialCompleted).toBe(false)
  pending.resolve({ id: 'acc', name: '未保存草稿', game: '代号鸢' }); await flushPromises()
  expect(activeAccount.id).toBe('acc'); expect(store.status).toBe('paused')
})

it('在真实保存确认框退出不会确认或取消提交，真实按钮仍可使用', async () => {
  const { router, store } = await render(); await begin(router, store); await enterQuick()
  const page = host.findComponent(QuickPage)
  await page.get('.op-check').setValue(true); await page.get('.wiz-actions .primary').trigger('click'); await flushPromises()
  const panel = document.querySelector('.dialog')
  expect(panel.querySelector('.tutorial-exit')).toBeTruthy()
  await clickText('退出引导')
  expect(dialog._state.visible).toBe(true); expect(page.get('.op-check').element.checked).toBe(true)
  expect(operatorApi.importOperator).not.toHaveBeenCalled()
  panel.querySelector('.dlg-btn.primary').click(); await flushPromises()
  expect(current[0].entries.op.star_level).toBe(1)
  expect(store.tutorialCompleted).toBe(false)
})

it('跨登录路由保留目标并在身份就绪后恢复；旧身份成果不能完成新任务', async () => {
  auth.accessToken = ''; auth.userInfo = null; activeAccount.clear()
  const { router, store } = await render(); await begin(router, store)
  expect(store.waitingFor).toBe('login')
  await clickText('去登录')
  expect(store.active).toBe(true)
  auth.userInfo = { id: 'owner' }; auth.accessToken = 'synthetic-token'; activeAccount.set('acc')
  await router.push('/operator'); await flushPromises()
  expect(store.waitingFor).toBe('operator_saved')
  auth.userInfo = { id: 'other' }; await flushPromises()
  publishOperatorCurrentRead({ ownerId: 'owner', accountId: 'acc', game: '如鸢', data: stored() })
  expect(store.ownerId).toBe('other'); expect(store.tutorialCompleted).toBe(false)
  expect(store.active).toBe(false)
})

it('延迟请求在退出或换账号后不能推进；手动重入只重新读取实际状态', async () => {
  const { router, store } = await render(); await begin(router, store)
  const pending = deferred(); operatorApi.getOperatorCurrent.mockReturnValueOnce(pending.promise)
  const read = refreshTutorialBusiness(); await flushPromises()
  await clickText('退出引导')
  pending.resolve(stored()); await read
  expect(store.tutorialCompleted).toBe(false)
  const another = { id: 'other-account', name: '另一个账号', game: '如鸢' }
  accounts.push(another)
  operatorApi.getOperatorCurrent.mockImplementation(async ({ accountId }) => accountId === 'acc' ? stored() : [])
  activeAccount.set('other-account'); store.openTasks(); await nextTick()
  await startOnboardingTask(router, 'operator-first-entry'); await flushPromises()
  expect(store.waitingFor).toBe('operator_saved'); expect(store.tutorialCompleted).toBe(false)
  expect(JSON.parse(localStorage.getItem(onboardingStorageKey('owner'))).tutorialTask).toBe('operator-first-entry')
})

it('从帮助继续当前快捷录入不离开页面、不清空草稿，不按旧步骤重播', async () => {
  const { router, store } = await render(); await begin(router, store); await enterQuick()
  const page = host.findComponent(QuickPage)
  await page.get('.op-check').setValue(true)
  await clickText('退出引导')
  store.openTasks(); await nextTick()
  await clickText('继续实操教程：录入第一位密探')
  expect(router.currentRoute.value.path).toBe('/operator/quick')
  expect(page.get('.op-check').element.checked).toBe(true)
  expect(dialog._state.visible).toBe(false)
  expect(store.waitingFor).toBe('operator_saved')
})

it('永久不自动提示也可手动重进；已有账号任务只按真实账号列表完成', async () => {
  const { router, store } = await render()
  store.recommend(); await nextTick()
  const checkbox = guide().querySelector('input[type="checkbox"]')
  checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await nextTick()
  await clickText('直接使用 / 暂时关闭')
  expect(store.disableAutoGuide).toBe(true)
  store.openTasks(); await nextTick()
  await startOnboardingTask(router, 'account-create'); await flushPromises()
  expect(store.tutorialCompleted).toBe(true)
  expect(store.completedTasks['account-create'].accountId).toBe('acc')
  expect(accountsApi.createAccount).not.toHaveBeenCalled()
})

const connection = (extra = {}) => ({ token_id: 'connection', account_id: 'acc', account_name: '主账号', scopes: ['inventory:write'], ...extra })
const syncReceipt = (extra = {}) => ({ connection_id: 'connection', account_id: 'acc', synced: true, data_type: 'inventory', record_id: 'inventory:1', received_at: '2026-10-08T00:00:00Z', ...extra })
async function beginMaa(router) {
  await startOnboardingTask(router, 'maayuan-first-sync'); await flushPromises()
}
async function createConnection(router) {
  await beginMaa(router)
  await host.get('.app-connect').trigger('click'); await flushPromises()
  expect(host.get('#maayuan-account').element.value).toBe('')
  await host.get('#maayuan-account').setValue('acc'); await flushPromises()
  expect(guide().textContent).toContain('核对所选账号与权限')
  connectionApi.generateOpenApiToken.mockImplementationOnce(async () => {
    connectionApi.getOpenApiTokens.mockResolvedValue([connection()])
    return { ...connection(), token: crypto.randomUUID() }
  })
  await host.get('#maayuan-connect-panel').trigger('submit'); await flushPromises()
}

it('MaaYuan真实选择→API创建→真实复制→等待；收到服务端库存证据才完成', async () => {
  const { router, store } = await render('/user/profile')
  await createConnection(router)
  expect(store.maaYuan.phase).toBe('token-created')
  expect(store.tutorialCompleted).toBe(false)
  expect(guide().textContent).toContain('还没确认同步')
  expect(connectionApi.generateOpenApiToken).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc', scopes: ['inventory:write', 'operator:scan:write', 'operator:read', 'star:capture:write'] }))
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  await host.get('.nt-row button').trigger('click'); await flushPromises()
  expect(store.maaYuan.phase).toBe('waiting-sync')
  expect(store.tutorialCompleted).toBe(false)
  expect(guide().textContent).toContain('自动识别背包')
  expect(guide().textContent).not.toContain('下一步')
  await clickText('我已返回，检查真实同步')
  expect(store.tutorialCompleted).toBe(false)
  connectionApi.getConnectionFirstSync.mockResolvedValue(syncReceipt())
  eventCallbacks.forEach(listener => listener({ event: 'inventory_import', data: { account_id: 'acc' } }))
  await flushPromises()
  expect(store.tutorialCompleted).toBe(true)
  expect(store.maaYuan.phase).toBe('synced')
  expect(guide().textContent).toContain('第一次 MaaYuan 同步已完成')
  expect(guide().textContent).toContain(account.name)
  expect(localStorage.getItem(onboardingStorageKey('owner'))).not.toContain(host.get('.nt-code').text())
  expect(guide().textContent).not.toContain(host.get('.nt-code').text())
})

it('MaaYuan创建失败保持真实表单和当前阶段，立即退出且不撤销连接', async () => {
  const { router, store } = await render('/user/profile'); await beginMaa(router)
  await host.get('.app-connect').trigger('click'); await host.get('#maayuan-account').setValue('acc'); await flushPromises()
  connectionApi.generateOpenApiToken.mockRejectedValueOnce(new Error('创建请求失败'))
  await host.get('#maayuan-connect-panel').trigger('submit'); await flushPromises()
  expect(store.maaYuan.phase).toBe('choose-account')
  expect(store.waitingFor).toBe('maa_create')
  expect(host.get('#maayuan-account').element.value).toBe('acc')
  await clickText('退出引导')
  expect(host.find('#maayuan-connect-panel').exists()).toBe(true)
  expect(host.get('#maayuan-account').element.value).toBe('acc')
  expect(store.tutorialCompleted).toBe(false)
  expect(connectionApi.deleteOpenApiToken).not.toHaveBeenCalled()
})

it.each(['token-created', 'waiting-sync'])('MaaYuan %s退出仅移除教学，重入复用原连接与真实成果', async phase => {
  const { router, store } = await render('/user/profile'); await createConnection(router)
  if (phase === 'waiting-sync') { await host.get('.nt-row button').trigger('click'); await flushPromises() }
  await clickText('退出引导')
  expect(host.find('.new-token').exists()).toBe(true)
  expect(store.maaYuan.phase).toBe(phase)
  expect(store.tutorialCompleted).toBe(false)
  await refreshTutorialBusiness()
  expect(store.tutorialCompleted).toBe(false)
  connectionApi.getConnectionFirstSync.mockResolvedValue(syncReceipt())
  await host.get('.maayuan-tutorial-entry button').trigger('click'); await flushPromises()
  expect(store.tutorialCompleted).toBe(true)
  expect(connectionApi.generateOpenApiToken).toHaveBeenCalledTimes(1)
  expect(connectionApi.deleteOpenApiToken).not.toHaveBeenCalled()
})

it('MaaYuan复制拒绝不能推进，失败仍可Esc退出', async () => {
  const { router, store } = await render('/user/profile'); await createConnection(router)
  navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'))
  const old = document.execCommand
  document.execCommand = vi.fn(() => false)
  try {
    await host.get('.nt-row button').trigger('click'); await flushPromises()
    expect(store.maaYuan.phase).toBe('token-created')
    expect(store.waitingFor).toBe('maa_copy')
    expect(host.get('.notice-line').text()).toContain('复制失败')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises()
    expect(guide()).toBeNull()
    expect(host.find('.new-token').exists()).toBe(true)
    expect(store.tutorialCompleted).toBe(false)
  } finally { document.execCommand = old }
})

it('已有MaaYuan连接只真实复制不重新创建；复制失败仍停留，成功后等待', async () => {
  connectionApi.getOpenApiTokens.mockResolvedValue([connection()])
  connectionApi.getOpenApiTokenSecret.mockResolvedValue({ token: crypto.randomUUID() })
  const { router, store } = await render('/user/profile'); await beginMaa(router)
  expect(store.waitingFor).toBe('maa_copy')
  expect(connectionApi.getOpenApiTokenSecret).not.toHaveBeenCalled()
  await host.get('.connection-actions .copy').trigger('click'); await flushPromises()
  expect(store.maaYuan.phase).toBe('waiting-sync')
  expect(store.tutorialCompleted).toBe(false)
  expect(connectionApi.generateOpenApiToken).not.toHaveBeenCalled()
})

it('MaaYuan等待可刷新与跨页继续；当前页面换账号仍验证绑定账号', async () => {
  const { router, store } = await render('/user/profile'); await createConnection(router)
  await host.get('.nt-row button').trigger('click'); await flushPromises()
  host.unmount()
  const restored = await render('/changelog')
  expect(restored.store.waitingFor).toBe('maa_sync')
  expect(restored.store.maaYuan).toMatchObject({ connectionId: 'connection', accountId: 'acc', phase: 'waiting-sync' })
  accounts.push({ id: 'other', name: '另一账号', game: '如鸢' }); activeAccount.set('other'); await flushPromises()
  connectionApi.getConnectionFirstSync.mockResolvedValue(syncReceipt())
  window.dispatchEvent(new Event('focus')); await flushPromises()
  expect(restored.store.tutorialCompleted).toBe(true)
  expect(restored.router.currentRoute.value.path).toBe('/changelog')
  expect(connectionApi.generateOpenApiToken).toHaveBeenCalledTimes(1)
})

it('MaaYuan预览事件、错账号或错连接证据不能完成；查询失败允许退出', async () => {
  connectionApi.getOpenApiTokens.mockResolvedValue([connection()])
  const { router, store } = await render('/user/profile'); await beginMaa(router)
  connectionApi.getConnectionFirstSync.mockResolvedValue(syncReceipt())
  const reads = connectionApi.getConnectionFirstSync.mock.calls.length
  eventCallbacks.forEach(listener => listener({ event: 'inventory_import', data: { account_id: 'acc', preview: true } }))
  await flushPromises()
  expect(connectionApi.getConnectionFirstSync).toHaveBeenCalledTimes(reads)
  expect(store.tutorialCompleted).toBe(false)
  for (const invalid of [syncReceipt({ account_id: 'other' }), syncReceipt({ connection_id: 'other' }), syncReceipt({ data_type: 'star' })]) {
    connectionApi.getConnectionFirstSync.mockResolvedValueOnce(invalid)
    await refreshTutorialBusiness()
    expect(store.tutorialCompleted).toBe(false)
  }
  connectionApi.getConnectionFirstSync.mockRejectedValueOnce(new Error('不可观察'))
  await refreshTutorialBusiness(); expect(store.waitingFor).toBe('read_error')
  await clickText('退出引导'); expect(guide()).toBeNull()
})

it('MaaYuan在途创建/复制/同步查询退出后，迟到成功不完成且不取消业务', async () => {
  const { router, store } = await render('/user/profile'); await beginMaa(router)
  await host.get('.app-connect').trigger('click'); await host.get('#maayuan-account').setValue('acc'); await flushPromises()
  const pending = deferred(); connectionApi.generateOpenApiToken.mockReturnValueOnce(pending.promise)
  await host.get('#maayuan-connect-panel').trigger('submit'); await flushPromises()
  await clickText('退出引导')
  expect(host.get('#maayuan-account').element.value).toBe('acc')
  pending.resolve({ ...connection(), token: crypto.randomUUID() }); connectionApi.getOpenApiTokens.mockResolvedValue([connection()]); await flushPromises()
  expect(host.find('.new-token').exists()).toBe(true)
  expect(store.status).toBe('paused')
  await host.get('.maayuan-tutorial-entry button').trigger('click'); await flushPromises()
  const copied = deferred(); navigator.clipboard.writeText.mockReturnValueOnce(copied.promise)
  await host.get('.nt-row button').trigger('click'); await flushPromises()
  await clickText('退出引导'); copied.resolve(); await flushPromises()
  expect(store.maaYuan.phase).toBe('token-created')
  await host.get('.maayuan-tutorial-entry button').trigger('click'); await flushPromises()
  const receiptRead = deferred(); connectionApi.getConnectionFirstSync.mockReturnValueOnce(receiptRead.promise)
  const read = refreshTutorialBusiness(); await flushPromises()
  await clickText('退出引导'); receiptRead.resolve(syncReceipt()); await read
  expect(store.tutorialCompleted).toBe(false)
  expect(connectionApi.deleteOpenApiToken).not.toHaveBeenCalled()
})

it('MaaYuan等待定时检查只读，暂停和卸载后不再查询', async () => {
  connectionApi.getOpenApiTokens.mockResolvedValue([connection()])
  vi.useFakeTimers()
  try {
    const { router, store } = await render('/user/profile'); await beginMaa(router)
    const initialReads = connectionApi.getConnectionFirstSync.mock.calls.length
    await vi.advanceTimersByTimeAsync(15000); await flushPromises()
    expect(connectionApi.getConnectionFirstSync.mock.calls.length).toBeGreaterThan(initialReads)
    await clickText('退出引导')
    const reads = connectionApi.getConnectionFirstSync.mock.calls.length
    window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(15000)
    expect(connectionApi.getConnectionFirstSync).toHaveBeenCalledTimes(reads)
    expect(store.tutorialCompleted).toBe(false)
    host.unmount(); window.dispatchEvent(new Event('focus')); await flushPromises()
    expect(connectionApi.getConnectionFirstSync).toHaveBeenCalledTimes(reads)
  } finally { vi.useRealTimers() }
})

it('MaaYuan已有连接复制失败不推进，重试WebKit真实复制成功才等待', async () => {
  connectionApi.getOpenApiTokens.mockResolvedValue([connection()])
  connectionApi.getOpenApiTokenSecret.mockResolvedValue({ token: crypto.randomUUID() })
  const { router, store } = await render('/user/profile'); await beginMaa(router)
  navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'))
  const originalCopy = document.execCommand
  document.execCommand = vi.fn(() => false)
  try {
    await host.get('.connection-actions .copy').trigger('click'); await flushPromises()
    expect(store.maaYuan.phase).toBe('token-created')
    expect(store.waitingFor).toBe('maa_copy')
  } finally { document.execCommand = originalCopy }
  const pending = deferred(); connectionApi.getOpenApiTokenSecret.mockReturnValueOnce(pending.promise)
  vi.stubGlobal('ClipboardItem', class { constructor(data) { this.data = data } })
  const write = vi.fn(items => items[0].data['text/plain'].then(() => undefined))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } })
  await host.get('.connection-actions .copy').trigger('click')
  expect(write).toHaveBeenCalledTimes(1)
  expect(store.maaYuan.phase).toBe('token-created')
  pending.resolve({ token: crypto.randomUUID() }); await flushPromises()
  expect(store.maaYuan.phase).toBe('waiting-sync')
  expect(store.tutorialCompleted).toBe(false)
  expect(connectionApi.generateOpenApiToken).not.toHaveBeenCalled()
})

it('MaaYuan迟到证据不交给另一身份；已撤销连接和旧完成标记不算成果', async () => {
  connectionApi.getOpenApiTokens.mockResolvedValue([connection()])
  const { router, store } = await render('/user/profile'); await beginMaa(router)
  const pending = deferred(); connectionApi.getConnectionFirstSync.mockReturnValueOnce(pending.promise)
  const read = refreshTutorialBusiness(); await flushPromises()
  auth.userInfo = { id: 'another-owner' }; await flushPromises()
  pending.resolve(syncReceipt()); await read
  expect(store.ownerId).toBe('another-owner')
  expect(store.tutorialCompleted).toBe(false)
  expect(store.active).toBe(false)
  auth.userInfo = { id: 'owner' }; await flushPromises()
  connectionApi.getOpenApiTokens.mockResolvedValue([])
  await beginMaa(router)
  expect(store.status).toBe('in_progress')
  expect(store.waitingFor).toBe('maa_connect')
  expect(store.maaYuan.connectionId).toBe('')
  expect(store.tutorialCompleted).toBe(false)
  expect(store.waitingFor).toBe('maa_connect')
  expect(connectionApi.generateOpenApiToken).not.toHaveBeenCalled()
})

async function followHere() {
  await host.findAll('.tool-task-prompt button').find(button => button.text() === '跟着做一次').trigger('click')
  await flushPromises()
}
async function saveBaseline() {
  const page = host.findComponent(InventoryPage)
  await page.get('.inventory-entry').trigger('click')
  await page.get('.stock-baseline-confirmation input').setValue(true)
  await page.get('.manifest-edit-actions .primary').trigger('click')
  await flushPromises()
}

it('Today自愿参加→选择密探→真实保存→回到Today核验；一份数据足够', async () => {
  const { router, store } = await render()
  await followHere()
  expect(store.waitingFor).toBe('first_task')
  await clickText('录入第一位密探'); await enterQuick()
  expect(store.tutorialCompleted).toBe(false)
  await selectAndSave()
  expect(store.waitingFor).toBe('today_return')
  expect(store.tutorialCompleted).toBe(false)
  await clickText('返回 Today 验证第一份数据')
  expect(router.currentRoute.value.path).toBe('/')
  expect(store.tutorialCompleted).toBe(true)
  expect(guide().textContent).toContain('第一份数据已建立')
  expect(store.completedTasks['today-first-data']).toMatchObject({ firstDataTask: 'operator', operatorId: 'op', accountId: 'acc' })
  expect(stock).toEqual([])
})

it('Today选择盘点，返回只认完整基准；无保存、局部数据和读失败不能毕业', async () => {
  const { router, store } = await render(); await followHere()
  await clickText('完成首次库存盘点')
  await router.push('/'); await flushPromises()
  expect(store.tutorialCompleted).toBe(false)
  stock = [{ account_id: 'acc', entity_type: 'item', entries: { coin: { count: 3 } } }]
  await refreshTutorialBusiness()
  expect(store.tutorialCompleted).toBe(false)
  inventoryApi.getCurrent.mockRejectedValueOnce(new Error('库存暂不可读'))
  await refreshTutorialBusiness()
  expect(store.waitingFor).toBe('read_error')
  expect(guide().textContent).toContain('库存暂不可读')
  await clickText('退出引导')
  expect(store.tutorialCompleted).toBe(false)
})

it('库存实操只有真实保存并读到完整基准后完成，全零也可明确确认', async () => {
  const { store } = await render('/inventory'); await followHere()
  expect(store.waitingFor).toBe('inventory_saved')
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  await saveBaseline()
  expect(inventoryApi.importInventory).toHaveBeenCalledTimes(1)
  expect(inventoryApi.importInventory.mock.calls[0][0].records[0]).toMatchObject({ snapshot_scope: 'full', record_type: 'stock_snapshot', account_id: 'acc' })
  expect(store.tutorialCompleted).toBe(true)
  expect(host.findComponent(InventoryPage).get('.inventory-freshness time').attributes('datetime')).toBe(stock[0].full_baseline_at)
  expect(guide().textContent).toContain('完整库存基准已验证')
})

it.each(['失败', '无基准', '读取失败'])('库存保存%s保持任务未完成并允许退出，保留真实草稿/数据', async variant => {
  const { store } = await render('/inventory'); await followHere()
  if (variant === '失败') inventoryApi.importInventory.mockRejectedValueOnce(new Error('盘点保存失败'))
  else if (variant === '无基准') inventoryApi.importInventory.mockResolvedValueOnce({ accepted: 1 })
  else inventoryApi.importInventory.mockImplementationOnce(async () => {
    stock = [{ account_id: 'acc', entity_type: 'item', full_baseline_at: '2026-10-08T00:00:00Z', entries: {} }]
    inventoryApi.getCurrent.mockRejectedValueOnce(new Error('盘点读回失败'))
    return { accepted: 1 }
  })
  await saveBaseline()
  expect(store.tutorialCompleted).toBe(false)
  if (variant === '失败') {
    expect(host.findComponent(InventoryPage).text()).toContain('盘点保存失败')
    expect(host.get('.stock-baseline-confirmation input').element.checked).toBe(true)
  }
  await clickText('退出引导')
  expect(guide()).toBeNull()
  expect(store.status).toBe('paused')
  if (variant === '失败') expect(host.get('.stock-baseline-confirmation input').element.checked).toBe(true)
  else if (variant === '读取失败') expect(stock[0].full_baseline_at).toBeTruthy()
})

it('库存输入与在途保存期间Esc退出，不丢草稿、不取消保存、迟到成功不毕业', async () => {
  const { router, store } = await render('/inventory'); await followHere()
  const page = host.findComponent(InventoryPage)
  await page.get('.inventory-entry').trigger('click')
  await page.get('input[aria-label="白金币当前库存"]').setValue('120')
  const pending = deferred(); inventoryApi.importInventory.mockReturnValueOnce(pending.promise)
  await page.get('.manifest-edit-actions .primary').trigger('click')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises()
  expect(page.get('input[aria-label="白金币当前库存"]').element.value).toBe('120')
  stock = [{ account_id: 'acc', entity_type: 'item', full_baseline_at: '2026-10-08T00:00:00Z', entries: { baijinbi: { count: 120 } } }]
  pending.resolve({ accepted: 1 }); await flushPromises()
  expect(store.tutorialCompleted).toBe(false)
  expect(page.get('.inventory-freshness time').exists()).toBe(true)
  await startOnboardingTask(router, 'inventory-first-baseline'); await flushPromises()
  expect(store.tutorialCompleted).toBe(true)
  expect(inventoryApi.importInventory).toHaveBeenCalledTimes(1)
})

it('Today刷新恢复所选业务而非步骤，星石只以当前账号云端保存状态完成', async () => {
  const { store } = await render(); await followHere(); await clickText('完成一次星石截图识别')
  expect(store.tutorialCompleted).toBe(false)
  host.unmount()
  const restored = await render('/star')
  expect(restored.store.firstDataTask).toBe('star')
  expect(restored.store.waitingFor).toBe('star_saved')
  starApi.getCurrentStarState.mockResolvedValueOnce({ inventory: [{ instance_id: 'saved-star' }] })
  await restored.router.push('/'); await flushPromises()
  expect(restored.store.tutorialCompleted).toBe(true)
  expect(restored.store.completedTasks['today-first-data'].starId).toBe('saved-star')
  expect(JSON.parse(localStorage.getItem(onboardingStorageKey('owner')))).not.toHaveProperty('stepIndex')
})

it('已有成果用户不自动推荐；直接使用真实盘点不会被标为教程完成', async () => {
  current = stored()
  await render()
  expect(guide()).toBeNull()
  expect(host.find('.tool-task-prompt').exists()).toBe(false)
  host.unmount()
  const { store } = await render('/inventory')
  await host.findAll('.tool-task-prompt button').find(button => button.text() === '直接使用 / 暂时关闭').trigger('click')
  await saveBaseline()
  expect(store.tutorialCompleted).toBe(false)
  expect(store.completedTasks).toEqual({})
})

it('Today真实账号创建后重新读取readiness并选择首份数据，而非把建号算建档', async () => {
  accounts = []; activeAccount.clear()
  const { store } = await render(); await followHere()
  await host.get('.account-management-action').trigger('click'); await flushPromises()
  const panel = document.querySelector('.account-panel')
  const input = panel.querySelector('.name-field input')
  input.value = '我的真实游戏账号'; input.dispatchEvent(new Event('input', { bubbles: true }))
  const radio = panel.querySelector('input[value="如鸢"]')
  if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })) }
  await nextTick()
  panel.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises()
  expect(accountsApi.createAccount).toHaveBeenCalled()
  expect(host.find('.data-readiness-grid').exists()).toBe(true)
  expect(store.waitingFor).toBe('first_task')
  expect(store.tutorialCompleted).toBe(false)
})

it('库存迟到的A账号读回不完成B；刷新后的历史完成不能代替重新读取', async () => {
  const { router, store } = await render('/inventory'); await followHere()
  const late = deferred(); inventoryApi.getCurrent.mockReturnValueOnce(late.promise)
  const read = refreshTutorialBusiness(); await flushPromises()
  accounts.push({ id: 'b', name: 'B', game: '如鸢' }); activeAccount.set('b'); await flushPromises()
  late.resolve([{ account_id: 'acc', entity_type: 'item', full_baseline_at: '2026-10-08T00:00:00Z', entries: {} }]); await read
  expect(store.tutorialCompleted).toBe(false)
  activeAccount.set('acc'); await flushPromises()
  stock = [{ account_id: 'acc', entity_type: 'item', full_baseline_at: '2026-10-08T00:00:00Z', entries: {} }]
  await refreshTutorialBusiness()
  expect(store.tutorialCompleted).toBe(true)
  host.unmount(); stock = []
  const restored = await render('/inventory')
  expect(restored.store.tutorialCompleted).toBe(false)
  expect(guide()).toBeNull()
  await startOnboardingTask(restored.router, 'inventory-first-baseline'); await flushPromises()
  expect(restored.store.waitingFor).toBe('inventory_saved')
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})
