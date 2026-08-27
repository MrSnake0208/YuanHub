// 反馈工单接口封装（对照 BackEndV3-Share 契约）
import { request } from './request.js'

// 创建反馈
export function createFeedback(payload) {
  return request('/v1/reports', {
    method: 'POST',
    auth: true,
    body: {
      type: payload.type,
      category: payload.category,
      content: payload.content,
      media_ids: payload.mediaIds,
      client_info_consent: payload.clientInfoConsent
    }
  })
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return message
  return {
    ...message,
    isAdmin: message.isAdmin ?? message.is_admin ?? false,
    createdAt: message.createdAt ?? message.created_at ?? null
  }
}

function normalizeFeedback(report) {
  if (!report || typeof report !== 'object') return report
  return {
    ...report,
    createdAt: report.createdAt ?? report.created_at ?? null,
    updatedAt: report.updatedAt ?? report.updated_at ?? null,
    mediaIds: report.mediaIds ?? report.media_ids ?? [],
    messages: Array.isArray(report.messages) ? report.messages.map(normalizeMessage) : []
  }
}

// 获取反馈列表
export async function listFeedback(params = {}) {
  const qs = new URLSearchParams()
  if (params.page != null) qs.set('page', String(params.page))
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize))
  if (params.status) qs.set('status', params.status)
  if (params.type) qs.set('type', params.type)
  if (params.mine != null) qs.set('mine', String(params.mine))
  if (params.reporterUserId) qs.set('reporterUserId', params.reporterUserId)
  if (params.q) qs.set('q', params.q)
  if (params.sortBy) qs.set('sortBy', params.sortBy)
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder)
  const query = qs.toString()
  const data = await request(`/v1/reports${query ? '?' + query : ''}`, { auth: true })
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data && data.reports)
      ? data.reports
      : Array.isArray(data && data.items)
        ? data.items
        : []
  return {
    items: items.map(normalizeFeedback),
    nextCursor: data && (data.nextCursor ?? data.next_cursor) || null,
    total: data && data.total != null ? data.total : items.length
  }
}

// 获取单个反馈详情
export function getFeedback(id) {
  return request(`/v1/reports/${encodeURIComponent(id)}`, { auth: true })
}

// 追加消息
export function appendFeedbackMessage(id, body) {
  return request(`/v1/reports/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    auth: true,
    body: {
      content: body.content,
      media_ids: body.mediaIds
    }
  })
}

// 更新状态
export function updateFeedbackStatus(id, status) {
  return request(`/v1/reports/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    auth: true,
    body: { status }
  })
}