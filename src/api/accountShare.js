import { request } from './request.js'

const path = (accountId, suffix = '') => '/v1/accounts/share' + suffix + '?account_id=' + encodeURIComponent(accountId)
export const getAccountShare = accountId => request(path(accountId), { auth: true })
export const setAccountShareScope = (accountId, scope, enabled) => request(path(accountId), { method: 'PATCH', auth: true, body: { scope, enabled } })
export const regenerateAccountShare = accountId => request(path(accountId, '/regenerate'), { method: 'POST', auth: true })
export const revokeAccountShare = accountId => request(path(accountId), { method: 'DELETE', auth: true })
export const viewStarShare = token => request('/v1/star/share/view/' + encodeURIComponent(token), { auth: false })
