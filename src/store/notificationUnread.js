import { reactive, watch } from 'vue'
import {
  getUnreadFeedbackNotificationRefs,
  getUnreadNotificationCount,
  listUnreadNotifications,
  NOTIFICATION_STATE_EVENT
} from '../api/notifications.js'
import { auth } from './auth.js'

const POLL_INTERVAL = 30000
const FRESH_TTL = 15000

export const notificationUnreadState = reactive({
  count: 0,
  unreadNotifications: [],
  feedbackRefIds: [],
  loading: false,
  detailsLoading: false,
  loaded: false,
  detailsLoaded: false
})

let requestId = 0
let countRequestPromise = null
let detailsRequestPromise = null
let countLoadedAt = 0
let detailsLoadedAt = 0
let pollTimer = null
let stopIdentityWatch = null
let subscriberCount = 0
let detailsSubscriberCount = 0
let activeIdentity = ''

function currentIdentity() {
  const user = auth.userInfo
  const userId = user && (user.id || user.userId || user.user_id)
  return auth.accessToken && userId ? String(userId) : ''
}

function normalizeCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

function clearState({ loaded = true } = {}) {
  notificationUnreadState.count = 0
  notificationUnreadState.unreadNotifications = []
  notificationUnreadState.feedbackRefIds = []
  notificationUnreadState.loading = false
  notificationUnreadState.detailsLoading = false
  notificationUnreadState.loaded = loaded
  notificationUnreadState.detailsLoaded = loaded
  countLoadedAt = 0
  detailsLoadedAt = 0
}

export function setNotificationUnreadCount(value) {
  if (!currentIdentity()) return
  notificationUnreadState.count = normalizeCount(value)
  notificationUnreadState.loaded = true
  countLoadedAt = Date.now()
}

function applyUnreadNotifications(notifications) {
  const items = Array.isArray(notifications) ? notifications : []
  notificationUnreadState.unreadNotifications = items
  notificationUnreadState.feedbackRefIds = getUnreadFeedbackNotificationRefs(items)
  notificationUnreadState.count = items.length
  notificationUnreadState.loaded = true
  notificationUnreadState.detailsLoaded = true
  countLoadedAt = Date.now()
  detailsLoadedAt = countLoadedAt
}

export function removeNotificationUnreadItems(ids) {
  const idSet = new Set(
    (Array.isArray(ids) ? ids : [ids])
      .filter(Boolean)
      .map(String)
  )
  if (!idSet.size || !notificationUnreadState.detailsLoaded) return
  applyUnreadNotifications(
    notificationUnreadState.unreadNotifications.filter(item => !item || !idSet.has(String(item.id)))
  )
}

export function refreshNotificationUnread({ force = false } = {}) {
  const identity = currentIdentity()
  if (!identity) {
    clearState()
    return Promise.resolve({ count: 0 })
  }
  if (countRequestPromise) return countRequestPromise
  if (!force && notificationUnreadState.loaded && Date.now() - countLoadedAt < FRESH_TTL) {
    return Promise.resolve({ count: notificationUnreadState.count })
  }

  const revision = requestId
  notificationUnreadState.loading = true
  const pending = getUnreadNotificationCount()
    .then(function (data) {
      if (revision === requestId && identity === currentIdentity()) {
        setNotificationUnreadCount(data && data.count)
      }
      return { count: revision === requestId ? notificationUnreadState.count : normalizeCount(data && data.count) }
    })
    .catch(function () {
      return { count: notificationUnreadState.count }
    })
    .finally(function () {
      if (countRequestPromise === pending) {
        countRequestPromise = null
        notificationUnreadState.loading = false
      }
    })

  countRequestPromise = pending
  return pending
}

export function refreshNotificationUnreadDetails({ force = false } = {}) {
  const identity = currentIdentity()
  if (!identity) {
    clearState()
    return Promise.resolve([])
  }
  if (detailsRequestPromise) return detailsRequestPromise
  if (!force && notificationUnreadState.detailsLoaded && Date.now() - detailsLoadedAt < FRESH_TTL) {
    return Promise.resolve(notificationUnreadState.unreadNotifications)
  }

  const revision = requestId
  notificationUnreadState.detailsLoading = true
  const pending = listUnreadNotifications()
    .then(function (notifications) {
      if (revision === requestId && identity === currentIdentity()) applyUnreadNotifications(notifications)
      return notifications
    })
    .catch(function () {
      return notificationUnreadState.unreadNotifications
    })
    .finally(function () {
      if (detailsRequestPromise === pending) {
        detailsRequestPromise = null
        notificationUnreadState.detailsLoading = false
      }
    })

  detailsRequestPromise = pending
  return pending
}

export function refreshNotificationState({ force = false } = {}) {
  return detailsSubscriberCount > 0
    ? refreshNotificationUnreadDetails({ force })
    : refreshNotificationUnread({ force })
}

function handleNotificationStateChange() {
  void refreshNotificationState({ force: true })
}

function refreshVisible() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  void refreshNotificationState()
}

function startNotificationUnread() {
  if (stopIdentityWatch) return
  stopIdentityWatch = watch(currentIdentity, function (identity) {
    if (identity === activeIdentity) {
      if (identity) void refreshNotificationState()
      return
    }

    activeIdentity = identity
    requestId += 1
    countRequestPromise = null
    detailsRequestPromise = null
    clearState({ loaded: false })
    if (identity) void refreshNotificationState({ force: true })
  }, { immediate: true })

  if (typeof window !== 'undefined') {
    window.addEventListener(NOTIFICATION_STATE_EVENT, handleNotificationStateChange)
    pollTimer = setInterval(refreshVisible, POLL_INTERVAL)
  }
}

function stopNotificationUnread() {
  // 仅释放订阅副作用，不取消共享中的 in-flight 请求。
  // 这样路由切换导致 Sidebar 短暂卸载/重挂时仍可复用同一个 Promise。
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (stopIdentityWatch) {
    stopIdentityWatch()
    stopIdentityWatch = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener(NOTIFICATION_STATE_EVENT, handleNotificationStateChange)
  }
}

export function subscribeNotificationUnread({ details = false } = {}) {
  subscriberCount += 1
  if (details) detailsSubscriberCount += 1

  if (subscriberCount === 1) startNotificationUnread()
  else if (details) void refreshNotificationUnreadDetails()
  else void refreshNotificationUnread()

  let active = true
  return function unsubscribeNotificationUnread() {
    if (!active) return
    active = false
    subscriberCount = Math.max(0, subscriberCount - 1)
    if (details) detailsSubscriberCount = Math.max(0, detailsSubscriberCount - 1)
    if (subscriberCount === 0) stopNotificationUnread()
  }
}
