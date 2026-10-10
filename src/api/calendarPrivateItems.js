import { request } from './request.js'
import { auth } from '../store/auth.js'

const PATH = '/v1/activity-calendar/private-items'
const options = userId => ({ auth: true, expectedUserId: userId ?? auth.userInfo?.id ?? '' })
const query = values => '?' + new URLSearchParams(Object.entries(values).filter(([, value]) => value != null && value !== '')).toString()
export const listCalendarPrivateItems = (filters, userId) => request(PATH + query(filters), options(userId))
export const getCalendarPrivateItem = (id, accountId, userId) => request(PATH + '/' + encodeURIComponent(id) + query({ account_id: accountId }), options(userId))
export const createCalendarPrivateItem = (body, userId) => request(PATH, { ...options(userId), method: 'POST', body })
export const updateCalendarPrivateItem = (id, body, userId) => request(PATH + '/' + encodeURIComponent(id), { ...options(userId), method: 'PUT', body })
export const deleteCalendarPrivateItem = (id, accountId, version, userId) => request(PATH + '/' + encodeURIComponent(id) + query({ account_id: accountId, expected_version: version }), { ...options(userId), method: 'DELETE' })
