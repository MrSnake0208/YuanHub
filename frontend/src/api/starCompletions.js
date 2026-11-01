import { request } from './request.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../config/features.js'

/** Fail before transport creation: an undeployed public API must never receive a command. */
export function createStarCompletionApi({ userId, transport = request, enabled = isFeatureEnabled(FEATURE_KEYS.STAR_COMPLETION) } = {}) {
  const check = () => {
    if (!enabled || !userId) throw Object.assign(new Error('养成完成尚未开放。'), { code: 'star_completion_unavailable' })
  }
  const query = id => '?account_id=' + encodeURIComponent(id)
  return {
    context(accountId) { check(); return transport('/v1/star-state/completion-context' + query(accountId), { auth: true, expectedUserId: userId }) },
    post(body) { check(); return transport('/v1/star-state/completions', { method: 'POST', auth: true, expectedUserId: userId, body }) },
    receipt(operationId, accountId) { check(); return transport('/v1/star-state/completions/' + encodeURIComponent(operationId) + query(accountId), { auth: true, expectedUserId: userId }) },
  }
}
