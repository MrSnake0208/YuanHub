import test from 'node:test'
import assert from 'node:assert/strict'
import { watch } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import '../test-support/enableTutorials.js'
const { useOnboardingStore, onboardingStorageKey, ONBOARDING_VERSION } = await import('../src/stores/onboarding.js')
import { resolveTaskProgress, ownedOperatorId, inventoryBaselineAt, maaYuanCheckpoint, verifiedConnectionSync, isTutorialTaskRoute } from '../src/utils/onboardingTasks.js'

function setup(initial = {}) {
  const values = new Map(Object.entries(initial))
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)
  } })
  setActivePinia(createPinia())
  return { store: useOnboardingStore().initialize('owner'), values }
}
const ready = { ownerId: 'owner', loggedIn: true, accounts: [{ id: 'acc', game: '如鸢' }], accountId: 'acc', currentLoaded: true, operatorId: '' }
const progress = state => resolveTaskProgress('operator-first-entry', { ...ready, ...state })

test('任务路由限定当前工作区和账号前置，不把今日子任务或MaaYuan带到无关页面', () => {
  assert.equal(isTutorialTaskRoute('today-first-data', 'inventory', '/today'), true)
  assert.equal(isTutorialTaskRoute('today-first-data', 'inventory', '/inventory'), true)
  assert.equal(isTutorialTaskRoute('today-first-data', 'inventory', '/operator'), false)
  assert.equal(isTutorialTaskRoute('operator-first-entry', null, '/operator/quick'), true)
  assert.equal(isTutorialTaskRoute('operator-first-entry', null, '/user/profile'), true)
  assert.equal(isTutorialTaskRoute('operator-first-entry', null, '/changelog'), false)
  assert.equal(isTutorialTaskRoute('maayuan-first-sync', null, '/user/profile'), true)
  assert.equal(isTutorialTaskRoute('maayuan-first-sync', null, '/inventory'), false)
  assert.equal(isTutorialTaskRoute('unknown', null, '/'), false)
})

test('库存只认当前账号道具完整基准，局部记录不毕业，畸形响应失败', () => {
  assert.equal(inventoryBaselineAt([], 'acc'), '')
  assert.equal(inventoryBaselineAt([{ entries: { coin: { count: 0 } } }], 'acc'), '')
  for (const current of [null, [null], [{ account_id: 'other', entries: {} }], [{ entity_type: 'agent', entries: {} }], [{ entries: { coin: { count: -1 } } }]]) assert.throws(() => inventoryBaselineAt(current, 'acc'))
  const baselineAt = '2026-10-08T00:00:00Z'
  assert.equal(inventoryBaselineAt([{ account_id: 'acc', entries: {}, full_baseline_at: baselineAt }], 'acc'), baselineAt)
  assert.equal(resolveTaskProgress('inventory-first-baseline', ready).waitingFor, 'inventory_saved')
  const { store } = setup(); store.start('inventory-first-baseline')
  assert.equal(store.applyProgress({ waitingFor: 'verified', evidence: { ownerId: 'owner', task: 'inventory-first-baseline', accountId: 'acc' } }), false)
  store.applyProgress(resolveTaskProgress('inventory-first-baseline', { ...ready, baselineAt }))
  assert.equal(store.tutorialCompleted, true)
})

test('Today主动选择真实任务且返回Today核验；关闭不毕业，所选任务可恢复', () => {
  assert.equal(resolveTaskProgress('today-first-data', ready).waitingFor, 'first_task')
  assert.equal(resolveTaskProgress('today-first-data', { ...ready, firstDataTask: 'operator', operatorId: 'op' }).waitingFor, 'today_return')
  assert.equal(resolveTaskProgress('today-first-data', { ...ready, firstDataTask: 'operator', operatorId: 'op', onToday: true }).waitingFor, 'verified')
  const { store } = setup(); store.start('today-first-data'); store.chooseFirstData('inventory'); store.dismiss()
  assert.equal(store.tutorialCompleted, false)
  setActivePinia(createPinia())
  const restored = useOnboardingStore().initialize('owner')
  assert.equal(restored.firstDataTask, 'inventory'); assert.equal(restored.active, false)
  assert.equal(restored.chooseFirstData('star'), false)
})

test('登录、账号、数据未知、失败与缺少密探是不同的真实等待条件', () => {
  assert.equal(progress({ loggedIn: false }).waitingFor, 'login')
  assert.equal(progress({ accounts: null }).waitingFor, 'business_state')
  assert.equal(progress({ accounts: [] }).waitingFor, 'account_created')
  assert.equal(progress({ accountId: '' }).waitingFor, 'account_selected')
  assert.equal(progress({ currentLoaded: false }).waitingFor, 'business_state')
  assert.equal(progress({ error: 'read failed', accounts: [] }).waitingFor, 'read_error')
  assert.equal(progress({}).waitingFor, 'operator_saved')
  assert.equal(progress({ operatorId: 'op' }).waitingFor, 'verified')
})

test('只有已招募条目算成果，空、未拥有和损坏响应不能冒充成功', () => {
  assert.equal(ownedOperatorId([], 'acc', '如鸢'), '')
  assert.equal(ownedOperatorId([{ entries: { op: { star_level: 0, level: 0 } } }], 'acc', '如鸢'), '')
  assert.equal(ownedOperatorId([{ account_id: 'acc', game: '如鸢', entries: { op: { star_level: 1 } } }], 'acc', '如鸢'), 'op')
  for (const data of [null, {}, [{ entries: [] }], [{ account_id: 'other', entries: {} }], [{ game: '代号鸢', entries: {} }]]) {
    assert.throws(() => ownedOperatorId(data, 'acc', '如鸢'))
  }
})

test('完成必须有相同任务、身份及真实记录凭据，不能直接点按钮完成', () => {
  const { store } = setup()
  assert.equal(store.start('welcome'), false)
  store.start('operator-first-entry')
  assert.equal(store.applyProgress({ waitingFor: 'verified' }), false)
  assert.equal(store.applyProgress(progress({ operatorId: 'op', ownerId: 'other' })), false)
  assert.equal(store.tutorialCompleted, false)
  store.applyProgress(progress({ operatorId: 'op' }))
  assert.equal(store.tutorialCompleted, true)
  assert.equal(store.completedTasks['operator-first-entry'].operatorId, 'op')
})

test('关闭仅暂停本次，不等于完成或永久禁用；可手动继续', () => {
  const { store } = setup()
  store.start('operator-first-entry'); store.dismiss()
  assert.equal(store.status, 'paused')
  assert.equal(store.tutorialTask, 'operator-first-entry')
  assert.ok(store.dismissedForNow)
  assert.equal(store.tutorialCompleted, false)
  assert.equal(store.disableAutoGuide, false)
  assert.equal(store.visible, false)
  store.start('operator-first-entry')
  assert.equal(store.active, true)
  store.dismiss({ disableAutoGuide: true }); store.start('operator-first-entry')
  assert.equal(store.panel, 'task')
  assert.equal(store.disableAutoGuide, true)
})

test('刷新保存任务目标但重新等待业务证据，不恢复历史页码或完成假象', () => {
  const { store, values } = setup()
  store.start('operator-first-entry'); store.applyProgress({ waitingFor: 'operator_saved' })
  assert.equal(JSON.parse(values.get(onboardingStorageKey('owner'))).waitingFor, 'operator_saved')
  setActivePinia(createPinia())
  const restored = useOnboardingStore().initialize('owner')
  assert.equal(restored.active, true)
  assert.equal(restored.tutorialTask, 'operator-first-entry')
  assert.equal(restored.waitingFor, 'business_state')
  assert.equal(restored.tutorialCompleted, false)
})

test('身份隔离；只有主动选择的游客任务跟随登录，不把旧身份结果交给新身份', () => {
  const { store, values } = setup()
  store.start('operator-first-entry')
  store.initialize('other')
  assert.equal(store.tutorialTask, null)
  assert.equal(JSON.parse(values.get(onboardingStorageKey('owner'))).status, 'paused')
  store.initialize('guest'); store.start('operator-first-entry'); store.initialize('signed-in')
  assert.equal(store.tutorialTask, 'operator-first-entry')
  assert.equal(store.active, true)
  assert.equal(JSON.parse(values.get(onboardingStorageKey('guest'))).status, 'paused')
})

test('游客直接使用后登录不会再次自动推荐，旧 Tour 完成也不是实操成果', () => {
  const { store } = setup()
  store.initialize('guest'); store.dismiss(); store.initialize('signed-in')
  assert.equal(store.visible, false)
  setActivePinia(createPinia())
  assert.equal(useOnboardingStore().initialize('signed-in').visible, false)
  const migrated = setup({ 'yuanhub:onboarding:v1': JSON.stringify({ status: 'completed', version: 1 }) }).store
  assert.equal(migrated.visible, false)
  assert.equal(migrated.tutorialCompleted, false)
  assert.deepEqual(migrated.completedTasks, {})
})

test('损坏的完成凭据不能恢复为实操完成', () => {
  const { store } = setup({ [onboardingStorageKey('owner')]: JSON.stringify({
    version: ONBOARDING_VERSION, status: 'completed', tutorialTask: 'operator-first-entry',
    completedTasks: { 'operator-first-entry': { ownerId: 'another-owner', accountId: 'acc' } }
  }) })
  assert.equal(store.tutorialCompleted, false)
  assert.deepEqual(store.completedTasks, {})
})

test('损坏/不可用存储不困住用户', () => {
  const { store } = setup({ [onboardingStorageKey('owner')]: '{bad json' })
  assert.equal(store.visible, false)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
  assert.equal(store.start('account-create'), true)
  store.dismiss()
  assert.equal(store.visible, false)
  delete globalThis.localStorage
})

const receipt = (extra = {}) => ({ connection_id: 'connection', account_id: 'acc', data_type: 'inventory', synced: true, record_id: 'inventory:1', received_at: '2026-10-08T00:00:00Z', ...extra })

test('MaaYuan完成只接纳绑定连接与账号的真实库存凭据', () => {
  const { store } = setup()
  store.start('maayuan-first-sync')
  for (const invalid of [null, receipt({ synced: false }), receipt({ connection_id: 'other' }), receipt({ account_id: 'other' }), receipt({ data_type: 'star' }), receipt({ record_id: '' }), receipt({ received_at: 'bad' })]) {
    assert.equal(verifiedConnectionSync(invalid, 'connection', 'acc'), false)
    assert.equal(store.applyProgress({ waitingFor: 'verified', evidence: { ownerId: 'owner', task: 'maayuan-first-sync', accountId: 'acc', connectionId: 'connection', receipt: invalid } }), false)
  }
  assert.equal(store.tutorialCompleted, false)
  assert.equal(store.applyProgress({ waitingFor: 'verified', evidence: { ownerId: 'owner', task: 'maayuan-first-sync', accountId: 'acc', connectionId: 'connection', receipt: receipt() } }), true)
  assert.equal(store.tutorialCompleted, true)
})

test('MaaYuan每阶段退出保留任务元数据，但不写完成或永久禁用', () => {
  for (const phase of ['choose-account', 'token-created', 'token-copied', 'waiting-sync']) {
    const { store, values } = setup()
    store.start('maayuan-first-sync')
    store.setMaaYuanCheckpoint({ connectionId: 'connection', accountId: 'acc', phase, token: crypto.randomUUID(), stepIndex: 3 })
    store.dismiss()
    assert.equal(store.tutorialCompleted, false)
    assert.equal(store.disableAutoGuide, false)
    const saved = JSON.parse(values.get(onboardingStorageKey('owner')))
    assert.deepEqual(saved.maaYuan, { task: 'maayuan-first-sync', connectionId: 'connection', accountId: 'acc', phase })
    assert.equal(JSON.stringify(saved).includes('stepIndex'), false)
    assert.equal(Object.hasOwn(saved.maaYuan, 'token'), false)
    setActivePinia(createPinia())
    const restored = useOnboardingStore().initialize('owner')
    assert.equal(restored.visible, false)
    assert.equal(restored.maaYuan.phase, phase)
    restored.start('maayuan-first-sync')
    assert.equal(restored.waitingFor, 'business_state')
  }
})

test('MaaYuan本地完成标记必须重新验证，不能刷新就显示成功', () => {
  const { store, values } = setup()
  store.start('maayuan-first-sync')
  store.setMaaYuanCheckpoint({ connectionId: 'connection', accountId: 'acc', phase: 'synced' })
  store.applyProgress({ waitingFor: 'verified', evidence: { ownerId: 'owner', task: 'maayuan-first-sync', accountId: 'acc', connectionId: 'connection', receipt: receipt() } })
  setActivePinia(createPinia())
  const restored = useOnboardingStore().initialize('owner')
  assert.equal(restored.tutorialCompleted, false)
  assert.equal(restored.status, 'paused')
  assert.equal(restored.visible, false)
  assert.equal(maaYuanCheckpoint({ phase: 'page-5' }).phase, 'choose-account')
  assert.ok(values.size)
})

test('MaaYuan身份同步watch重入时，原身份正确暂停且返回后可重新验证', () => {
  const { store, values } = setup()
  store.start('maayuan-first-sync')
  let owner = 'other'
  const stop = watch(() => [store.active, store.ownerId], () => store.initialize(owner), { flush: 'sync' })
  store.initialize(owner)
  assert.equal(store.ownerId, 'other')
  assert.equal(JSON.parse(values.get(onboardingStorageKey('owner'))).status, 'paused')
  owner = 'owner'
  store.initialize(owner)
  stop()
  assert.equal(store.status, 'paused')
  store.start('maayuan-first-sync')
  assert.equal(store.waitingFor, 'business_state')
})
