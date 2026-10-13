import { getCurrentStarState, patchCurrentStarState, rebuildStarState, listStarRecoveryPoints, restoreStarRecoveryPoint } from '../../api/starState.js'
import { createPlannerSnapshotWriter } from '../../data/plannerSnapshotWriter.js'

const clone = value => JSON.parse(JSON.stringify(value))
const uncertainRebuild = message => Object.assign(new Error(message), { code: 'star_rebuild_uncertain' })
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

// CAS metadata belongs to the coordinator; the product receives business only.
function productSnapshot(state) {
  const { inventory, planTargets, experience, bag } = state
  return { inventory, planTargets, experience, bag }
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
      needsRetry: Boolean(active.ready && (writer.pending || writer.error || active.error)),
      recoveryRequired: Boolean(active.ready && (active.error || writer.error || (!writer.saving && writer.pending))) })
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
      for (const prefix of ['yuanhub.star-rebuild-pending:','yuanhub.star-plan-pending:']) {
        const pendingRaw=storage.getItem(prefix + accountId)
        if (!pendingRaw) continue
        const expected=JSON.parse(pendingRaw)
        if (businessSame(cloud,expected) && cloud.revision===expected.revision) storage.removeItem(prefix + accountId)
        else session.error=new Error('原星石写入仍待权威确认，重复写入已锁定。请稍后重新加载。')
      }
      session.ready = true; active = session; emit()
      if (!session.error && cloud.revision === 0 && !businessSame(next, cloud)) void session.writer.save(next)
      return true
    } catch (error) {
      if (token === sequence) { active = { accountId, loading: false, ready: false, error, writer: null }; emit() }
      return false
    }
  }
  function committed(event) {
    const session = active
    if (!session?.ready || session.replacing || session.error || event.accountId !== session.accountId || selectedHostAccount()?.accountId !== event.accountId) return false
    void session.writer.save(draftState(event.snapshot, session.generation, session.writer.state().revision))
    return true
  }
  function commandSession() {
    const session = active
    if (!session?.ready || selectedHostAccount()?.accountId !== session.accountId) throw new Error('星石云端状态尚未就绪，请重新加载后重试。')
    const writer = session.writer.state()
    if (session.replacing || session.error || writer.pending || writer.saving || writer.error) {
      throw Object.assign(new Error('存在未完成的星石云端保存，请重新加载后重试。'), { status: 409 })
    }
    return session
  }
  async function rebuild(snapshot, reason, recoveryPointId = null, scope = null) {
    const session = commandSession()
    if (scope && (scope.accountId !== session.accountId || scope.generation !== session.generation || scope.revision !== session.writer.state().revision)) throw new Error('云端版本已变化，请重新预览继承计划。')
    session.replacing = true; emit()
    try {
      const body = { ...stateBody(draftState(snapshot, session.generation, session.writer.state().revision), session.writer.state().revision), reason }
      if (recoveryPointId) body.recovery_point_id = recoveryPointId
      if (reason === 'pre_ocr_rebuild') body.plan_targets = {}
      const expected = businessState({ generation: body.expected_generation + 1, revision: body.expected_revision + 1,
        inventory: body.inventory, plan_targets: body.plan_targets, experience: body.experience, bag: body.bag })
      const pendingKey='yuanhub.star-rebuild-pending:' + session.accountId
      if (reason === 'pre_ocr_rebuild') storage.setItem(pendingKey,JSON.stringify(expected))
      let response
      if (reason !== 'pre_ocr_rebuild') response = await rebuildState(session.accountId, body)
      else {
        try {
          response = await rebuildState(session.accountId, body)
          const saved = businessState(response?.state)
          if (!businessSame(saved, expected) || saved.revision !== expected.revision) throw new Error('云端重建回读与确认结果不一致。')
        } catch (error) {
          // A lost POST response may already have committed. Read before any retry;
          // the exact generation/revision and complete snapshot fence double rebuilds.
          let raw, remote
          try { raw = await getState(session.accountId); remote = businessState(raw) }
          catch { session.error = uncertainRebuild('无法确认云端重建结果，请重新加载恢复，勿重复识别。'); throw session.error }
          if (businessSame(remote, expected) && remote.revision === expected.revision) response = { state: raw }
          else {
            session.error = uncertainRebuild('原识别请求结果不确定，已锁定重复写入。请重新加载并恢复权威状态。')
            throw session.error
          }
        }
      }
      if (active !== session || selectedHostAccount()?.accountId !== session.accountId) throw new Error('账号已切换，请重新加载星石状态。')
      if (!session.writer.adopt(businessState(response.state))) throw new Error('云端版本已变化，请重新加载星石状态。')
      if (reason === 'pre_ocr_rebuild') storage.removeItem(pendingKey)
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
    completionScope(userId, game) {
      const session = active
      if (!userId || !session?.ready || session.error || selectedHostAccount()?.accountId !== session.accountId || selectedHostAccount()?.gameVersion !== game) return null
      const state = session.writer.state()
      if (state.pending || state.saving || state.error) return null
      return { userId, accountId: session.accountId, game, generation: session.generation, revision: state.revision }
    },
    beginCompletion(scope) {
      const session = commandSession()
      if (scope.accountId !== session.accountId || scope.generation !== session.generation || scope.revision !== session.writer.state().revision) throw new Error('云端版本已变化，请重新确认。')
      session.replacing = true; emit()
      // Lease is session-bound: an old account response cannot unlock/adopt a new one.
      return {
        adopt(context) {
          if (active !== session || selectedHostAccount()?.accountId !== session.accountId || context.account_id !== session.accountId) throw new Error('账号已切换，原操作仍待恢复。')
          const next = businessState(context.state)
          if (next.generation < session.generation || (next.generation === session.generation && next.revision < session.writer.state().revision)) throw new Error('回执版本已过期，请重新读取。')
          if (!session.writer.adopt(next)) throw new Error('云端版本无法采用，请恢复原操作。')
        },
        release() { session.replacing = false; if (active === session) emit() },
      }
    },
    retry: () => active?.writer?.retry() ?? Promise.resolve(false),
    needsRetry: () => Boolean(active?.ready && (active.error || active.writer?.state().pending || active.writer?.state().error)),
    ocrRebuildScope() { const session = commandSession(); return { accountId: session.accountId, generation: session.generation, revision: session.writer.state().revision } },
    async applyRecoveredPlan(snapshot, scope) {
      const session = commandSession()
      if (!scope || scope.accountId !== session.accountId || scope.generation !== session.generation || scope.revision !== session.writer.state().revision) throw new Error('云端版本已变化，请重新预览。')
      session.replacing = true; emit()
      try {
        const raw = await getState(session.accountId), current = businessState(raw)
        if (current.generation !== scope.generation || current.revision !== scope.revision || active !== session || selectedHostAccount()?.accountId !== session.accountId) throw new Error('云端版本或账号已变化，请重新加载。')
        const incoming = draftState(snapshot,scope.generation,scope.revision)
        if (stable([cloudInventory(incoming),incoming.bag,incoming.experience]) !== stable([cloudInventory(current),current.bag,current.experience])) throw new Error('当前背包与云端不一致，已停止仅计划恢复。')
        if (businessSame(current,incoming)) return productSnapshot(current)
        const pendingKey='yuanhub.star-plan-pending:' + session.accountId
        storage.setItem(pendingKey,JSON.stringify({...incoming, inventory: businessState({inventory: cloudInventory(incoming)}).inventory, revision: scope.revision+1}))
        const body = stateBody(incoming,scope.revision)
        const response = await patchState(session.accountId,body)
        const saved = businessState(response.state)
        if (active !== session || selectedHostAccount()?.accountId !== session.accountId || saved.generation !== scope.generation || !businessSame(saved,incoming)) throw new Error('云端计划回读异常，请重新加载。')
        if (!session.writer.adopt(saved)) throw new Error('云端版本无法采用，请重新加载。')
        storage.removeItem(pendingKey)
        return productSnapshot(saved)
      } catch (error) { session.error = error; throw error }
      finally { session.replacing = false; if (active === session) emit() }
    },
    rebuildOcr: async (snapshot, recoveryPointId, scope) => productSnapshot(businessState((await rebuild(snapshot, 'pre_ocr_rebuild', recoveryPointId, scope)).state)),
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
