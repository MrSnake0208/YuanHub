// 反馈工单接口封装（对照 BackEndV3-Share 契约）
import { request } from './request.js'
import { feedbackDiagnostics } from '../config/buildInfo.js'

const FEEDBACK_TYPES = new Set(['BUG', 'FEATURE', 'CONTENT', 'ACCOUNT', 'REPORT', 'OTHER'])
const FEEDBACK_CATEGORIES = new Set(['INVENTORY', 'OPERATOR', 'LEDGER', 'PLAZA', 'ACCOUNT', 'UI', 'OTHER'])

// 创建反馈。新契约中 type 是反馈类型，category 是前端板块。
// diagnostics 始终取自本次构建实际运行的前端版本，与 clientInfoConsent 无关：
// consent 只控制 IP / User-Agent 等浏览器信息，版本与 Build 属于应用诊断信息。
export async function createFeedback(payload) {
  const rawType = String(payload.type || 'FEEDBACK').trim().toUpperCase()
  const rawCategory = String(payload.category || '').trim().toUpperCase()
  const rawArea = String(payload.area || '').trim().toUpperCase()
  const legacyType = rawType === 'FEEDBACK' && FEEDBACK_TYPES.has(rawCategory) ? rawCategory : rawType
  const category = rawType === 'FEEDBACK'
    ? (FEEDBACK_CATEGORIES.has(rawArea) ? rawArea : (FEEDBACK_CATEGORIES.has(rawCategory) ? rawCategory : 'OTHER'))
    : (FEEDBACK_CATEGORIES.has(rawCategory) ? rawCategory : (FEEDBACK_CATEGORIES.has(rawArea) ? rawArea : (rawCategory || 'OTHER')))
  const title = payload.title ? String(payload.title).trim() : ''
  const body = {
    type: legacyType,
    category,
    content: payload.content,
    media_ids: payload.mediaIds || [],
    client_info_consent: Boolean(payload.clientInfoConsent),
    diagnostics: feedbackDiagnostics()
  }
  // 旧客户端不带标题时保持请求体不变，避免破坏既有契约。
  if (title) body.title = title
  const data = await request('/v1/reports', { method: 'POST', auth: true, body })
  return normalizeFeedback(data)
}

function normalizeDiagnostics(value) {
  if (!value || typeof value !== 'object') return null
  const productVersion = value.productVersion ?? value.product_version ?? ''
  const frontendCommit = value.frontendCommit ?? value.frontend_commit ?? ''
  const buildTime = value.buildTime ?? value.build_time ?? ''
  if (!productVersion && !frontendCommit && !buildTime) return null
  return {
    productVersion: String(productVersion || ''),
    frontendCommit: String(frontendCommit || ''),
    buildTime: String(buildTime || '')
  }
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
  const rawType = String(report.type || '').trim().toUpperCase()
  const rawCategory = String(report.category || '').trim().toUpperCase()
  const rawArea = String(report.area || '').trim().toUpperCase()
  const legacyCategory = rawType === 'FEEDBACK' && FEEDBACK_TYPES.has(rawCategory)
  // Legacy area has the same precedence used by backend scope authorization.
  const category = FEEDBACK_CATEGORIES.has(rawArea)
    ? rawArea
    : (FEEDBACK_CATEGORIES.has(rawCategory) ? rawCategory : 'OTHER')
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
  const lastReporterMessageIndex = report.lastReporterMessageIndex
    ?? report.last_reporter_message_index
    ?? null
  return {
    ...report,
    type,
    category,
    // area remains a read-only alias for older page consumers.
    area: category,
    // 旧工单没有 diagnostics 时保持 null，页面需要兼容。
    diagnostics: normalizeDiagnostics(report.diagnostics ?? report.diagnostics_data),
    status: String(report.status || '').toUpperCase(),
    hasAdminReply: report.hasAdminReply ?? report.has_admin_reply ?? false,
    lastMessageSender: lastMessageSender == null ? '' : String(lastMessageSender).toUpperCase(),
    lastMessageId,
    lastMessageCreatedAt: lastMessageCreatedAt ?? updatedAt,
    lastMessageIndex: report.lastMessageIndex ?? report.last_message_index ?? null,
    lastReporterMessageId: report.lastReporterMessageId ?? report.last_reporter_message_id ?? null,
    lastReporterMessageCreatedAt: report.lastReporterMessageCreatedAt
      ?? report.last_reporter_message_created_at
      ?? null,
    lastReporterMessageIndex: lastReporterMessageIndex == null || !Number.isFinite(Number(lastReporterMessageIndex))
      ? null
      : Number(lastReporterMessageIndex),
    // 公开共创字段：后端全局 SNAKE_CASE，这里同时兼容 camelCase。
    title: report.title ?? null,
    visibility: String(report.visibility || 'PRIVATE').toUpperCase(),
    publicTitle: report.publicTitle ?? report.public_title ?? null,
    publicSummary: report.publicSummary ?? report.public_summary ?? null,
    publicStatus: report.publicStatus ?? report.public_status ?? null,
    supportCount: Number(report.supportCount ?? report.support_count ?? 0),
    mergedIntoId: report.mergedIntoId ?? report.merged_into_id ?? null,
    mergedCount: Number(report.mergedCount ?? report.merged_count ?? 0),
    publishedAt: report.publishedAt ?? report.published_at ?? null,
    publicUpdatedAt: report.publicUpdatedAt ?? report.public_updated_at ?? null,
    completedAt: report.completedAt ?? report.completed_at ?? null,
    targetVersionId: report.targetVersionId ?? report.target_version_id ?? null,
    targetVersionLabel: report.targetVersionLabel ?? report.target_version_label ?? null,
    completedVersionId: report.completedVersionId ?? report.completed_version_id ?? null,
    completedVersionLabel: report.completedVersionLabel ?? report.completed_version_label ?? null,
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

// ===== 管理员公开管理（共创中心第一轮） =====

export async function publishFeedback(id, payload = {}) {
  const data = await request(`/v1/admin/feedback/${encodeURIComponent(id)}/publish`, {
    method: 'PATCH',
    auth: true,
    body: {
      public_title: payload.publicTitle,
      public_summary: payload.publicSummary || null,
      public_status: payload.publicStatus || null
    }
  })
  return normalizeFeedback(data)
}

export async function unpublishFeedback(id) {
  const data = await request(`/v1/admin/feedback/${encodeURIComponent(id)}/unpublish`, {
    method: 'PATCH',
    auth: true
  })
  return normalizeFeedback(data)
}

export async function updateFeedbackPublicStatus(id, publicStatus) {
  const data = await request(`/v1/admin/feedback/${encodeURIComponent(id)}/public-status`, {
    method: 'PATCH',
    auth: true,
    body: { public_status: String(publicStatus || '').toUpperCase() }
  })
  return normalizeFeedback(data)
}

export async function mergeFeedback(id, targetFeedbackId) {
  const data = await request(`/v1/admin/feedback/${encodeURIComponent(id)}/merge`, {
    method: 'POST',
    auth: true,
    body: { target_feedback_id: targetFeedbackId }
  })
  return normalizeFeedback(data)
}

// 关联/清除目标版本与完成版本;传 null 或空字符串表示清除。
export async function updateFeedbackVersions(id, payload = {}) {
  const data = await request(`/v1/admin/feedback/${encodeURIComponent(id)}/versions`, {
    method: 'PATCH',
    auth: true,
    body: {
      target_version_id: payload.targetVersionId || null,
      completed_version_id: payload.completedVersionId || null
    }
  })
  return normalizeFeedback(data)
}
