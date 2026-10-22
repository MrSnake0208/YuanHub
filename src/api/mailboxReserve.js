import { request } from './request.js'

const path = accountId => '/v1/inventory/mailbox-reserve?' + new URLSearchParams({ account_id: accountId })
export const getMailboxReserve = (accountId, userId) => request(path(accountId), { auth: true, expectedUserId: userId })
export const saveMailboxReserve = (accountId, userId, body) => request(path(accountId), { method: 'PUT', auth: true, expectedUserId: userId, body })
