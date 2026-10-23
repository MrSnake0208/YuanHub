import { request } from './request.js'

const PATH = '/v1/inventory/draw-resources'

export function getDrawResources(accountId, userId) {
  return request(PATH + '?' + new URLSearchParams({ account_id: accountId }), {
    auth: true, expectedUserId: userId, headers: { 'Cache-Control': 'no-cache' }
  })
}

export function recordDrawResources(body, userId) {
  return request(PATH, { method: 'POST', auth: true, expectedUserId: userId, body })
}
