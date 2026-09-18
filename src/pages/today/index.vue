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
              <router-link class="primary-action" :to="auth.isLoggedIn ? '/operator/quick' : '/login'">
                {{ auth.isLoggedIn ? '快速更新数据' : '登录同步我的数据' }}
                <ArrowRight :size="16" aria-hidden="true" />
              </router-link>
              <router-link class="secondary-action" to="/demo">看看完整演示</router-link>
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
  MessageSquareText,
  PackageOpen,
  ScrollText,
  ShoppingCart,
  Users,
  Zap
} from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { listAccounts } from '../../api/accounts.js'
import { getOperatorCurrent } from '../../api/operator.js'
import { getCurrent, listAgentFavorites } from '../../api/inventory.js'
import { getUnreadNotificationCount } from '../../api/notifications.js'
import { auth } from '../../store/auth.js'
import { activeAccount } from '../../store/activeAccount.js'
import { summarizeTodayData } from '../../data/todayData.js'

const DEMO_SUMMARY = Object.freeze({ operatorCount: 3, favoriteCount: 2, inventoryKindCount: 5, unreadCount: 1 })
const EMPTY_SUMMARY = Object.freeze({ operatorCount: 0, favoriteCount: 0, inventoryKindCount: 0, unreadCount: 0 })

const accounts = ref([])
const realSummary = ref({ ...EMPTY_SUMMARY })
const loading = ref(false)
const errorMessage = ref('')
let loadSequence = 0

const accountId = computed({
  get: function () { return activeAccount.id },
  set: function (value) { activeAccount.set(value) }
})

const accountGame = computed(function () { return activeAccount.gameFor(accountId.value) })
const summary = computed(function () { return auth.isLoggedIn ? realSummary.value : DEMO_SUMMARY })
const summaryCaption = computed(function () {
  if (!auth.isLoggedIn) return '示例账号 · 登录后显示你的真实状态'
  const account = accounts.value.find(function (item) { return item.id === accountId.value })
  return account ? `${account.name} · ${account.game || accountGame.value}` : '等待建立第一个子账号'
})

const summaryItems = computed(function () {
  return [
    { label: '已录入密探', value: summary.value.operatorCount, icon: Users },
    { label: '特别关注', value: summary.value.favoriteCount, icon: Heart },
    { label: '有库存材料', value: summary.value.inventoryKindCount, icon: PackageOpen },
    { label: '未读通知', value: summary.value.unreadCount, icon: Bell }
  ]
})

const todayTasks = computed(function () {
  if (!auth.isLoggedIn) {
    return [
      { title: '认识密探名册', description: '看图鉴、养成状态和自己的密探 BOX。', to: '/operator', icon: Users },
      { title: '试试快捷录入', description: '用一条流程快速建立密探与库存数据。', to: '/operator/quick', icon: Zap },
      { title: '看看库存追踪', description: '知道材料有多少、最近从哪里获得。', to: '/inventory', icon: PackageOpen }
    ]
  }
  if (!accounts.value.length) {
    return [
      { title: '建立第一个子账号', description: '密探和库存会统一归到这个游戏账号。', to: '/operator', icon: Users },
      { title: '从快捷录入开始', description: '已有数据时，可以一次导入后继续整理。', to: '/operator/quick', icon: Zap }
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
  tasks.push(summary.value.unreadCount == null
    ? { title: '打开通知中心', description: '未读状态暂未读取，可以到通知中心继续查看。', to: '/notifications', icon: Bell }
    : summary.value.unreadCount
    ? { title: '处理新通知', description: `还有 ${summary.value.unreadCount} 条未读消息。`, to: '/notifications', icon: Bell }
    : { title: '整理星石背包', description: '记录已拥有的星石，方便按密探搭配。', to: '/star', icon: Gem })
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

async function loadDashboard() {
  if (!auth.isLoggedIn) return
  const sequence = ++loadSequence
  loading.value = true
  errorMessage.value = ''
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
    if (sequence === loadSequence) errorMessage.value = readableError(error, '今日一览数据读取失败')
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
      listAgentFavorites(targetAccount)
    )
  }
  const results = await Promise.allSettled(requests)
  if (sequence !== loadSequence || targetAccount !== accountId.value) return

  const failures = results.filter(function (result) { return result.status === 'rejected' })
  realSummary.value = summarizeTodayData({
    notifications: results[0].status === 'fulfilled' ? results[0].value : null,
    current: results[1] && results[1].status === 'fulfilled' ? results[1].value : null,
    inventory: results[2] && results[2].status === 'fulfilled' ? results[2].value : null,
    favorites: results[3] && results[3].status === 'fulfilled' ? results[3].value : null
  })
  if (results[0].status === 'rejected') realSummary.value.unreadCount = null
  if (targetAccount && results[1].status === 'rejected') realSummary.value.operatorCount = null
  if (targetAccount && results[2].status === 'rejected') realSummary.value.inventoryKindCount = null
  if (targetAccount && results[3].status === 'rejected') realSummary.value.favoriteCount = null
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
.secondary-action { border: 1px solid rgba(73, 59, 44, .2); color: var(--ink); }
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
