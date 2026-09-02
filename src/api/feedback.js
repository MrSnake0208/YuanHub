// 反馈工单接口封装（对照 BackEndV3-Share 契约）
import { request } from './request.js'

const FEEDBACK_TYPES = new Set(['BUG', 'FEATURE', 'CONTENT', 'ACCOUNT', 'REPORT', 'OTHER'])
const FEEDBACK_CATEGORIES = new Set(['INVENTORY', 'OPERATOR', 'LEDGER', 'PLAZA', 'ACCOUNT', 'UI', 'OTHER'])

// 创建反馈。新契约中 type 是反馈类型，category 是前端板块。
export async function createFeedback(payload) {
  const rawType = String(payload.type || 'FEEDBACK').toUpperCase()
  const rawCategory = String(payload.category || '').toUpperCase()
  const rawArea = String(payload.area || '').toUpperCase()
  const legacyType = rawType === 'FEEDBACK' && FEEDBACK_TYPES.has(rawCategory) ? rawCategory : rawType
  const category = FEEDBACK_CATEGORIES.has(rawCategory)
    ? rawCategory
    : (FEEDBACK_CATEGORIES.has(rawArea) ? rawArea : (rawCategory || 'OTHER'))
  const data = await request('/v1/reports', {
    method: 'POST',
    auth: true,
    body: {
      type: legacyType,
      category,
      content: payload.content,
      media_ids: payload.mediaIds || [],
      client_info_consent: Boolean(payload.clientInfoConsent)
    }
  })
  return normalizeFeedback(data)
}

export function normalizeFeedbackMessage(message) {
  if (!message || typeof message !== 'object') return message
  const canonicalSenderKind = message.senderKind ?? message.sender_kind
  const senderKind = canonicalSenderKind == null ? '' : String(canonicalSenderKind).toUpperCase()
  return {
    ...message,
    senderKind,
    author: normalizeUser(message.author),
    isAdmin: canonicalSenderKind != null
      ? senderKind === 'ADMIN'
      : Boolean(message.isAdmin ?? message.is_admin ?? false),
    createdAt: message.createdAt ?? message.created_at ?? null,
    images: Array.isArray(message.images) ? message.images : [],
    files: Array.isArray(message.files)
      ? message.files.map(file => ({
          ...file,
          id: file.id || '',
          name: file.name || '',
          mime: file.mime || 'application/octet-stream',
          size: Number(file.size || 0),
          downloadUrl: file.downloadUrl ?? file.download_url ?? ''
        }))
      : []
  }
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') return null
  return {
    ...user,
    id: user.id || user.userId || user.user_id || '',
    userName: user.userName ?? user.user_name ?? ''
  }
}

export function normalizeFeedback(report) {
  if (!report || typeof report !== 'object') return report
  const rawType = String(report.type || '').toUpperCase()
  const rawCategory = String(report.category || '').toUpperCase()
  const rawArea = String(report.area || '').toUpperCase()
  const legacyCategory = rawType === 'FEEDBACK' && FEEDBACK_TYPES.has(rawCategory)
  const category = FEEDBACK_CATEGORIES.has(rawCategory)
    ? rawCategory
    : (FEEDBACK_CATEGORIES.has(rawArea) ? rawArea : (legacyCategory ? 'OTHER' : (rawCategory || 'OTHER')))
  const type = legacyCategory ? rawCategory : rawType
  const rawQuota = report.quota && typeof report.quota === 'object' ? report.quota : null
  const reporter = normalizeUser(report.reporter)
  const handler = normalizeUser(report.handler)
  const rawLastMessage = report.lastMessage ?? report.last_message
  const lastMessage = rawLastMessage && typeof rawLastMessage === 'object'
    ? normalizeFeedbackMessage(rawLastMessage)
    : null
  const lastMessageId = report.lastMessageId
    ?? report.last_message_id
    ?? lastMessage?.id
    ?? ''
  const lastMessageCreatedAt = report.lastMessageCreatedAt
    ?? report.last_message_created_at
    ?? lastMessage?.createdAt
    ?? null
  const lastMessageSender = report.lastMessageSender
    ?? report.last_message_sender
    ?? lastMessage?.senderKind
    ?? ''
  const updatedAt = report.updatedAt ?? report.updated_at ?? null
  return {
    ...report,
    type,
    category,
    // area remains a read-only alias for older page consumers.
    area: category,
    status: String(report.status || '').toUpperCase(),
    hasAdminReply: report.hasAdminReply ?? report.has_admin_reply ?? false,
    lastMessageSender: lastMessageSender == null ? '' : String(lastMessageSender).toUpperCase(),
    lastMessageId,
    lastMessageCreatedAt: lastMessageCreatedAt ?? updatedAt,
    lastMessageIndex: report.lastMessageIndex ?? report.last_message_index ?? null,
    createdAt: report.createdAt ?? report.created_at ?? null,
    updatedAt,
    mediaIds: report.mediaIds ?? report.media_ids ?? [],
    reporter,
    reporterName: report.reporterName ?? report.reporter_name ?? reporter?.userName ?? '',
    reporterUserId: report.reporterUserId ?? report.reporter_user_id ?? reporter?.id ?? '',
    handler,
    quota: rawQuota
      ? {
          ...rawQuota,
          pendingCount: rawQuota.pendingCount ?? rawQuota.pending_count ?? 0,
          pendingLimit: rawQuota.pendingLimit ?? rawQuota.pending_limit ?? 0,
          canAppend: rawQuota.canAppend ?? rawQuota.can_append ?? false
        }
      : null,
    viewerIsReporter: report.viewerIsReporter ?? report.viewer_is_reporter ?? false,
    viewerCanManage: report.viewerCanManage ?? report.viewer_can_manage ?? false,
    lastMessage: lastMessage || undefined,
    messages: Array.isArray(report.messages) ? report.messages.map(normalizeFeedbackMessage) : []
  }
}

// 获取反馈列表
export async function listFeedback(params = {}) {
  const qs = new URLSearchParams()
  if (params.page != null) qs.set('page', String(params.page))
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize))
  if (params.status) qs.set('status', params.status)
  if (params.type) qs.set('type', params.type)
  if (params.category) qs.set('category', params.category)
  else if (params.area) qs.set('area', params.area)
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

export function listMyFeedback(params = {}) {
  return listFeedback({ ...params, mine: true })
}

export function listManagedFeedback(params = {}) {
  return listFeedback({ ...params, mine: false })
}

// 获取单个反馈详情
export function getFeedbackAccess() {
  return request('/v1/reports/access', { auth: true })
}

export function listFeedbackAccessGrants() {
  return request('/v1/admin/feedback-access', { auth: true })
}

export function updateFeedbackAccessGrant(userId, grant) {
  return request('/v1/admin/feedback-access/' + encodeURIComponent(userId), {
    method: 'PUT',
    auth: true,
    body: {
      receive_categories: grant.receiveCategories || grant.receiveAreas || [],
      manage_categories: grant.manageCategories || grant.manageAreas || []
    }
  })
}

export function deleteFeedbackAccessGrant(userId) {
  return request('/v1/admin/feedback-access/' + encodeURIComponent(userId), {
    method: 'DELETE',
    auth: true
  })
}

export async function getFeedback(id) {
  const data = await request(`/v1/reports/${encodeURIComponent(id)}`, { auth: true })
  return normalizeFeedback(data)
}

export function downloadFeedbackAttachment(reportId, mediaId) {
  return request(
    `/v1/reports/${encodeURIComponent(reportId)}/attachments/${encodeURIComponent(mediaId)}`,
    { auth: true, responseType: 'blob' }
  )
}

async function appendFeedbackMessage(id, body, actorMode) {
  const data = await request(`/v1/reports/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    auth: true,
    body: {
      content: body.content,
      media_ids: body.mediaIds || [],
      actor_mode: actorMode
    }
  })
  return normalizeFeedback(data)
}

export function appendMyFeedbackMessage(id, body) {
  return appendFeedbackMessage(id, body, 'REPORTER')
}

export function appendManagedFeedbackMessage(id, body) {
  return appendFeedbackMessage(id, body, 'ADMIN')
}

async function updateFeedbackStatus(id, status, actorMode) {
  const data = await request(`/v1/reports/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    auth: true,
    body: {
      status: String(status).toUpperCase(),
      actor_mode: actorMode
    }
  })
  return normalizeFeedback(data)
}

export function updateMyFeedbackStatus(id, status) {
  return updateFeedbackStatus(id, status, 'REPORTER')
}

export function updateManagedFeedbackStatus(id, status) {
  return updateFeedbackStatus(id, status, 'ADMIN')
}
