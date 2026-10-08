import { reactive, watch } from 'vue'
import { useOnboardingStore } from '../stores/onboarding.js'
import { auth } from '../store/auth.js'
import { activeAccount } from '../store/activeAccount.js'
import { accountListChange } from '../store/accountList.js'
import { listAccounts } from '../api/accounts.js'
import { getOperatorCurrent } from '../api/operator.js'
import { ONBOARDING_TASKS, ownedOperatorId, resolveTaskProgress, verifiedConnectionSync } from './onboardingTasks.js'
import { getOpenApiTokens, getConnectionFirstSync } from '../api/openApi.js'
import { subscribeAccountEvents } from '../store/accountEvents.js'
import { operatorCurrentRead } from './operatorEvents.js'

export const tutorialBusiness = reactive({ accounts: null, accountId: '', game: '', currentLoaded: false, operatorId: '', error: '', maaFormOpen: false, accountName: '' })
let generation = 0
let stopController = null

const identity = () => auth.isLoggedIn && auth.userInfo?.id ? String(auth.userInfo.id) : 'guest'
const storeForIdentity = () => useOnboardingStore().initialize(identity())

function applyBusiness() {
  const store = storeForIdentity()
  store.applyProgress(resolveTaskProgress(store.tutorialTask, { ...tutorialBusiness, ownerId: store.ownerId, loggedIn: identity() !== 'guest' }))
}

export async function refreshTutorialBusiness() {
  const store = storeForIdentity(), token = ++generation, ownerId = store.ownerId, task = store.tutorialTask
  const valid = () => token === generation && store.active && store.ownerId === ownerId && identity() === ownerId && store.tutorialTask === task
  Object.assign(tutorialBusiness, { accounts: null, accountId: activeAccount.id, game: '', currentLoaded: false, operatorId: '', error: '' })
  if (!store.active) return
  if (ownerId === 'guest') { applyBusiness(); return }
  if (task !== 'maayuan-first-sync' || !['maa_copy', 'maa_sync'].includes(store.waitingFor)) store.applyProgress({ waitingFor: 'business_state' })
  try {
    const accounts = await listAccounts(auth.userInfo.id)
    if (!valid()) return
    if (!Array.isArray(accounts) || accounts.some(account => !account?.id || !['如鸢', '代号鸢'].includes(account.game))) throw new Error('无法确认账号数据，请重试读取。')
    tutorialBusiness.accounts = accounts
    if (task === 'maayuan-first-sync') { await refreshMaaYuan(store, accounts, valid); return }
    const account = accounts.find(item => item.id === activeAccount.id)
    if (task === 'account-create' || !account) { applyBusiness(); return }
    tutorialBusiness.accountId = account.id
    tutorialBusiness.game = account.game
    const current = await getOperatorCurrent({ accountId: account.id, game: account.game })
    if (!valid() || activeAccount.id !== account.id) return
    tutorialBusiness.operatorId = ownedOperatorId(current, account.id, account.game)
    tutorialBusiness.currentLoaded = true
    applyBusiness()
  } catch (error) {
    if (!valid()) return
    tutorialBusiness.error = task === 'maayuan-first-sync'
      ? (error?.status === 404
          ? '当前连接已失效或服务尚未提供同步验证接口。可重新读取或退出；不能把连接码创建成功视为同步成功。'
          : '暂时无法读取连接或同步证据，尚不能确认成功。可稍后重新检查或退出；历史记录没有连接来源时无法追认。')
      : error?.message || '暂时无法读取业务结果，请在真实页面处理错误后重试。'
    if (task === 'maayuan-first-sync') store.applyProgress({ waitingFor: 'read_error' })
    else applyBusiness()
  }
}

async function refreshMaaYuan(store, accounts, valid) {
  const connections = await getOpenApiTokens()
  if (!valid()) return
  if (!Array.isArray(connections)) throw new Error('无法读取连接')
  const usable = connections.filter(item => item?.token_id && accounts.some(account => account.id === item.account_id) && item.scopes?.includes('inventory:write'))
  const checkpoint = store.maaYuan
  let connection = usable.find(item => item.token_id === checkpoint.connectionId && item.account_id === checkpoint.accountId)
  if (!checkpoint.connectionId) {
    connection = checkpoint.accountId
      ? usable.find(item => item.account_id === checkpoint.accountId)
      : usable.find(item => item.account_id === activeAccount.id) || usable[0]
  }
  if (!connection) {
    const accountId = accounts.some(account => account.id === checkpoint.accountId) ? checkpoint.accountId : ''
    store.setMaaYuanCheckpoint({ accountId, phase: 'choose-account' })
    store.applyProgress({ waitingFor: !accounts.length ? 'account_created' : !tutorialBusiness.maaFormOpen ? 'maa_connect' : accountId ? 'maa_create' : 'maa_account' })
    return
  }
  const sameConnection = checkpoint.connectionId === connection.token_id && checkpoint.accountId === connection.account_id
  // A local synced flag without a fresh server receipt cannot complete or skip copying.
  const phase = sameConnection && ['token-copied', 'waiting-sync'].includes(checkpoint.phase) ? 'waiting-sync' : 'token-created'
  store.setMaaYuanCheckpoint({ connectionId: connection.token_id, accountId: connection.account_id, phase })
  const account = accounts.find(account => account.id === connection.account_id)
  tutorialBusiness.accountName = account ? `${account.game} · ${account.name}` : connection.account_name
  const receipt = await getConnectionFirstSync(connection.token_id)
  if (!valid() || store.maaYuan.connectionId !== connection.token_id || store.maaYuan.accountId !== connection.account_id) return
  if (verifiedConnectionSync(receipt, connection.token_id, connection.account_id)) {
    store.setMaaYuanCheckpoint({ ...store.maaYuan, phase: 'synced' })
    store.applyProgress({ waitingFor: 'verified', evidence: {
      ownerId: store.ownerId, task: 'maayuan-first-sync', connectionId: connection.token_id,
      accountId: connection.account_id, receipt: Object.fromEntries(['connection_id', 'account_id', 'synced', 'data_type', 'record_id', 'received_at'].map(key => [key, receipt[key]]))
    } })
  } else {
    if (receipt?.connection_id !== connection.token_id || receipt?.account_id !== connection.account_id || receipt?.synced !== false) throw new Error('无法确认同步状态')
    store.applyProgress({ waitingFor: phase === 'waiting-sync' ? 'maa_sync' : 'maa_copy' })
  }
}

export function recordMaaYuanAction(action, context = {}) {
  const store = storeForIdentity()
  if (!store.active || store.tutorialTask !== 'maayuan-first-sync') return
  generation++ // Product events supersede older reads.
  if (action === 'connect') {
    tutorialBusiness.maaFormOpen = context.open === true
    if (!store.maaYuan.connectionId) store.applyProgress({ waitingFor: context.open ? (store.maaYuan.accountId ? 'maa_create' : 'maa_account') : 'maa_connect' })
    return
  }
  if (action === 'account') {
    store.setMaaYuanCheckpoint({ accountId: context.accountId, phase: 'choose-account' })
    void refreshTutorialBusiness()
  } else if (action === 'created') {
    store.setMaaYuanCheckpoint({ accountId: context.accountId, connectionId: context.connectionId, phase: 'token-created' })
    store.applyProgress({ waitingFor: 'maa_copy' })
  } else if (action === 'copied' && context.connectionId === store.maaYuan.connectionId && context.accountId === store.maaYuan.accountId) {
    store.setMaaYuanCheckpoint({ ...store.maaYuan, phase: 'token-copied' })
    store.applyProgress({ waitingFor: 'maa_sync' })
    void refreshTutorialBusiness()
  }
}

export async function startOnboardingTask(router, taskId) {
  if (!Object.hasOwn(ONBOARDING_TASKS, taskId)) return false
  const store = storeForIdentity()
  const continuingHere = store.tutorialTask === taskId && store.status === 'paused' &&
    (router.currentRoute.value.path === ONBOARDING_TASKS[taskId]?.route.split('#')[0] ||
      (taskId === 'operator-first-entry' && ['/operator/quick', '/user/profile', '/login'].includes(router.currentRoute.value.path)))
  if (!store.start(taskId)) return false
  if (continuingHere) return true
  try { await router.push(ONBOARDING_TASKS[taskId].route) } catch {
    // A navigation failure is not task completion or dismissal.
  }
  return true
}

// Stable navigation entry: choose/continue a real task instead of replaying pages.
export function restartOnboardingTour() {
  generation++
  storeForIdentity().openTasks()
}

export function destroyOnboardingTour({ preserveState = false } = {}) {
  generation++
  if (!preserveState) storeForIdentity().dismiss()
}

export function initializeOnboardingTour(router) {
  stopController?.()
  const store = storeForIdentity()
  const stopIdentity = watch(identity, ownerId => { generation++; store.initialize(ownerId) }, { flush: 'sync' })
  const stopBusiness = watch(() => [store.active, store.tutorialTask, store.ownerId, activeAccount.id,
    activeAccount.gameFor(), accountListChange.value, router.currentRoute.value.fullPath], () => {
    void refreshTutorialBusiness()
  }, { immediate: true, flush: 'sync' })
  const stopRead = watch(operatorCurrentRead, read => {
    if (store.tutorialTask !== 'operator-first-entry' || !store.active || !read || read.ownerId !== store.ownerId || read.accountId !== activeAccount.id ||
        read.accountId !== tutorialBusiness.accountId || read.game !== tutorialBusiness.game || !tutorialBusiness.accounts) return
    try {
      const operatorId = ownedOperatorId(read.data, read.accountId, read.game)
      // A verified product read supersedes an older tutorial GET.
      generation++
      tutorialBusiness.operatorId = operatorId
      tutorialBusiness.currentLoaded = true
      tutorialBusiness.error = ''
      applyBusiness()
    } catch (error) {
      tutorialBusiness.error = error.message
      applyBusiness()
    }
  }, { flush: 'sync' })
  const stopRecommend = watch(() => [router.currentRoute.value.name, store.status, store.ownerId,
    store.panel, store.dismissedForNow], () => {
    if (router.currentRoute.value.name === 'today') store.recommend()
  }, { immediate: true })
  const checkMaaYuan = () => {
    if (store.active && store.tutorialTask === 'maayuan-first-sync' && store.maaYuan.connectionId && document.visibilityState !== 'hidden') void refreshTutorialBusiness()
  }
  // SSE is only a wake-up; neither previews nor account-wide changes are receipts.
  const stopEvents = subscribeAccountEvents(message => {
    if (message?.event === 'inventory_import' && !message.data?.preview && message.data?.account_id === store.maaYuan.accountId) checkMaaYuan()
  })
  const poll = setInterval(checkMaaYuan, 15000)
  window.addEventListener('focus', checkMaaYuan)
  document.addEventListener('visibilitychange', checkMaaYuan)
  const cleanup = () => {
    generation++
    stopIdentity(); stopBusiness(); stopRead(); stopRecommend(); stopEvents()
    clearInterval(poll)
    window.removeEventListener('focus', checkMaaYuan)
    document.removeEventListener('visibilitychange', checkMaaYuan)
    if (stopController === cleanup) stopController = null
  }
  stopController = cleanup
  return cleanup
}
