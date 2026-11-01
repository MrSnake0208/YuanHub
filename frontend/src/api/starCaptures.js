import { request } from './request.js'

const PATH = '/v1/star/captures'

function capturePath(captureId) {
  return PATH + '/' + encodeURIComponent(captureId)
}

export function getPendingStarCapture(accountId) {
  return request(PATH + '/pending?account_id=' + encodeURIComponent(accountId), { auth: true })
}

export function getStarCaptureManifest(accountId, captureId) {
  return request(capturePath(captureId) + '?account_id=' + encodeURIComponent(accountId), { auth: true })
}

export function getStarCaptureImage(accountId, captureId, sourceImageId) {
  return request(capturePath(captureId) + '/images/' + encodeURIComponent(sourceImageId) + '?account_id=' + encodeURIComponent(accountId), { auth: true, responseType: 'blob' })
}

export function consumeStarCapture(accountId, captureId) {
  return request(capturePath(captureId) + '/consume?account_id=' + encodeURIComponent(accountId), { method: 'POST', auth: true })
}
