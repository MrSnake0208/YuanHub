import { normalizeTrainingWorkspace, readTrainingWorkspace, trainingWorkspaceKey, trainingPlanMemberIds } from './operatorTrainingPlans.js'
import { PLANNER_RULES, normalizePlannerSnapshot, plannerStorageKey } from './cultivationPlanner.js'

// Only schema fields change case. Resource IDs, date keys and operator IDs stay intact.
const fields = ['activePlanId', 'trainingLevels', 'operatorIds', 'excludedOperatorIds', 'starLevel', 'agentOrder', 'purchaseCount',
  'manualPlans', 'startDate', 'baselineDate', 'initialState', 'requiredState', 'progressRows', 'plannedYield',
  'etaDays', 'lastProgressDay', 'costPer', 'groupId', 'stageLevel', 'colorKey', 'defaultValue', 'costCoins',
  'totalCoins', 'initialExtra', 'dailyCoins', 'beforePercent', 'todayPercent', 'startRemaining']
const snake = Object.fromEntries(fields.map(key => [key, key.replace(/[A-Z]/g, c => '_' + c.toLowerCase())]))
const camel = Object.fromEntries(Object.entries(snake).map(([a, b]) => [b, a]))
const clone = value => JSON.parse(JSON.stringify(value))
function mapFields(value, names) {
  if (Array.isArray(value)) return value.map(item => mapFields(item, names))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [names[key] || key, mapFields(item, names)]))
}
export function workspaceBody(workspace, revision = workspace.revision) {
  return { schema_version: 1, expected_revision: revision, ...mapFields({
    activePlanId: workspace.activePlanId, trainingLevels: workspace.trainingLevels,
    plans: workspace.plans.map(plan => ({ ...plan, targets: plan.source === 'favorites' ? {} : Object.fromEntries(
      Object.entries(plan.targets).map(([id, target]) => [id, { level: target.level, elite: target.elite, starLevel: target.starLevel }])) }))
  }, snake) }
}
export function workspaceFromRemote(data, accountId) {
  if (data.schema_version !== 1 || data.account_id !== accountId) throw new Error('云端培养计划版本或子账号不匹配')
  return normalizeTrainingWorkspace({ ...mapFields(data, camel), version: 1, accountId, updatedAt: data.updated_at }, accountId)
}
export function plannerTimezone() { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai' }
export function plannerDateInZone(timezone, value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const get = type => parts.find(part => part.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function scheduleBody(snapshot, revision = snapshot.revision || 0) {
  return { schema_version: 1, rules_version: PLANNER_RULES.version, expected_revision: revision,
    timezone: snapshot.timezone || plannerTimezone(), ...mapFields({ strategy: snapshot.strategy, agentOrder: snapshot.agentOrder,
      preferences: snapshot.preferences, manualPlans: snapshot.manualPlans, schedule: snapshot.schedule }, snake) }
}
export function scheduleFromRemote(data, accountId) {
  if (data.schema_version !== 1 || data.rules_version !== PLANNER_RULES.version || data.account_id !== accountId) throw new Error('云端日程版本或子账号不匹配，请更新页面后重试')
  // Saved snapshots must not be normalized by newer simulation rules on read.
  return { ...mapFields(data, camel), version: 1, accountId, revision: data.revision,
    timezone: data.revision ? data.timezone : plannerTimezone(), updatedAt: data.updated_at }
}
export const migrationKey = accountId => 'yuanhub:planner-cloud-migration:v1:' + accountId
export function readLocalPlannerBundle(storage, accountId) {
  const hasWorkspace = storage.getItem(trainingWorkspaceKey(accountId)) != null
  const workspace = readTrainingWorkspace(storage, accountId)
  const schedules = {}
  for (const plan of workspace.plans) {
    const raw = storage.getItem(plannerStorageKey(accountId) + ':plan:' + encodeURIComponent(plan.id))
      || (plan.id === 'favorites' ? storage.getItem(plannerStorageKey(accountId)) : null)
    if (!raw) continue
    const parsed = JSON.parse(raw)
    if (parsed.version !== 1 || parsed.accountId !== accountId) throw new Error('本机日程版本或子账号不匹配，原数据已保留')
    const normalized = normalizePlannerSnapshot(parsed, accountId)
    if (parsed.schedule && !normalized.schedule) throw new Error('本机固定日程无法读取，原数据已保留')
    schedules[plan.id] = { ...normalized, timezone: parsed.timezone || plannerTimezone() }
  }
  return hasWorkspace || Object.keys(schedules).length ? { workspace, schedules } : null
}
// Existing cloud plans are retained. Local favorites become an independent custom
// plan so importing one browser cannot change the cloud's live favorites membership.
export function buildPlannerMigration(local, remote, favoriteIds, targets, uuid = () => crypto.randomUUID()) {
  const empty = remote.revision === 0
  const workspace = clone(empty ? local.workspace : remote)
  const schedules = {}
  const planMap = {}
  if (empty) {
    for (const plan of workspace.plans) planMap[plan.id] = plan.id
  } else for (const localPlan of local.workspace.plans) {
    const id = uuid()
    const plan = clone(localPlan)
    plan.id = id
    plan.name = (plan.name + '（本机导入）').slice(0, 40)
    plan.source = 'custom'
    plan.operatorIds = [...trainingPlanMemberIds(localPlan, favoriteIds)]
    plan.excludedOperatorIds = []
    if (localPlan.source === 'favorites') plan.targets = Object.fromEntries(plan.operatorIds.map(id => [id, {
      level: targets[id]?.level ?? 100, elite: targets[id]?.elite ?? 17, starLevel: targets[id]?.starLevel ?? 7
    }]))
    workspace.plans.push(plan)
    planMap[localPlan.id] = id
  }
  for (const [id, snapshot] of Object.entries(local.schedules)) schedules[planMap[id]] = scheduleBody(snapshot, 0)
  return { migration_id: uuid(), workspace: workspaceBody(workspace, remote.revision), schedules }
}
