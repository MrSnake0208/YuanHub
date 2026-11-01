import { rewardValidationError } from './rules.js'
export const newCandidate = game => ({ game, category_id: '', name: '', condition: '', is_hidden: null, rewards: null, target: null, linked_metric: null })
export const suggestionStatus = value => ({ PENDING: '待审核', ACCEPTED: '已采纳到草稿，待管理员发布', REJECTED: '未采纳' })[value] || '未知状态'
export function candidateErrors(candidate, categories, items) {
  const errors = {}
  if (!candidate.name.trim()) errors.name = '请填写成就名称。'
  if (!categories.some(c => c.category_id === candidate.category_id)) errors.category_id = '请选择该游戏的启用分类。'
  if (candidate.target != null && (!Number.isSafeInteger(candidate.target) || candidate.target < 1 || candidate.target > 1e12)) errors.target = '目标须为1到1e12的整数。'
  if (candidate.linked_metric && ![1, 3, 10, 20, 50, 100, 200].includes(candidate.target)) errors.target = '羁绊种数目标须为1、3、10、20、50、100或200。'
  for (let i = 0; i < (candidate.rewards?.length || 0); i++) {
    const error = rewardValidationError(candidate.rewards[i], i, candidate.rewards, items, candidate.game)
    if (error) errors.rewards = error
  }
  return errors
}
export function safeSource(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '' } catch { return '' }
}
