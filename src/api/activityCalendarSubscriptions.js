import { request } from './request.js'
import { auth } from '../store/auth.js'
const PATH = '/v1/activity-calendar/subscriptions'
const options = userId => ({ auth: true, expectedUserId: userId ?? auth.userInfo?.id ?? '' })
const query = values => '?' + new URLSearchParams(Object.entries(values).filter(([, value]) => value != null && value !== '')).toString()
export const listCalendarSubscriptions = (filters, userId) => request(PATH + query(filters), options(userId))
export const calendarSubscriptionSummary = (accountId, userId) => request(PATH + '/summary' + query({ account_id: accountId }), options(userId))
export const getCalendarSubscription = (id, accountId, userId) => request(PATH + '/' + encodeURIComponent(id) + query({ account_id: accountId }), options(userId))
export const setCalendarSubscription = (id, body, userId) => request(PATH + '/' + encodeURIComponent(id), { ...options(userId), method: 'PUT', body })
export const saveCalendarProgress = (id, body, userId) => request(PATH + '/' + encodeURIComponent(id) + '/progress', { ...options(userId), method: 'PUT', body })
