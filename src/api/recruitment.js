import { request } from './request.js'
import { DOWNLOAD_REQUEST_TIMEOUT_MS, UPLOAD_REQUEST_TIMEOUT_MS } from '../utils/requestTimeout.js'

const PATH = '/v1/recruitment'
const ADMIN_PATH = '/v1/admin/recruitment-catalog'
export function listAdminRecruitmentCatalog() { return request(ADMIN_PATH, { auth: true }) }
export function createAdminRecruitmentPool(pool) { return request(ADMIN_PATH, { auth: true, method: 'POST', body: pool }) }
export function importAdminRecruitmentCatalog(document) { return request(ADMIN_PATH + '/import', { auth: true, method: 'POST', timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS, body: document }) }
export function updateAdminRecruitmentPool(poolId, pool) { return request(ADMIN_PATH + '/' + encodeURIComponent(poolId), { auth: true, method: 'PUT', body: pool }) }
function query(values) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value != null && value !== '') params.set(key, value)
  return '?' + params
}
export function getRecruitmentCatalog(game) { return request(PATH + '/catalog' + query({ game }), { auth: false }) }
export function getRecruitmentArchive(accountId) { return request(PATH + '/archive' + query({ account_id: accountId }), { auth: true }) }
export function listRecruitmentEvents({ accountId, poolId, cursor, dateFrom, dateTo, order = 'desc', limit = 50 }) {
  return request(PATH + '/events' + query({ account_id: accountId, pool_id: poolId, cursor, date_from: dateFrom, date_to: dateTo, order, limit }), { auth: true })
}
export function listRecruitmentBatches({ accountId, poolId, cursor, limit = 50 }) { return request(PATH + '/batches' + query({ account_id: accountId, pool_id: poolId, cursor, limit }), { auth: true }) }
export function recruitmentCommand({ accountId, expectedRevision, requestId, operation, data }) {
  return request(PATH + '/commands', { auth: true, method: 'POST', body: { account_id: accountId, expected_revision: expectedRevision, request_id: requestId, operation, data } })
}
export function exportRecruitment(accountId) { return request(PATH + '/export' + query({ account_id: accountId }), { auth: true, timeoutMs: DOWNLOAD_REQUEST_TIMEOUT_MS }) }
export function previewRecruitmentImport({ accountId, document, options }) {
  return request(PATH + '/import/preview', { auth: true, method: 'POST', timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS, body: { account_id: accountId, document, options } })
}
export function commitRecruitmentImport({ accountId, document, options, previewToken, documentHash, expectedRevision, requestId }) {
  return request(PATH + '/import/commit', { auth: true, method: 'POST', timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS, body: { account_id: accountId, document, options, preview_token: previewToken, document_hash: documentHash, expected_revision: expectedRevision, request_id: requestId } })
}
