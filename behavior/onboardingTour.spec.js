import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import OnboardingGuide from '../src/components/OnboardingGuide.vue'
import OperatorPage from '../src/pages/operator/index.vue'
import QuickPage from '../src/pages/operator/quick.vue'
import ProfilePage from '../src/pages/user/profile.vue'
import AppDialog from '../src/components/AppDialog.vue'
import { useOnboardingStore, onboardingStorageKey } from '../src/stores/onboarding.js'
import { initializeOnboardingTour, startOnboardingTask, refreshTutorialBusiness } from '../src/utils/onboardingTour.js'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import * as accountsApi from '../src/api/accounts.js'
import * as operatorApi from '../src/api/operator.js'
import { starLoadoutPresetStore } from '../src/domain/starLoadoutPresets.js'
import { operatorCurrentRead, publishOperatorCurrentRead } from '../src/utils/operatorEvents.js'
import { accountListChange } from '../src/store/accountList.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn() }))
vi.mock('../src/api/operator.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/inventory.js', async importOriginal => ({ ...(await importOriginal()), listAgentFavorites: vi.fn().mockResolvedValue({ agent_ids: [] }) }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn().mockResolvedValue({ generation: 0, entries: [] }) }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn().mockResolvedValue({ generation: 0, revision: 0, loadouts: {} }), putCurrentStarLoadout: vi.fn() }))
vi.mock('../src/api/openApi.js', () => ({
  getOpenApiPermissions: vi.fn().mockResolvedValue([]), getOpenApiTokens: vi.fn().mockResolvedValue([]),
  generateOpenApiToken: vi.fn(), getOpenApiTokenSecret: vi.fn(), updateOpenApiTokenScopes: vi.fn(), deleteOpenApiToken: vi.fn()
}))
vi.mock('../src/api/request.js', () => ({ avatarUrl: value => value || '' }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  const auth = reactive({ accessToken: 'synthetic-token', userInfo: { id: 'owner' }, get isLoggedIn() { return !!this.accessToken } })
  return { auth }
})
vi.mock('../src/store/beta.js', () => ({ beta: { canUseBetaFeatures: true, loadMe: () => Promise.resolve(), campaign: { accessMode: 'OPEN' } } }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))

let accounts, current, host
const account = { id: 'acc', name: '真实组件测试账号', game: '如鸢' }
const entry = { star_level: 1, level: 25, elite: 3 }
const stored = () => [{ account_id: 'acc', game: '如鸢', entries: { op: { ...entry } } }]
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

beforeEach(() => {
  if (dialog._state.visible) dialog._cancel()
  vi.clearAllMocks()
  auth.accessToken = 'synthetic-token'; auth.userInfo = { id: 'owner' }
  accounts = [{ ...account }]; current = []
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
    { path: '/', name: 'today', component: { template: '<main><button>普通产品操作</button></main>' } },
    { path: '/operator', component: OperatorPage }, { path: '/operator/quick', component: QuickPage },
    { path: '/user/profile', component: ProfilePage },
    { path: '/login', component: { template: '<main>真实登录入口</main>' } },
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
      OperatorGrowthTracker: true, StarLoadoutEditor: true, StarLoadoutModal: true
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
  expect(guide().textContent).toContain('跟着做一次')
  expect(host.get('main button').element.disabled).toBe(false)
  expect(accountsApi.listAccounts).not.toHaveBeenCalled()
  await clickText('直接使用 / 暂时关闭')
  expect(guide()).toBeNull(); expect(store.tutorialCompleted).toBe(false)
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
