import { computed, onBeforeUnmount, provide, ref, watch } from 'vue'
import { useAccountListUpdates } from '../store/accountList.js'
import { auth } from '../store/auth.js'
import { activeAccount } from '../store/activeAccount.js'
import { listAccounts } from '../api/accounts.js'
import { listCalendarSubscriptions, getCalendarSubscription, setCalendarSubscription, saveCalendarProgress } from '../api/activityCalendarSubscriptions.js'
import { CALENDAR_SUBSCRIPTIONS } from '../data/activityCalendarSubscriptions.js'
import { useUnsavedChanges } from '../utils/useUnsavedChanges.js'

// Page-owned state shared by the three calendar views, never a cross-user singleton.
export function useCalendarSubscriptions(enabled, range, category) {
  let alive = true, accountGeneration = 0, generation = 0, deferredLoad = false, acceptedSwitch = false
  const permitted = computed(() => enabled && auth.isLoggedIn && auth.isAdmin && !!auth.userInfo?.id)
  const identity = computed(() => permitted.value ? String(auth.userInfo.id) : '')
  const accounts = ref([]), accountError = ref(''), accountLoading = ref(false)
  useAccountListUpdates(next => {
    if (!identity.value) return
    accountGeneration++; accountLoading.value = false; accountError.value = ''
    accounts.value = next
    activeAccount.syncAccounts(next)
  })
  const selectedAccount = ref(activeAccount.id)
  const account = computed(() => accounts.value.find(value => value.id === selectedAccount.value) || null)
  const key = computed(() => JSON.stringify([identity.value, account.value?.id, account.value?.game, range.value, category.value]))
  const records = ref([]), unavailable = ref([]), count = ref(0), loading = ref(false), error = ref('')
  const now = ref(Date.now()), drafts = ref({})
  const epoch = ref(0), contextNotice = ref('')
  const dirty = computed(() => Object.values(drafts.value).some(Boolean))
  const confirmDiscard = useUnsavedChanges(dirty, '活动备忘录', { title: '还有未保存的备忘修改' })
  const byId = computed(() => Object.fromEntries(records.value.map(record => [record.event_id, record])))
  async function loadAccounts() {
    const token = ++accountGeneration, user = identity.value
    accountError.value = ''; accountLoading.value = !!user
    if (!user) return
    try {
      const result = await listAccounts(user)
      if (!alive || token !== accountGeneration || user !== identity.value) return
      accounts.value = Array.isArray(result) ? result : []
      activeAccount.syncAccounts(accounts.value)
    } catch (err) {
      if (alive && token === accountGeneration) accountError.value = err?.message || '账号读取失败，请重试。'
    } finally { if (alive && token === accountGeneration) accountLoading.value = false }
  }
  watch(identity, () => { accounts.value = []; void loadAccounts() }, { immediate: true, flush: 'sync' })
  watch(() => JSON.stringify([identity.value, account.value?.id, account.value?.game]), () => {
    if (dirty.value && !acceptedSwitch) contextNotice.value = '身份、权限或游戏账号已变化，未保存的备忘已清除。'
  }, { flush: 'sync' })
  watch(key, () => {
    epoch.value++; deferredLoad = false; records.value = []; unavailable.value = []; drafts.value = {}; count.value = 0
  }, { flush: 'sync' })
  const ticket = () => [key.value, epoch.value]
  const current = context => alive && context[0] === key.value && context[1] === epoch.value && !!identity.value && !!account.value
  async function switchAccount(id) {
    const context = ticket()
    if (id === selectedAccount.value) return true
    if (!await confirmDiscard() || !alive || context[0] !== key.value || context[1] !== epoch.value || !identity.value || !accounts.value.some(value => value.id === id)) return false
    contextNotice.value = ''
    acceptedSwitch = true
    selectedAccount.value = id
    acceptedSwitch = false
    activeAccount.set(id)
    return true
  }
  watch(() => activeAccount.id, id => {
    if (id === selectedAccount.value) return
    if (!dirty.value || !identity.value || !account.value || !accounts.value.some(value => value.id === id)) {
      selectedAccount.value = id
      return
    }
    // Keep the accepted page context stable while a global entry asks to switch.
    activeAccount.set(selectedAccount.value)
    void switchAccount(id)
  }, { flush: 'sync' })
  async function load() {
    if (dirty.value) { deferredLoad = true; return }
    deferredLoad = false
    const token = ++generation, context = ticket(), user = identity.value, owner = account.value?.id
    error.value = ''; loading.value = !!owner
    if (!user || !owner) { records.value = []; unavailable.value = []; count.value = 0; return }
    try {
      const result = await listCalendarSubscriptions({ account_id: owner, ...range.value, category: category.value }, user)
      if (!current(context) || token !== generation) return
      if (dirty.value) { deferredLoad = true; return }
      records.value = result.items || []; unavailable.value = result.unavailable_items || []; count.value = result.subscribed_count || 0
    } catch (err) {
      if (current(context) && token === generation) {
        if (dirty.value) deferredLoad = true
        else error.value = err?.message || '订阅读取失败，请重试。'
      }
    } finally { if (alive && token === generation) loading.value = false }
  }
  watch(() => JSON.stringify([key.value, range.value, category.value]), load, { immediate: true, flush: 'sync' })
  watch(dirty, value => { if (!value && deferredLoad && alive) void load() })
  function apply(record) {
    generation++; loading.value = false; error.value = ''
    const wasSubscribed = records.value.some(value => value.event_id === record.event_id) || unavailable.value.some(value => value.event_id === record.event_id)
    if (record.subscribed !== wasSubscribed) count.value = Math.max(0, count.value + (record.subscribed ? 1 : -1))
    records.value = records.value.filter(value => value.event_id !== record.event_id)
    unavailable.value = unavailable.value.filter(value => value.event_id !== record.event_id)
    if (record.subscribed) (record.item ? records.value : unavailable.value).push(record)
  }
  async function refreshOne(id) {
    const context = ticket(), user = identity.value, owner = account.value?.id
    if (!current(context)) throw new Error('请先选择游戏账号。')
    try {
      const result = await getCalendarSubscription(id, owner, user)
      if (!current(context)) return null
      return result
    } catch (err) {
      if (err?.status === 404 && err?.code === 'subscription_not_found' && current(context)) return null
      throw err
    }
  }
  async function subscribe(id, subscribed) {
    const context = ticket(), user = identity.value, owner = account.value?.id
    if (!current(context)) throw new Error('请先选择游戏账号。')
    const previous = await refreshOne(id)
    if (!current(context)) return null
    const result = await setCalendarSubscription(id, { account_id: owner, expected_version: previous?.version ?? null, subscribed }, user)
    if (!current(context)) return null
    apply(result)
    return result
  }
  async function progress(id, version, draft) {
    const context = ticket(), user = identity.value, owner = account.value?.id
    if (!current(context)) throw new Error('请先选择游戏账号。')
    const result = await saveCalendarProgress(id, { account_id: owner, expected_version: version, ...draft }, user)
    if (!current(context)) return null
    if (result?.event_id !== id || !Number.isInteger(result.version) || result.version <= version) throw new Error('保存结果需要确认，请读取最新状态。')
    apply(result)
    return result
  }
  function discardDrafts() { epoch.value++; drafts.value = {} }
  const state = { permitted, identity, account, accounts, accountError, accountLoading, loadAccounts, key, epoch, contextNotice, records, unavailable, count, byId, loading, error, now, dirty, confirmDiscard, switchAccount, discardDrafts, load, refreshOne, subscribe, progress, accept: apply, setDirty: (id, value) => { drafts.value = { ...drafts.value, [id]: value } } }
  provide(CALENDAR_SUBSCRIPTIONS, state)
  onBeforeUnmount(() => { alive = false; generation++; accountGeneration++ })
  return state
}
