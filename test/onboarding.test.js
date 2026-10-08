import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useOnboardingStore, onboardingStorageKey, ONBOARDING_VERSION } from '../src/stores/onboarding.js'
import { resolveTaskProgress, ownedOperatorId } from '../src/utils/onboardingTasks.js'

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
  assert.equal(store.recommend(), false)
  store.openTasks(); store.start('operator-first-entry')
  assert.equal(store.active, true)
  store.dismiss({ disableAutoGuide: true }); store.openTasks()
  assert.equal(store.panel, 'tasks')
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
  assert.equal(store.recommend(), false)
  setActivePinia(createPinia())
  assert.equal(useOnboardingStore().initialize('signed-in').recommend(), false)
  const migrated = setup({ 'yuanhub:onboarding:v1': JSON.stringify({ status: 'completed', version: 1 }) }).store
  assert.equal(migrated.recommend(), false)
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
  assert.equal(store.recommend(), true)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
  assert.equal(store.start('account-create'), true)
  store.dismiss()
  assert.equal(store.visible, false)
  delete globalThis.localStorage
})
