import { request } from './request.js'

const PATH = '/v1/achievements'
const privateRequest = (path, identity, options = {}) => request(PATH + path, { ...options, auth: true, expectedUserId: identity })

export const getAchievementCatalog = game => request(PATH + '/catalog?game=' + encodeURIComponent(game), { auth: true })
export const getAchievementArchive = (accountId, identity) => privateRequest('/archive?account_id=' + encodeURIComponent(accountId), identity)
export const exportAchievements = (accountId, identity) => privateRequest('/export?account_id=' + encodeURIComponent(accountId), identity)
export const writeAchievements = (accountId, identity, revision, records) => privateRequest('/batch', identity, {
  method: 'POST', body: { account_id: accountId, expected_revision: revision, records }
})
export const previewAchievements = (accountId, identity, document, strategy) => privateRequest('/import/preview', identity, {
  method: 'POST', body: { account_id: accountId, document, strategy }
})
export const importAchievements = (accountId, identity, document, preview, skipUnknown) => privateRequest('/import/confirm', identity, {
  method: 'POST', body: { account_id: accountId, document, strategy: preview.strategy, expected_revision: preview.expected_revision, catalog_version: preview.catalog_version, preview_token: preview.preview_token, skip_unknown: skipUnknown }
})
