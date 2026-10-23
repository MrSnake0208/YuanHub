import { request } from './request.js'
import { auth } from '../store/auth.js'

const identity = () => ({ auth: true, expectedUserId: String(auth.userInfo?.id || '') })

const path = (accountId, suffix) => '/v1/star/scans' + suffix + '?account_id=' + encodeURIComponent(accountId)
export const listStarScans = accountId => request(path(accountId, '/pending'), { ...identity() })
export const getStarScan = (accountId, id) => request(path(accountId, '/' + encodeURIComponent(id)), { ...identity() })
export const applyStarScan = (accountId, id, body) => request(path(accountId, '/' + encodeURIComponent(id) + '/apply'), { ...identity(), method: 'POST', body })
export const discardStarScan = (accountId, id) => request(path(accountId, '/' + encodeURIComponent(id) + '/discard'), { ...identity(), method: 'POST' })
