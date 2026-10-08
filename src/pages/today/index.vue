<template>
  <div class="today-page">
    <IslandSidebar />
    <main id="main-content" class="today-main">
      <TodayLobby :owner-id="auth.isLoggedIn ? String(auth.userInfo?.id || '') : ''" :status="lobbyStatus">
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

      <section class="today-content" :data-tour="calendarEnabled || showAccountOverview ? undefined : 'today-overview'">
        <div class="wrap today-wrap">
          <div v-if="errorMessage" class="today-alert" role="alert">
            <span>{{ errorMessage }}</span>
            <button type="button" :disabled="summaryLoading" @click="accountLoadFailed ? loadDashboard() : retrySummary()">重试</button>
          </div>

          <p v-if="accountLoading" class="today-loading" role="status">正在读取游戏账号…</p>
          <ToolTaskPrompt v-if="showDataOnboarding && !isReturningUser" guide-task="today-first-data" title="建立第一份真实数据" description="可以跟着完成一项你需要的真实任务，也可以直接使用下方业务入口。已有成果会复用，保存并验证成功后才算建档。" />

          <div v-if="calendarEnabled || showAccountOverview" class="today-overview" :class="{ 'has-sidebar': calendarEnabled && showAccountOverview }" data-tour="today-overview">
            <TodayActivitySummary v-if="calendarEnabled" :game="calendarGame" />
            <div v-if="showAccountOverview" class="today-account-overview">
              <TodaySubscriptionSummary v-if="calendarEnabled && validAccountId" :account-id="validAccountId" :game="accountGame" />
              <section class="account-data-summary" aria-labelledby="account-data-title" :aria-busy="summaryLoading">
                <h2 id="account-data-title">当前账号状态</h2>
                <p v-if="summaryLoading" class="today-loading" role="status">正在读取当前账号的数据…</p>
                <p v-else-if="!validAccountId">请选择游戏账号，查看对应的数据状态。</p>
                <template v-else>
                  <ul class="account-data-list">
                    <li v-for="item in dataSetupItems" :key="item.key" :class="{ 'is-unknown': item.status === 'unknown' }">
                      <span>{{ item.title }}</span><strong>{{ item.statusLabel }}</strong>
                    </li>
                  </ul>
                  <p v-if="unknownDataItems.length">{{ unknownDataLabel }}状态未确认，不会要求重新录入。</p>
                  <p v-else-if="!missingDataItems.length">已录入的数据可继续在对应工作区维护。</p>
                </template>
              </section>
            </div>
          </div>

          <component
            :is="isReturningUser ? 'details' : 'section'"
            v-if="showDataOnboarding"
            class="data-onboarding"
            :class="{ 'is-optional': isReturningUser }"
            aria-labelledby="data-onboarding-title"
            @toggle="$event.currentTarget.open && $event.currentTarget.scrollIntoView({ block: 'start' })"
          >
            <summary v-if="isReturningUser">还有 {{ missingDataItems.length }} 项数据可补齐（可选）</summary>
            <div class="onboarding-heading">
              <div>
                <span v-if="!isReturningUser" class="onboarding-kicker">第一次建档</span>
                <h2 id="data-onboarding-title">{{ onboardingTitle }}</h2>
                <p>{{ onboardingDescription }}</p>
              </div>
              <span class="onboarding-note">{{ onboardingNote }}</span>
            </div>

            <div v-if="onboardingStage === 'auth'" class="auth-onboarding-card">
              <span class="entry-icon" aria-hidden="true"><Users :size="20" /></span>
              <div class="auth-onboarding-copy">
                <h3>先登录 YuanHub</h3>
                <p>登录后会继续检查你有没有子账号，再分别检查密探、库存和星石。已经有的数据不会要求你重复录入。</p>
              </div>
              <div class="auth-onboarding-actions">
                <router-link class="entry-primary-action" :to="{ path: '/login', query: { redirect: '/' } }">
                  登录并继续
                  <ArrowRight :size="16" aria-hidden="true" />
                </router-link>
                <router-link class="entry-secondary-action" to="/register">还没有账号？注册</router-link>
              </div>
            </div>

            <div
              v-else-if="onboardingStage === 'account'"
              class="inline-account-card account-management-card"
              data-tour="today-create-account"
              aria-labelledby="inline-account-title"
            >
              <div class="inline-account-intro">
                <span class="entry-icon" aria-hidden="true"><Users :size="20" /></span>
                <div>
                  <h3 id="inline-account-title">先建立你的游戏账号</h3>
                  <p>在这里创建游戏账号，今日一览会自动继续检查这个账号的数据。</p>
                </div>
              </div>
              <button
                class="entry-primary-action account-management-action"
                type="button"
                @click="accountContext?.openManager('create', $event.currentTarget)"
              >
                创建游戏账号
                <ArrowRight :size="16" aria-hidden="true" />
              </button>
            </div>

            <div v-else-if="onboardingStage === 'data'" class="entry-choice-wrap" data-tour="today-entry-choice">
              <div class="data-readiness-grid" aria-label="当前账号的数据准备状态">
                <article
                  v-for="item in dataSetupItems"
                  :key="item.key"
                  class="data-readiness-card"
                  :class="{ 'is-ready': item.status === 'ready', 'is-unknown': item.status === 'unknown' }"
                >
                  <div class="readiness-card-head">
                    <span class="readiness-icon" aria-hidden="true"><component :is="item.icon" :size="19" /></span>
                    <div>
                      <h3>{{ item.title }}</h3>
                      <span class="readiness-status">{{ item.statusLabel }}</span>
                    </div>
                  </div>
                  <p>{{ item.description }}</p>
                  <router-link
                    v-if="item.status === 'empty'"
                    class="readiness-action"
                    :to="item.manualTo"
                  >
                    {{ item.manualLabel }}
                    <ArrowRight :size="14" aria-hidden="true" />
                  </router-link>
                </article>
              </div>

              <article v-if="autoSyncMissingItems.length" class="sync-recommendation">
                <div class="sync-recommendation-copy">
                  <span class="entry-icon" aria-hidden="true"><Link2 :size="20" /></span>
                  <div>
                    <span class="recommend-badge">推荐</span>
                    <h3>不想手填，可以连接 MaaYuan</h3>
                    <p>
                      当前可帮助你自动补齐：{{ autoSyncMissingLabel }}。
                      连接后，以后完成对应 MaaYuan 任务就会同步到这个子账号。
                    </p>
                    <small v-if="dataReadiness.star === 'empty'">星石自动同步仍在接入中，当前请先从「星石背包」手动录入。</small>
                  </div>
                </div>
                <router-link class="entry-primary-action" :to="maaYuanConnectTo">
                  去生成连接码
                  <ArrowRight :size="16" aria-hidden="true" />
                </router-link>
              </article>
            </div>
          </component>

        </div>
      </section>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { useAccountListUpdates } from '../../store/accountList.js'
import ToolTaskPrompt from '../../components/ToolTaskPrompt.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowRight, Gem, Link2, PackageOpen, Users } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import DataAccountContextBar from '../../components/DataAccountContextBar.vue'
import TodayActivitySummary from '../../components/today/TodayActivitySummary.vue'
import TodaySubscriptionSummary from '../../components/today/TodaySubscriptionSummary.vue'
import TodayLobby from '../../components/today/TodayLobby.vue'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
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
const calendarEnabled = computed(() => isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR) && auth.isLoggedIn && auth.isAdmin && !accountLoading.value)
const calendarGame = computed(function () {
  return auth.isLoggedIn && accounts.value.some(account => account.id === accountId.value)
    ? accountGame.value : ''
})
const dataReadiness = computed(function () { return getTodayDataReadiness(realSummary.value) })
const isReturningUser = computed(() => !!validAccountId.value && hasTodayAccountData(realSummary.value))
const showAccountOverview = computed(() => auth.isLoggedIn && !accountLoading.value && !accountLoadFailed.value && accounts.value.length > 0 && (summaryLoading.value || !showDataOnboarding.value || isReturningUser.value))
const onboardingStage = computed(function () {
  return getTodayOnboardingStage({
    isLoggedIn: auth.isLoggedIn,
    hasAccounts: accounts.value.length > 0,
    summary: realSummary.value
  })
})
const showDataOnboarding = computed(function () {
  if (auth.isLoggedIn && (accountLoadFailed.value || accountLoading.value || summaryLoading.value || (accounts.value.length && !validAccountId.value))) return false
  return shouldShowTodayDataOnboarding({
    isLoggedIn: auth.isLoggedIn,
    hasAccounts: accounts.value.length > 0,
    summary: realSummary.value
  })
})
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
  const names = missingDataItems.value.map(function (item) { return item.title })
  return isReturningUser.value ? '按需补齐数据' : names.length === 1 ? '还差 ' + names[0] + ' 数据' : '还有 ' + names.length + ' 项数据可以补齐'
})
const onboardingDescription = computed(function () {
  if (onboardingStage.value === 'auth') {
    return '今日一览会根据你的真实数据给出提示。先登录，之后会继续判断是否需要创建子账号。'
  }
  if (onboardingStage.value === 'account') {
    return '密探、库存、星石和自动同步数据都需要先归属到一个游戏账号。账号统一在个人中心创建和维护。'
  }
  return 'YuanHub 已分别检查当前子账号的密探、库存和星石。缺哪一项就只补哪一项，已有数据不会重复要求录入。'
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
    ? `还有 ${missingDataItems.value.length} 项资料尚未建档，随时可以继续。`
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
.today-page { min-height: 100dvh; color: var(--ink); }
.today-main { min-height: 100dvh; }
.today-wrap { max-width: 1180px; }
.today-content { padding: 16px 0 48px; }
.today-alert { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; margin-bottom: 16px; padding: 12px 14px; border: 1px solid var(--rouge); border-radius: 10px; color: var(--rouge); font-size: 13px; line-height: 1.7; }
.today-alert button { min-height: 44px; padding: 8px 12px; border: 1px solid currentColor; border-radius: 7px; background: var(--surface); color: inherit; cursor: pointer; }
.today-loading { color: var(--tea); font-size: 13px; line-height: 1.7; }
.today-overview, .today-account-overview { display: grid; align-items: start; gap: 16px; min-width: 0; margin-bottom: 20px; }
.today-account-overview { margin-bottom: 0; }
.account-data-summary { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.account-data-summary h2 { color: var(--tea); font: 900 20px/1.5 var(--font-s); }
.account-data-summary > p { margin-top: 8px; color: var(--tea); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.account-data-list { display: grid; gap: 8px; list-style: none; margin: 12px 0 0; padding: 0; }
.account-data-list li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; font-size: 13px; line-height: 1.7; }
.account-data-list strong { font-weight: 650; }
.account-data-list .is-unknown { color: var(--rouge); }
.today-page a:focus-visible, .today-page button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.data-onboarding { scroll-margin-top: calc(84px + env(safe-area-inset-top)); margin-bottom: 20px; padding: 20px 16px; border: 1px solid rgba(156, 122, 77, .3); border-radius: 18px; background: linear-gradient(145deg, rgba(255, 253, 246, .94), rgba(239, 210, 142, .12)); }
.onboarding-heading { display: flex; flex-direction: column; align-items: start; justify-content: space-between; gap: 8px; }
.onboarding-heading > div { max-width: 760px; }
.onboarding-kicker { color: var(--accent); font: 800 11px/1 var(--font-d); letter-spacing: .14em; }
.onboarding-heading h2 { margin-top: 9px; font-family: var(--font-s); font-size: 23px; font-weight: 900; }
.onboarding-heading p { margin-top: 9px; color: rgba(73, 59, 44, .68); font-size: 13px; line-height: 1.75; }
.onboarding-note { flex: 0 0 auto; max-width: 180px; color: var(--ink-60); font-size: 11px; line-height: 1.6; text-align: left; }
.auth-onboarding-card { display: grid; grid-template-columns: 1fr; align-items: center; gap: 14px 18px; margin-top: 22px; padding: 16px; border: 1px solid rgba(156, 122, 77, .24); border-radius: 14px; background: rgba(255, 253, 246, .9); }
.auth-onboarding-copy h3 { font-family: var(--font-s); font-size: 19px; font-weight: 900; }
.auth-onboarding-copy p { margin-top: 6px; color: rgba(73, 59, 44, .61); font-size: 12px; line-height: 1.65; }
.auth-onboarding-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; }
.inline-account-card { display: grid; grid-template-columns: 1fr; gap: 18px 24px; margin-top: 22px; padding: 16px; border: 1px solid rgba(215, 137, 53, .36); border-radius: 14px; background: rgba(255, 253, 246, .9); box-shadow: inset 0 3px 0 rgba(215, 137, 53, .32); }
.inline-account-intro { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 13px; grid-column: 1 / -1; }
.inline-account-intro h3 { font-family: var(--font-s); font-size: 19px; font-weight: 900; }
.inline-account-intro p { margin-top: 6px; color: rgba(73, 59, 44, .61); font-size: 12px; line-height: 1.65; }
.account-management-card { align-items: center; }
.account-management-card .inline-account-intro { grid-column: auto; }
.account-management-action { white-space: normal; }
.entry-choice-wrap { margin-top: 18px; }
.data-readiness-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.data-readiness-card { display: flex; flex-direction: column; padding: 18px; border: 1px solid rgba(215, 137, 53, .34); border-radius: 13px; background: rgba(255, 253, 246, .9); }
.data-readiness-card.is-ready { border-color: rgba(98, 128, 93, .28); background: rgba(98, 128, 93, .07); }
.data-readiness-card.is-unknown { border-style: dashed; border-color: rgba(91, 106, 140, .28); }
.readiness-card-head { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 11px; }
.readiness-icon { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 9px; background: rgba(215, 137, 53, .1); color: var(--accent); }
.is-ready .readiness-icon { background: rgba(98, 128, 93, .12); color: #587253; }
.readiness-card-head h3 { font-family: var(--font-s); font-size: 17px; font-weight: 900; }
.readiness-status { display: block; margin-top: 3px; color: var(--accent); font-size: 10.5px; font-weight: 900; }
.is-ready .readiness-status { color: #587253; }
.is-unknown .readiness-status { color: var(--brand-blue); }
.data-readiness-card > p { margin-top: 13px; color: rgba(73, 59, 44, .6); font-size: 11.5px; line-height: 1.65; }
.readiness-action { display: inline-flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; margin-top: 12px; padding: 0 11px; border-radius: 8px; background: rgba(156, 122, 77, .08); color: var(--ink); font-size: 11.5px; font-weight: 900; text-decoration: none; }
.readiness-action:hover { background: rgba(239, 210, 142, .22); }
.sync-recommendation { display: flex; flex-direction: column; align-items: stretch; justify-content: space-between; gap: 16px; margin-top: 14px; padding: 16px; border: 1px solid rgba(215, 137, 53, .36); border-radius: 13px; background: rgba(239, 210, 142, .11); }
.sync-recommendation-copy { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 12px; }
.sync-recommendation h3 { margin-top: 5px; font-family: var(--font-s); font-size: 17px; font-weight: 900; }
.sync-recommendation p { margin-top: 5px; color: rgba(73, 59, 44, .62); font-size: 11.5px; line-height: 1.65; }
.sync-recommendation small { display: block; margin-top: 6px; color: rgba(73, 59, 44, .52); font-size: 10.5px; line-height: 1.55; }
.entry-icon { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 10px; background: rgba(215, 137, 53, .1); color: var(--accent); }
.recommend-badge { background: rgba(239, 210, 142, .48); color: var(--tea); }
.entry-primary-action, .entry-secondary-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 15px; border-radius: 9px; font-size: 12px; font-weight: 900; text-decoration: none; }
.entry-primary-action { background: var(--tea); color: var(--cream); box-shadow: 0 8px 18px rgba(73, 59, 44, .12); }
.entry-secondary-action { border: 1px solid rgba(73, 59, 44, .22); color: var(--ink); }
.data-onboarding.is-optional { padding: 0; border: 0; border-radius: 0; background: transparent; }
.is-optional > summary { min-height: 44px; padding: 10px 0; color: var(--tea); font-size: 13px; font-weight: 700; cursor: pointer; }
.is-optional .onboarding-heading { margin-top: 12px; }
.auth-onboarding-card > .entry-icon { display: none; }
@media (min-width: 768px) {
  .data-readiness-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .onboarding-heading { flex-direction: row; align-items: end; }
  .auth-onboarding-card { grid-template-columns: auto minmax(0, 1fr); }
  .auth-onboarding-card > .entry-icon { display: grid; }
  .auth-onboarding-actions { grid-column: 1 / -1; }
}
@media (min-width: 981px) {
  .today-main { margin-left: 228px; }
  .has-sidebar { grid-template-columns: minmax(0, 1fr) minmax(260px, 300px); }
  .account-management-card { grid-template-columns: minmax(0, 1fr) auto; }
  .sync-recommendation { flex-direction: row; align-items: center; }
}
</style>
