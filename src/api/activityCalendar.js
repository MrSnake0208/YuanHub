import { request } from './request.js'
import { auth } from '../store/auth.js'

const PUBLIC_PATH = '/v1/activity-calendar'
const ADMIN_PATH = '/v1/admin/activity-calendar'

function query(filters = {}) {
  const params = new URLSearchParams()
  for (const key of ['game', 'from', 'to', 'category', 'enabled', 'search']) {
    const value = filters[key]
    if (value != null && value !== '') params.set(key, String(value))
  }
  return params.size ? '?' + params.toString() : ''
}

export function listActivityCalendar(filters) { return request(PUBLIC_PATH + query(filters), { auth: false }) }
const adminOptions = () => ({ auth: true, expectedUserId: auth.userInfo?.id || '' })
export function listAdminActivityCalendar(filters) { return request(ADMIN_PATH + query(filters), adminOptions()) }
export function createActivityCalendar(body) { return request(ADMIN_PATH, { ...adminOptions(), method: 'POST', body }) }
export function updateActivityCalendar(id, body) { return request(ADMIN_PATH + '/' + encodeURIComponent(id), { ...adminOptions(), method: 'PUT', body }) }
