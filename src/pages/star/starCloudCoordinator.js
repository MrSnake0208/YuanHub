import { getCurrentStarState, patchCurrentStarState, rebuildStarState, listStarRecoveryPoints, restoreStarRecoveryPoint } from '../../api/starState.js'
import { createPlannerSnapshotWriter } from '../../data/plannerSnapshotWriter.js'
import { rollbackRejectedStarPlanIntent } from './starPlanIntentRecovery.js'
import { starBreakthroughOptions } from '../../domain/starBreakthrough.js'

const clone = value => JSON.parse(JSON.stringify(value))
const uncertainRebuild = message => Object.assign(new Error(message), { code: 'star_rebuild_uncertain' })
const explicitlyRejected = error => [400,401,403,404,409,422].includes(error?.status) && error?.code !== 'request_identity_changed'
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
    ...(Object.hasOwn(item, 'breakthroughStage') ? { breakthrough_stage: item.breakthroughStage } : {}),
  })).sort((left, right) => left.instance_id.localeCompare(right.instance_id))
}

function businessState(remote) {
  const bag = record(remote?.bag), experience = record(remote?.experience)
  return {
    generation: number(remote?.generation), revision: number(remote?.revision),
    inventory: (Array.isArray(remote?.inventory) ? remote.inventory : []).map(item => ({
      starInstanceId: String(item.instance_id ?? item.instanceId ?? ''), kind: localKind[item.kind],
      name: String(item.name ?? ''), quality: localQuality[item.quality], level: item.level,
      ...(Object.hasOwn(item, 'breakthrough_stage') ? { breakthroughStage: item.breakthrough_stage }
        : Object.hasOwn(item, 'breakthroughStage') ? { breakthroughStage: item.breakthroughStage } : {}),
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
  // Rebuilds infer only unambiguous levels; compare that canonical reply with old snapshots too.
  const inventory = state => cloudInventory(state).map(star => {
    const options = starBreakthroughOptions(star)
    return { ...star, breakthrough_stage: Object.hasOwn(star, 'breakthrough_stage') ? star.breakthrough_stage
      : options.length === 1 ? options[0] : null }
  })
  return a.generation === b.generation && stable([inventory(a), a.planTargets, a.experience, a.bag]) === stable([inventory(b), b.planTargets, b.experience, b.bag])
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
  const writerKey = accountId => 'yuanhub.star-state:' + accountId
  function hasCommandPending(accountId) {
    try { return ['yuanhub.star-rebuild-pending:', 'yuanhub.star-plan-pending:'].some(prefix => storage.getItem(prefix + accountId) !== null) }
    catch { return true } // Unreadable protection records cannot authorize a write/discard.
  }
  function current(session) { return active === session && selectedHostAccount()?.accountId === session.accountId }
  function assertCurrent(session) {
    if (!current(session)) throw new Error('账号或页面已变化，请重新加载当前账号。')
  }
  async function readBusiness(accountId) {
    const raw = await getState(accountId)
    // Never turn a malformed/partial recovery read into an empty backpack.
    const isRecord = value => value && typeof value === 'object' && !Array.isArray(value)
    const count = value => value === null || Number.isInteger(value) && value >= 0
    const plan = raw?.plan_targets ?? raw?.planTargets
    if (!Number.isInteger(raw?.generation) || raw.generation < 0 || !Number.isInteger(raw?.revision) || raw.revision < 0 ||
      !Array.isArray(raw.inventory) || !isRecord(raw.bag) || !isRecord(raw.experience) || !isRecord(plan) ||
      !count(Object.hasOwn(raw.bag, 'current_count') ? raw.bag.current_count : raw.bag.currentCount) || !count(raw.bag.capacity) ||
      !['orange', 'purple', 'white'].every(key => count(raw.experience[key]))) throw new Error('云端星石数据不完整，请保留本机记录并重试。')
    return businessState(raw)
  }
  function canReloadCloud() {
    if (!active?.ready || !current(active) || !active.writer.isActive() || active.replacing || active.error || hasCommandPending(active.accountId)) return false
    const writer = active.writer.state()
    return !writer.saving && Boolean(writer.pending)
  }
  function emit() {
    if (!active) return onState({ accountId: '', loading: false, ready: false, needsRetry: false, recoveryRequired: false })
    const writer = active.writer?.state() || {}
    return onState({ accountId: active.accountId, loading: active.loading, ready: active.ready, writer,
      replacing: Boolean(active.replacing), recovering: Boolean(active.reloading), readOnlyReload: Boolean(active.readOnlyReload), error: active.error, commandPending: hasCommandPending(active.accountId), canReloadCloud: canReloadCloud(),
      needsRetry: Boolean(active.ready && (writer.pending || writer.error || active.error)),
      recoveryRequired: Boolean(active.ready && (active.error || writer.error || (!writer.saving && writer.pending))) })
  }
  function sessionFor(accountId, initial, handle) {
    const session = { accountId, generation: initial.generation, handle, ready: false, loading: false, replacing: false, writer: null }
    session.writer = createPlannerSnapshotWriter({
      initial, storage, key: writerKey(accountId), isCurrent: () => current(session),
      read: () => readBusiness(accountId),
      write: async body => {
        assertCurrent(session)
        if (hasCommandPending(accountId)) throw Object.assign(new Error('背包替换或计划保存仍待核对，请重新加载。'), { status: 409 })
        return businessState((await patchState(accountId, body)).state)
      },
      body: stateBody, equals: businessSame, sameVersion: (a, b) => a.generation === b.generation && a.revision === b.revision, onChange: emit,
      onSaved: saved => { session.readOnlyReload = false; session.generation = saved.generation; emit() },
    })
    return session
  }
  async function enter(handle, { readOnly = false, isCurrent = () => true } = {}) {
    active?.writer?.stop()
    const host = selectedHostAccount?.()
    if (!host?.accountId) { active = null; ++sequence; emit(); return false }
    const accountId = host.accountId, token = ++sequence
    active = { accountId, loading: true, ready: false, writer: null }; emit()
    try {
      const [cloud, local] = await Promise.all([readBusiness(accountId), handle.getCloudBusinessSnapshot()])
      if (token !== sequence || !isCurrent() || selectedHostAccount()?.accountId !== accountId) return false
      const next = cloud.revision > 0 ? cloud : draftState(local, cloud.generation, cloud.revision)
      if (cloud.revision > 0) await handle.applyCloudBusinessSnapshot(next)
      if (token !== sequence || !isCurrent() || selectedHostAccount()?.accountId !== accountId) return false
      const session = sessionFor(accountId, cloud, handle)
      for (const prefix of ['yuanhub.star-rebuild-pending:','yuanhub.star-plan-pending:']) {
        const pendingRaw=storage.getItem(prefix + accountId)
        if (!pendingRaw) continue
        const expected=JSON.parse(pendingRaw)
        if (businessSame(cloud,expected) && cloud.revision===expected.revision) storage.removeItem(prefix + accountId)
        else session.error=new Error('上次保存结果仍待确认，请重新加载核对，不要重复替换背包或登记完成。')
      }
      session.readOnlyReload = readOnly; session.ready = true; active = session; emit()
      if (!readOnly && !session.error && cloud.revision === 0 && !businessSame(next, cloud)) void session.writer.save(next)
      return true
    } catch (error) {
      if (token === sequence) { active = { accountId, loading: false, ready: false, error, writer: null }; emit() }
      return false
    }
  }
  function committed(event) {
    const session = active
    if (!session?.ready || !session.writer.isActive() || (session.replacing && !session.reloading) || session.error || event.accountId !== session.accountId || selectedHostAccount()?.accountId !== event.accountId) return false
    session.commitVersion = (session.commitVersion || 0) + 1
    void session.writer.save(draftState(event.snapshot, session.generation, session.writer.state().revision))
    return true
  }
  // Internal lossless reconciliation remains available; the page never uses it to resubmit discarded edits.
  function retry() {
    const session = active
    if (!session?.ready || !current(session) || session.replacing || session.error || hasCommandPending(session.accountId)) return Promise.resolve(false)
    return session.writer.retry()
  }
  async function discardAndReload({ isCurrent = () => true } = {}) {
    if (!canReloadCloud()) return false
    const session = active, commitVersion = session.commitVersion || 0
    session.replacing = true; session.reloading = true; emit()
    try {
      return await session.writer.discard({ beforeDiscard: async remote => {
        const assertSafe = () => {
          assertCurrent(session)
          if (!isCurrent() || (session.commitVersion || 0) !== commitVersion) throw new Error('恢复期间账号或本机修改已变化，待同步记录已保留。')
          if (hasCommandPending(session.accountId)) throw new Error('识别重建或计划继承仍待核对，不能放弃普通修改。')
          const base = session.writer.state().base
          if (remote.generation < base.generation || remote.revision < base.revision) throw new Error('云端版本已过期，请重新读取。')
        }
        assertSafe()
        const pendingRaw = storage.getItem(writerKey(session.accountId))
        const local = await session.handle.getCloudBusinessSnapshot()
        assertSafe()
        if (storage.getItem(writerKey(session.accountId)) !== pendingRaw) throw new Error('本机待保存记录已变化，请重新核对。')
        const backupKey = 'yuanhub.star-state-backup:' + session.accountId + ':' + globalThis.crypto.randomUUID()
        const backup = JSON.stringify({ accountId: session.accountId, savedAt: new Date().toISOString(), pendingRaw, pending: session.writer.state().pending, local, cloud: remote })
        storage.setItem(backupKey, backup)
        if (storage.getItem(backupKey) !== backup) throw new Error('未能保留本机备份，已停止重新加载。')
        await session.handle.applyCloudBusinessSnapshot(remote)
        assertSafe()
        const hydrated = await session.handle.getCloudBusinessSnapshot()
        assertSafe()
        if (!businessSame(remote, draftState(hydrated, remote.generation, remote.revision))) throw new Error('背包读取结果不一致，本机待保存记录已保留。')
      } })
    } finally { session.replacing = false; session.reloading = false; if (current(session)) emit() }
  }
  function commandSession() {
    const session = active
    if (!session?.ready || selectedHostAccount()?.accountId !== session.accountId) throw new Error('星石云端状态尚未就绪，请重新加载后重试。')
    const writer = session.writer.state()
    if (!session.writer.isActive() || session.replacing || session.error || writer.pending || writer.saving || writer.error || hasCommandPending(session.accountId)) {
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
      const pendingRaw = JSON.stringify(expected)
      storage.setItem(pendingKey, pendingRaw)
      // Another session may start a newer rebuild while this response is in flight.
      // Only the persisted intent belonging to this request may be adopted/cleared.
      const assertPendingOwner = () => {
        let matches = false
        try { matches = storage.getItem(pendingKey) === pendingRaw } catch { /* Cannot prove ownership without the durable record. */ }
        if (!matches) {
          session.error = uncertainRebuild('本次保存状态仍待核对，请重新加载，不要重复替换背包。')
          throw session.error
        }
      }
      const clearPending = () => { assertPendingOwner(); storage.removeItem(pendingKey) }
      let response
      if (reason !== 'pre_ocr_rebuild') {
        try { response = await rebuildState(session.accountId, body) }
        catch (error) {
          if (explicitlyRejected(error)) clearPending()
          else {
            session.error = uncertainRebuild('背包替换结果尚未确认，请先重新加载核对，不要重复导入或恢复。')
            throw session.error
          }
          throw error
        }
      }
      else {
        try {
          response = await rebuildState(session.accountId, body)
          const saved = businessState(response?.state)
          if (!businessSame(saved, expected) || saved.revision !== expected.revision) throw new Error('云端重建回读与确认结果不一致。')
        } catch (error) {
          if (explicitlyRejected(error)) {
            assertPendingOwner()
            session.error = error
            await rollbackRejectedStarPlanIntent({ operation: 'ocr', accountId: session.accountId, snapshot, recoveryPointId,
              scope: { generation: body.expected_generation, revision: body.expected_revision } })
            clearPending()
            session.error = undefined
            throw error
          }
          // A lost POST response may already have committed. Read before any retry;
          // the exact generation/revision and complete snapshot fence double rebuilds.
          let raw, remote
          try { raw = await getState(session.accountId); remote = businessState(raw) }
          catch { session.error = uncertainRebuild('还无法确认新背包是否保存成功。原截图和旧计划已保留，请先重新加载并核对背包，不要再次完整识别。'); throw session.error }
          if (businessSame(remote, expected) && remote.revision === expected.revision) response = { state: raw }
          else {
            session.error = uncertainRebuild('还无法确认新背包是否保存成功。原截图和旧计划已保留，请先重新加载并核对背包，不要再次完整识别。')
            throw session.error
          }
        }
      }
      if (active !== session || selectedHostAccount()?.accountId !== session.accountId) throw new Error('账号已切换，请重新加载星石状态。')
      assertPendingOwner()
      if (!session.writer.adopt(businessState(response.state))) throw new Error('云端版本已变化，请重新加载星石状态。')
      clearPending()
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
    } catch (error) {
      if (![400,401,403,404,409,422].includes(error?.status) || error?.code === 'request_identity_changed') {
        session.error = Object.assign(new Error('恢复结果尚未确认，请重新加载核对，不要重复恢复。', { cause: error }), { code: 'star_restore_uncertain' })
        throw session.error
      }
      throw error
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
    retry, discardAndReload, canReloadCloud,
    leave() { active?.writer?.stop(); active = null; ++sequence; emit() },
    needsRetry: () => Boolean(active?.ready && (active.error || active.writer?.state().pending || active.writer?.state().error)),
    ocrRebuildScope() { const session = commandSession(); return { accountId: session.accountId, generation: session.generation, revision: session.writer.state().revision } },
    async applyRecoveredPlan(snapshot, scope) {
      const session = commandSession()
      if (!scope || scope.accountId !== session.accountId || scope.generation !== session.generation || scope.revision !== session.writer.state().revision) throw new Error('云端版本已变化，请重新预览。')
      session.replacing = true; emit()
      let writeStarted = false
      try {
        const raw = await getState(session.accountId), current = businessState(raw)
        if (current.generation !== scope.generation || current.revision !== scope.revision || active !== session || selectedHostAccount()?.accountId !== session.accountId) throw new Error('云端版本或账号已变化，请重新加载。')
        const incoming = draftState(snapshot,scope.generation,scope.revision)
        if (stable([cloudInventory(incoming),incoming.bag,incoming.experience]) !== stable([cloudInventory(current),current.bag,current.experience])) throw new Error('当前背包与云端数据不一致，计划继承已停止，请先重新加载。')
        if (businessSame(current,incoming)) return productSnapshot(current)
        const pendingKey='yuanhub.star-plan-pending:' + session.accountId
        storage.setItem(pendingKey,JSON.stringify({...incoming, inventory: businessState({inventory: cloudInventory(incoming)}).inventory, revision: scope.revision+1}))
        const body = stateBody(incoming,scope.revision)
        writeStarted = true
        const response = await patchState(session.accountId,body)
        const saved = businessState(response.state)
        if (active !== session || selectedHostAccount()?.accountId !== session.accountId || saved.generation !== scope.generation || !businessSame(saved,incoming)) throw new Error('计划保存结果尚未确认，请重新加载核对，不要重复继承。')
        if (!session.writer.adopt(saved)) throw new Error('云端版本无法采用，请重新加载。')
        storage.removeItem(pendingKey)
        return productSnapshot(saved)
      } catch (error) {
        if (!writeStarted || explicitlyRejected(error)) {
          session.error = error
          await rollbackRejectedStarPlanIntent({ operation: 'plan', accountId: session.accountId, snapshot, scope })
          storage.removeItem('yuanhub.star-plan-pending:' + session.accountId)
        }
        session.error = storage.getItem('yuanhub.star-plan-pending:' + session.accountId)
          ? Object.assign(new Error('计划保存结果尚未确认，请重新加载核对，不要重复继承。', { cause: error }), { code: 'star_plan_uncertain' }) : error
        throw session.error
      }
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
