import { request } from './request.js'

function path(accountId, suffix) {
  return '/v1/operator/' + suffix + '?' + new URLSearchParams({ account_id: accountId })
}
export const getTrainingWorkspace = accountId => request(path(accountId, 'training-workspace'), { auth: true })
export const putTrainingWorkspace = (accountId, body) => request(path(accountId, 'training-workspace'), { auth: true, method: 'PUT', body })
export const getStaminaSchedule = (accountId, planId) => request(path(accountId, 'training-plans/' + encodeURIComponent(planId) + '/stamina-schedule'), { auth: true })
export const putStaminaSchedule = (accountId, planId, body) => request(path(accountId, 'training-plans/' + encodeURIComponent(planId) + '/stamina-schedule'), { auth: true, method: 'PUT', body })
export const importLocalTrainingWorkspace = (accountId, body) => request(path(accountId, 'training-workspace/import-local'), { auth: true, method: 'POST', body })
export const removeTrainingMember = (accountId, planId, operatorId, body) => request(path(accountId, 'training-plans/' + encodeURIComponent(planId) + '/members/' + encodeURIComponent(operatorId) + '/remove'), { auth: true, method: 'POST', body })
