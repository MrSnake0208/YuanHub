import { FEATURE_KEYS, isFeatureEnabled } from '../config/features.js'

// UI/API aliases share one source; preserve unknown reads so they cannot look active.
export const OPERATOR_STATUS_OPTIONS = [
  { value: 'growing', label: '养成中' },
  { value: 'graduated', label: '已毕业' },
  { value: 'inactive', label: '养老中' },
  { value: 'discarded', label: '已弃置' },
]
export function operatorEditableStatusOptions() {
  return OPERATOR_STATUS_OPTIONS.filter(option => option.value !== 'discarded' || isFeatureEnabled(FEATURE_KEYS.OPERATOR_DISCARDED))
}

export function assertOperatorStateWriteEnabled(value) {
  if (operatorAnnotationStatus(value) === 'discarded' && !isFeatureEnabled(FEATURE_KEYS.OPERATOR_DISCARDED))
    throw new Error('已弃置暂未开放，请等待配套软件兼容后再使用')
}

const STATE_TO_API = { growing: 'active', graduated: 'graduated', inactive: 'skip', discarded: 'discarded' }
const STATE_FROM_API = { active: 'growing', graduated: 'graduated', skip: 'inactive', discarded: 'discarded' }

export function operatorAnnotationStatus(value) {
  const state = value == null ? '' : String(value).trim()
  return Object.hasOwn(STATE_FROM_API, state) ? STATE_FROM_API[state] : state || 'growing'
}

export function operatorAnnotationApiState(value) {
  const state = operatorAnnotationStatus(value)
  if (!Object.hasOwn(STATE_TO_API, state)) throw new Error('不支持的养成状态：' + state)
  return STATE_TO_API[state]
}

export function operatorAnnotationStatusLabel(value) {
  const state = operatorAnnotationStatus(value)
  return OPERATOR_STATUS_OPTIONS.find(option => option.value === state)?.label || '不支持的养成状态：' + state
}

export function matchesOperatorStatus(value, filter) {
  const state = operatorAnnotationStatus(value)
  if (filter === 'all') return true
  if (filter === 'registered') return ['growing', 'graduated', 'inactive'].includes(state)
  return state === filter
}

export function reconcileOperatorAnnotations(remote, local, busyIds) {
  const result = {
    statuses: { ...remote.statuses },
    remarks: { ...remote.remarks },
    revisions: { ...remote.revisions },
  }
  const ids = new Set(Object.keys(local.statuses).concat(Object.keys(local.remarks), Object.keys(local.revisions)))
  for (const id of ids) {
    if (!busyIds.has(id) && (Number(local.revisions[id]) || 0) <= (Number(remote.revisions[id]) || 0)) continue
    for (const key of ['statuses', 'remarks', 'revisions']) {
      if (Object.prototype.hasOwnProperty.call(local[key], id)) result[key][id] = local[key][id]
      else delete result[key][id]
    }
  }
  return result
}
