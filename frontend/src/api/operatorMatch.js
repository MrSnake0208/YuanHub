import { request } from './request.js'

const path = '/user/operator-match/connections'
export const listMatchConnections = expectedUserId => request(path, { auth: true, expectedUserId })
export const createMatchConnection = expectedUserId => request(path, { method: 'POST', auth: true, expectedUserId })
export const getMatchSecret = (expectedUserId, id) => request(`${path}/${encodeURIComponent(id)}/secret`, { auth: true, expectedUserId })
export const revokeMatchConnection = (expectedUserId, id) => request(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true, expectedUserId })
