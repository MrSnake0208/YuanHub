import { request } from './request.js'
import { normalizeAdminAccess } from '../utils/authPermissions.js'

function pick(value, camelKey, snakeKey, fallback = '') {
  if (!value || typeof value !== 'object') return fallback
  return value[camelKey] ?? value[snakeKey] ?? fallback
}

export async function getCurrentAdminAccess() {
  return normalizeAdminAccess(await request('/v1/admin/access/me', { auth: true }))
}

export function normalizeAdminRoleUser(value) {
  return {
    userId: pick(value, 'userId', 'user_id'),
    userName: pick(value, 'userName', 'user_name'),
    activated: value && value.activated === true,
    roles: Array.isArray(value && value.roles) ? value.roles.slice() : [],
    grantedBy: pick(value, 'grantedBy', 'granted_by'),
    grantedAt: pick(value, 'grantedAt', 'granted_at'),
    updatedBy: pick(value, 'updatedBy', 'updated_by'),
    updatedAt: pick(value, 'updatedAt', 'updated_at')
  }
}

export async function listAdminRoleUsers() {
  const data = await request('/v1/admin/roles/users', { auth: true })
  return Array.isArray(data) ? data.map(normalizeAdminRoleUser) : []
}

export async function replaceAdminRoles(userId, roles) {
  const data = await request('/v1/admin/roles/users/' + encodeURIComponent(userId), {
    method: 'PUT',
    auth: true,
    body: { roles: Array.isArray(roles) ? roles.slice() : [] }
  })
  return normalizeAdminRoleUser(data)
}

function normalizeAuditSnapshot(value) {
  if (!value || typeof value !== 'object') return null
  const receiveAreas = value.receiveAreas || value.receive_areas
  const manageAreas = value.manageAreas || value.manage_areas
  return {
    roles: Array.isArray(value.roles) ? value.roles.slice() : [],
    receiveAreas: Array.isArray(receiveAreas) ? receiveAreas.slice() : [],
    manageAreas: Array.isArray(manageAreas) ? manageAreas.slice() : []
  }
}

export function normalizeAdminAuditLog(value) {
  return {
    id: pick(value, 'id', 'id'),
    actorUserId: pick(value, 'actorUserId', 'actor_user_id'),
    action: pick(value, 'action', 'action'),
    targetUserId: pick(value, 'targetUserId', 'target_user_id', null),
    targetResource: pick(value, 'targetResource', 'target_resource', null),
    before: normalizeAuditSnapshot(value && value.before),
    after: normalizeAuditSnapshot(value && value.after),
    occurredAt: pick(value, 'occurredAt', 'occurred_at'),
    requestId: pick(value, 'requestId', 'request_id', null)
  }
}

export async function listAdminAuditLogs({ page = 1, size = 20 } = {}) {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  const value = await request('/v1/admin/audit-logs?' + params.toString(), { auth: true })
  const items = Array.isArray(value && value.data) ? value.data.map(normalizeAdminAuditLog) : []
  return {
    hasNext: value && (value.hasNext ?? value.has_next) === true,
    page: Number(value && value.page) || page,
    total: Number(value && value.total) || 0,
    data: items
  }
}
