import { request } from './request.js'

const path = account => `/v1/accounts/${encodeURIComponent(account)}/daily-zhuyu-preference`
export const getDailyZhuyuPreference = (account, user) => request(path(account), { auth: true, expectedUserId: user, headers: { 'Cache-Control': 'no-cache' } })
export const saveDailyZhuyuPreference = (account, user, game, expected, preference) => request(path(account), { method: 'PUT', auth: true, expectedUserId: user, body: { game, expected, preference } })
