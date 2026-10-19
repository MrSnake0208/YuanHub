import { request } from './request.js'

const PATH = '/v1/bonds'
const privateRequest = (path, identity, options = {}) => request(PATH + path, { ...options, auth: true, expectedUserId: identity })
export const getBondCatalog = game => request(PATH + '/catalog?game=' + encodeURIComponent(game), { auth: false })
export const getBondArchive = (account, identity) => privateRequest('/archive?account_id=' + encodeURIComponent(account), identity)
export const exportBonds = (account, identity) => privateRequest('/export?account_id=' + encodeURIComponent(account), identity)
export const writeBonds = (account, identity, revision, catalogVersion, records) => privateRequest('/batch', identity, {
  method: 'POST', body: { account_id: account, expected_revision: revision, catalog_version: catalogVersion, records }
})
export const previewBonds = (identity, body) => privateRequest('/import/preview', identity, { method: 'POST', body })
export const confirmBonds = (identity, body) => privateRequest('/import/confirm', identity, { method: 'POST', body })
export const getBondAdminCatalog = (game, identity) => request('/v1/admin/bonds/catalog?game=' + encodeURIComponent(game), { auth: true, expectedUserId: identity })
export const bondAdminAction = (game, identity, action, body) => request('/v1/admin/bonds/catalog/' + action + '?game=' + encodeURIComponent(game), { method: 'POST', auth: true, expectedUserId: identity, body })
