import { request } from './request.js'

const PATH = '/v1/star-exchange/replace'

// Replacement import is deliberately distinct from normal current-inventory and
// current-workspace autosave: Backend owns the three-domain transaction.
export function replaceStarExchange(body) {
  return request(PATH, { method: 'POST', body, auth: true })
}
