import { request } from './request.js'

const path = game => '/v1/admin/achievement-catalogs?game=' + encodeURIComponent(game)
export const getAchievementCatalogAdmin = (game, identity) => request(path(game), { auth: true, expectedUserId: identity })
export const achievementCatalogCommand = (game, identity, action, revision, fields = {}) => request(
  '/v1/admin/achievement-catalogs/' + action + '?game=' + encodeURIComponent(game),
  { method: 'POST', auth: true, expectedUserId: identity, body: { expected_revision: revision, ...fields } }
)
export const exportAchievementCatalog = (game, identity, scope) => request(
  '/v1/admin/achievement-catalogs/export?game=' + encodeURIComponent(game) + '&scope=' + scope,
  { auth: true, expectedUserId: identity }
)
