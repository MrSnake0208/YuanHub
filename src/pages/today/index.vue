<template>
  <div class="today-page">
    <IslandSidebar />
    <main id="main-content" class="today-main">
      <header class="today-hero">
        <div class="wrap today-wrap">
          <div class="hero-copy">
            <span class="today-kicker">YUANHUB · 今日一览</span>
            <h1>今天也来啦</h1>
            <p>不用记住所有页面。先看看今天值得做什么，再从这里去到对应工具。</p>
            <div class="hero-actions">
              <router-link class="primary-action" :to="heroPrimaryTo">
                {{ heroPrimaryLabel }}
                <ArrowRight :size="16" aria-hidden="true" />
              </router-link>
            </div>
          </div>

          <div class="account-context">
            <span class="data-badge" :class="{ 'is-demo': !auth.isLoggedIn }">
              <span class="status-dot" aria-hidden="true"></span>
              {{ auth.isLoggedIn ? '真实数据' : '演示数据' }}
            </span>
            <label v-if="auth.isLoggedIn && accounts.length" class="account-picker">
              <span>当前子账号</span>
              <select v-model="accountId" :disabled="loading" aria-label="选择今日一览的数据子账号">
                <option v-for="account in accounts" :key="account.id" :value="account.id">
                  {{ account.name }} · {{ account.game || activeAccount.gameFor(account.id) }}
                </option>
              </select>
            </label>
            <p v-else-if="auth.isLoggedIn && loading">正在读取你的账号状态…</p>
            <p v-else-if="auth.isLoggedIn">尚未建立子账号，先从今天的第一步开始。</p>
            <p v-else>这是示例状态。登录后会换成你的账号、密探和库存数据。</p>
          </div>
        </div>
      </header>

      <section class="today-content">
        <div class="wrap today-wrap">
          <div v-if="errorMessage" class="today-alert" role="alert">
            <span>{{ errorMessage }}</span>
            <button type="button" @click="loadDashboard">重试</button>
          </div>

          <section
            v-if="showDataOnboarding"
            class="data-onboarding"
            aria-labelledby="data-onboarding-title"
          >
            <div class="onboarding-heading">
              <div>
                <span class="onboarding-kicker">FIRST DATA · 第一次建档</span>
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

            <form
              v-else-if="onboardingStage === 'account'"
              class="inline-account-card"
              data-tour="today-create-account"
              aria-labelledby="inline-account-title"
              @submit.prevent="createTodayAccount"
            >
              <div class="inline-account-intro">
                <span class="entry-icon" aria-hidden="true"><Users :size="20" /></span>
                <div>
                  <h3 id="inline-account-title">创建第一个子账号</h3>
                  <p>名称只用于区分你的游戏存档；密探、库存、奖励和连接码都会归到这个账号。</p>
                </div>
              </div>

              <fieldset class="account-game-choice">
                <legend>游戏版本</legend>
                <div class="account-game-options">
                  <label
                    v-for="game in ACCOUNT_GAMES"
                    :key="game"
                    :class="{ selected: newAccountGame === game }"
                  >
                    <input
                      v-model="newAccountGame"
                      type="radio"
                      name="today-account-game"
                      :value="game"
                      :disabled="creatingAccount"
                    />
                    <span>{{ game }}</span>
                  </label>
                </div>
              </fieldset>

              <label class="account-name-field" for="today-account-name">
                <span>账号名称</span>
                <input
                  id="today-account-name"
                  v-model="newAccountName"
                  maxlength="64"
                  autocomplete="off"
                  placeholder="例如：大鸟大号"
                  :disabled="creatingAccount"
                />
              </label>

              <div class="inline-account-actions">
                <p v-if="accountCreateError" class="account-create-error" role="alert">
                  {{ accountCreateError }}
                </p>
                <button
                  type="submit"
                  class="entry-primary-button"
                  :disabled="creatingAccount || !newAccountName.trim()"
                >
                  {{ creatingAccount ? '正在创建…' : '创建并开始录入' }}
                  <ArrowRight :size="16" aria-hidden="true" />
                </button>
              </div>
            </form>

            <div v-else-if="onboardingStage === 'data'" class="entry-choice-wrap" data-tour="today-entry-choice">
              <p v-if="createdAccountName" class="account-created-note" role="status">
                已创建“{{ createdAccountName }}”。下面会按功能分别检查，已经有的数据不会重复要求录入。
              </p>
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
          </section>

          <section class="today-section" data-tour="today-overview" aria-labelledby="today-actions-title">
            <div class="section-heading">
              <div>
                <span class="section-index">01</span>
                <h2 id="today-actions-title">今天先做</h2>
              </div>
              <p>{{ auth.isLoggedIn ? '根据当前账号状态整理' : '用演示状态带你认识常用流程' }}</p>
            </div>
            <div class="task-grid" :aria-busy="loading">
              <router-link v-for="(task, index) in todayTasks" :key="task.title" class="task-card" :to="task.to">
                <span class="task-number">0{{ index + 1 }}</span>
                <component :is="task.icon" :size="22" aria-hidden="true" />
                <div>
                  <h3>{{ task.title }}</h3>
                  <p>{{ task.description }}</p>
                </div>
                <ArrowRight class="task-arrow" :size="18" aria-hidden="true" />
              </router-link>
            </div>
          </section>

          <section class="today-section" aria-labelledby="today-status-title">
            <div class="section-heading">
              <div>
                <span class="section-index">02</span>
                <h2 id="today-status-title">一眼看懂现在</h2>
              </div>
              <p>{{ summaryCaption }}</p>
            </div>
            <div class="summary-grid" :aria-busy="loading">
              <div v-for="item in summaryItems" :key="item.label" class="summary-card">
                <component :is="item.icon" :size="19" aria-hidden="true" />
                <strong>{{ (loading && auth.isLoggedIn) || item.value == null ? '—' : item.value }}</strong>
                <span>{{ item.label }}</span>
              </div>
            </div>
          </section>

          <section class="today-section" aria-labelledby="today-tools-title">
            <div class="section-heading">
              <div>
                <span class="section-index">03</span>
                <h2 id="today-tools-title">你可以在这里</h2>
              </div>
              <p>按目的找功能，不用记菜单层级</p>
            </div>

            <div class="tool-groups">
              <div v-for="group in toolGroups" :key="group.title" class="tool-group">
                <div class="tool-group-heading">
                  <span>{{ group.eyebrow }}</span>
                  <h3>{{ group.title }}</h3>
                </div>
                <div class="tool-list">
                  <router-link v-for="tool in group.tools" :key="tool.title" class="tool-card" :to="tool.to">
                    <span class="tool-icon"><component :is="tool.icon" :size="21" aria-hidden="true" /></span>
                    <span class="tool-copy">
                      <strong>{{ tool.title }}</strong>
                      <small>{{ tool.description }}</small>
                    </span>
                    <span v-if="tool.badge" class="tool-badge">{{ tool.badge }}</span>
                    <ArrowRight class="tool-arrow" :size="17" aria-hidden="true" />
                  </router-link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowRight,
  Bell,
  Gem,
  Heart,
  Link2,
  MessageSquareText,
  PackageOpen,
  ScrollText,
  ShoppingCart,
  Users,
  Zap
} from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { createAccount, listAccounts } from '../../api/accounts.js'
import { getOperatorCurrent } from '../../api/operator.js'
import { getCurrent, listAgentFavorites } from '../../api/inventory.js'
import { getUnreadNotificationCount } from '../../api/notifications.js'
import { getCurrentStarState } from '../../api/starState.js'
import { auth } from '../../store/auth.js'
import { ACCOUNT_GAMES, DEFAULT_ACCOUNT_GAME, activeAccount } from '../../store/activeAccount.js'
import {
  getTodayDataReadiness,
  getTodayOnboardingStage,
  shouldShowTodayDataOnboarding,
  summarizeTodayData
} from '../../data/todayData.js'

const DEMO_SUMMARY = Object.freeze({ operatorCount: 3, favoriteCount: 2, inventoryKindCount: 5, starCount: 6, unreadCount: 1 })
const EMPTY_SUMMARY = Object.freeze({ operatorCount: 0, favoriteCount: 0, inventoryKindCount: 0, starCount: 0, unreadCount: 0 })
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
    readyDescription: '密探数据已经可用于今日一览和养成相关功能。',
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
    readyDescription: '库存数据已经可用于今日一览和材料相关功能。',
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
const realSummary = ref({ ...EMPTY_SUMMARY })
const loading = ref(false)
const errorMessage = ref('')
const accountLoadFailed = ref(false)
const creatingAccount = ref(false)
const newAccountName = ref('')
const newAccountGame = ref(DEFAULT_ACCOUNT_GAME)
const accountCreateError = ref('')
const createdAccountName = ref('')
let loadSequence = 0

const accountId = computed({
  get: function () { return activeAccount.id },
  set: function (value) { activeAccount.set(value) }
})

const accountGame = computed(function () { return activeAccount.gameFor(accountId.value) })
const summary = computed(function () { return auth.isLoggedIn ? realSummary.value : DEMO_SUMMARY })
const dataReadiness = computed(function () { return getTodayDataReadiness(realSummary.value) })
const onboardingStage = computed(function () {
  return getTodayOnboardingStage({
    isLoggedIn: auth.isLoggedIn,
    hasAccounts: accounts.value.length > 0,
    summary: realSummary.value
  })
})
const showDataOnboarding = computed(function () {
  if (auth.isLoggedIn && (accountLoadFailed.value || loading.value)) return false
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
    return {
      ...item,
      status,
      statusLabel: status === 'ready'
        ? '已录入 ' + count + ' ' + item.unit
        : status === 'unknown'
          ? '暂时无法读取'
          : '尚未录入',
      description: status === 'ready'
        ? item.readyDescription
        : status === 'unknown'
          ? '这项数据暂时读取失败，不会要求你重新录入。'
          : item.emptyDescription
    }
  })
})
const missingDataItems = computed(function () {
  return dataSetupItems.value.filter(function (item) { return item.status === 'empty' })
})
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
  return names.length === 1 ? '还差 ' + names[0] + ' 数据' : '还有 ' + names.length + ' 项数据可以补齐'
})
const onboardingDescription = computed(function () {
  if (onboardingStage.value === 'auth') {
    return '今日一览会根据你的真实数据给出提示。先登录，之后会继续判断是否需要创建子账号。'
  }
  if (onboardingStage.value === 'account') {
    return '密探、库存、星石和自动同步数据都需要先归属到一个游戏子账号。直接在这里创建即可。'
  }
  return 'YuanHub 已分别检查当前子账号的密探、库存和星石。缺哪一项就只补哪一项，已有数据不会重复要求录入。'
})
const onboardingNote = computed(function () {
  if (onboardingStage.value === 'auth') return '第 1 步 · 登录'
  if (onboardingStage.value === 'account') return '第 2 步 · 子账号'
  return '第 3 步 · 按功能补数据'
})
const maaYuanConnectTo = computed(function () {
  return {
    path: '/user/profile',
    query: { connect: 'maayuan', from: 'today' },
    hash: '#maayuan-app-title'
  }
})
const heroPrimaryTo = computed(function () {
  if (onboardingStage.value === 'auth') return { path: '/login', query: { redirect: '/' } }
  if (showDataOnboarding.value) return '/#data-onboarding-title'
  return '/operator/quick'
})
const heroPrimaryLabel = computed(function () {
  if (onboardingStage.value === 'auth') return '登录并开始'
  if (onboardingStage.value === 'account') return '先创建子账号'
  if (onboardingStage.value === 'data') return '继续补齐 ' + missingDataItems.value.length + ' 项数据'
  return '快速更新数据'
})
const summaryCaption = computed(function () {
  if (!auth.isLoggedIn) return '示例账号 · 登录后显示你的真实状态'
  const account = accounts.value.find(function (item) { return item.id === accountId.value })
  return account ? `${account.name} · ${account.game || accountGame.value}` : '等待建立第一个子账号'
})

const summaryItems = computed(function () {
  return [
    { label: '已录入密探', value: summary.value.operatorCount, icon: Users },
    { label: '有库存材料', value: summary.value.inventoryKindCount, icon: PackageOpen },
    { label: '已录入星石', value: summary.value.starCount, icon: Gem },
    { label: '未读通知', value: summary.value.unreadCount, icon: Bell }
  ]
})

const todayTasks = computed(function () {
  if (!auth.isLoggedIn) {
    return [
      { title: '登录并开始建档', description: '登录后会继续检查子账号和三类核心数据。', to: { path: '/login', query: { redirect: '/' } }, icon: Users },
      { title: '看看最近更新', description: '了解 YuanHub 最近新增和调整了哪些功能。', to: '/changelog', icon: ScrollText }
    ]
  }
  if (!accounts.value.length) {
    return [
      { title: '建立第一个子账号', description: '密探、库存和星石都会统一归到这个游戏账号。', to: '/#data-onboarding-title', icon: Users }
    ]
  }

  const tasks = []
  tasks.push(summary.value.operatorCount == null
    ? { title: '打开密探名册', description: '密探状态暂未读取，可以到名册中继续查看。', to: '/operator?tab=current', icon: Users }
    : summary.value.operatorCount
    ? summary.value.favoriteCount == null
      ? { title: '看看密探近况', description: `已录入 ${summary.value.operatorCount} 位，关注状态暂未读取。`, to: '/operator?tab=current', icon: Users }
      : summary.value.favoriteCount
      ? { title: '看看密探近况', description: `已录入 ${summary.value.operatorCount} 位，${summary.value.favoriteCount} 位特别关注。`, to: '/operator?tab=current', icon: Users }
      : { title: '选出特别关注', description: '把最近要养的密探放到最前面。', to: '/operator?tab=current', icon: Heart }
    : { title: '录入密探进度', description: '先建立 BOX，之后今日一览才能给出更贴合的提示。', to: '/operator/quick', icon: Zap })
  tasks.push(summary.value.inventoryKindCount == null
    ? { title: '打开库存追踪', description: '库存状态暂未读取，可以到库存页继续查看。', to: '/inventory', icon: PackageOpen }
    : summary.value.inventoryKindCount
    ? { title: '核对当前库存', description: `已有 ${summary.value.inventoryKindCount} 种材料，看看是否需要更新。`, to: '/inventory', icon: PackageOpen }
    : { title: '建立库存快照', description: '录入现有材料，后续获取与消耗才有依据。', to: '/inventory', icon: PackageOpen })
  tasks.push(summary.value.starCount == null
    ? { title: '打开星石背包', description: '星石状态暂未读取，可以到星石背包继续查看。', to: '/star', icon: Gem }
    : summary.value.starCount
    ? { title: '整理星石背包', description: `已有 ${summary.value.starCount} 颗星石，看看是否需要更新搭配。`, to: '/star', icon: Gem }
    : { title: '录入星石背包', description: '记录已拥有的星石，之后可以按密探整理搭配。', to: '/star', icon: Gem })
  return tasks
})

const toolGroups = computed(function () {
  const unreadBadge = auth.isLoggedIn && summary.value.unreadCount ? `${summary.value.unreadCount} 条新消息` : ''
  return [
    {
      eyebrow: 'LOOK AROUND',
      title: '看一看',
      tools: [
        { title: '密探名册', description: '看图鉴、养成进度与密探 BOX', to: '/operator', icon: Users },
        { title: '库存追踪', description: '看材料余量、来源与变化记录', to: '/inventory', icon: PackageOpen },
        { title: '星石背包', description: '看已有星石与密探搭配', to: '/star', icon: Gem },
        { title: '更新日志', description: '看看 YuanHub 最近新增了什么', to: '/changelog', icon: ScrollText }
      ]
    },
    {
      eyebrow: 'GET THINGS DONE',
      title: '动手做',
      tools: [
        { title: '快捷录入', description: '快速更新密探与库存数据', to: '/operator/quick', icon: Zap },
        { title: '广陵账房', description: '计算礼包性价比，整理购买计划', to: '/cart', icon: ShoppingCart },
        { title: '通知中心', description: auth.isLoggedIn ? '处理反馈回复与站内消息' : '登录后接收反馈回复与站内消息', to: '/notifications', icon: Bell, badge: unreadBadge },
        { title: '反馈中心', description: auth.isLoggedIn ? '提交建议并跟进处理进度' : '登录后提交建议并跟进进度', to: '/feedback', icon: MessageSquareText }
      ]
    }
  ]
})

function readableError(error, fallback) {
  if (!error || !error.message) return fallback
  return /Failed to fetch|NetworkError|fetch/i.test(error.message) ? '网络异常，请稍后重试' : error.message
}

async function createTodayAccount() {
  if (creatingAccount.value) return
  const name = newAccountName.value.trim()
  if (!name) {
    accountCreateError.value = '请填写一个方便辨认的账号名称'
    return
  }

  creatingAccount.value = true
  accountCreateError.value = ''
  try {
    const created = await createAccount(name, newAccountGame.value)
    if (!created || !created.id) throw new Error('账号已创建，但没有返回账号编号，请重新加载')

    accounts.value = accounts.value.concat(created)
    activeAccount.syncAccounts(accounts.value)
    activeAccount.set(created.id)
    createdAccountName.value = created.name || name
    newAccountName.value = ''
    realSummary.value = { ...EMPTY_SUMMARY }
  } catch (error) {
    accountCreateError.value = readableError(error, '子账号创建失败，请稍后重试')
  } finally {
    creatingAccount.value = false
  }
}

async function loadDashboard() {
  if (!auth.isLoggedIn) return
  const sequence = ++loadSequence
  loading.value = true
  errorMessage.value = ''
  accountLoadFailed.value = false
  try {
    const data = await listAccounts()
    if (sequence !== loadSequence) return
    accounts.value = Array.isArray(data) ? data : []
    activeAccount.syncAccounts(accounts.value)
    if (!accounts.value.some(function (account) { return account.id === accountId.value })) {
      activeAccount.set(accounts.value[0] && accounts.value[0].id)
    }
    await loadSummary(sequence)
  } catch (error) {
    if (sequence === loadSequence) {
      accountLoadFailed.value = true
      errorMessage.value = readableError(error, '今日一览数据读取失败')
    }
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function loadSummary(sequence) {
  const targetAccount = accountId.value
  const requests = [getUnreadNotificationCount()]
  if (targetAccount) {
    requests.push(
      getOperatorCurrent({ accountId: targetAccount, game: accountGame.value }),
      getCurrent({ accountId: targetAccount, entityType: 'item' }),
      listAgentFavorites(targetAccount),
      getCurrentStarState(targetAccount)
    )
  }
  const results = await Promise.allSettled(requests)
  if (sequence !== loadSequence || targetAccount !== accountId.value) return

  const failures = results.filter(function (result) { return result.status === 'rejected' })
  realSummary.value = summarizeTodayData({
    notifications: results[0].status === 'fulfilled' ? results[0].value : null,
    current: results[1] && results[1].status === 'fulfilled' ? results[1].value : null,
    inventory: results[2] && results[2].status === 'fulfilled' ? results[2].value : null,
    favorites: results[3] && results[3].status === 'fulfilled' ? results[3].value : null,
    starState: results[4] && results[4].status === 'fulfilled' ? results[4].value : null
  })
  if (results[0].status === 'rejected') realSummary.value.unreadCount = null
  if (targetAccount && results[1].status === 'rejected') realSummary.value.operatorCount = null
  if (targetAccount && results[2].status === 'rejected') realSummary.value.inventoryKindCount = null
  if (targetAccount && results[3].status === 'rejected') realSummary.value.favoriteCount = null
  if (targetAccount && results[4].status === 'rejected') realSummary.value.starCount = null
  errorMessage.value = failures.length ? '部分状态暂时读取失败，页面没有使用演示数据补齐。' : ''
}

watch([accountId, accountGame], function () {
  if (!auth.isLoggedIn || !accounts.value.length) return
  const sequence = ++loadSequence
  loading.value = true
  errorMessage.value = ''
  loadSummary(sequence).finally(function () {
    if (sequence === loadSequence) loading.value = false
  })
})

onMounted(loadDashboard)
</script>

<style scoped>
.today-page { min-height: 100vh; color: var(--ink); }
.today-main { min-height: 100vh; margin-left: 228px; }
.today-wrap { max-width: 1180px; }
.today-hero { position: relative; overflow: hidden; padding: 64px 0 48px; border-bottom: 1px solid rgba(156, 122, 77, .26); background: linear-gradient(135deg, rgba(255, 253, 246, .9), rgba(239, 210, 142, .2)); }
.today-hero::after { position: absolute; top: -160px; right: -100px; width: 420px; height: 420px; border: 1px solid rgba(156, 122, 77, .18); border-radius: 50%; box-shadow: 0 0 0 46px rgba(156, 122, 77, .04), 0 0 0 92px rgba(156, 122, 77, .035); content: ''; pointer-events: none; }
.today-hero .today-wrap { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr) 300px; align-items: end; gap: 72px; }
.today-kicker, .section-index, .tool-group-heading span { color: var(--accent); font: 800 11px/1 var(--font-d); letter-spacing: .14em; }
.today-hero h1 { margin-top: 12px; font-family: var(--font-s); font-size: clamp(42px, 5vw, 68px); font-weight: 900; letter-spacing: -.04em; }
.hero-copy > p { max-width: 610px; margin-top: 12px; color: rgba(73, 59, 44, .7); font-size: 15px; line-height: 1.8; }
.hero-actions { display: flex; align-items: center; gap: 12px; margin-top: 26px; }
.hero-actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 0 16px; border-radius: 9px; font-size: 13px; font-weight: 800; text-decoration: none; }
.primary-action { gap: 8px; background: var(--tea); color: var(--cream); box-shadow: 0 8px 20px rgba(73, 59, 44, .15); }
.account-context { display: grid; gap: 14px; padding: 20px; border: 1px solid rgba(156, 122, 77, .28); border-radius: 14px; background: rgba(255, 253, 246, .72); backdrop-filter: blur(10px); }
.account-context > p { color: rgba(73, 59, 44, .68); font-size: 12px; line-height: 1.6; }
.data-badge { display: inline-flex; align-items: center; gap: 7px; width: max-content; color: var(--tea); font-size: 11px; font-weight: 900; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #62805d; box-shadow: 0 0 0 4px rgba(98, 128, 93, .12); }
.data-badge.is-demo { color: #9b6c30; }
.data-badge.is-demo .status-dot { background: #d18935; box-shadow: 0 0 0 4px rgba(209, 137, 53, .14); }
.account-picker { display: grid; gap: 7px; color: rgba(73, 59, 44, .62); font-size: 10px; font-weight: 900; letter-spacing: .08em; }
.account-picker select { min-width: 0; min-height: 42px; padding: 0 34px 0 11px; border: 1px solid rgba(156, 122, 77, .35); border-radius: 8px; background: var(--surface); color: var(--ink); font: 700 13px var(--font-b); }
.today-content { padding: 38px 0 72px; }
.today-alert { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding: 12px 14px; border: 1px solid rgba(166, 81, 74, .28); border-radius: 10px; background: rgba(166, 81, 74, .07); color: var(--rouge); font-size: 12px; }
.today-alert button { padding: 7px 11px; border: 1px solid currentColor; border-radius: 7px; background: transparent; color: inherit; font-weight: 800; cursor: pointer; }
.data-onboarding { margin-bottom: 46px; padding: 26px; border: 1px solid rgba(156, 122, 77, .3); border-radius: 18px; background: linear-gradient(145deg, rgba(255, 253, 246, .94), rgba(239, 210, 142, .12)); box-shadow: 0 14px 36px rgba(73, 59, 44, .06); }
.onboarding-heading { display: flex; align-items: end; justify-content: space-between; gap: 32px; }
.onboarding-heading > div { max-width: 760px; }
.onboarding-kicker { color: var(--accent); font: 800 11px/1 var(--font-d); letter-spacing: .14em; }
.onboarding-heading h2 { margin-top: 9px; font-family: var(--font-s); font-size: 27px; font-weight: 900; }
.onboarding-heading p { margin-top: 9px; color: rgba(73, 59, 44, .68); font-size: 13px; line-height: 1.75; }
.onboarding-note { flex: 0 0 auto; max-width: 180px; color: rgba(73, 59, 44, .52); font-size: 11px; line-height: 1.6; text-align: right; }
.auth-onboarding-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px 18px; margin-top: 22px; padding: 22px; border: 1px solid rgba(156, 122, 77, .24); border-radius: 14px; background: rgba(255, 253, 246, .9); }
.auth-onboarding-copy h3 { font-family: var(--font-s); font-size: 19px; font-weight: 900; }
.auth-onboarding-copy p { margin-top: 6px; color: rgba(73, 59, 44, .61); font-size: 12px; line-height: 1.65; }
.auth-onboarding-actions { display: flex; align-items: center; gap: 9px; }
.inline-account-card { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(260px, .8fr); gap: 18px 24px; margin-top: 22px; padding: 22px; border: 1px solid rgba(215, 137, 53, .36); border-radius: 14px; background: rgba(255, 253, 246, .9); box-shadow: inset 0 3px 0 rgba(215, 137, 53, .32); }
.inline-account-intro { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 13px; grid-column: 1 / -1; }
.inline-account-intro h3 { font-family: var(--font-s); font-size: 19px; font-weight: 900; }
.inline-account-intro p { margin-top: 6px; color: rgba(73, 59, 44, .61); font-size: 12px; line-height: 1.65; }
.account-game-choice { margin: 0; padding: 0; border: 0; }
.account-game-choice legend, .account-name-field > span { display: block; margin-bottom: 8px; color: rgba(73, 59, 44, .66); font-size: 11px; font-weight: 900; letter-spacing: .05em; }
.account-game-options { display: flex; flex-wrap: wrap; gap: 8px; }
.account-game-options label { position: relative; display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0 15px; border: 1px solid rgba(156, 122, 77, .28); border-radius: 9px; background: var(--surface); color: rgba(73, 59, 44, .72); font-size: 12px; font-weight: 800; cursor: pointer; }
.account-game-options label.selected { border-color: rgba(215, 137, 53, .58); background: rgba(239, 210, 142, .2); color: var(--ink); }
.account-game-options input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
.account-game-options label:focus-within { outline: 2px solid rgba(215, 137, 53, .42); outline-offset: 2px; }
.account-name-field { display: block; }
.account-name-field input { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid rgba(156, 122, 77, .34); border-radius: 9px; background: var(--surface); color: var(--ink); font: 700 13px var(--font-b); }
.account-name-field input:focus { border-color: rgba(215, 137, 53, .7); outline: 2px solid rgba(215, 137, 53, .16); outline-offset: 1px; }
.inline-account-actions { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-end; gap: 14px; padding-top: 2px; }
.account-create-error { margin-right: auto; color: var(--rouge); font-size: 11px; font-weight: 700; line-height: 1.5; }
.entry-primary-button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 8px; padding: 0 16px; border: 0; border-radius: 9px; background: var(--tea); color: var(--cream); box-shadow: 0 8px 18px rgba(73, 59, 44, .12); font: 900 12px var(--font-b); cursor: pointer; }
.entry-primary-button:disabled { opacity: .5; cursor: not-allowed; }
.entry-choice-wrap { margin-top: 18px; }
.account-created-note { margin-bottom: 12px; padding: 10px 12px; border-radius: 9px; background: rgba(98, 128, 93, .1); color: #4f684b; font-size: 11.5px; font-weight: 800; line-height: 1.55; }
.data-readiness-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.data-readiness-card { display: flex; min-height: 188px; flex-direction: column; padding: 18px; border: 1px solid rgba(215, 137, 53, .34); border-radius: 13px; background: rgba(255, 253, 246, .9); }
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
.readiness-action { display: inline-flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 40px; margin-top: auto; padding: 0 11px; border-radius: 8px; background: rgba(156, 122, 77, .08); color: var(--ink); font-size: 11.5px; font-weight: 900; text-decoration: none; }
.readiness-action:hover { background: rgba(239, 210, 142, .22); }
.sync-recommendation { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 14px; padding: 18px 20px; border: 1px solid rgba(215, 137, 53, .36); border-radius: 13px; background: rgba(239, 210, 142, .11); }
.sync-recommendation-copy { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 12px; }
.sync-recommendation h3 { margin-top: 5px; font-family: var(--font-s); font-size: 17px; font-weight: 900; }
.sync-recommendation p { margin-top: 5px; color: rgba(73, 59, 44, .62); font-size: 11.5px; line-height: 1.65; }
.sync-recommendation small { display: block; margin-top: 6px; color: rgba(73, 59, 44, .52); font-size: 10.5px; line-height: 1.55; }
.data-entry-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .85fr); gap: 14px; }
.entry-card { padding: 22px; border: 1px solid rgba(156, 122, 77, .24); border-radius: 14px; background: rgba(255, 253, 246, .88); }
.recommended-entry { border-color: rgba(215, 137, 53, .42); box-shadow: inset 0 3px 0 rgba(215, 137, 53, .42); }
.entry-card-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 13px; align-items: start; }
.entry-icon { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 10px; background: rgba(215, 137, 53, .1); color: var(--accent); }
.entry-card-head h3 { margin-top: 5px; font-family: var(--font-s); font-size: 19px; font-weight: 900; }
.entry-card-head p { margin-top: 6px; color: rgba(73, 59, 44, .61); font-size: 12px; line-height: 1.65; }
.recommend-badge, .manual-badge { display: inline-flex; align-items: center; width: max-content; min-height: 23px; padding: 0 8px; border-radius: 999px; font-size: 10px; font-weight: 900; letter-spacing: .04em; }
.recommend-badge { background: rgba(239, 210, 142, .48); color: var(--tea); }
.manual-badge { border: 1px solid rgba(91, 106, 140, .32); color: var(--brand-blue); }
.sync-steps { display: grid; gap: 0; margin: 20px 0; padding: 0; list-style: none; }
.sync-steps.compact { margin-bottom: 18px; }
.sync-steps li { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; padding: 9px 0; }
.sync-steps li:not(:last-child)::after { position: absolute; top: 36px; bottom: -1px; left: 13px; width: 1px; background: rgba(156, 122, 77, .2); content: ''; }
.step-number { position: relative; z-index: 1; display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid rgba(215, 137, 53, .38); border-radius: 50%; background: var(--surface); color: var(--accent); font: 900 11px/1 var(--font-d); }
.sync-steps strong, .manual-copy strong { font-size: 12px; font-weight: 900; }
.sync-steps p, .manual-copy p { margin-top: 4px; color: rgba(73, 59, 44, .58); font-size: 11px; line-height: 1.65; }
.sync-task-map { display: grid; gap: 6px; margin-top: 10px; }
.sync-task-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, auto); align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px; background: rgba(156, 122, 77, .07); }
.sync-task-row > span:first-child { color: rgba(73, 59, 44, .68); font-size: 11px; font-weight: 800; }
.sync-task-target { display: flex; align-items: center; justify-content: flex-end; gap: 6px; color: var(--ink); font-size: 11px; font-weight: 900; text-align: right; }
.sync-task-target::before { color: rgba(215, 137, 53, .82); content: '→'; }
.sync-task-coming { padding: 2px 5px; border-radius: 999px; background: rgba(91, 106, 140, .1); color: var(--brand-blue); font-size: 9px; font-style: normal; font-weight: 900; white-space: nowrap; }
.entry-primary-action, .entry-secondary-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 15px; border-radius: 9px; font-size: 12px; font-weight: 900; text-decoration: none; }
.entry-primary-action { background: var(--tea); color: var(--cream); box-shadow: 0 8px 18px rgba(73, 59, 44, .12); }
.entry-secondary-action { border: 1px solid rgba(73, 59, 44, .22); color: var(--ink); }
.manual-entry { display: flex; flex-direction: column; }
.manual-copy { margin-top: 20px; padding: 16px 0; border-top: 1px solid rgba(156, 122, 77, .18); border-bottom: 1px solid rgba(156, 122, 77, .18); }
.manual-page-links { display: grid; gap: 7px; margin-top: 12px; }
.manual-page-links a { display: flex; min-height: 40px; align-items: center; justify-content: space-between; gap: 10px; padding: 0 11px; border-radius: 8px; background: rgba(156, 122, 77, .07); color: var(--ink); font-size: 11.5px; font-weight: 850; text-decoration: none; }
.manual-page-links a:hover { background: rgba(239, 210, 142, .18); }
.manual-actions { display: grid; align-items: start; gap: 12px; margin-top: auto; padding-top: 22px; }
.today-section + .today-section { margin-top: 52px; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
.section-heading > div { display: flex; align-items: baseline; gap: 12px; }
.section-heading h2 { font-family: var(--font-s); font-size: 26px; font-weight: 900; }
.section-heading > p { color: rgba(73, 59, 44, .56); font-size: 12px; }
.task-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.task-card { position: relative; display: grid; grid-template-columns: auto 1fr auto; gap: 13px; min-height: 146px; padding: 25px 20px 20px; overflow: hidden; border: 1px solid rgba(156, 122, 77, .3); border-radius: 14px; background: var(--surface); color: var(--ink); text-decoration: none; transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
.task-card:hover { transform: translateY(-2px); border-color: rgba(156, 122, 77, .58); box-shadow: 0 12px 28px rgba(73, 59, 44, .08); }
.task-card > svg:first-of-type { color: var(--accent); }
.task-number { position: absolute; top: 8px; right: 12px; color: rgba(156, 122, 77, .14); font: 900 38px/1 var(--font-d); }
.task-card h3 { font-size: 15px; font-weight: 900; }
.task-card p { margin-top: 8px; color: rgba(73, 59, 44, .62); font-size: 12px; line-height: 1.65; }
.task-arrow { align-self: end; color: rgba(73, 59, 44, .4); }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid rgba(156, 122, 77, .28); border-radius: 14px; background: rgba(255, 253, 246, .58); }
.summary-card { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 3px 12px; padding: 22px; }
.summary-card + .summary-card { border-left: 1px solid rgba(156, 122, 77, .22); }
.summary-card svg { grid-row: span 2; color: var(--accent); }
.summary-card strong { font: 900 24px/1 var(--font-d); }
.summary-card span { color: rgba(73, 59, 44, .58); font-size: 11px; font-weight: 700; }
.tool-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.tool-group { overflow: hidden; border: 1px solid rgba(156, 122, 77, .28); border-radius: 14px; background: var(--surface); }
.tool-group-heading { padding: 20px 22px 15px; border-bottom: 1px solid rgba(156, 122, 77, .18); }
.tool-group-heading h3 { margin-top: 7px; font-family: var(--font-s); font-size: 20px; }
.tool-list { display: grid; }
.tool-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 13px; min-height: 78px; padding: 14px 18px; color: var(--ink); text-decoration: none; }
.tool-card + .tool-card { border-top: 1px solid rgba(156, 122, 77, .16); }
.tool-card:hover { background: rgba(239, 210, 142, .1); }
.tool-icon { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 10px; background: rgba(156, 122, 77, .1); color: var(--accent); }
.tool-copy { display: grid; gap: 5px; min-width: 0; }
.tool-copy strong { font-size: 13px; }
.tool-copy small { overflow: hidden; color: rgba(73, 59, 44, .58); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.tool-badge { padding: 4px 7px; border-radius: 999px; background: rgba(166, 81, 74, .1); color: var(--rouge); font-size: 10px; font-weight: 800; }
.tool-arrow { color: rgba(73, 59, 44, .34); }
@media (max-width: 980px) {
  .today-main { margin-left: 0; }
  .today-hero .today-wrap { gap: 36px; }
}
@media (max-width: 760px) {
  .today-hero { padding: 34px 0 28px; }
  .today-hero .today-wrap { grid-template-columns: 1fr; gap: 26px; }
  .today-hero h1 { font-size: 42px; }
  .hero-actions { align-items: stretch; flex-direction: column; }
  .today-content { padding: 26px 0 54px; }
  .data-onboarding { margin-bottom: 36px; padding: 20px 16px; }
  .onboarding-heading { align-items: flex-start; flex-direction: column; gap: 10px; }
  .onboarding-heading h2 { font-size: 23px; }
  .onboarding-note { max-width: none; text-align: left; }
  .auth-onboarding-card { grid-template-columns: auto minmax(0, 1fr); align-items: start; padding: 18px 16px; }
  .auth-onboarding-actions { grid-column: 1 / -1; align-items: stretch; flex-direction: column; }
  .inline-account-card { grid-template-columns: 1fr; padding: 18px 16px; }
  .inline-account-intro, .inline-account-actions { grid-column: auto; }
  .account-game-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .account-game-options label { width: 100%; }
  .inline-account-actions { align-items: stretch; flex-direction: column; }
  .account-create-error { margin-right: 0; }
  .entry-primary-button { width: 100%; }
  .data-readiness-grid { grid-template-columns: 1fr; }
  .data-readiness-card { min-height: 0; }
  .sync-recommendation { align-items: stretch; flex-direction: column; }
  .data-entry-grid { grid-template-columns: 1fr; }
  .entry-card { padding: 18px 16px; }
  .sync-task-row { grid-template-columns: 1fr; gap: 3px; }
  .sync-task-target { justify-content: flex-start; text-align: left; }
  .entry-primary-action, .entry-secondary-action { width: 100%; }
  .section-heading { align-items: flex-start; flex-direction: column; gap: 8px; }
  .task-grid, .tool-groups { grid-template-columns: 1fr; }
  .task-card { min-height: 128px; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary-card:nth-child(odd) { border-left: 0; }
  .summary-card:nth-child(n + 3) { border-top: 1px solid rgba(156, 122, 77, .22); }
  .tool-card { padding-inline: 14px; }
  .tool-badge { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .task-card { transition: none; }
}
</style>
