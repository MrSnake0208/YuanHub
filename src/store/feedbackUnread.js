import { computed, reactive, watch } from 'vue'
import { listManagedFeedback } from '../api/feedback.js'
import { auth } from './auth.js'
import { canManageAnyFeedback } from '../utils/authPermissions.js'
import {
  countUnreadFeedback,
  FEEDBACK_READ_STATE_EVENT,
  getUnreadFeedbackIds,
  markFeedbackListRead
} from '../utils/feedbackReadState.js'

const PAGE_SIZE = 100
const MAX_PAGES = 100
const POLL_INTERVAL = 30000
const FRESH_TTL = 15000

export const feedbackUnreadState = reactive({
  count: 0,
  ids: [],
  loading: false,
  loaded: false
})

const canReadManagedFeedback = computed(() => Boolean(
  auth.accessToken &&
  auth.userInfo &&
  auth.adminAccessLoaded &&
  !auth.adminAccessLoading &&
  auth.adminAccess &&
  (auth.adminAccess.superAdmin || canManageAnyFeedback(auth.adminAccess))
))

const feedbackUnreadContext = computed(() => {
  const access = auth.adminAccess
  return [
    canReadManagedFeedback.value,
    currentUserId(),
    Boolean(access && access.superAdmin),
    access && Array.isArray(access.manageAreas) ? access.manageAreas.join(',') : ''
  ].join('|')
})

let requestId = 0
let requestPromise = null
let pollTimer = null
let stopPermissionWatch = null
let subscriberCount = 0
let managedFeedbackSnapshot = []
let loadedAt = 0
let activeContext = ''

function currentUserId() {
  const user = auth.userInfo
  return user && (user.id || user.userId || user.user_id)
    ? String(user.id || user.userId || user.user_id)
    : ''
}

function clearFeedbackUnread() {
  managedFeedbackSnapshot = []
  feedbackUnreadState.count = 0
  feedbackUnreadState.ids = []
  feedbackUnreadState.loading = false
  feedbackUnreadState.loaded = true
}

async function fetchFeedbackUnread() {
  const currentRequestId = ++requestId
  const requestContext = feedbackUnreadContext.value
  if (!canReadManagedFeedback.value) {
    clearFeedbackUnread()
    return
  }

  feedbackUnreadState.loading = true
  try {
    const reports = []
    let page = 1
    let pageSize = PAGE_SIZE
    let total = null

    while (page <= MAX_PAGES) {
      const data = await listManagedFeedback({
        page,
        pageSize,
        sortBy: 'updatedAt',
        sortOrder: 'desc'
      })
      if (
        currentRequestId !== requestId ||
        requestContext !== feedbackUnreadContext.value ||
        !canReadManagedFeedback.value
      ) return
      const items = Array.isArray(data.items) ? data.items : []
      reports.push(...items)
      total = Number.isFinite(Number(data.total)) ? Number(data.total) : null
      const returnedPageSize = Number(data.pageSize) > 0 ? Number(data.pageSize) : pageSize
      if (!items.length || (total != null && reports.length >= total) || (total == null && items.length < returnedPageSize)) break
      page += 1
      pageSize = returnedPageSize
    }

    if (
      currentRequestId !== requestId ||
      requestContext !== feedbackUnreadContext.value ||
      !canReadManagedFeedback.value
    ) return
    const userId = currentUserId()
    managedFeedbackSnapshot = reports
    feedbackUnreadState.count = countUnreadFeedback(reports, userId)
    feedbackUnreadState.ids = getUnreadFeedbackIds(reports, userId)
    feedbackUnreadState.loaded = true
    loadedAt = Date.now()
  } catch (_) {
    // 反馈角标读取失败不应阻断页面；保留最近一次成功状态。
  } finally {
    if (currentRequestId === requestId) feedbackUnreadState.loading = false
  }
}

export function refreshFeedbackUnread({ force = false } = {}) {
  if (!canReadManagedFeedback.value) {
    clearFeedbackUnread()
    return Promise.resolve()
  }
  if (requestPromise) return requestPromise
  if (!force && feedbackUnreadState.loaded && Date.now() - loadedAt < FRESH_TTL) {
    return Promise.resolve()
  }
  const promise = fetchFeedbackUnread()
  const trackedPromise = promise.finally(function () {
    if (requestPromise === trackedPromise) requestPromise = null
  })
  requestPromise = trackedPromise
  return trackedPromise
}

export async function markAllManagedFeedbackRead() {
  if (!canReadManagedFeedback.value) return 0
  if (!feedbackUnreadState.loaded || feedbackUnreadState.loading) await refreshFeedbackUnread()
  if (!canReadManagedFeedback.value || !managedFeedbackSnapshot.length) return 0

  const userId = currentUserId()
  const unreadIds = new Set(feedbackUnreadState.ids)
  const targets = managedFeedbackSnapshot.filter(report => {
    const reportId = report && (report.id ?? report.reportId ?? report.report_id)
    return reportId != null && unreadIds.has(String(reportId))
  })
  const marked = markFeedbackListRead(userId, targets)
  feedbackUnreadState.count = countUnreadFeedback(managedFeedbackSnapshot, userId)
  feedbackUnreadState.ids = getUnreadFeedbackIds(managedFeedbackSnapshot, userId)
  loadedAt = Date.now()
  return marked
}

function handleReadStateChange(event) {
  if (!event || !event.detail || event.detail.userId !== currentUserId()) return
  void refreshFeedbackUnread({ force: true })
}

function refreshVisible() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  void refreshFeedbackUnread()
}

function startFeedbackUnread() {
  if (stopPermissionWatch) return
  stopPermissionWatch = watch(feedbackUnreadContext, function (context) {
    if (context === activeContext) {
      if (canReadManagedFeedback.value) void refreshFeedbackUnread()
      return
    }

    // A new identity/scope must not deduplicate onto the previous user's request.
    activeContext = context
    requestId += 1
    requestPromise = null
    loadedAt = 0
    clearFeedbackUnread()
    if (canReadManagedFeedback.value) {
      feedbackUnreadState.loaded = false
      void refreshFeedbackUnread({ force: true })
    }
  }, { immediate: true })
  if (typeof window !== 'undefined') {
    window.addEventListener(FEEDBACK_READ_STATE_EVENT, handleReadStateChange)
    pollTimer = setInterval(refreshVisible, POLL_INTERVAL)
  }
}

function stopFeedbackUnread() {
  // 路由切换只释放 timer/watch；共享 in-flight Promise 保持到自然完成，
  // 以便新的订阅者能继续复用同一请求。
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (stopPermissionWatch) {
    stopPermissionWatch()
    stopPermissionWatch = null
  }
  if (typeof window !== 'undefined') window.removeEventListener(FEEDBACK_READ_STATE_EVENT, handleReadStateChange)
}

export function subscribeFeedbackUnread() {
  subscriberCount += 1
  if (subscriberCount === 1) startFeedbackUnread()
  else refreshFeedbackUnread()

  let active = true
  return function unsubscribeFeedbackUnread() {
    if (!active) return
    active = false
    subscriberCount = Math.max(0, subscriberCount - 1)
    if (subscriberCount === 0) stopFeedbackUnread()
  }
}
