const STORAGE_PREFIX = 'yh_feedback_read_state:'
const READ_STATE_EVENT = 'yh-feedback-read-state-changed'
const memoryStates = new Map()

function normalizeUserId(userId) {
  return userId == null ? '' : String(userId).trim()
}

function normalizeReportId(reportId) {
  return reportId == null ? '' : String(reportId).trim()
}

function storageKey(userId) {
  return STORAGE_PREFIX + encodeURIComponent(normalizeUserId(userId))
}

function getStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function cloneState(state) {
  return Object.fromEntries(Object.entries(state || {}).map(([id, cursor]) => [id, { ...cursor }]))
}

function readState(userId) {
  const normalizedUserId = normalizeUserId(userId)
  if (!normalizedUserId) return {}

  const fallback = memoryStates.get(normalizedUserId) || {}
  const storage = getStorage()
  if (!storage) return cloneState(fallback)

  try {
    const raw = storage.getItem(storageKey(normalizedUserId))
    if (!raw) return cloneState(fallback)
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return cloneState(fallback)
    const state = {}
    for (const [reportId, cursor] of Object.entries(parsed)) {
      if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) {
        state[reportId] = { ...cursor }
      }
    }
    memoryStates.set(normalizedUserId, state)
    return cloneState(state)
  } catch (_) {
    return cloneState(fallback)
  }
}

function writeState(userId, state) {
  const normalizedUserId = normalizeUserId(userId)
  if (!normalizedUserId) return false
  const nextState = cloneState(state)
  memoryStates.set(normalizedUserId, nextState)
  const storage = getStorage()
  if (!storage) return false

  try {
    storage.setItem(storageKey(normalizedUserId), JSON.stringify(nextState))
    return true
  } catch (_) {
    return false
  }
}

function dispatchStateChange(userId, reportId) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent(READ_STATE_EVENT, {
      detail: { userId: normalizeUserId(userId), reportId: normalizeReportId(reportId) }
    }))
  } catch (_) {
    // Storage state remains authoritative when event dispatch is unavailable.
  }
}

function valueTimestamp(value) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function numericOrder(value) {
  if (value == null || value === '') return null
  return Number.isFinite(Number(value)) ? Number(value) : null
}

function boundaryFromMessage(message, index = null) {
  if (!message || typeof message !== 'object') return null
  const messageId = message.messageId
    ?? message.message_id
    ?? message.lastMessageId
    ?? message.last_message_id
    ?? message.id
    ?? ''
  const messageCreatedAt = message.messageCreatedAt
    ?? message.message_created_at
    ?? message.lastMessageCreatedAt
    ?? message.last_message_created_at
    ?? message.createdAt
    ?? message.created_at
    ?? message.updatedAt
    ?? message.updated_at
    ?? null
  const messageIndex = message.messageIndex ?? message.message_index ?? message.index ?? index
  if (!messageId && !messageCreatedAt && numericOrder(messageIndex) == null) return null
  return {
    messageId: messageId ? String(messageId) : '',
    messageCreatedAt: messageCreatedAt || null,
    messageIndex: numericOrder(messageIndex)
  }
}

export function getFeedbackMessageBoundary(value) {
  if (!value || typeof value !== 'object') return null
  if (value.messageId != null || value.message_id != null || value.messageCreatedAt != null || value.message_created_at != null) {
    return boundaryFromMessage(value)
  }
  if (Array.isArray(value.messages)) {
    let latest = null
    value.messages.forEach((message, index) => {
      const boundary = boundaryFromMessage(message, index)
      if (!boundary) return
      if (!latest || compareBoundaries(boundary, latest) >= 0) latest = boundary
    })
    return latest
  }
  if (
    value.lastMessageSender != null ||
    value.last_message_sender != null ||
    value.lastMessageId != null ||
    value.last_message_id != null ||
    value.lastMessageCreatedAt != null ||
    value.last_message_created_at != null
  ) return boundaryFromMessage(value)
  if (value.reportId != null || value.report_id != null || value.status != null) return null
  return boundaryFromMessage(value)
}

function compareBoundaries(left, right) {
  if (!left || !right) return 0
  const leftTime = valueTimestamp(left.messageCreatedAt)
  const rightTime = valueTimestamp(right.messageCreatedAt)
  if (leftTime != null && rightTime != null && leftTime !== rightTime) return leftTime > rightTime ? 1 : -1
  if (left.messageIndex != null && right.messageIndex != null && left.messageIndex !== right.messageIndex) {
    return left.messageIndex > right.messageIndex ? 1 : -1
  }
  return 0
}

function isAdminMessage(value) {
  if (!value || typeof value !== 'object') return false
  const canonicalSenderKind = value.senderKind ?? value.sender_kind ?? value.lastMessageSender ?? value.last_message_sender
  if (canonicalSenderKind != null && canonicalSenderKind !== '') {
    return String(canonicalSenderKind).toUpperCase() === 'ADMIN'
  }
  return value.isAdmin === true || value.is_admin === true
}

function isReporterMessage(value) {
  if (!value || typeof value !== 'object') return false
  const canonicalSenderKind = value.senderKind ?? value.sender_kind ?? value.lastMessageSender ?? value.last_message_sender
  if (canonicalSenderKind == null || canonicalSenderKind === '') return false
  const senderKind = String(canonicalSenderKind).toUpperCase()
  return senderKind === 'REPORTER' || senderKind === 'USER' || senderKind === 'USER_MESSAGE' || senderKind === 'CUSTOMER'
}

function latestMessage(value) {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value.messages) && value.messages.length) {
    let latest = null
    value.messages.forEach((message, index) => {
      const candidate = { ...message, messageIndex: message.messageIndex ?? index }
      if (!latest || compareBoundaries(getFeedbackMessageBoundary(candidate), getFeedbackMessageBoundary(latest)) >= 0) latest = candidate
    })
    return latest
  }
  return value
}

export function getFeedbackReadCursor(userId, reportId) {
  const id = normalizeReportId(reportId)
  if (!id) return null
  return readState(userId)[id] || null
}

export function hasUnreadFeedback(report, userId) {
  const reportId = report && (report.id ?? report.reportId ?? report.report_id)
  const cursor = getFeedbackReadCursor(userId, reportId)
  if (Array.isArray(report?.messages) && report.messages.length) {
    return report.messages.some(function (message, index) {
      if (!isReporterMessage(message)) return false
      const messageBoundary = boundaryFromMessage(message, index)
      return !!messageBoundary && (!cursor || compareBoundaries(messageBoundary, cursor) > 0)
    })
  }

  const current = latestMessage(report)
  const boundary = getFeedbackMessageBoundary(report)
  if (!current || isAdminMessage(current) || !isReporterMessage(current) || !boundary) return false
  return !cursor || compareBoundaries(boundary, cursor) > 0
}

export function countUnreadFeedback(reports, userId) {
  if (!Array.isArray(reports)) return 0
  const seen = new Set()
  return reports.reduce(function (count, report) {
    const reportId = report && (report.id ?? report.reportId ?? report.report_id)
    const key = reportId || report
    if (seen.has(key)) return count
    seen.add(key)
    return count + (hasUnreadFeedback(report, userId) ? 1 : 0)
  }, 0)
}

export function markFeedbackRead(userId, reportId, reportOrMessage) {
  const normalizedReportId = normalizeReportId(reportId)
  if (!normalizeUserId(userId) || !normalizedReportId) return false
  const boundary = getFeedbackMessageBoundary(reportOrMessage)
  if (!boundary) return false
  const state = readState(userId)
  state[normalizedReportId] = boundary
  const result = writeState(userId, state)
  dispatchStateChange(userId, normalizedReportId)
  return result
}

export function clearFeedbackReadState(userId) {
  const normalizedUserId = normalizeUserId(userId)
  if (!normalizedUserId) return false
  memoryStates.delete(normalizedUserId)
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.removeItem(storageKey(normalizedUserId))
    return true
  } catch (_) {
    return false
  }
}

export const FEEDBACK_READ_STATE_EVENT = READ_STATE_EVENT
