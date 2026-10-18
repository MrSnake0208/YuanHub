import { reactive, watch } from 'vue'
import { auth } from './auth.js'
import { openNotificationEventStream } from '../api/notificationEvents.js'
import {
  notificationUnreadState,
  refreshNotificationUnreadDetails,
  setNotificationRealtimeManaged,
  subscribeNotificationUnread
} from './notificationUnread.js'
import { claimFeedbackNotification } from '../utils/notificationClaims.js'
import { canPlayNotificationSound, playNotificationSound, subscribeNotificationSound } from '../utils/notificationSound.js'

export const NOTIFICATION_RECEIVED_EVENT = 'yuanHub:notification-received'
export const notificationRealtimeState = reactive({ toasts: [], connected: false })
const detailRefreshers = new Set()
const dismissTimers = new Map()

function identity() {
  const user = auth.userInfo
  return auth.accessToken ? String(user?.id || user?.userId || user?.user_id || '') : ''
}

export function subscribeFeedbackNotificationRefresh(handler) {
  detailRefreshers.add(handler)
  return () => detailRefreshers.delete(handler)
}

export function dismissFeedbackNotification(id) {
  clearTimeout(dismissTimers.get(id))
  dismissTimers.delete(id)
  notificationRealtimeState.toasts = notificationRealtimeState.toasts.filter(item => item.id !== id)
}

export function pauseFeedbackNotification(id) {
  clearTimeout(dismissTimers.get(id))
  dismissTimers.delete(id)
}

export function resumeFeedbackNotification(id) {
  pauseFeedbackNotification(id)
  dismissTimers.set(id, setTimeout(() => dismissFeedbackNotification(id), 5000))
}

function clearToasts() {
  for (const timer of dismissTimers.values()) clearTimeout(timer)
  dismissTimers.clear()
  notificationRealtimeState.toasts = []
}

export function startNotificationRealtime() {
  setNotificationRealtimeManaged(true)
  const unsubscribeUnread = subscribeNotificationUnread({ details: true })
  const unsubscribeSound = subscribeNotificationSound()
  let session = null

  const stopWatch = watch(identity, userId => {
    session?.close()
    clearToasts()
    notificationRealtimeState.connected = false
    if (!userId) { session = null; return }
    const current = { closed: false, stream: null, seen: new Set(), unreadIds: new Set(), pending: new Map(), baseline: false, running: false, dirty: false, lastSync: 0 }
    session = current
    const active = () => !current.closed && identity() === userId

    async function present() {
      if (document.visibilityState === 'hidden') return
      for (const [id, notification] of current.pending) {
        current.pending.delete(id)
        if (!active()) return
        if (!notificationUnreadState.unreadNotifications.some(item => item.id === id)) continue
        let refreshed = false
        for (const handler of detailRefreshers) {
          try { if (await handler(notification)) { refreshed = true; break } } catch (_) { /* Show the card if detail refresh fails. */ }
          if (!active()) return
        }
        if (refreshed) { current.dirty = true; continue }
        if (!active()) return
        const claim = await claimFeedbackNotification(userId, id, canPlayNotificationSound(), active)
        if (!active() || !claim.claimed || document.visibilityState === 'hidden') continue
        notificationRealtimeState.toasts.push(notification)
        while (notificationRealtimeState.toasts.length > 3) dismissFeedbackNotification(notificationRealtimeState.toasts[0].id)
        resumeFeedbackNotification(id)
        if (claim.sound) playNotificationSound()
      }
    }

    async function sync() {
      if (!active()) return
      if (current.running) { current.dirty = true; return }
      current.running = true
      try {
        do {
          current.dirty = false
          const items = await refreshNotificationUnreadDetails({ force: true })
          if (!active() || !notificationUnreadState.detailsLoaded || notificationUnreadState.detailsError) return
          current.lastSync = Date.now()
          const added = items.filter(item => item.id && !current.seen.has(item.id))
          const unreadIds = new Set(items.map(item => item.id))
          const changed = added.length || unreadIds.size !== current.unreadIds.size || [...current.unreadIds].some(id => !unreadIds.has(id))
          current.unreadIds = unreadIds
          items.forEach(item => current.seen.add(item.id))
          if (current.baseline && added.length) {
            for (const item of added) {
              if (!item.readAt && item.refType === 'FEEDBACK' && item.refId && ['FEEDBACK_REPLY', 'FEEDBACK_MESSAGE_FROM_REPORTER'].includes(item.kind)) current.pending.set(item.id, item)
            }
          }
          if (current.baseline && changed) window.dispatchEvent(new CustomEvent(NOTIFICATION_RECEIVED_EVENT))
          current.baseline = true
          if (!current.stream) {
            current.stream = openNotificationEventStream({
              onOpen: () => { if (active()) { notificationRealtimeState.connected = true; void sync() } },
              onError: () => { if (active()) notificationRealtimeState.connected = false },
              onEvent: message => { if (active() && message.event === 'notification_created') void sync() }
            })
          }
          await present()
        } while (active() && current.dirty)
      } finally {
        current.running = false
      }
    }

    const poll = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      if (!notificationRealtimeState.connected || Date.now() - current.lastSync >= 120000) void sync()
    }, 30000)
    const visible = () => { if (document.visibilityState !== 'hidden') void sync() }
    document.addEventListener('visibilitychange', visible)
    current.close = () => {
      current.closed = true
      current.stream?.close()
      current.pending.clear()
      current.seen.clear()
      current.unreadIds.clear()
      clearInterval(poll)
      document.removeEventListener('visibilitychange', visible)
    }
    void sync()
  }, { immediate: true, flush: 'sync' })

  return () => {
    stopWatch()
    session?.close()
    unsubscribeSound()
    unsubscribeUnread()
    setNotificationRealtimeManaged(false)
    notificationRealtimeState.connected = false
    clearToasts()
  }
}
