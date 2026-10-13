<template>
  <div class="page-notifications">
    <IslandSidebar />

    <main id="main-content" class="notifications-main">
      <header class="page-header"><div class="wrap">
        <h1 class="page-header-title">通知中心</h1>
        <p class="page-header-description">查看反馈回复与状态更新。需要跟进问题？前往 <router-link to="/feedback">我的反馈</router-link>。</p>
      </div></header>

      <section class="notifications-workspace">
        <div class="wrap">
          <!-- 筛选 -->
          <div class="toolbar notification-toolbar">
            <div class="tabs">
              <button
                v-for="t in filterTabs"
                :key="t.key"
                :class="{ on: filter === t.key }"
                :aria-pressed="filter === t.key"
                type="button"
                :disabled="markingAll || Boolean(markingId)"
                @click="setFilter(t.key)"
              >
                {{ t.label }}<span v-if="t.key === 'unread' && unreadCount > 0" class="unread-badge">{{ unreadCount }}</span>
              </button>
            </div>
            <div class="notification-actions">
              <button
                class="page-header-action"
                :disabled="loading || markingAll || Boolean(markingId) || unreadCount === 0"
                @click="markAllRead"
              >
                {{ markingAll ? '正在标记…' : markAllError ? '重试全部已读' : '全部已读' }}
              </button>
            </div>
            <span class="sort-lb">共 {{ total }} 条</span>
            <p v-if="markAllError" class="action-error" role="alert">{{ markAllError }}</p>
          </div>
          <p class="retention-note">站内通知保留最近 90 天；完整沟通记录可在「我的反馈」查看。</p>

          <!-- 列表 -->
          <div class="notification-list">
            <p v-if="error && notifications.length" class="action-error" role="alert">{{ error }} <button class="link" type="button" @click="loadNotifications">重试刷新</button></p>
            <div v-if="loading && !notifications.length" class="state">正在加载通知…</div>
            <div v-else-if="error && !notifications.length" class="state err">
              {{ error }}
              <button class="link" type="button" @click="loadNotifications">重试</button>
            </div>
            <template v-else-if="notifications.length === 0">
              <div class="empty-state">
                <Bell :size="32" />
                <strong>{{ filter === 'unread' ? '未读通知已看完' : '还没有收到通知' }}</strong>
                <span>{{ filter === 'unread' ? '可以查看全部通知，或回到反馈继续跟进。' : '提交反馈后，管理员回复和处理进展会通知你。' }}</span>
                <button v-if="filter === 'unread'" class="empty-action" type="button" @click="setFilter('all')">查看全部通知</button>
                <router-link class="empty-action" to="/feedback">查看我的反馈</router-link>
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
                  <a v-if="notificationTarget(item)" class="ntf-open-link" :href="notificationTarget(item)" @click.stop="openNotification(item, $event)">{{ item.refType === 'BETA' ? '查看内测资格' : '查看反馈' }} →</a>
                  <AccountIdDetails v-if="item.refType === 'FEEDBACK' && item.refId" :value="item.refId" label="查看关联反馈编号" />
                  <div class="ntf-meta">
                    <time>{{ formatTime(item.createdAt) }}</time>
                    <span v-if="!item.readAt" class="ntf-unread-dot" aria-label="未读"></span>
                  </div>
                  <p v-if="markReadErrorId === item.id" class="action-error" role="alert">标记失败，请重试。</p>
                </div>
                <button
                  v-if="!item.readAt"
                  class="ntf-read-btn"
                  type="button"
                  :disabled="loading || markingAll || Boolean(markingId)"
                  @click.stop="markRead(item)"
                >
                  {{ markingId === item.id ? '…' : markReadErrorId === item.id ? '重试标为已读' : '标为已读' }}
                </button>
              </article>

              <!-- 加载更多 -->
              <div v-if="hasMore" class="more-row">
                <button class="btn-more" :disabled="loading || loadingMore || markingAll || Boolean(markingId) || Boolean(error)" @click="loadMore">
                  {{ loadingMore ? '正在加载…' : loadMoreError ? '重试加载更多' : '加载更多' }}
                </button>
                <p v-if="loadMoreError" class="action-error" role="alert">{{ loadMoreError }}</p>
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
import '@/styles/page-header.css'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, MessageSquare, RefreshCw } from '@lucide/vue'
import { auth } from '../../store/auth.js'
import { canManageAnyFeedback } from '../../utils/authPermissions.js'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import AccountIdDetails from '../../components/AccountIdDetails.vue'
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '../../api/notifications.js'
import {
  notificationUnreadState,
  setNotificationUnreadCount,
  refreshNotificationState
} from '../../store/notificationUnread.js'

const router = useRouter()

const PAGE_SIZE = 20
const filter = ref('all')
const notifications = ref([])
const total = ref(0)
const unreadCount = computed(() => notificationUnreadState.count)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const markingId = ref('')
const markingAll = ref(false)
const markAllError = ref('')
const markReadErrorId = ref('')
const loadMoreError = ref('')
const page = ref(1)
let notificationRequestId = 0
let mutationRequestId = 0
let mounted = false
const identity = computed(() => auth.accessToken ? String(auth.userInfo?.id || auth.userInfo?.userId || auth.userInfo?.user_id || '') : '')

function ownsRequest(requestId, userId) {
  return mounted && requestId === notificationRequestId && userId === identity.value
}

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
  if (markingAll.value || markingId.value) return
  filter.value = key
  page.value = 1
  notifications.value = []
  markReadErrorId.value = ''
  loadMoreError.value = ''
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

async function loadNotifications({ afterRead = false } = {}) {
  const requestId = ++notificationRequestId
  const userId = identity.value
  loadingMore.value = false
  loadMoreError.value = ''
  loading.value = true
  error.value = ''
  try {
    const params = {
      page: 1,
      pageSize: PAGE_SIZE
    }
    if (filter.value === 'unread') params.unreadOnly = true
    const data = await listNotifications(params)
    if (!ownsRequest(requestId, userId)) return
    notifications.value = Array.isArray(data.notifications) ? data.notifications : []
    page.value = 1
    total.value = data.total
    setNotificationUnreadCount(data.unreadCount)
  } catch (err) {
    if (!ownsRequest(requestId, userId)) return
    error.value = afterRead ? '已标记成功，但通知刷新失败，请重试刷新。' : err.message || '通知加载失败'
  } finally {
    if (ownsRequest(requestId, userId)) loading.value = false
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value || markingAll.value || markingId.value || error.value || !hasMore.value) return
  loadingMore.value = true
  loadMoreError.value = ''
  const requestId = notificationRequestId
  const userId = identity.value
  const nextPage = page.value + 1
  try {
    const params = {
      page: nextPage,
      pageSize: PAGE_SIZE
    }
    if (filter.value === 'unread') params.unreadOnly = true
    const data = await listNotifications(params)
    if (!ownsRequest(requestId, userId)) return
    page.value = nextPage
    if (Array.isArray(data.notifications)) {
      notifications.value = notifications.value.concat(data.notifications)
    }
    total.value = data.total
    setNotificationUnreadCount(data.unreadCount)
  } catch (_) {
    if (!ownsRequest(requestId, userId)) return
    loadMoreError.value = '加载更多失败，已加载的通知仍可查看。'
  } finally {
    if (ownsRequest(requestId, userId)) loadingMore.value = false
  }
}

function beginMutation() {
  notificationRequestId += 1
  loadingMore.value = false
  loadMoreError.value = ''
  error.value = ''
  return { requestId: ++mutationRequestId, userId: identity.value }
}

function ownsMutation(context) {
  return mounted && context.requestId === mutationRequestId && context.userId === identity.value
}

async function refreshAfterRead() {
  // 已读 API 已发出状态事件；复用共享单飞刷新，避免独立递减角标。
  void refreshNotificationState({ force: true })
  if (filter.value === 'unread') {
    notifications.value = notifications.value.filter(item => !item.readAt)
    await loadNotifications({ afterRead: true })
  }
}

async function markRead(item) {
  if (!item || item.readAt || loading.value || markingId.value || markingAll.value) return
  const context = beginMutation()
  markingId.value = item.id
  markReadErrorId.value = ''
  try {
    const updated = await markNotificationRead(item.id)
    if (!ownsMutation(context)) return
    if (updated) Object.assign(item, updated)
    await refreshAfterRead()
  } catch (_) {
    if (!ownsMutation(context)) return
    markReadErrorId.value = item.id
  } finally {
    if (ownsMutation(context)) markingId.value = ''
  }
}

async function markAllRead() {
  if (loading.value || markingAll.value || markingId.value) return
  const context = beginMutation()
  markingAll.value = true
  markAllError.value = ''
  try {
    await markAllNotificationsRead()
    if (!ownsMutation(context)) return
    const readAt = new Date().toISOString()
    notifications.value.forEach(item => { if (!item.readAt) item.readAt = readAt })
    await refreshAfterRead()
  } catch (_) {
    if (!ownsMutation(context)) return
    markAllError.value = '全部已读失败，未读通知仍保留，请重试。'
  } finally {
    if (ownsMutation(context)) markingAll.value = false
  }
}

function notificationTarget(item) {
  if (item.refType === 'BETA') return '/beta'
  if (item.refType !== 'FEEDBACK' || !item.refId) return ''
  const target = isManagementNotification(item.kind) ? '/feedback/manage' : '/feedback'
  if (target === '/feedback/manage' && !canManageFeedback.value) return ''
  return target + '?id=' + encodeURIComponent(item.refId)
}

function openNotification(item, event) {
  if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return
  event?.preventDefault()
  // 标记已读
  if (!item.readAt) markRead(item)
  // 分配和用户追加通知来自管理队列，回复和状态通知仍属于个人工单。
  const target = notificationTarget(item)
  if (target) router.push(target)
}

function isMessageNotification(kind) {
  return kind === 'FEEDBACK_REPLY' || kind === 'FEEDBACK_MESSAGE_FROM_REPORTER'
}

function isManagementNotification(kind) {
  return ['FEEDBACK_ASSIGNED', 'FEEDBACK_MESSAGE_FROM_REPORTER', 'FEEDBACK_DEV_HANDOFF', 'FEEDBACK_DEV_RETURN'].includes(kind)
}

onMounted(function () {
  mounted = true
  loadNotifications()
})

watch(identity, function () {
  mutationRequestId += 1
  notificationRequestId += 1
  notifications.value = []
  total.value = 0
  page.value = 1
  markingId.value = ''
  markingAll.value = false
  markReadErrorId.value = ''
  markAllError.value = ''
  error.value = ''
  loading.value = false
  loadingMore.value = false
  loadMoreError.value = ''
  if (mounted && identity.value) loadNotifications()
}, { flush: 'sync' })

onBeforeUnmount(function () {
  mounted = false
  mutationRequestId += 1
  notificationRequestId += 1
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.page-header-description a { color: var(--accent-strong); }
.notification-toolbar { backdrop-filter: none; border: 0; background: none; box-shadow: none; }
.notification-actions button { cursor: pointer; color: var(--tea); background: var(--surface); border-color: var(--line); }
.notification-actions button:hover:not(:disabled) { background: var(--cream); border-color: var(--tea); }
.notification-actions button:disabled { opacity: .45; cursor: not-allowed; }
.retention-note { color: var(--ink-60) }
.ntf-open-link, .empty-action { color: var(--accent-strong); text-underline-offset: 3px }
.empty-action { border: 1px solid var(--line); border-radius: 10px; background: var(--paper); cursor: pointer }
.action-error{color:var(--rouge)}

.unread-badge { background: var(--rouge); color: #fff; border-radius: 999px }
.state { color: var(--ink-60); background: var(--surface); border: 1.5px dashed var(--line); border-radius: 18px }
.state.err { color: var(--ink-60) }
.notification-list .link { color: var(--accent-strong); background: transparent; border: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }
.empty-state { color: var(--ink-60); background: var(--surface); border: 1.5px dashed var(--line); border-radius: 18px }
.empty-state strong { color: var(--ink) }

.notification-item { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; cursor: pointer; transition: all .3s var(--ease) }
.notification-item:hover { border-color: rgba(73, 59, 44, .24); box-shadow: 0 8px 20px -16px rgba(73, 59, 44, .25) }
.notification-item.unread { background: rgba(239, 210, 142, .18); border-color: rgba(239, 210, 142, .5) }

.ntf-icon { border-radius: 12px }
.ntf-icon.reply { background: rgba(215, 137, 53, .15); color: var(--accent-strong) }
.ntf-icon.status { background: rgba(91, 106, 140, .12); color: var(--brand-blue) }
.ntf-title { color: var(--ink) }
.ntf-text { color: var(--ink-60) }
.ntf-meta time { color: var(--ink-35) }
.ntf-unread-dot { border-radius: 50%; background: var(--rouge) }

.ntf-read-btn { color: var(--accent-strong); background: rgba(239, 210, 142, .3); border: 1px solid transparent; border-radius: 8px; cursor: pointer; transition: all .25s var(--ease) }
.ntf-read-btn:hover:not(:disabled) { background: var(--yellow); border-color: var(--yellow-deep) }
.ntf-read-btn:disabled { opacity: .45; cursor: not-allowed }
.btn-more { background: var(--tea); color: var(--cream); border: none; border-radius: 999px; cursor: pointer; transition: all .3s var(--ease) }
.btn-more:hover:not(:disabled) { background: var(--accent); color: #fff }
.btn-more:disabled { opacity: .45; cursor: default }

@media (max-width: 767px) {
  .notification-item { border-radius: 14px }
  .ntf-icon { border-radius: 10px }
}
</style>
<style scoped src="./notificationsPageDesktop.css"></style>
<style scoped src="./notificationsPageMobile.css"></style>
