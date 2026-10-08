import { reactive, watch } from 'vue'
import { useOnboardingStore } from '../stores/onboarding.js'
import { auth } from '../store/auth.js'
import { activeAccount } from '../store/activeAccount.js'
import { accountListChange } from '../store/accountList.js'
import { listAccounts } from '../api/accounts.js'
import { getOperatorCurrent } from '../api/operator.js'
import { ONBOARDING_TASKS, ownedOperatorId, resolveTaskProgress } from './onboardingTasks.js'
import { operatorCurrentRead } from './operatorEvents.js'

export const tutorialBusiness = reactive({ accounts: null, accountId: '', game: '', currentLoaded: false, operatorId: '', error: '' })
let generation = 0
let stopController = null

const identity = () => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : 'guest'
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
  store.applyProgress({ waitingFor: 'business_state' })
  try {
    const accounts = await listAccounts(auth.userInfo.id)
    if (!valid()) return
    if (!Array.isArray(accounts) || accounts.some(account => !account?.id || !['如鸢', '代号鸢'].includes(account.game))) throw new Error('无法确认账号数据，请重试读取。')
    tutorialBusiness.accounts = accounts
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
    tutorialBusiness.error = error?.message || '暂时无法读取业务结果，请在真实页面处理错误后重试。'
    applyBusiness()
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
    if (!store.active || !read || read.ownerId !== store.ownerId || read.accountId !== activeAccount.id ||
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
  const cleanup = () => {
    generation++
    stopIdentity(); stopBusiness(); stopRead(); stopRecommend()
    if (stopController === cleanup) stopController = null
  }
  stopController = cleanup
  return cleanup
}
