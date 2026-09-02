// 站内通知接口封装
import { request } from './request.js'

const NOTIFICATION_STATE_EVENT = 'yuanHub:notification-state-change'

function firstDefined(value, ...keys) {
  for (const key of keys) {
    if (value && value[key] !== undefined && value[key] !== null) return value[key]
  }
  return undefined
}

function normalizeCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

export function normalizeNotification(notification) {
  if (!notification || typeof notification !== 'object') return null
  return {
    ...notification,
    id: firstDefined(notification, 'id') || '',
    kind: firstDefined(notification, 'kind') || '',
    title: firstDefined(notification, 'title') || '',
    body: firstDefined(notification, 'body') || '',
    refType: firstDefined(notification, 'refType', 'ref_type') || '',
    refId: firstDefined(notification, 'refId', 'ref_id') || '',
    readAt: firstDefined(notification, 'readAt', 'read_at') || null,
    createdAt: firstDefined(notification, 'createdAt', 'created_at') || null
  }
}

export function normalizeNotificationList(data) {
  const source = Array.isArray(data)
    ? data
    : Array.isArray(data?.notifications)
      ? data.notifications
      : Array.isArray(data?.items)
        ? data.items
        : []
  const value = data && typeof data === 'object' ? data : {}
  const rawTotal = firstDefined(value, 'total')
  return {
    notifications: source.map(normalizeNotification).filter(Boolean),
    total: rawTotal == null ? source.length : normalizeCount(rawTotal),
    unreadCount: normalizeCount(firstDefined(value, 'unreadCount', 'unread_count')),
    page: normalizeCount(firstDefined(value, 'page')) || 1,
    pageSize: normalizeCount(firstDefined(value, 'pageSize', 'page_size')) || source.length,
    hasNext: Boolean(firstDefined(value, 'hasNext', 'has_next'))
  }
}

export function normalizeUnreadNotificationCount(data) {
  const value = data && typeof data === 'object' ? data : {}
  return { count: normalizeCount(firstDefined(value, 'count', 'unreadCount', 'unread_count')) }
}

function notifyStateChange() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_STATE_EVENT))
  } catch (_) {
    // The server remains authoritative when event dispatch is unavailable.
  }
}

// 获取通知列表
export async function listNotifications(params = {}) {
  const qs = new URLSearchParams()
  if (params.page != null) qs.set('page', String(params.page))
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize))
  if (params.unreadOnly != null) qs.set('unreadOnly', String(params.unreadOnly))
  const query = qs.toString()
  return normalizeNotificationList(await request(`/v1/notifications${query ? '?' + query : ''}`, { auth: true }))
}

// 获取未读通知数
export async function getUnreadNotificationCount() {
  return normalizeUnreadNotificationCount(await request('/v1/notifications/unread-count', { auth: true }))
}

// 标记单条通知已读
export async function markNotificationRead(id) {
  const result = await request(`/v1/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
    auth: true,
    body: {}
  })
  const notification = normalizeNotification(result)
  notifyStateChange()
  return notification
}

// 标记全部已读
export async function markAllNotificationsRead() {
  const result = await request('/v1/notifications/read-all', {
    method: 'PATCH',
    auth: true,
    body: {}
  })
  notifyStateChange()
  return {
    updated: normalizeCount(firstDefined(result, 'updated'))
  }
}

// 获取所有未读通知，供反馈列表按 refId 建立逐工单标识。
export async function listUnreadNotifications(params = {}) {
  const pageSize = Number(params.pageSize) > 0 ? Math.floor(Number(params.pageSize)) : 100
  const notifications = []
  let page = 1
  let total = null

  while (page <= 100) {
    const result = await listNotifications({ page, pageSize, unreadOnly: true })
    notifications.push(...result.notifications)
    total = result.total
    if (!result.notifications.length || (total != null && notifications.length >= total)) break
    if (result.notifications.length < result.pageSize) break
    page += 1
  }

  return notifications
}

export function getUnreadFeedbackNotificationRefs(notifications) {
  if (!Array.isArray(notifications)) return []
  const seen = new Set()
  return notifications.reduce((refs, item) => {
    const notification = normalizeNotification(item)
    if (!notification || notification.readAt || notification.refType !== 'FEEDBACK' || !notification.refId) return refs
    const refId = String(notification.refId)
    if (seen.has(refId)) return refs
    seen.add(refId)
    refs.push(refId)
    return refs
  }, [])
}

// 详情打开成功后只标记该反馈引用下的通知。
export async function markFeedbackNotificationsRead(refId, notifications) {
  const normalizedRefId = refId == null ? '' : String(refId)
  if (!normalizedRefId) return []
  const source = Array.isArray(notifications)
    ? notifications
    : await listUnreadNotifications()
  const seenIds = new Set()
  const matches = source
    .map(normalizeNotification)
    .filter(item => {
      if (!item || item.readAt || item.refType !== 'FEEDBACK' || String(item.refId) !== normalizedRefId || !item.id || seenIds.has(item.id)) {
        return false
      }
      seenIds.add(item.id)
      return true
    })
  const marked = []
  for (const item of matches) {
    if (!item.id) continue
    marked.push(await markNotificationRead(item.id))
  }
  return marked
}

export { NOTIFICATION_STATE_EVENT }
