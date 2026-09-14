import { normalizeTrainingLevels } from './operatorTraining.js'

export const TRAINING_WORKSPACE_VERSION = 1
export const FAVORITES_PLAN_ID = 'favorites'
export function trainingWorkspaceKey(accountId) { return 'yuanhub:operator-training-workspace:v1:' + accountId }
const uniqueIds = value => [...new Set((Array.isArray(value) ? value : []).filter(id => typeof id === 'string' && id))]

export function emptyTrainingWorkspace(accountId) {
  return { version: TRAINING_WORKSPACE_VERSION, accountId, revision: 0, updatedAt: null,
    activePlanId: FAVORITES_PLAN_ID, trainingLevels: normalizeTrainingLevels(),
    plans: [{ id: FAVORITES_PLAN_ID, name: '特别关注', source: 'favorites', operatorIds: [], excludedOperatorIds: [], targets: {} }] }
}

export function normalizeTrainingWorkspace(raw, accountId) {
  const base = emptyTrainingWorkspace(accountId)
  if (!raw) return base
  if (raw.version !== TRAINING_WORKSPACE_VERSION || raw.accountId !== accountId) throw new Error('培养计划版本或子账号不匹配，未覆盖原数据')
  const seen = new Set()
  const plans = (Array.isArray(raw.plans) ? raw.plans : []).filter(plan => {
    if (!plan || typeof plan.id !== 'string' || !plan.id || seen.has(plan.id)) return false
    seen.add(plan.id)
    return true
  }).map(plan => ({
    id: plan.id, name: String(plan.name || '未命名计划').slice(0, 40), source: plan.id === FAVORITES_PLAN_ID ? 'favorites' : 'custom',
    operatorIds: uniqueIds(plan.operatorIds), excludedOperatorIds: uniqueIds(plan.excludedOperatorIds),
    targets: Object.fromEntries(Object.entries(plan.targets || {}).filter(([, target]) => target && typeof target === 'object').map(([id, target]) => [id, {
      level: Math.max(0, Math.min(100, Math.trunc(Number(target.level)) || 0)),
      elite: Math.max(0, Math.min(17, Math.trunc(Number(target.elite)) || 0)),
      starLevel: Math.max(0, Math.min(31, Math.trunc(Number(target.starLevel)) || 0))
    }]))
  }))
  if (!plans.some(plan => plan.id === FAVORITES_PLAN_ID)) plans.unshift(base.plans[0])
  return { ...base, plans, revision: Math.max(0, Number(raw.revision) || 0), updatedAt: raw.updatedAt || null,
    activePlanId: plans.some(plan => plan.id === raw.activePlanId) ? raw.activePlanId : FAVORITES_PLAN_ID,
    trainingLevels: normalizeTrainingLevels(raw.trainingLevels) }
}

// 持久化边界集中于此；后续远端 repository 可复用相同 workspace 模型。
export function readTrainingWorkspace(storage, accountId) {
  const text = storage.getItem(trainingWorkspaceKey(accountId))
  return normalizeTrainingWorkspace(text ? JSON.parse(text) : null, accountId)
}

export function writeTrainingWorkspace(storage, workspace) {
  const next = normalizeTrainingWorkspace(workspace, workspace.accountId)
  const stored = readTrainingWorkspace(storage, workspace.accountId)
  if (stored.revision !== next.revision) throw new Error('培养计划已在其他页面更新，请刷新后重试')
  next.revision += 1
  next.updatedAt = new Date().toISOString()
  storage.setItem(trainingWorkspaceKey(next.accountId), JSON.stringify(next))
  return next
}

export function trainingPlanMemberIds(plan, favoriteIds) {
  if (!plan) return new Set()
  const members = plan.source === 'favorites' ? [...favoriteIds, ...plan.operatorIds] : plan.operatorIds
  const excluded = new Set(plan.excludedOperatorIds)
  return new Set(members.filter(id => !excluded.has(id)))
}
