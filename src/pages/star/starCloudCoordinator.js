import { getCurrentStarState, patchCurrentStarState, rebuildStarState, listStarRecoveryPoints, restoreStarRecoveryPoint } from '../../api/starState.js'
import { createPlannerSnapshotWriter } from '../../data/plannerSnapshotWriter.js'

const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const inventoryKind = { '主星': 'main', '辅星': 'support' }
const localKind = { main: '主星', support: '辅星' }
const inventoryQuality = { '橙': 'orange', '紫': 'purple', '蓝': 'blue', '绿': 'green', '白': 'white' }
const localQuality = { orange: '橙', purple: '紫', blue: '蓝', green: '绿', white: '白' }
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const number = value => Number.isInteger(value) && value >= 0 ? value : 0
const pick = (value, snake, camel) => value?.[snake] ?? value?.[camel]

export function cloudInventory(snapshot) {
  return snapshot.inventory.map(item => ({
    instance_id: item.starInstanceId, kind: inventoryKind[item.kind], name: item.name,
    quality: inventoryQuality[item.quality], level: item.level,
  })).sort((left, right) => left.instance_id.localeCompare(right.instance_id))
}

function businessState(remote) {
  const bag = record(remote?.bag), experience = record(remote?.experience)
  return {
    generation: number(remote?.generation), revision: number(remote?.revision),
    inventory: (Array.isArray(remote?.inventory) ? remote.inventory : []).map(item => ({
      starInstanceId: String(item.instance_id ?? item.instanceId ?? ''), kind: localKind[item.kind],
      name: String(item.name ?? ''), quality: localQuality[item.quality], level: item.level,
    })),
    planTargets: clone(record(remote?.plan_targets ?? remote?.planTargets)),
    experience: { orange: experience.orange ?? null, purple: experience.purple ?? null, white: experience.white ?? null },
    bag: { currentCount: bag.current_count ?? bag.currentCount ?? null, capacity: bag.capacity ?? null },
  }
}

function draftState(snapshot, generation, revision) {
  return { generation, revision, inventory: clone(snapshot.inventory), planTargets: clone(record(snapshot.planTargets)),
    experience: clone(snapshot.experience), bag: clone(snapshot.bag) }
}

function businessSame(a, b) {
  return a.generation === b.generation && stable([a.inventory, a.planTargets, a.experience, a.bag]) === stable([b.inventory, b.planTargets, b.experience, b.bag])
}

function stateBody(value, expectedRevision) {
  return { expected_generation: value.generation, expected_revision: expectedRevision,
    inventory: cloudInventory(value), plan_targets: clone(value.planTargets), experience: clone(value.experience),
    bag: { current_count: value.bag.currentCount, capacity: value.bag.capacity } }
}

/** One account-bound CAS writer for current-generation star business state. */
export function createStarCloudCoordinator({
  selectedHostAccount, getState = getCurrentStarState, patchState = patchCurrentStarState,
  rebuildState = rebuildStarState, listPoints = listStarRecoveryPoints, restorePoint = restoreStarRecoveryPoint,
  storage = globalThis.localStorage, onState = () => {},
} = {}) {
  let active = null, sequence = 0
  function emit() {
    if (!active) return onState({ accountId: '', loading: false, ready: false, needsRetry: false, recoveryRequired: false })
    const writer = active.writer?.state() || {}
    return onState({ accountId: active.accountId, loading: active.loading, ready: active.ready, writer,
      replacing: Boolean(active.replacing), error: active.error,
      needsRetry: Boolean(active.ready && (writer.pending || writer.error)),
      recoveryRequired: Boolean(active.ready && (writer.error || (!writer.saving && writer.pending))) })
  }
  function sessionFor(accountId, initial) {
    const session = { accountId, generation: initial.generation, ready: false, loading: false, replacing: false, writer: null }
    session.writer = createPlannerSnapshotWriter({
      initial, storage, key: 'yuanhub.star-state:' + accountId,
      read: async () => businessState(await getState(accountId)),
      write: async body => businessState((await patchState(accountId, body)).state),
      body: stateBody, equals: businessSame, onChange: emit,
      onSaved: saved => { session.generation = saved.generation; emit() },
    })
    return session
  }
  async function enter(handle) {
    const host = selectedHostAccount?.()
    if (!host?.accountId) { active = null; ++sequence; emit(); return false }
    const accountId = host.accountId, token = ++sequence
    active = { accountId, loading: true, ready: false, writer: null }; emit()
    try {
      const [remote, local] = await Promise.all([getState(accountId), handle.getCloudBusinessSnapshot()])
      if (token !== sequence || selectedHostAccount()?.accountId !== accountId) return false
      const cloud = businessState(remote)
      const next = cloud.revision > 0 ? cloud : draftState(local, cloud.generation, cloud.revision)
      if (cloud.revision > 0) await handle.applyCloudBusinessSnapshot(next)
      if (token !== sequence || selectedHostAccount()?.accountId !== accountId) return false
      const session = sessionFor(accountId, cloud)
      session.ready = true; active = session; emit()
      if (cloud.revision === 0 && !businessSame(next, cloud)) void session.writer.save(next)
      return true
    } catch (error) {
      if (token === sequence) { active = { accountId, loading: false, ready: false, error, writer: null }; emit() }
      return false
    }
  }
  function committed(event) {
    const session = active
    if (!session?.ready || session.replacing || event.accountId !== session.accountId || selectedHostAccount()?.accountId !== event.accountId) return false
    void session.writer.save(draftState(event.snapshot, session.generation, session.writer.state().revision))
    return true
  }
  function commandSession() {
    const session = active
    if (!session?.ready || selectedHostAccount()?.accountId !== session.accountId) throw new Error('星石云端状态尚未就绪，请重新加载后重试。')
    const writer = session.writer.state()
    if (session.replacing || writer.pending || writer.saving || writer.error) {
      throw Object.assign(new Error('存在未完成的星石云端保存，请重新加载后重试。'), { status: 409 })
    }
    return session
  }
  async function rebuild(snapshot, reason, recoveryPointId = null) {
    const session = commandSession()
    session.replacing = true; emit()
    try {
      const body = { ...stateBody(draftState(snapshot, session.generation, session.writer.state().revision), session.writer.state().revision), reason }
      if (recoveryPointId) body.recovery_point_id = recoveryPointId
      if (reason === 'pre_ocr_rebuild') body.plan_targets = {}
      const response = await rebuildState(session.accountId, body)
      if (active !== session || selectedHostAccount()?.accountId !== session.accountId) throw new Error('账号已切换，请重新加载星石状态。')
      if (!session.writer.adopt(businessState(response.state))) throw new Error('云端版本已变化，请重新加载星石状态。')
      return response
    } finally { session.replacing = false; if (active === session) emit() }
  }
  async function restore(pointId) {
    const session = commandSession()
    session.replacing = true; emit()
    try {
      const response = await restorePoint(session.accountId, pointId, {
        expected_generation: session.generation, expected_revision: session.writer.state().revision,
      })
      if (active !== session || selectedHostAccount()?.accountId !== session.accountId) throw new Error('账号已切换，请重新加载星石状态。')
      if (!session.writer.adopt(businessState(response.state))) throw new Error('云端版本已变化，请重新加载星石状态。')
      return { snapshot: businessState(response.state), summary: response.recovery_summary ?? response.recoverySummary,
        recovery_point: response.recovery_point ?? response.recoveryPoint }
    } finally { session.replacing = false; if (active === session) emit() }
  }
  return { enter, committed,
    retry: () => active?.writer?.retry() ?? Promise.resolve(false),
    needsRetry: () => Boolean(active?.ready && (active.writer?.state().pending || active.writer?.state().error)),
    rebuildOcr: async (snapshot, recoveryPointId) => businessState((await rebuild(snapshot, 'pre_ocr_rebuild', recoveryPointId)).state),
    replaceImport: async snapshot => {
      const response = await rebuild(snapshot, 'import_data_safety')
      return { ...response, snapshot: businessState(response.state) }
    },
    restoreLocal: async snapshot => {
      const response = await rebuild(snapshot, 'restore_local')
      return { snapshot: businessState(response.state), summary: response.recovery_summary ?? response.recoverySummary,
        recovery_point: response.recovery_point ?? response.recoveryPoint }
    },
    listRecoveryPoints: async () => {
      const session = commandSession()
      const points = await listPoints(session.accountId)
      return points.map(point => ({
        restorePointId: pick(point, 'recovery_point_id', 'recoveryPointId'), reason: point.reason,
        createdAt: pick(point, 'created_at', 'createdAt'),
        workspaceRevision: pick(point, 'source_generation', 'sourceGeneration'),
        inventoryCount: pick(point, 'inventory_count', 'inventoryCount'),
        plannedCount: pick(point, 'planned_count', 'plannedCount'),
        bagCurrentCount: pick(point.bag, 'current_count', 'currentCount'), bagCapacity: point.bag?.capacity,
        loadoutCount: pick(point, 'slot_count', 'slotCount') ?? null,
        loadoutOperatorCount: pick(point, 'operator_count', 'operatorCount') ?? null,
        historicalLoadoutAvailable: pick(point, 'loadout_available', 'loadoutAvailable') ?? false,
      }))
    },
    restorePoint: restore, state: () => active }
}
