import { request } from './request.js'

function camelObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('内测状态响应不完整，请重试。')
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase()), val]))
}

export function normalizeBetaStatus(value) {
  const data = camelObject(value)
  if (!data.campaignId || !['CLOSED', 'BETA', 'OPEN'].includes(data.accessMode) || !data.publicState || !Number.isFinite(Date.parse(data.serverNow))) {
    throw new Error('内测状态响应不完整，请重试。')
  }
  for (const key of ['initialCapacity', 'capacity', 'maxCapacity', 'reservedInitial', 'reservedRemaining', 'grantedCount', 'publicRemaining']) {
    if (!Number.isInteger(data[key]) || data[key] < 0) throw new Error('内测名额响应异常，请重试。')
  }
  return data
}

export function normalizeBetaMe(value) {
  const data = camelObject(value)
  data.campaign = normalizeBetaStatus(data.campaign)
  if (!['NOT_JOINED', 'WAITING', 'ACTIVE', 'WITHDRAWN'].includes(data.enrollmentStatus)) throw new Error('本人资格响应异常，请重试。')
  data.canUseBetaFeatures = data.canUseBetaFeatures === true
  data.shareSnapshotEligible = data.shareSnapshotEligible === true
  data.canResetLocalTest = data.canResetLocalTest === true
  return data
}

export function normalizeBetaAdmin(value) {
  const data = camelObject(value)
  data.campaign = normalizeBetaStatus(data.campaign)
  if (!Number.isInteger(data.configVersion)) throw new Error('管理配置版本缺失，请重试。')
  return data
}

export async function getBetaStatus() { return normalizeBetaStatus(await request('/v1/beta/status')) }
export async function getBetaMe() { return normalizeBetaMe(await request('/v1/beta/me', { auth: true })) }
export async function joinBeta({ campaignId, rulesVersion, acceptedTerms, acceptWaitlist, intentTags = [] }) {
  return normalizeBetaMe(await request('/v1/beta/join', {
    method: 'POST', auth: true,
    body: { campaign_id: campaignId, rules_version: rulesVersion, accepted_terms: acceptedTerms === true, accept_waitlist: acceptWaitlist === true, intent_tags: intentTags }
  }))
}
export async function withdrawBeta() { return normalizeBetaMe(await request('/v1/beta/waitlist', { method: 'DELETE', auth: true })) }
/** Local test mode only; clears the isolated local campaign so a tester can retry the flow. */
export async function resetLocalTest() { return normalizeBetaMe(await request('/v1/beta/test-reset', { method: 'POST', auth: true })) }
export async function getBetaAdmin() { return normalizeBetaAdmin(await request('/v1/admin/beta', { auth: true })) }
export async function updateBetaAdmin(action, body) {
  if (!['admissions', 'capacity', 'mode'].includes(action)) throw new Error('未知内测管理操作')
  return normalizeBetaAdmin(await request('/v1/admin/beta/' + action, { method: 'PUT', body, auth: true }))
}
export async function resetLocalBeta(reason) {
  return normalizeBetaAdmin(await request('/v1/admin/beta/local-reset', {
    method: 'PUT', auth: true, body: { reason }
  }))
}
