import { request } from './request.js'

const path = mode => '/v1/today/preferences/' + encodeURIComponent(mode)
const options = userId => ({ auth: true, expectedUserId: userId, headers: { 'Cache-Control': 'no-cache' } })
export const getTodayPreferences = (mode, userId) => request(path(mode), options(userId))
export const saveTodayPreferences = (mode, body, userId) => request(path(mode), { ...options(userId), method: 'PUT', body })
