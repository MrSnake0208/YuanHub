import { request } from './request.js'

const BASE = '/v1/star-state'
const accountQuery = accountId => '?account_id=' + encodeURIComponent(accountId)

export function getCurrentStarState(accountId) {
  return request(BASE + '/current' + accountQuery(accountId), { auth: true })
}

export function patchCurrentStarState(accountId, body) {
  return request(BASE + '/current' + accountQuery(accountId), { method: 'PATCH', auth: true, body })
}

export function rebuildStarState(accountId, body) {
  return request(BASE + '/rebuild' + accountQuery(accountId), { method: 'POST', auth: true, body })
}

export function listStarRecoveryPoints(accountId) {
  return request(BASE + '/recovery-points' + accountQuery(accountId), { auth: true })
}

export function restoreStarRecoveryPoint(accountId, pointId, body) {
  return request(BASE + '/recovery-points/' + encodeURIComponent(pointId) + '/restore' + accountQuery(accountId), {
    method: 'POST', auth: true, body,
  })
}
