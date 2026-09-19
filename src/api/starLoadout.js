// Current account-wide star loadout snapshot. Request handling stays in request.js.
import { request } from './request.js'

const PATH = '/v1/star-loadout/current'

export function getCurrentStarLoadout(accountId) {
  return request(PATH + '?account_id=' + encodeURIComponent(accountId), { auth: true })
}

export function putCurrentStarLoadout(accountId, body) {
  return request(PATH + '?account_id=' + encodeURIComponent(accountId), {
    method: 'PUT',
    body,
    auth: true,
  })
}
