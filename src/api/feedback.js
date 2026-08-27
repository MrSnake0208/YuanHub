// 反馈工单接口封装（对照 BackEndV3-Share 契约）
import { request } from './request.js'

// 创建反馈。后端一期固定为 FEEDBACK，问题/建议等语义由 category 表达。
export async function createFeedback(payload) {
  const data = await request('/v1/reports', {
    method: 'POST',
    auth: true,
    body: {
      type: 'FEEDBACK',
      category: payload.category,
      content: payload.content,
      media_ids: payload.mediaIds || [],
      client_info_consent: Boolean(payload.clientInfoConsent)
    }
  })
  return normalizeFeedback(data)
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return message
  const senderKind = message.senderKind ?? message.sender_kind ?? ''
  return {
    ...message,
    senderKind,
    isAdmin: message.isAdmin ?? message.is_admin ?? senderKind === 'ADMIN',
    createdAt: message.createdAt ?? message.created_at ?? null,
    images: Array.isArray(message.images) ? message.images : []
  }
}

function normalizeFeedback(report) {
  if (!report || typeof report !== 'object') return report
  return {
    ...report,
    type: String(report.type || '').toUpperCase(),
    category: String(report.category || '').toUpperCase(),
    status: String(report.status || '').toUpperCase(),
    hasAdminReply: report.hasAdminReply ?? report.has_admin_reply ?? false,
    lastMessageSender: report.lastMessageSender ?? report.last_message_sender ?? '',
    createdAt: report.createdAt ?? report.created_at ?? null,
    updatedAt: report.updatedAt ?? report.updated_at ?? null,
    mediaIds: report.mediaIds ?? report.media_ids ?? [],
    quota: report.quota || null,
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
    total: data && data.total != null ? data.total : items.length,
    page: data && data.page != null ? data.page : Number(params.page || 1),
    pageSize: data && (data.pageSize ?? data.page_size) != null
      ? (data.pageSize ?? data.page_size)
      : items.length
  }
}

// 获取单个反馈详情
export async function getFeedback(id) {
  const data = await request(`/v1/reports/${encodeURIComponent(id)}`, { auth: true })
  return normalizeFeedback(data)
}

// 追加消息
export async function appendFeedbackMessage(id, body) {
  const data = await request(`/v1/reports/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    auth: true,
    body: {
      content: body.content,
      media_ids: body.mediaIds || []
    }
  })
  return normalizeFeedback(data)
}

// 更新状态
export async function updateFeedbackStatus(id, status) {
  const data = await request(`/v1/reports/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    auth: true,
    body: { status: String(status).toUpperCase() }
  })
  return normalizeFeedback(data)
}
