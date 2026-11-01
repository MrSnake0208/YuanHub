import { request } from './request.js'

const path = '/v1/operator/resets'
const post = (suffix, body, user, headers) => request(path + suffix, { auth: true, expectedUserId: user, method: 'POST', body, headers })
export const previewOperatorReset = (body, user) => post('/preview', body, user)
export const executeOperatorReset = (body, key, user) => post('/execute', body, user, { 'Idempotency-Key': key })
export const previewOperatorResetUndo = (id, body, user) => post('/' + encodeURIComponent(id) + '/undo-preview', body, user)
export const undoOperatorReset = (id, body, user) => post('/' + encodeURIComponent(id) + '/undo', body, user)
export const listOperatorResets = (account, game, operator, user, cursor) => request(path + '?' + new URLSearchParams({ account_id: account, game, operator_id: operator, ...(cursor ? { cursor } : {}) }), { auth: true, expectedUserId: user })
