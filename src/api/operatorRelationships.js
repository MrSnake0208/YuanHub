import { request } from './request.js'
const path = '/v1/operator/relationships'
export const getRelationshipCatalog = game => request(path + '/catalog?' + new URLSearchParams({ game }), { auth: true })
export const getRelationships = accountId => request(path + '?' + new URLSearchParams({ account_id: accountId }), { auth: true })
export const patchRelationships = (accountId, body) => request(path + '?' + new URLSearchParams({ account_id: accountId }), { method: 'PATCH', auth: true, body })
