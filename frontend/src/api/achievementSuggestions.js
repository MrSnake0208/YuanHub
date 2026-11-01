import { request } from './request.js'
const player = '/v1/achievements/suggestions'
const admin = '/v1/admin/achievement-catalogs/suggestions'
const call = (path, identity, options = {}) => request(path, { ...options, auth: true, expectedUserId: identity })
const query = params => '?' + new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null))
export const getSuggestionOptions = (game, identity) => call(player + '/options' + query({ game }), identity)
export const getSuggestionReviewOptions = (game, identity) => call(admin + '/options' + query({ game }), identity)
export const submitAchievementSuggestion = (body, identity) => call(player, identity, { method: 'POST', body })
export const getMyAchievementSuggestions = (params, identity) => call(player + query(params), identity)
export const getAchievementSuggestion = (id, identity, review = false) => call((review ? admin : player) + '/' + encodeURIComponent(id), identity)
export const getAchievementSuggestionQueue = (params, identity) => call(admin + query(params), identity)
export const reviewAchievementSuggestion = (id, action, body, identity) => call(admin + '/' + encodeURIComponent(id) + '/' + action, identity, { method: 'POST', body })
