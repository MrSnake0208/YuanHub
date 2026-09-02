import { computed, reactive, watch } from 'vue'
import { listManagedFeedback } from '../api/feedback.js'
import { auth } from './auth.js'
import { canManageAnyFeedback } from '../utils/authPermissions.js'
import {
  countUnreadFeedback,
  FEEDBACK_READ_STATE_EVENT,
  getUnreadFeedbackIds
} from '../utils/feedbackReadState.js'

const PAGE_SIZE = 100
const MAX_PAGES = 100
const POLL_INTERVAL = 30000

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

function currentUserId() {
  const user = auth.userInfo
  return user && (user.id || user.userId || user.user_id)
    ? String(user.id || user.userId || user.user_id)
    : ''
}

function clearFeedbackUnread() {
  feedbackUnreadState.count = 0
  feedbackUnreadState.ids = []
  feedbackUnreadState.loading = false
  feedbackUnreadState.loaded = true
}

async function fetchFeedbackUnread() {
  const currentRequestId = ++requestId
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
      const items = Array.isArray(data.items) ? data.items : []
      reports.push(...items)
      total = Number.isFinite(Number(data.total)) ? Number(data.total) : null
      const returnedPageSize = Number(data.pageSize) > 0 ? Number(data.pageSize) : pageSize
      if (!items.length || (total != null && reports.length >= total) || (total == null && items.length < returnedPageSize)) break
      page += 1
      pageSize = returnedPageSize
    }

    if (currentRequestId !== requestId || !canReadManagedFeedback.value) return
    const userId = currentUserId()
    feedbackUnreadState.count = countUnreadFeedback(reports, userId)
    feedbackUnreadState.ids = getUnreadFeedbackIds(reports, userId)
    feedbackUnreadState.loaded = true
  } catch (_) {
    // 反馈角标读取失败不应阻断页面；保留最近一次成功状态。
  } finally {
    if (currentRequestId === requestId) feedbackUnreadState.loading = false
  }
}

export function refreshFeedbackUnread() {
  if (requestPromise) return requestPromise
  const promise = fetchFeedbackUnread()
  const trackedPromise = promise.finally(function () {
    if (requestPromise === trackedPromise) requestPromise = null
  })
  requestPromise = trackedPromise
  return trackedPromise
}

function handleReadStateChange(event) {
  if (!event || !event.detail || event.detail.userId !== currentUserId()) return
  refreshFeedbackUnread()
}

function startFeedbackUnread() {
  if (stopPermissionWatch) return
  stopPermissionWatch = watch(feedbackUnreadContext, function () {
    if (canReadManagedFeedback.value) refreshFeedbackUnread()
    else {
      requestId += 1
      clearFeedbackUnread()
    }
  }, { immediate: true })
  if (typeof window !== 'undefined') window.addEventListener(FEEDBACK_READ_STATE_EVENT, handleReadStateChange)
  pollTimer = setInterval(refreshFeedbackUnread, POLL_INTERVAL)
}

function stopFeedbackUnread() {
  requestId += 1
  requestPromise = null
  feedbackUnreadState.loading = false
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
