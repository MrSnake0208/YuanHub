// 站内通知接口封装
import { request } from './request.js'

// 获取通知列表
export function listNotifications(params) {
  const qs = new URLSearchParams()
  if (params.page != null) qs.set('page', String(params.page))
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize))
  if (params.unreadOnly != null) qs.set('unreadOnly', String(params.unreadOnly))
  const query = qs.toString()
  return request(`/v1/notifications${query ? '?' + query : ''}`, { auth: true })
}

// 获取未读通知数
export function getUnreadNotificationCount() {
  return request('/v1/notifications/unread-count', { auth: true })
}

// 标记单条通知已读
export function markNotificationRead(id) {
  return request(`/v1/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
    auth: true,
    body: {}
  })
}

// 标记全部已读
export function markAllNotificationsRead() {
  return request('/v1/notifications/read-all', {
    method: 'PATCH',
    auth: true,
    body: {}
  })
}