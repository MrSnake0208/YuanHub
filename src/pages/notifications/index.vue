<template>
  <div class="page-notifications">
    <IslandSidebar />

    <main id="main-content" class="notifications-main">
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">通知中心</span>
          </div>
          <h1>通知中心<span class="small">站内消息</span></h1>
          <p class="hero-sub">反馈有新消息或状态更新时，通知会出现在这里。</p>
          <div class="hero-stats">
            <div><div class="k">全部通知</div><div class="v">{{ total }}<small>条</small></div></div>
            <div><div class="k">未读</div><div class="v">{{ unreadCount }}<small>条</small></div></div>
            <div class="hero-action">
              <button
                class="act-btn primary"
                :disabled="loading || unreadCount === 0"
                @click="markAllRead"
              >
                {{ markingAll ? '正在标记…' : '全部已读' }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- 筛选 -->
          <div class="toolbar">
            <div class="tabs">
              <button
                v-for="t in filterTabs"
                :key="t.key"
                :class="{ on: filter === t.key }"
                @click="setFilter(t.key)"
              >
                {{ t.label }}<span v-if="t.key === 'unread' && unreadCount > 0" class="unread-badge">{{ unreadCount }}</span>
              </button>
            </div>
            <div class="sp"></div>
            <span class="sort-lb">共 {{ total }} 条</span>
          </div>

          <!-- 列表 -->
          <div class="notification-list">
            <div v-if="loading" class="state">正在加载通知…</div>
            <div v-else-if="error" class="state err">
              {{ error }}
              <button class="link" type="button" @click="loadNotifications">重试</button>
            </div>
            <template v-else-if="notifications.length === 0">
              <div class="empty-state">
                <Bell :size="32" />
                <strong>暂无通知</strong>
                <span>当反馈有新消息或状态更新时，通知会出现在这里。</span>
              </div>
            </template>
            <template v-else>
              <article
                v-for="item in notifications"
                :key="item.id"
                class="notification-item"
                :class="{ unread: !item.readAt }"
                @click="openNotification(item)"
              >
                <div class="ntf-icon" :class="isMessageNotification(item.kind) ? 'reply' : 'status'">
                  <component :is="isMessageNotification(item.kind) ? MessageSquare : RefreshCw" :size="18" />
                </div>
                <div class="ntf-body">
                  <div class="ntf-title">{{ item.title }}</div>
                  <p class="ntf-text">{{ item.body }}</p>
                  <div v-if="item.refType === 'FEEDBACK' && item.refId" class="ntf-ref">关联反馈：{{ item.refId }}</div>
                  <div class="ntf-meta">
                    <time>{{ formatTime(item.createdAt) }}</time>
                    <span v-if="!item.readAt" class="ntf-unread-dot" aria-label="未读"></span>
                  </div>
                </div>
                <button
                  v-if="!item.readAt"
                  class="ntf-read-btn"
                  type="button"
                  :disabled="markingId === item.id"
                  @click.stop="markRead(item)"
                >
                  {{ markingId === item.id ? '…' : '标为已读' }}
                </button>
              </article>

              <!-- 加载更多 -->
              <div v-if="hasMore" class="more-row">
                <button class="btn-more" :disabled="loadingMore" @click="loadMore">
                  {{ loadingMore ? '正在加载…' : '加载更多' }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>通知中心<br><span>反馈 · 回复 · 状态更新</span></template>
        <template #fine><b>YuanHub</b> · 通知中心<br>站内通知仅保留最近 90 天</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, MessageSquare, RefreshCw } from '@lucide/vue'
import { auth } from '../../store/auth.js'
import { canManageAnyFeedback } from '../../utils/authPermissions.js'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  NOTIFICATION_STATE_EVENT
} from '../../api/notifications.js'

const router = useRouter()

const PAGE_SIZE = 20
const filter = ref('all')
const notifications = ref([])
const total = ref(0)
const unreadCount = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const markingId = ref('')
const markingAll = ref(false)
const page = ref(1)
let unreadPollTimer = null
let notificationRequestId = 0
let unreadCountRequestId = 0

const filterTabs = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' }
]

const canManageFeedback = computed(() => Boolean(
  auth.adminAccess && (auth.adminAccess.superAdmin || canManageAnyFeedback(auth.adminAccess))
))

const hasMore = computed(function () {
  return notifications.value.length < total.value
})

function setFilter(key) {
  filter.value = key
  page.value = 1
  notifications.value = []
  loadNotifications()
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return diffMin + '分钟前'
  if (diffHour < 24) return diffHour + '小时前'
  if (diffDay < 7) return diffDay + '天前'

  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  if (y === now.getFullYear()) return m + '-' + day + ' ' + h + ':' + min
  return y + '-' + m + '-' + day + ' ' + h + ':' + min
}

async function loadNotifications() {
  const requestId = ++notificationRequestId
  const countRequestId = ++unreadCountRequestId
  loading.value = true
  error.value = ''
  try {
    const params = {
      page: page.value,
      pageSize: PAGE_SIZE
    }
    if (filter.value === 'unread') params.unreadOnly = true
    const data = await listNotifications(params)
    if (requestId !== notificationRequestId) return
    notifications.value = Array.isArray(data.notifications) ? data.notifications : []
    total.value = data.total
    if (countRequestId === unreadCountRequestId) unreadCount.value = data.unreadCount
  } catch (err) {
    if (requestId !== notificationRequestId) return
    error.value = err.message || '通知加载失败'
    notifications.value = []
  } finally {
    if (requestId === notificationRequestId) loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  const requestId = notificationRequestId
  const countRequestId = ++unreadCountRequestId
  const nextPage = page.value + 1
  try {
    const params = {
      page: nextPage,
      pageSize: PAGE_SIZE
    }
    if (filter.value === 'unread') params.unreadOnly = true
    const data = await listNotifications(params)
    if (requestId !== notificationRequestId) return
    page.value = nextPage
    if (Array.isArray(data.notifications)) {
      notifications.value = notifications.value.concat(data.notifications)
    }
    total.value = data.total
    if (countRequestId === unreadCountRequestId) unreadCount.value = data.unreadCount
  } catch (_) {
    // 保持当前页，避免失败的加载更多改变分页状态。
  } finally {
    loadingMore.value = false
  }
}

async function loadUnreadCount() {
  const requestId = ++unreadCountRequestId
  try {
    const data = await getUnreadNotificationCount()
    if (requestId === unreadCountRequestId) unreadCount.value = data.count
  } catch (_) {
    // 静默失败
  }
}

async function markRead(item) {
  if (!item || item.readAt || markingId.value) return
  markingId.value = item.id
  ++unreadCountRequestId
  try {
    const updated = await markNotificationRead(item.id)
    if (updated) Object.assign(item, updated)
    await Promise.all([loadUnreadCount(), loadNotifications()])
  } catch (_) {
    // 静默失败
  } finally {
    markingId.value = ''
  }
}

async function markAllRead() {
  if (markingAll.value) return
  markingAll.value = true
  ++unreadCountRequestId
  try {
    await markAllNotificationsRead()
    await Promise.all([loadUnreadCount(), loadNotifications()])
  } catch (_) {
    // 静默失败
  } finally {
    markingAll.value = false
  }
}

function openNotification(item) {
  // 标记已读
  if (!item.readAt) markRead(item)
  // 分配和用户追加通知来自管理队列，回复和状态通知仍属于个人工单。
  if (item.refType === 'FEEDBACK' && item.refId) {
    const target = isManagementNotification(item.kind) ? '/feedback/manage' : '/feedback'
    if (target === '/feedback/manage' && !canManageFeedback.value) return
    router.push(target + '?id=' + encodeURIComponent(item.refId))
  }
}

function isMessageNotification(kind) {
  return kind === 'FEEDBACK_REPLY' || kind === 'FEEDBACK_MESSAGE_FROM_REPORTER'
}

function isManagementNotification(kind) {
  return kind === 'FEEDBACK_ASSIGNED' || kind === 'FEEDBACK_MESSAGE_FROM_REPORTER'
}

function startPolling() {
  loadUnreadCount()
  unreadPollTimer = setInterval(loadUnreadCount, 30000)
}

function stopPolling() {
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer)
    unreadPollTimer = null
  }
}

onMounted(function () {
  if (typeof window !== 'undefined') window.addEventListener(NOTIFICATION_STATE_EVENT, loadUnreadCount)
  loadNotifications()
  startPolling()
})

onBeforeUnmount(function () {
  stopPolling()
  notificationRequestId += 1
  unreadCountRequestId += 1
  if (typeof window !== 'undefined') window.removeEventListener(NOTIFICATION_STATE_EVENT, loadUnreadCount)
})
</script>

<style scoped>
.notifications-main { padding-bottom: 0 }
.page-notifications .hero::after { content: '通知' }
.hero-action { display: flex; align-items: center; justify-content: center; padding: 16px 24px }
.hero-action .act-btn { min-height: 44px; padding: 10px 24px; color: var(--cream); background: var(--tea); border: 1.5px solid transparent; border-radius: 999px; cursor: pointer; font-family: var(--font-b); font-size: 13px; font-weight: 800; white-space: nowrap; transition: all .3s var(--ease) }
.hero-action .act-btn:hover:not(:disabled) { background: var(--accent) }
.hero-action .act-btn:disabled { opacity: .45; cursor: not-allowed }

.unread-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; margin-left: 6px; padding: 0 6px; background: var(--rouge); color: #fff; border-radius: 999px; font-size: 11px; font-weight: 800; line-height: 1 }

.notification-list { margin-top: 28px; display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px }
.state { margin-top: 16px; padding: 44px 30px; color: var(--ink-60); background: var(--surface); border: 1.5px dashed var(--line); border-radius: 18px; text-align: center; font-size: 13px; font-weight: 700 }
.state.err { color: var(--ink-60) }
.state .link { min-height: 44px; margin-left: 10px; color: var(--accent-strong); background: transparent; border: 0; cursor: pointer; font-weight: 800; text-decoration: underline; text-underline-offset: 3px }
.empty-state { margin-top: 16px; padding: 60px 30px; color: var(--ink-60); background: var(--surface); border: 1.5px dashed var(--line); border-radius: 18px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px }
.empty-state strong { color: var(--ink); font-family: var(--font-s); font-size: 17px }
.empty-state span { max-width: 460px; line-height: 1.65; font-size: 13px }

.notification-item { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 14px; padding: 16px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; cursor: pointer; transition: all .3s var(--ease); align-items: start }
.notification-item:hover { border-color: rgba(73, 59, 44, .24); box-shadow: 0 8px 20px -16px rgba(73, 59, 44, .25) }
.notification-item.unread { background: rgba(239, 210, 142, .18); border-color: rgba(239, 210, 142, .5) }

.ntf-icon { flex: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; font-size: 14px }
.ntf-icon.reply { background: rgba(215, 137, 53, .15); color: var(--accent-strong) }
.ntf-icon.status { background: rgba(91, 106, 140, .12); color: var(--brand-blue) }

.ntf-body { min-width: 0 }
.ntf-title { font-size: 14px; font-weight: 800; color: var(--ink); line-height: 1.4 }
.notification-item.unread .ntf-title { font-weight: 900 }
.ntf-text { margin-top: 4px; font-size: 13px; line-height: 1.6; color: var(--ink-60); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
.ntf-ref { margin-top: 7px; color: var(--accent-strong); font: 700 11px var(--font-d); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.ntf-meta { margin-top: 8px; display: flex; align-items: center; gap: 8px }
.ntf-meta time { font-family: var(--font-d); font-size: 11px; color: var(--ink-35); font-weight: 700 }
.ntf-unread-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--rouge); flex: none }

.ntf-read-btn { flex: none; min-height: 36px; padding: 6px 14px; color: var(--accent-strong); background: rgba(239, 210, 142, .3); border: 1px solid transparent; border-radius: 8px; cursor: pointer; font-family: var(--font-b); font-size: 12px; font-weight: 800; white-space: nowrap; transition: all .25s var(--ease); align-self: center }
.ntf-read-btn:hover:not(:disabled) { background: var(--yellow); border-color: var(--yellow-deep) }
.ntf-read-btn:disabled { opacity: .45; cursor: not-allowed }

.more-row { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 24px }
.btn-more { background: var(--tea); color: var(--cream); border: none; border-radius: 999px; padding: 14px 38px; font-size: 14px; font-weight: 800; font-family: var(--font-b); cursor: pointer; transition: all .3s var(--ease) }
.btn-more:hover:not(:disabled) { background: var(--accent); color: #fff; transform: translateY(-2px) }
.btn-more:disabled { opacity: .45; cursor: default }

@media (max-width: 767px) {
  .notification-item { grid-template-columns: 40px minmax(0, 1fr); gap: 10px; padding: 14px; border-radius: 14px }
  .ntf-icon { width: 40px; height: 40px; border-radius: 10px }
  .ntf-icon svg { width: 16px; height: 16px }
  .ntf-read-btn { grid-column: 2; justify-self: start; min-height: 40px; padding: 5px 12px; font-size: 11px }
  .hero-action { padding: 12px 16px }
  .hero-action .act-btn { width: 100%; min-height: 44px }
}
</style>
