import { request } from './request.js'

const PATH = '/v1/bonds'
const privateRequest = (path, identity, options = {}) => request(PATH + path, { ...options, auth: true, expectedUserId: identity })
export const getBondCatalog = game => request(PATH + '/catalog?game=' + encodeURIComponent(game), { auth: true })
export const getBondArchive = (account, identity) => privateRequest('/archive?account_id=' + encodeURIComponent(account), identity)
export const exportBonds = (account, identity) => privateRequest('/export?account_id=' + encodeURIComponent(account), identity)
const writeBatch = (path, account, identity, revision, catalogVersion, records) => privateRequest(path, identity, {
  method: 'POST', body: { account_id: account, expected_revision: revision, catalog_version: catalogVersion, records }
})
export const writeBonds = (account, identity, revision, catalogVersion, records) =>
  writeBatch('/batch', account, identity, revision, catalogVersion, records)
export const writeBattleBonds = (account, identity, revision, catalogVersion, records) =>
  writeBatch('/battle/batch', account, identity, revision, catalogVersion, records)
export const writeBattleBond = (account, identity, revision, catalogVersion, id, triggered) =>
  privateRequest('/battle/records/' + encodeURIComponent(id), identity, {
    method: 'PATCH', body: { account_id: account, expected_revision: revision, catalog_version: catalogVersion, triggered }
  })
export const previewBonds = (identity, body) => privateRequest('/import/preview', identity, { method: 'POST', body })
export const confirmBonds = (identity, body) => privateRequest('/import/confirm', identity, { method: 'POST', body })
export const getBondAdminCatalog = (game, identity) => request('/v1/admin/bonds/catalog?game=' + encodeURIComponent(game), { auth: true, expectedUserId: identity })
export const bondAdminAction = (game, identity, action, body) => request('/v1/admin/bonds/catalog/' + action + '?game=' + encodeURIComponent(game), { method: 'POST', auth: true, expectedUserId: identity, body })
