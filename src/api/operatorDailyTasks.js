import { request } from './request.js'
import { auth } from '../store/auth.js'

const path = (account, plan, date, entry = '') => '/v1/operator/training-plans/' + encodeURIComponent(plan) + '/daily-tasks' +
  (entry ? '/' + encodeURIComponent(entry) : '') + '?' + new URLSearchParams({ account_id: account, date })
const options = user => ({ auth: true, expectedUserId: user ?? auth.userInfo?.id ?? '' })
export const getOperatorDailyTasks = (account, plan, date, user) => request(path(account, plan, date), options(user))
export const adoptOperatorDailyTasks = (account, plan, date, body, user) => request(path(account, plan, date), { ...options(user), method: 'PUT', body })
export const completeOperatorDailyTask = (account, plan, date, entry, body, user) => request(path(account, plan, date, entry), { ...options(user), method: 'PUT', body })
