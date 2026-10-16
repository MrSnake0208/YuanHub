<template>
  <TodayLayout :show-overview="calendarEnabled || trainingEnabled"
    :has-sidebar="calendarEnabled && !!validAccountId">
    <template #lobby>
      <TodayLobby :owner-id="auth.isLoggedIn ? String(auth.userInfo?.id || '') : ''" :status="lobbyStatus">
        <template v-if="TUTORIALS_ENABLED" #actions><TutorialEntry v-if="TUTORIALS_ENABLED" task="today-first-data" /></template>
        <DataAccountContextBar
          v-if="auth.isLoggedIn"
          ref="accountContext"
          compact
          :accounts="accounts"
          :account-id="accountId"
          :game="accountGame"
          :is-logged-in="auth.isLoggedIn"
          :loading="accountLoading"
          :switch-disabled="accountLoadFailed"
        />
      </TodayLobby>
    </template>
    <template #status>
      <div v-if="errorMessage" class="today-alert" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" :disabled="summaryLoading" @click="accountLoadFailed ? loadDashboard() : retrySummary()">重试</button>
      </div>

      <p v-if="accountLoading" class="today-loading" role="status">正在读取游戏账号…</p>
      <OnboardingGuide v-if="TUTORIALS_ENABLED" :tasks="['today-first-data']" />
    </template>
    <template #overview>
      <div v-if="(calendarEnabled || trainingEnabled) && validAccountId" class="today-personal">
        <TodaySubscriptionSummary v-if="calendarEnabled" :account-id="validAccountId" :game="accountGame" :hide-empty="isFreshAccount" reminders-target="#today-reminders" />
        <TodayTrainingPlans v-if="trainingEnabled" :account-id="validAccountId" :game="accountGame" :hide-empty="isFreshAccount" />
        <TodayPrivateItems v-if="calendarEnabled" :account-id="validAccountId" :game="accountGame" :hide-empty="isFreshAccount" />
      </div>
    </template>
    <template v-if="calendarEnabled" #activity>
      <TodayActivitySummary :game="calendarGame" />
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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Gem, PackageOpen, Users } from '@lucide/vue'
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

const accounts = ref([])
const accountContext = ref(null)
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
const calendarEnabled = computed(() => isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR) && auth.isLoggedIn && !accountLoading.value)
const trainingEnabled = computed(() => isFeatureEnabled(FEATURE_KEYS.OPERATOR_GROWTH_TRACKING) && auth.isLoggedIn && !accountLoading.value)
const calendarGame = computed(function () {
  return auth.isLoggedIn && accounts.value.some(account => account.id === accountId.value)
    ? accountGame.value : ''
})
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
    return '今日一览会根据你的真实数据给出提示。先登录，之后会继续判断是否需要创建子账号。'
  }
  if (onboardingStage.value === 'account') {
    return '密探、库存、星石和自动同步数据都需要先归属到一个游戏账号。账号统一在个人中心创建和维护。'
  }
  return unknownDataItems.value.length
    ? '仅对确认缺少的数据提供录入入口；状态待确认的资料无需重新录入。'
    : '任选一项录入即可开始，也可以连接 MaaYuan 自动同步密探和库存。'
})
const onboardingNote = computed(function () {
  return '任选所需业务 · 无需全部录入'
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
watch(() => [auth.isLoggedIn, auth.accessToken, auth.userInfo?.id], loadDashboard, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { loadSequence++; summarySequence++ })
</script>

<style scoped>
/* 刻意共享的字段外观，不持有双端布局。 */

.today-alert { border: 1px solid var(--rouge); color: var(--rouge); line-height: 1.7; }
.today-alert button { border: 1px solid currentColor; background: var(--surface); color: inherit; cursor: pointer; }
.today-loading { color: var(--tea); line-height: 1.7; }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
<style scoped src="../../components/today/todayAccountDesktop.css"></style>
<style scoped src="../../components/today/todayAccountMobile.css"></style>
