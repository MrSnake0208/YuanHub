// YuanStar 当前星石快照。认证、响应解包与刷新逻辑统一交给 request.js。
import { request } from './request.js'

const PATH = '/v1/star-inventory/current'

export function getCurrentStarInventory(accountId) {
  return request(PATH + '?account_id=' + encodeURIComponent(accountId), { auth: true })
}

export function putCurrentStarInventory(accountId, body) {
  return request(PATH + '?account_id=' + encodeURIComponent(accountId), {
    method: 'PUT',
    body,
    auth: true,
  })
}
