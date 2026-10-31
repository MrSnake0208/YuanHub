<template>
  <TodayLayout :show-overview="calendarEnabled || trainingEnabled">
    <template #lobby>
      <TodayLobby :owner-id="auth.isLoggedIn ? String(auth.userInfo?.id || '') : ''" :status="lobbyStatus" :game="calendarGame">
        <template #actions>
          <div class="today-actions">
            <button v-if="auth.isLoggedIn" type="button" class="today-record" aria-haspopup="dialog" aria-controls="reward-entry-panel"
              :aria-expanded="!!rewardEntryWorkspace?.mode" :disabled="rewardEntryDisabled || recordBusy" :title="recordUnavailableReason || '记录获得、使用与兑换'"
              @click="openRewardEntry($event.currentTarget)"><Plus :size="16" aria-hidden="true" />记一笔</button>
          </div>
        </template>
        <template v-if="auth.isLoggedIn" #utilities>
          <button type="button" class="today-customize" aria-label="自定义首页" title="自定义首页" aria-haspopup="dialog" @click="customizeOpen = true"><SlidersHorizontal :size="16" aria-hidden="true" /><span class="customize-desktop-label">自定义首页</span><span class="customize-mobile-label" aria-hidden="true">自定义</span></button>
          <TutorialEntry v-if="TUTORIALS_ENABLED" task="today-first-data" />
        </template>
        <DataAccountContextBar
          v-if="auth.isLoggedIn"
          ref="accountContext"
          compact
          :accounts="accounts"
          :account-id="accountId"
          :game="accountGame"
          :is-logged-in="auth.isLoggedIn"
          :loading="accountLoading"
          :switch-disabled="accountLoadFailed || recordBusy"
          :switch-disabled-reason="recordBusy ? '正在保存或确认入账，请处理完成后再切换账号。' : ''"
          :before-switch="beforeAccountSwitch"
        />
      </TodayLobby>
    </template>
    <template #status>
      <p v-if="preferenceOwner && preferenceActive.loading && !preferenceActive.snapshot" class="today-loading" role="status">正在读取首页设置…</p>
      <div v-if="preferenceOwner && preferenceActive.error" class="today-alert" role="alert">
        <span>首页设置读取失败：{{ preferenceActive.error }}{{ preferenceActive.snapshot ? '（保留上次设置）' : '' }}</span>
        <button type="button" :disabled="preferenceActive.loading" @click="preferences.load(layoutMode)">重试读取设置</button>
      </div>
      <p v-if="preferenceActive.snapshot && allModulesHidden" class="today-loading" role="status">当前端的首页模块已全部隐藏，可从「自定义首页」恢复默认并保存。</p>
      <div v-if="errorMessage" class="today-alert" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" :disabled="summaryLoading" @click="accountLoadFailed ? loadDashboard() : retrySummary()">重试</button>
      </div>

      <p v-if="accountLoading" class="today-loading" role="status">正在读取游戏账号…</p>
      <OnboardingGuide v-if="TUTORIALS_ENABLED" :tasks="['today-first-data']" />
      <TodayPreferencesPanel v-model:open="customizeOpen" :preferences="preferences" />
      <RewardEntryWorkspace v-if="recordMounted && auth.isLoggedIn && validAccountId" :key="highlightContext" ref="rewardEntryWorkspace" compact
        :account-id="validAccountId" :account-name="currentAccountName" :game="accountGame"
        :disabled="rewardEntryDisabled" :resource-busy="drawResourceBusy" :before-close="confirmDrawDraft"
        @busy="rewardBusy = $event" @imported="onRewardImported">
        <template #actions />
        <template #resource-entry="{ operation }">
          <DrawResourceEntry ref="drawResourceEntry" embedded :operation="operation" :account-id="validAccountId"
            :user-id="String(auth.userInfo?.id || '')" :game="accountGame" :disabled="rewardEntryDisabled || rewardBusy"
            @busy="drawResourceBusy = $event" @recorded="onRewardImported" />
        </template>
      </RewardEntryWorkspace>
    </template>
    <template #highlights>
      <TodayHighlights v-if="calendarEnabled && validAccountId && moduleShown('highlights')" :key="highlightContext" :items="highlights" :sources="highlightSources" @retry="retryHighlights" @empty-focus="focusCustomize" />
    </template>
    <template #todos>
      <div id="today-training-todos"></div>
    </template>
    <template #overview>
      <TodaySubscriptionSummary ref="subscriptionSource" @highlight-state="subscriptionState = $event" v-if="calendarEnabled && validAccountId" :account-id="validAccountId" :game="accountGame" :hide-empty="isFreshAccount" :show-checklist="moduleShown('checklist')" :show-reminders="false" />
    </template>
    <template #activities>
      <TodayActivitySummary v-if="calendarEnabled" :visible="moduleShown('activities')" :game="calendarGame" />
    </template>
    <template #training>
      <TodayTrainingPlans :visible="moduleShown('training')" v-if="trainingEnabled && validAccountId" :account-id="validAccountId" :game="accountGame" :hide-empty="isFreshAccount" todos-target="#today-training-todos" :show-todos="moduleShown('checklist')" />
    </template>
    <template #notes>
      <TodayPrivateItems ref="privateSource" @highlight-state="privateState = $event" :visible="moduleShown('private_items')" v-if="calendarEnabled && validAccountId" :account-id="validAccountId" :game="accountGame" hide-empty />
    </template>
    <template #onboarding>
      <TodayDataOnboarding
        v-if="showDataOnboarding"
        :onboarding-title="onboardingTitle"
        :onboarding-description="onboardingDescription"
        :onboarding-note="onboardingNote"
        :onboarding-stage="onboardingStage"
        :data-setup-items="dataSetupItems"
        :auto-sync-missing-items="autoSyncMissingItems"
        :auto-sync-missing-label="autoSyncMissingLabel"
        :data-readiness="dataReadiness"
        :maa-yuan-connect-to="maaYuanConnectTo"
        @create-account="accountContext?.openManager('create', $event)"
      />
    </template>
  </TodayLayout>
</template>

<script setup>
import { useAccountListUpdates } from '../../store/accountList.js'
import TutorialEntry from '../../components/TutorialEntry.vue'
import OnboardingGuide from '../../components/OnboardingGuide.vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Gem, PackageOpen, Plus, SlidersHorizontal, Users } from '@lucide/vue'
import RewardEntryWorkspace from '../../components/inventory/RewardEntryWorkspace.vue'
import DrawResourceEntry from '../../components/inventory/DrawResourceEntry.vue'
import { dialog } from '../../utils/dialog.js'
import { TODAY_MODULES, useTodayPreferences } from '../../composables/useTodayPreferences.js'
import TodayPreferencesPanel from '../../components/today/TodayPreferencesPanel.vue'
import TodayHighlights from '../../components/today/TodayHighlights.vue'
import { aggregateTodayHighlights } from '../../data/todayHighlights.js'
import TodayLayout from '../../components/today/TodayLayout.vue'
import TodayDataOnboarding from '../../components/today/TodayDataOnboarding.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import TodayActivitySummary from '../../components/today/TodayActivitySummary.vue'
import TodaySubscriptionSummary from '../../components/today/TodaySubscriptionSummary.vue'
import TodayPrivateItems from '../../components/today/TodayPrivateItems.vue'
import TodayTrainingPlans from '../../components/today/TodayTrainingPlans.vue'
import TodayLobby from '../../components/today/TodayLobby.vue'
import { FEATURE_KEYS, isFeatureEnabled, TUTORIALS_ENABLED } from '../../config/features.js'
import { listAccounts } from '../../api/accounts.js'
import { getOperatorCurrent } from '../../api/operator.js'
import { getCurrent } from '../../api/inventory.js'
import { getCurrentStarState } from '../../api/starState.js'
import { auth } from '../../store/auth.js'
import { activeAccount } from '../../store/activeAccount.js'
import {
  getTodayDataReadiness,
  getTodayOnboardingStage,
  hasTodayAccountData,
  shouldShowTodayDataOnboarding,
  summarizeTodayData
} from '../../data/todayData.js'

const EMPTY_SUMMARY = Object.freeze({ operatorCount: null, inventoryKindCount: null, inventoryRecorded: null, inventoryHasFullBaseline: null, starCount: null })
const DATA_SETUP_CONFIG = Object.freeze([
  {
    key: 'operator',
    title: '密探',
    countKey: 'operatorCount',
    unit: '位',
    icon: Users,
    manualTo: '/operator?tab=current',
    manualLabel: '去密探名册录入',
    emptyDescription: '还没有密探养成数据。可以从密探名册手动录入，也可以让 MaaYuan 自动采集。',
    readyDescription: '密探数据已录入，可在密探名册查看和继续维护。',
    autoSync: true
  },
  {
    key: 'inventory',
    title: '库存',
    countKey: 'inventoryKindCount',
    unit: '种',
    icon: PackageOpen,
    manualTo: '/inventory',
    manualLabel: '去库存追踪录入',
    emptyDescription: '还没有库存数据。可以从库存追踪手动维护，也可以让 MaaYuan 自动识别背包。',
    readyDescription: '库存数据已录入，可在库存追踪查看和继续维护。',
    autoSync: true
  },
  {
    key: 'star',
    title: '星石',
    countKey: 'starCount',
    unit: '颗',
    icon: Gem,
    manualTo: '/star',
    manualLabel: '去星石背包录入',
    emptyDescription: '还没有星石数据。当前先从星石背包录入；MaaYuan 星石自动同步仍在接入中。',
    readyDescription: '星石数据已经可用于背包整理和密探搭配。',
    autoSync: false
  }
])

const preferences = useTodayPreferences()
const { owner: preferenceOwner, layoutMode, active: preferenceActive, shown: moduleShown } = preferences
const allModulesHidden = computed(() => TODAY_MODULES.every(item => !moduleShown(item.id)))
const customizeOpen = ref(false)
const accounts = ref([])
const accountContext = ref(null)
const rewardEntryWorkspace = ref(null), drawResourceEntry = ref(null)
const recordMounted = ref(false), rewardBusy = ref(false), drawResourceBusy = ref(false)
const recordBusy = computed(() => rewardBusy.value || drawResourceBusy.value)
const subscriptionSource = ref(null), privateSource = ref(null)
const subscriptionState = ref(null), privateState = ref(null)
useAccountListUpdates(next => { accounts.value = next })
const realSummary = ref({ ...EMPTY_SUMMARY })
const accountLoading = ref(false)
const summaryLoading = ref(false)
const errorMessage = ref('')
const accountLoadFailed = ref(false)
let loadSequence = 0
let summarySequence = 0

const accountId = computed(function () { return activeAccount.id })

const accountGame = computed(function () { return activeAccount.gameFor(accountId.value) })
const validAccountId = computed(() => accounts.value.some(account => account.id === accountId.value) ? accountId.value : '')
const currentAccountName = computed(() => accounts.value.find(account => account.id === validAccountId.value)?.name || '当前账号')
const recordUnavailableReason = computed(() => {
  if (!auth.isLoggedIn) return '登录后可记一笔'
  if (accountLoading.value) return '正在读取游戏账号…'
  if (accountLoadFailed.value) return '账号读取失败，请先重试'
  if (!validAccountId.value) return '请先创建或选择游戏账号'
  if (summaryLoading.value) return '正在读取库存状态…'
  if (realSummary.value.inventoryKindCount == null) return '库存读取失败，请先重试'
  return ''
})
const rewardEntryDisabled = computed(() => !!recordUnavailableReason.value)
const calendarEnabled = computed(() => isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR) && auth.isLoggedIn && !accountLoading.value)
const trainingEnabled = computed(() => isFeatureEnabled(FEATURE_KEYS.OPERATOR_GROWTH_TRACKING) && auth.isLoggedIn && !accountLoading.value)
const calendarGame = computed(function () {
  return auth.isLoggedIn && accounts.value.some(account => account.id === accountId.value)
    ? accountGame.value : ''
})
const highlightContext = computed(() => JSON.stringify([auth.isLoggedIn ? auth.userInfo?.id || '' : '', validAccountId.value, accountGame.value]))
watch([highlightContext, calendarEnabled], () => { subscriptionState.value = null; privateState.value = null }, { flush: 'sync' })
watch(highlightContext, () => { recordMounted.value = false; rewardBusy.value = false; drawResourceBusy.value = false }, { flush: 'sync' })

async function openRewardEntry(trigger) {
  if (rewardEntryDisabled.value || recordBusy.value) return
  const context = highlightContext.value, sequence = loadSequence
  recordMounted.value = true
  await nextTick()
  if (context !== highlightContext.value || sequence !== loadSequence || rewardEntryDisabled.value || recordBusy.value) return
  rewardEntryWorkspace.value?.openManual(trigger)
}
async function confirmDrawDraft() {
  return !drawResourceEntry.value || await drawResourceEntry.value.confirmDiscard()
}
async function beforeAccountSwitch() {
  if (recordBusy.value) return false
  const context = highlightContext.value, sequence = loadSequence
  const current = () => context === highlightContext.value && sequence === loadSequence && !recordBusy.value
  if (!(await confirmDrawDraft()) || !current()) return false
  if (rewardEntryWorkspace.value?.hasDraft() && !(await dialog.confirm({
    title: '放弃当前账号的录入草稿？', message: '切换账号会清空未保存的记录。已保存的数据不受影响。',
    type: 'danger', confirmText: '放弃并切换', cancelText: '继续填写'
  }))) return false
  return current()
}
function onRewardImported(targetAccountId) {
  if (!auth.isLoggedIn || !validAccountId.value || targetAccountId !== validAccountId.value) return
  summaryLoading.value = true
  void loadSummary(++summarySequence, validAccountId.value, accountGame.value)
}
const highlightSources = computed(() => [
  { id: 'subscriptions', label: '订阅活动', state: subscriptionState.value },
  { id: 'private', label: '私人事项', state: privateState.value }
].map(({ state, ...source }) => ({ ...source, ...(state?.context === highlightContext.value ? state : { items: [], loading: true, error: '' }) })))
const highlights = computed(() => aggregateTodayHighlights({
  subscriptions: highlightSources.value[0].items,
  privateItems: highlightSources.value[1].items,
  now: subscriptionState.value?.context === highlightContext.value ? subscriptionState.value.now : Date.now(),
  game: accountGame.value
}))
function retryHighlights(source) { if (source === 'subscriptions') subscriptionSource.value?.reload(); else privateSource.value?.reload() }
function focusCustomize() { document.querySelector('.today-customize')?.focus({ preventScroll: true }) }
const dataReadiness = computed(function () { return getTodayDataReadiness(realSummary.value) })
const isReturningUser = computed(() => !!validAccountId.value && hasTodayAccountData(realSummary.value))
const onboardingStage = computed(function () {
  return getTodayOnboardingStage({
    isLoggedIn: auth.isLoggedIn,
    hasAccounts: accounts.value.length > 0,
    summary: realSummary.value
  })
})
const showDataOnboarding = computed(function () {
  if (isReturningUser.value) return false
  if (auth.isLoggedIn && (accountLoadFailed.value || accountLoading.value || summaryLoading.value || (accounts.value.length && !validAccountId.value))) return false
  return shouldShowTodayDataOnboarding({
    isLoggedIn: auth.isLoggedIn,
    hasAccounts: accounts.value.length > 0,
    summary: realSummary.value
  })
})
const isFreshAccount = computed(() => showDataOnboarding.value && onboardingStage.value === 'data'
  && Object.values(dataReadiness.value).every(status => status === 'empty'))
const dataSetupItems = computed(function () {
  return DATA_SETUP_CONFIG.map(function (item) {
    const status = dataReadiness.value[item.key]
    const count = realSummary.value[item.countKey]
    const zeroInventory = item.key === 'inventory' && status === 'ready' && count === 0
    const hasFullBaseline = realSummary.value.inventoryHasFullBaseline === true
    return {
      ...item,
      status,
      statusLabel: status === 'ready'
        ? zeroInventory
          ? (hasFullBaseline ? '已盘点' : '已有录入') + '，当前库存为零'
          : '已录入 ' + count + ' ' + item.unit
        : status === 'unknown'
          ? count == null ? '暂时无法读取' : '录入状态待确认'
          : '尚未录入',
      description: status === 'ready'
        ? zeroInventory && hasFullBaseline ? '已建立完整库存基准，不需要重复录入。可在库存追踪查看和继续维护。' : item.readyDescription
        : status === 'unknown'
          ? count == null
            ? '这项数据暂时读取失败，不会要求你重新录入。'
            : '暂时无法确认这项数据的录入状态，不会要求你重新录入。'
          : item.emptyDescription
    }
  })
})
const missingDataItems = computed(function () {
  return dataSetupItems.value.filter(function (item) { return item.status === 'empty' })
})
const unknownDataItems = computed(() => dataSetupItems.value.filter(item => item.status === 'unknown'))
const unknownDataLabel = computed(() => unknownDataItems.value.map(item => item.title).join('、'))
const autoSyncMissingItems = computed(function () {
  return missingDataItems.value.filter(function (item) { return item.autoSync })
})
const autoSyncMissingLabel = computed(function () {
  return autoSyncMissingItems.value.map(function (item) { return item.title }).join('、')
})
const onboardingTitle = computed(function () {
  if (onboardingStage.value === 'auth') return '先登录，再开始建立今日一览'
  if (onboardingStage.value === 'account') return '先建立你的游戏子账号'
  return unknownDataItems.value.length ? '部分资料状态待确认' : '从一份资料开始'
})
const onboardingDescription = computed(function () {
  if (onboardingStage.value === 'auth') {
    return '登录后，查看你的今日事项。'
  }
  if (onboardingStage.value === 'account') {
    return '为你的游戏存档分别记录密探、库存和星石。'
  }
  return unknownDataItems.value.length
    ? '仅对确认缺少的数据提供录入入口；状态待确认的资料无需重新录入。'
    : '任选一项录入即可开始，也可以连接 MaaYuan 自动同步密探和库存。'
})
const onboardingNote = computed(function () {
  return '按需录入 · 无需全部填写'
})
const lobbyStatus = computed(() => {
  if (!auth.isLoggedIn) return '登录后，一起看看你的今日事项。'
  if (accountLoading.value || summaryLoading.value) return '正在为你整理当前账号状态…'
  if (accountLoadFailed.value) return '账号暂时无法读取，请稍后重试。'
  if (!accounts.value.length) return '先建一个游戏账号，从这里开始。'
  if (!validAccountId.value) return '选一个游戏账号，看看今天的状态。'
  if (unknownDataItems.value.length) return `${unknownDataLabel.value}状态待确认，无需重复录入。`
  if (!isReturningUser.value) return '当前账号尚未建档，先从第一份资料开始吧。'
  return missingDataItems.value.length
    ? ''
    : '当前账号资料已就绪，今天也辛苦了。'
})
const maaYuanConnectTo = computed(function () {
  return {
    path: '/user/profile',
    query: { connect: 'maayuan', from: 'today' },
    hash: '#maayuan-app-title'
  }
})
function readableError(error, fallback) {
  if (!error || !error.message) return fallback
  return /Failed to fetch|NetworkError|fetch/i.test(error.message) ? '网络异常，请稍后重试' : error.message
}

async function loadDashboard() {
  const sequence = ++loadSequence
  accounts.value = []
  realSummary.value = { ...EMPTY_SUMMARY }
  errorMessage.value = ''
  accountLoadFailed.value = false
  accountLoading.value = auth.isLoggedIn
  if (!auth.isLoggedIn) return
  try {
    const data = await listAccounts(auth.userInfo?.id)
    if (sequence !== loadSequence) return
    if (!Array.isArray(data)) throw new Error('游戏账号响应无效，请重试读取')
    accounts.value = data
    activeAccount.syncAccounts(accounts.value)
    if (!validAccountId.value) activeAccount.set(accounts.value[0]?.id)
  } catch (error) {
    if (sequence === loadSequence) {
      accountLoadFailed.value = true
      errorMessage.value = readableError(error, '游戏账号读取失败，请重试')
    }
  } finally {
    if (sequence === loadSequence) accountLoading.value = false
  }
}

async function loadSummary(sequence, targetAccount, game) {
  const results = await Promise.allSettled([
    getOperatorCurrent({ accountId: targetAccount, game }),
    getCurrent({ accountId: targetAccount, entityType: 'item' }),
    getCurrentStarState(targetAccount)
  ])
  if (sequence !== summarySequence) return
  const value = index => results[index].status === 'fulfilled' ? results[index].value : null
  realSummary.value = summarizeTodayData({ current: value(0), inventory: value(1), starState: value(2) })
  if (results[0].status === 'rejected') realSummary.value.operatorCount = null
  if (results[1].status === 'rejected') realSummary.value.inventoryKindCount = null
  if (results[2].status === 'rejected') realSummary.value.starCount = null
  errorMessage.value = results.some(result => result.status === 'rejected') || realSummary.value.operatorCount == null || realSummary.value.starCount == null
    ? '部分状态暂时读取失败；已读取的数据仍可查看，可重试读取状态。' : ''
  summaryLoading.value = false
}

function retrySummary() {
  if (!validAccountId.value || summaryLoading.value) return
  summaryLoading.value = true
  errorMessage.value = ''
  void loadSummary(++summarySequence, validAccountId.value, accountGame.value)
}

// Account initialization finishes before summary requests; switches invalidate old data immediately.
watch([validAccountId, accountGame, accountLoading], () => {
  const sequence = ++summarySequence
  realSummary.value = { ...EMPTY_SUMMARY }
  summaryLoading.value = false
  if (!auth.isLoggedIn || accountLoading.value || accountLoadFailed.value) return
  errorMessage.value = ''
  if (!validAccountId.value) return
  summaryLoading.value = true
  void loadSummary(sequence, validAccountId.value, accountGame.value)
}, { flush: 'sync' })
// 同一用户续期 token 不重建账号上下文，避免打断尚待确认的记账。
watch(() => [auth.isLoggedIn, auth.userInfo?.id], loadDashboard, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { loadSequence++; summarySequence++ })
</script>

<style scoped>
#today-training-todos:empty { display: none; }
.today-customize { border: 1px solid var(--line); border-radius: 8px; color: var(--theme-strong-text, var(--tea)); background: var(--cream); cursor: pointer; font: inherit; font-size: 13px; }
.today-record { border: 1px solid var(--tea); border-radius: 8px; color: var(--on-strong); background: var(--tea); cursor: pointer; font: inherit; font-size: 13px; white-space: nowrap; }
.today-record:hover:not(:disabled) { background: var(--tea-deep); }
.today-record:disabled { opacity: .55; cursor: not-allowed; }
.today-customize:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
/* 刻意共享的字段外观，不持有双端布局。 */

.today-alert { border: 1px solid var(--rouge); color: var(--theme-danger-text, var(--rouge)); line-height: 1.7; }
.today-alert button { border: 1px solid currentColor; background: var(--surface); color: inherit; cursor: pointer; }
.today-loading { color: var(--theme-strong-text, var(--tea)); line-height: 1.7; }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
</style>
<style scoped src="../../components/today/todayAccountDesktop.css"></style>
<style scoped src="../../components/today/todayAccountMobile.css"></style>
