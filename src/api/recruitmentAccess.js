import { request } from './request.js'

const USER_PATH = '/v1/recruitment/access/me'
const ADMIN_PATH = '/v1/admin/recruitment-access'

function pick(value, camel, snake, fallback = null) {
  if (!value || typeof value !== 'object') return fallback
  return value[camel] ?? value[snake] ?? fallback
}

export function normalizeRecruitmentAccess(value) {
  return {
    accessMode: pick(value, 'accessMode', 'access_mode', 'LIMITED'),
    granted: value?.granted === true,
    canAccess: value?.canAccess === true || value?.can_access === true
  }
}

function normalizeGrant(value) {
  return {
    userId: pick(value, 'userId', 'user_id', ''),
    userName: pick(value, 'userName', 'user_name', '未知用户'),
    activated: value?.activated === true,
    grantedBy: pick(value, 'grantedBy', 'granted_by', ''),
    grantedAt: pick(value, 'grantedAt', 'granted_at')
  }
}

function normalizeAdmin(value) {
  const grants = Array.isArray(value?.grants) ? value.grants.map(normalizeGrant) : []
  return {
    accessMode: pick(value, 'accessMode', 'access_mode', 'LIMITED'),
    version: Number(value?.version) || 0,
    grants
  }
}

function normalizeCandidate(value) {
  return {
    id: pick(value, 'id', 'id', ''),
    userName: pick(value, 'userName', 'user_name', ''),
    email: value?.email || '',
    activated: value?.activated === true
  }
}

export async function getRecruitmentAccess() {
  return normalizeRecruitmentAccess(await request(USER_PATH, { auth: true }))
}

export async function getAdminRecruitmentAccess() {
  return normalizeAdmin(await request(ADMIN_PATH, { auth: true }))
}

export async function updateRecruitmentAccessMode(accessMode, expectedVersion) {
  return normalizeAdmin(await request(ADMIN_PATH + '/mode', {
    method: 'PUT',
    auth: true,
    body: { access_mode: accessMode, expected_version: expectedVersion }
  }))
}

export async function searchRecruitmentAccessUsers({ q, page = 1, size = 10 }) {
  const params = new URLSearchParams({ q: String(q || '').trim(), page: String(page), size: String(size) })
  const data = await request(ADMIN_PATH + '/users?' + params.toString(), { auth: true })
  return Array.isArray(data) ? data.map(normalizeCandidate) : []
}

export async function grantRecruitmentAccess(userId) {
  return normalizeGrant(await request(ADMIN_PATH + '/users/' + encodeURIComponent(userId), {
    method: 'PUT',
    auth: true
  }))
}

export function revokeRecruitmentAccess(userId) {
  return request(ADMIN_PATH + '/users/' + encodeURIComponent(userId), {
    method: 'DELETE',
    auth: true
  })
}
