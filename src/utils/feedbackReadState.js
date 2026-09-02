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
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
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
  if (Array.isArray(value.messages)) {
    if (!value.messages.length) return null
    return boundaryFromMessage(value.messages[value.messages.length - 1], value.messages.length - 1)
  }
  if (value.messageId != null || value.message_id != null || value.messageCreatedAt != null || value.message_created_at != null) {
    return boundaryFromMessage(value)
  }
  if (value.id != null && (value.senderKind != null || value.sender_kind != null)) return boundaryFromMessage(value)
  return null
}

/** Return the latest reporter boundary from a list item or a detail response. */
export function getFeedbackReporterBoundary(value) {
  if (!value || typeof value !== 'object') return null
  if (
    value.lastReporterMessageId != null ||
    value.last_reporter_message_id != null ||
    value.lastReporterMessageCreatedAt != null ||
    value.last_reporter_message_created_at != null ||
    value.lastReporterMessageIndex != null ||
    value.last_reporter_message_index != null
  ) {
    return boundaryFromMessage({
      messageId: value.lastReporterMessageId ?? value.last_reporter_message_id,
      messageCreatedAt: value.lastReporterMessageCreatedAt ?? value.last_reporter_message_created_at,
      messageIndex: value.lastReporterMessageIndex ?? value.last_reporter_message_index
    })
  }
  if (Array.isArray(value.messages)) {
    for (let index = value.messages.length - 1; index >= 0; index -= 1) {
      const message = value.messages[index]
      if (isReporterMessage(message)) return boundaryFromMessage(message, index)
    }
  }
  return null
}

function compareBoundaries(left, right) {
  if (!left || !right) return 0
  if (left.messageId && right.messageId && left.messageId === right.messageId) return 0
  if (left.messageIndex != null && right.messageIndex != null && left.messageIndex !== right.messageIndex) {
    return left.messageIndex > right.messageIndex ? 1 : -1
  }
  if (left.messageIndex != null && right.messageIndex != null) return 0
  const leftTime = valueTimestamp(left.messageCreatedAt)
  const rightTime = valueTimestamp(right.messageCreatedAt)
  if (leftTime != null && rightTime != null && leftTime !== rightTime) return leftTime > rightTime ? 1 : -1
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

export function getFeedbackReadCursor(userId, reportId) {
  const id = normalizeReportId(reportId)
  if (!id) return null
  return readState(userId)[id] || null
}

export function hasUnreadFeedback(report, userId) {
  const reportId = report && (report.id ?? report.reportId ?? report.report_id)
  const cursor = getFeedbackReadCursor(userId, reportId)
  const boundary = getFeedbackReporterBoundary(report)
  if (!boundary) return false
  return !cursor || compareBoundaries(boundary, cursor) > 0
}

export function countUnreadFeedback(reports, userId) {
  return getUnreadFeedbackIds(reports, userId).length
}

export function getUnreadFeedbackIds(reports, userId) {
  if (!Array.isArray(reports)) return []
  const seen = new Set()
  return reports.reduce(function (ids, report) {
    const reportId = report && (report.id ?? report.reportId ?? report.report_id)
    const key = reportId || report
    if (seen.has(key)) return ids
    seen.add(key)
    if (reportId && hasUnreadFeedback(report, userId)) ids.push(String(reportId))
    return ids
  }, [])
}

export function markFeedbackRead(userId, reportId, reportOrMessage) {
  const normalizedReportId = normalizeReportId(reportId)
  if (!normalizeUserId(userId) || !normalizedReportId) return false
  const boundary = Array.isArray(reportOrMessage?.messages)
    ? getFeedbackMessageBoundary(reportOrMessage)
    : getFeedbackMessageBoundary(reportOrMessage) || getFeedbackReporterBoundary(reportOrMessage)
  if (!boundary) return false
  const state = readState(userId)
  const previous = state[normalizedReportId]
  if (previous && compareBoundaries(boundary, previous) <= 0) return true
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
