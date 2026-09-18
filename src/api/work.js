import { request } from './request.js'

export function listWorks({ page = 1, limit = 20 } = {}) {
  return request('/v1/works?page=' + encodeURIComponent(page) + '&limit=' + encodeURIComponent(limit))
}

export function getWork(id) {
  return request('/v1/works/' + encodeURIComponent(id))
}

export function getWorkCompatibility(id, target) {
  return request('/v1/works/' + encodeURIComponent(id) + '/compatibility?to=' + encodeURIComponent(target))
}
