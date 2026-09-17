import { request } from './request.js'

const PATH = '/v1/star-loadout-presets/current'

export function getCurrentStarLoadoutPresets() {
  return request(PATH, { auth: true })
}

export function putCurrentStarLoadoutPresets(body) {
  return request(PATH, { method: 'PUT', body, auth: true })
}
