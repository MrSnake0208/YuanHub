import { request } from './request.js'

const url = (accountId, suffix = '') => '/v1/star/inventory-sync' + suffix + '?account_id=' + encodeURIComponent(accountId)
export const previewStarInventoryImport = (accountId, body) => request(url(accountId, '/preview'), { method: 'POST', auth: true, body })
export const confirmStarInventoryImport = (accountId, body) => request(url(accountId), { method: 'POST', auth: true, body })
