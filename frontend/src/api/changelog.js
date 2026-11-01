import { request } from './request.js'

function pick(value, camel, snake, fallback = null) {
  if (!value || typeof value !== 'object') return fallback
  return value[camel] ?? value[snake] ?? fallback
}

function revision(value) {
  if (!value || typeof value !== 'object') return null
  return {
    ...value,
    versionLabel: String(pick(value, 'versionLabel', 'version_label', '')),
    authoredBy: pick(value, 'authoredBy', 'authored_by'),
    updatedBy: pick(value, 'updatedBy', 'updated_by'),
    updatedAt: pick(value, 'updatedAt', 'updated_at'),
    submittedBy: pick(value, 'submittedBy', 'submitted_by'),
    submittedAt: pick(value, 'submittedAt', 'submitted_at'),
    rejectionReason: pick(value, 'rejectionReason', 'rejection_reason'),
    rejectedBy: pick(value, 'rejectedBy', 'rejected_by'),
    rejectedAt: pick(value, 'rejectedAt', 'rejected_at'),
    approvedBy: pick(value, 'approvedBy', 'approved_by'),
    publishedAt: pick(value, 'publishedAt', 'published_at')
  }
}

export function normalizeChangelogEntry(value) {
  const working = pick(value, 'workingRevision', 'working_revision')
  const published = pick(value, 'publishedRevision', 'published_revision')
  return {
    ...value,
    id: String(value && value.id || ''),
    version: Number(value && value.version) || 0,
    versionLabel: String(pick(value, 'versionLabel', 'version_label', '')),
    publishedAt: pick(value, 'publishedAt', 'published_at'),
    createdBy: pick(value, 'createdBy', 'created_by'),
    createdAt: pick(value, 'createdAt', 'created_at'),
    updatedBy: pick(value, 'updatedBy', 'updated_by'),
    updatedAt: pick(value, 'updatedAt', 'updated_at'),
    withdrawnAt: pick(value, 'withdrawnAt', 'withdrawn_at'),
    withdrawnBy: pick(value, 'withdrawnBy', 'withdrawn_by'),
    workingRevision: revision(working),
    publishedRevision: revision(published)
  }
}

function page(value, fallbackPage) {
  const items = value && Array.isArray(value.data) ? value.data : []
  return {
    data: items.map(normalizeChangelogEntry),
    page: Number(value && value.page) || fallbackPage,
    total: Number(value && value.total) || 0,
    hasNext: value && (value.hasNext ?? value.has_next) === true
  }
}

export async function listChangelog({ page: current = 1, size = 10 } = {}) {
  const query = new URLSearchParams({ page: String(current), size: String(size) })
  return page(await request('/v1/changelog?' + query), current)
}

export async function listAdminChangelog({ page: current = 1, size = 20 } = {}) {
  const query = new URLSearchParams({ page: String(current), size: String(size) })
  return page(await request('/v1/admin/changelog?' + query, { auth: true }), current)
}

function contentPayload(value, includeVersion) {
  const payload = {
    title: String(value.title || '').trim(),
    version_label: String(value.versionLabel || '').trim(),
    body: value.body
  }
  if (includeVersion) payload.expected_version = value.expectedVersion
  return payload
}

export async function createChangelogDraft(value) {
  return normalizeChangelogEntry(await request('/v1/admin/changelog', { method: 'POST', auth: true, body: contentPayload(value, false) }))
}

export async function saveChangelogDraft(id, value) {
  return normalizeChangelogEntry(await request('/v1/admin/changelog/' + encodeURIComponent(id) + '/draft', {
    method: 'PUT', auth: true, body: contentPayload(value, true)
  }))
}

async function transition(id, action, expectedVersion, extra = {}) {
  return normalizeChangelogEntry(await request('/v1/admin/changelog/' + encodeURIComponent(id) + '/' + action, {
    method: 'POST', auth: true, body: { expected_version: expectedVersion, ...extra }
  }))
}

export function submitChangelog(id, expectedVersion) { return transition(id, 'submit', expectedVersion) }
export function approveChangelog(id, expectedVersion) { return transition(id, 'approve', expectedVersion) }
export function rejectChangelog(id, expectedVersion, reason) { return transition(id, 'reject', expectedVersion, { reason }) }
export function withdrawChangelog(id, expectedVersion) { return transition(id, 'withdraw', expectedVersion) }
