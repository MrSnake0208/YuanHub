import { request } from './request.js'

export function listWorks({ page = 1, limit = 20 } = {}) {
  return request('/v1/works?page=' + encodeURIComponent(page) + '&limit=' + encodeURIComponent(limit))
}

export function getWork(id) {
  return request('/v1/works/' + encodeURIComponent(id), { auth: true })
}

export function getOwnedWork(id) {
  return getWork(id)
}

export function getWorkCompatibility(id, target) {
  return request('/v1/works/' + encodeURIComponent(id) + '/compatibility?to=' + encodeURIComponent(target), { auth: true })
}

export function previewWorkCompatibility(document, target) {
  return request('/v1/works/compatibility?to=' + encodeURIComponent(target), {
    method: 'POST',
    body: { document }
  })
}

export function listMyWorks({ page = 1, limit = 20 } = {}) {
  return request('/v1/works/mine?page=' + encodeURIComponent(page) + '&limit=' + encodeURIComponent(limit), { auth: true })
}

export function createWork(document) {
  return request('/v1/works', { method: 'POST', auth: true, body: { document } })
}

export function updateWork(id, expectedRevision, document) {
  return request('/v1/works/' + encodeURIComponent(id), {
    method: 'PUT',
    auth: true,
    body: { expected_revision: expectedRevision, document }
  })
}

function transitionWork(id, action, expectedRevision) {
  return request('/v1/works/' + encodeURIComponent(id) + '/' + action, {
    method: 'POST',
    auth: true,
    body: { expected_revision: expectedRevision }
  })
}

export function publishWork(id, expectedRevision) {
  return transitionWork(id, 'publish', expectedRevision)
}

export function unpublishWork(id, expectedRevision) {
  return transitionWork(id, 'unpublish', expectedRevision)
}

export function deleteWork(id, expectedRevision) {
  return request('/v1/works/' + encodeURIComponent(id), {
    method: 'DELETE',
    auth: true,
    body: { expected_revision: expectedRevision }
  })
}
