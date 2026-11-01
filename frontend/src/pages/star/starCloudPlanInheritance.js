import { getCurrentStarState, getPendingStarPlanInheritance, confirmStarPlanInheritance, discardStarPlanInheritance } from '../../api/starState.js'
import { cloudInventory } from './starCloudCoordinator.js'

const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const field = (value, snake, camel) => value?.[snake] ?? value?.[camel]
const kinds = { main: '主星', support: '辅星' }
const qualities = { orange: '橙', purple: '紫', blue: '蓝', green: '绿', white: '白' }
const rejected = error => [400,401,403,404,409,422].includes(error?.status)
const fail = () => { throw new Error('账号、背包或旧计划已变化，请保留当前编辑并重新加载后预览。') }

export function planSourceBusiness(raw) {
  const targets = field(raw, 'plan_targets', 'planTargets')
  if (!Array.isArray(raw?.inventory) || !Array.isArray(targets) || !raw.experience || !raw.bag) fail()
  const planTargets = {}
  for (const target of targets) {
    const id = field(target, 'instance_id', 'instanceId'), level = field(target, 'target_level', 'targetLevel')
    if (typeof id !== 'string' || !Number.isInteger(level) || Object.hasOwn(planTargets, id)) fail()
    Object.defineProperty(planTargets, id, { value: level, enumerable: true, writable: true })
  }
  return {
    inventory: raw.inventory.map(item => {
      const id = field(item, 'instance_id', 'instanceId')
      if (!id || !kinds[item.kind] || !qualities[item.quality] || !Number.isInteger(item.level)) fail()
      return { starInstanceId: id, kind: kinds[item.kind], name: item.name, quality: qualities[item.quality], level: item.level }
    }),
    planTargets,
    bag: { currentCount: field(raw.bag, 'current_count', 'currentCount') ?? null, capacity: raw.bag.capacity ?? null },
    experience: clone(raw.experience),
  }
}

function currentBusiness(raw) {
  if (!raw || typeof field(raw, 'plan_targets', 'planTargets') !== 'object' || Array.isArray(field(raw, 'plan_targets', 'planTargets'))) fail()
  const targets = Object.entries(field(raw, 'plan_targets', 'planTargets')).map(([instance_id, target_level]) => ({ instance_id, target_level }))
  return planSourceBusiness({ ...raw, plan_targets: targets })
}
function sameInventory(left, right) {
  const inventory = value => cloudInventory(value).map(({ breakthrough_stage, ...item }) => item)
  return stable([inventory(left),left.experience,left.bag]) === stable([inventory(right),right.experience,right.bag])
}

/** Cloud pending never shares IndexedDB records or the local OCR inheritance writer. */
export function createCloudPlanInheritancePort({
  coordinator, readState = getCurrentStarState, readPending = getPendingStarPlanInheritance,
  confirm = confirmStarPlanInheritance, discard = discardStarPlanInheritance,
  operationId = () => globalThis.crypto.randomUUID(),
} = {}) {
  const scopeMatches = scope => {
    const latest = coordinator.ocrRebuildScope()
    return latest.accountId === scope.accountId && latest.generation === scope.generation && latest.revision === scope.revision
  }
  const assertScope = scope => { if (!scope || !scopeMatches(scope)) fail() }
  const versionMatches = (raw, scope) => raw?.generation === scope.generation && raw.revision === scope.revision &&
    field(raw, 'account_id', 'accountId') === scope.accountId
  async function read(scope) {
    assertScope(scope)
    const [state, raw] = await Promise.all([readState(scope.accountId), readPending(scope.accountId)])
    assertScope(scope)
    if (!versionMatches(state, scope)) fail()
    if (raw == null) return null
    const accountId = field(raw, 'account_id', 'accountId')
    const targetGeneration = field(raw, 'target_generation', 'targetGeneration')
    const sourceRecoveryPointId = field(raw, 'source_recovery_point_id', 'sourceRecoveryPointId')
    const sourceGeneration = field(raw, 'source_generation', 'sourceGeneration')
    if (accountId !== scope.accountId || targetGeneration !== scope.generation || !sourceRecoveryPointId ||
      !Number.isInteger(sourceGeneration) || sourceGeneration >= targetGeneration) fail()
    return { accountId, targetGeneration, sourceGeneration, sourceRecoveryPointId,
      sourceState: planSourceBusiness(field(raw, 'source_state', 'sourceState')) }
  }
  async function resolve(action, source, snapshot, scope) {
    assertScope(scope)
    if (source.accountId !== scope.accountId || source.targetGeneration !== scope.generation) fail()
    const lease = coordinator.beginCompletion(scope)
    // During this lease ordinary autosaves cannot race the account-bound command.
    try {
      const raw = await readState(scope.accountId), current = currentBusiness(raw)
      if (!lease.isCurrent() || !versionMatches(raw, scope)) fail()
      if (action === 'confirm' && (!sameInventory(snapshot,current) || Object.keys(current.planTargets).length)) fail()
      const body = { operation_id: operationId(), source_recovery_point_id: source.sourceRecoveryPointId,
        expected_generation: scope.generation, expected_revision: scope.revision }
      if (action === 'confirm') body.plan_targets = clone(snapshot.planTargets)
      const send = () => (action === 'confirm' ? confirm : discard)(scope.accountId, body)
      let receipt
      try { receipt = await send() } catch (error) {
        if (rejected(error)) throw error
        if (!lease.isCurrent()) fail()
        // One exact retry, with the same operation_id, can recover a committed response loss.
        receipt = await send()
      }
      const after = await readState(scope.accountId), saved = currentBusiness(after)
      if (!lease.isCurrent()) fail()
      const receiptRevision = receipt?.revision
      if (field(receipt,'operation_id','operationId') !== body.operation_id ||
        field(receipt,'source_recovery_point_id','sourceRecoveryPointId') !== source.sourceRecoveryPointId ||
        field(receipt,'target_generation','targetGeneration') !== scope.generation || receipt.action !== action ||
        !Number.isInteger(receiptRevision) || !versionMatches(after,{...scope,revision:receiptRevision}) ||
        !sameInventory(saved,current) || stable(saved.planTargets) !== stable(action === 'confirm' ? snapshot.planTargets : current.planTargets)) fail()
      lease.adopt({ account_id: scope.accountId, state: after })
      return saved
    } finally { lease.release() }
  }
  return { read, confirm: (source,snapshot,scope) => resolve('confirm',source,snapshot,scope),
    discard: (source,scope) => resolve('discard',source,null,scope) }
}
