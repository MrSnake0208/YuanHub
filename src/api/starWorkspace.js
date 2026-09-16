import { request } from './request.js'

const PATH = '/v1/star-workspace/current'

export function getCurrentStarWorkspace(accountId) {
  return request(PATH + '?account_id=' + encodeURIComponent(accountId), { auth: true })
}

export function putCurrentStarWorkspace(accountId, body) {
  return request(PATH + '?account_id=' + encodeURIComponent(accountId), {
    method: 'PUT', body, auth: true,
  })
}
