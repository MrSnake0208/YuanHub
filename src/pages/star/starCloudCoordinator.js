import { getCurrentStarInventory, putCurrentStarInventory } from '../../api/starInventory.js'
import { getCurrentStarWorkspace, putCurrentStarWorkspace } from '../../api/starWorkspace.js'
import { replaceStarExchange } from '../../api/starExchange.js'
import { createPlannerSnapshotWriter } from '../../data/plannerSnapshotWriter.js'

const clone = value => JSON.parse(JSON.stringify(value))
const stable = value => JSON.stringify(value, function (_key, item) {
  return item && !Array.isArray(item) && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
})
const inventoryKind = { '主星': 'main', '辅星': 'support' }
const localKind = { main: '主星', support: '辅星' }
const inventoryQuality = { '橙': 'orange', '紫': 'purple', '蓝': 'blue', '绿': 'green', '白': 'white' }
const localQuality = { orange: '橙', purple: '紫', blue: '蓝', green: '绿', white: '白' }

function number(value) { return Number.isInteger(value) && value >= 0 ? value : 0 }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function inventoryEntries(remote) { return Array.isArray(remote && remote.entries) ? remote.entries : [] }
function revision(remote) { return number(remote && remote.revision) }
function inventoryExists(remote) { return revision(remote) > 0 }
function workspaceExists(remote) { return revision(remote) > 0 }
function cloudInventory(snapshot) {
  return snapshot.inventory.map(item => ({
    instance_id: item.starInstanceId, kind: inventoryKind[item.kind], name: item.name,
    quality: inventoryQuality[item.quality], level: item.level,
  })).sort((left, right) => left.instance_id.localeCompare(right.instance_id))
}
function businessInventory(remote) {
  return inventoryEntries(remote).map(item => ({
    starInstanceId: String(item.instance_id ?? item.instanceId ?? ''),
    kind: localKind[item.kind], name: String(item.name ?? ''), quality: localQuality[item.quality], level: item.level,
  }))
}
function workspaceFields(remote) {
  const bag = record(remote && remote.bag), experience = record(remote && remote.experience)
  return {
    planTargets: clone(record(remote && (remote.plan_targets ?? remote.planTargets))),
    bag: { currentCount: bag.current_count ?? bag.currentCount ?? null, capacity: bag.capacity ?? null },
    experience: { orange: experience.orange ?? null, purple: experience.purple ?? null, white: experience.white ?? null },
  }
}
function inventoryState(remote) { return { revision: revision(remote), inventory: businessInventory(remote) } }
function workspaceState(remote, snapshot) { return { revision: revision(remote), ...workspaceFields(remote), inventory: clone(snapshot.inventory) } }
function inventorySame(left, right) { return stable(left.inventory) === stable(right.inventory) }
function workspaceSame(left, right) {
  return stable({ planTargets: left.planTargets, bag: left.bag, experience: left.experience }) === stable({ planTargets: right.planTargets, bag: right.bag, experience: right.experience })
}
function orderedBusinessSnapshot(snapshot) {
  return {
    inventory: clone(Array.isArray(snapshot && snapshot.inventory) ? snapshot.inventory : []),
    planTargets: clone(record(snapshot && snapshot.planTargets)),
    bag: clone(record(snapshot && snapshot.bag)),
    experience: clone(record(snapshot && snapshot.experience)),
  }
}
function inventoryBody(value, effectiveAt) { return { effective_at: effectiveAt(), entries: cloudInventory(value) } }
function workspaceBody(value, expectedRevision) {
  return { expected_revision: expectedRevision, plan_targets: clone(value.planTargets), bag: { current_count: value.bag.currentCount, capacity: value.bag.capacity }, experience: clone(value.experience) }
}
function replacementBody(accountId, snapshot, inventoryRevision, workspaceRevision, effectiveAt) {
  return {
    account_id: accountId,
    inventory: { expected_revision: inventoryRevision, ...inventoryBody(snapshot, effectiveAt) },
    workspace: workspaceBody(snapshot, workspaceRevision),
  }
}
function errorMessage(error, fallback) { return error instanceof Error && error.message ? error.message : fallback }
function timestamp(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}
function inventoryEffectiveAtClock(remote, now) {
  let floor = timestamp(remote && (remote.effective_at ?? remote.effectiveAt))
  return () => {
    const proposed = Date.parse(now())
    floor = Math.max(floor + 1, Number.isFinite(proposed) ? proposed : Date.now())
    return new Date(floor).toISOString()
  }
}

/**
 * Owns account-bound cloud loading and the two independent revision writers.
 * The embed never sees API URLs; it only receives snapshot hydrate and commits.
 */
export function createStarCloudCoordinator({
  selectedHostAccount, getInventory = getCurrentStarInventory, putInventory = putCurrentStarInventory,
  getWorkspace = getCurrentStarWorkspace, putWorkspace = putCurrentStarWorkspace,
  replace = replaceStarExchange,
  storage = globalThis.localStorage, now = () => new Date().toISOString(), onState = () => {},
} = {}) {
  let active = null, sequence = 0
  const sessions = new Map()
  const emit = () => {
    if (!active) return onState({ accountId: '', loading: false, ready: false, needsRetry: false, recoveryRequired: false, hasOrderedHold: false, restoredHoldAwaitingRetry: false })
    const inventory = active.inventory.state(), workspace = active.workspace.state()
    const saving = Boolean(inventory.saving || workspace.saving)
    return onState({
      accountId: active.accountId, loading: active.loading, ready: active.ready,
      inventory, workspace,
      hasOrderedHold: Boolean(active.orderedHold),
      restoredHoldAwaitingRetry: Boolean(active.restoredHoldAwaitingRetry),
      needsRetry: Boolean(active.ready && (active.orderedHold || inventory.pending || inventory.error || workspace.pending || workspace.error)),
      recoveryRequired: Boolean(active.ready && (
        active.restoredHoldAwaitingRetry || inventory.error || workspace.error ||
        (!saving && (inventory.pending || workspace.pending))
      )),
    })
  }
  function createSession(accountId, remoteInventory, remoteWorkspace, snapshot) {
    const key = 'yuanhub.star-cloud:' + accountId + ':'
    // A reload starts a new local monotonic counter, so seed this account's
    // session clock from the remote current snapshot as well as local now().
    const nextEffectiveAt = inventoryEffectiveAtClock(remoteInventory, now)
    const inventory = createPlannerSnapshotWriter({
      initial: inventoryState(remoteInventory), key: key + 'inventory', storage,
      read: async () => inventoryState(await getInventory(accountId)),
      write: async body => {
        const saved = await putInventory(accountId, body)
        const returned = businessInventory(saved)
        return { revision: revision(saved) || 1, inventory: returned.length || !body.entries.length ? returned : businessInventory({ entries: body.entries }) }
      },
      // The inventory endpoint has no expected-revision field, but every real
      // content write still needs a monotonic effective_at. Keep this in the
      // writer body so merged pending drafts receive one timestamp only when
      // they are actually sent.
      body: value => inventoryBody(value, nextEffectiveAt), equals: inventorySame, onChange: emit,
    })
    const workspace = createPlannerSnapshotWriter({
      initial: workspaceState(remoteWorkspace, snapshot), key: key + 'workspace', storage,
      read: async () => workspaceState(await getWorkspace(accountId), snapshot),
      write: async body => workspaceState(await putWorkspace(accountId, body), { inventory: [] }),
      body: (value, expectedRevision) => workspaceBody(value, expectedRevision), equals: workspaceSame, onChange: emit,
    })
    const orderedKey = key + 'ordered'
    let restoredOrderedHold = null
    try {
      const stored = JSON.parse(storage.getItem(orderedKey) || 'null')
      if (stored && typeof stored === 'object' && Array.isArray(stored.inventory)) restoredOrderedHold = orderedBusinessSnapshot(stored)
    } catch (_) {}
    const orderedLease = Date.now().toString(36) + ':' + Math.random().toString(36).slice(2)
    const session = {
      accountId, inventory, workspace, nextEffectiveAt, replacing: false, barrier: null,
      orderedHold: restoredOrderedHold, orderedGeneration: restoredOrderedHold ? 1 : 0, orderedDriving: null,
      restoredHoldAwaitingRetry: Boolean(restoredOrderedHold),
    }
    session.isCurrent = () => sessions.get(accountId) === session
    session.ownsOrderedHold = function () {
      try {
        return JSON.parse(storage.getItem(orderedKey) || 'null')?.lease === orderedLease
      } catch (_) {
        return false
      }
    }
    if (restoredOrderedHold) {
      try {
        storage.setItem(orderedKey, JSON.stringify({ ...restoredOrderedHold, lease: orderedLease }))
      } catch (_) {}
    }
    session.enqueue = function (action) {
      if (!session.barrier) {
        return Promise.resolve().then(action)
      }
      const next = session.barrier.catch(() => undefined).then(action)
      session.barrier = next
      next.then(
        () => { if (session.barrier === next) session.barrier = null },
        () => { if (session.barrier === next) session.barrier = null },
      )
      return next
    }
    session.enqueueOrdered = function (action) {
      const next = (session.barrier || Promise.resolve()).catch(() => undefined).then(action)
      session.barrier = next
      next.then(
        () => { if (session.barrier === next) session.barrier = null },
        () => { if (session.barrier === next) session.barrier = null },
      )
      return next
    }
    session.coalesceOrderedHold = function (snapshot) {
      const hold = orderedBusinessSnapshot(snapshot)
      try {
        // Persist before the first Workspace request so a reload cannot lose
        // the Inventory intent that must remain ordered behind it.
        storage.setItem(orderedKey, JSON.stringify({ ...hold, lease: orderedLease }))
      } catch (_) {
        return false
      }
      session.orderedHold = hold
      session.orderedGeneration += 1
      emit()
      return true
    }
    session.clearOrderedHold = function () {
      if (!session.isCurrent() || !session.ownsOrderedHold()) return false
      try {
        storage.removeItem(orderedKey)
      } catch (_) {
        return false
      }
      session.orderedHold = null
      session.orderedGeneration += 1
      session.restoredHoldAwaitingRetry = false
      emit()
      return true
    }
    session.driveOrderedHold = async function (retry) {
      while (session.orderedHold) {
        if (!session.isCurrent() || !session.ownsOrderedHold()) return false
        const generation = session.orderedGeneration
        const hold = orderedBusinessSnapshot(session.orderedHold)
        let workspaceState = session.workspace.state()
        if (workspaceState.error) {
          if (!retry) return false
          await session.workspace.retry()
          workspaceState = session.workspace.state()
          if (workspaceState.pending || workspaceState.saving || workspaceState.error) return false
        }
        await session.workspace.save({
          revision: workspaceState.revision, ...workspaceFields({}), inventory: clone(hold.inventory),
          planTargets: clone(hold.planTargets), bag: clone(hold.bag), experience: clone(hold.experience),
        })
        workspaceState = session.workspace.state()
        if (workspaceState.pending || workspaceState.saving || workspaceState.error) return false
        // A newer complete snapshot arrived while this Workspace request was in
        // flight. Send that Workspace state before any older Inventory state.
        if (!session.orderedHold || !session.isCurrent() || !session.ownsOrderedHold()) return false
        if (session.orderedGeneration !== generation) continue

        let inventoryState = session.inventory.state()
        if (inventoryState.error) {
          if (!retry) return false
          await session.inventory.retry()
          inventoryState = session.inventory.state()
          if (inventoryState.pending || inventoryState.saving || inventoryState.error) return false
        }
        await session.inventory.save({ revision: inventoryState.revision, inventory: clone(hold.inventory) })
        inventoryState = session.inventory.state()
        if (inventoryState.pending || inventoryState.saving || inventoryState.error) return false
        if (session.orderedHold && session.orderedGeneration === generation) session.clearOrderedHold()
      }
      return true
    }
    session.startOrderedHold = function (retry) {
      const previous = session.orderedDriving
      if (previous) {
        if (!retry) return previous
        // A retry may be clicked in the microtask between a failed driver
        // resolving and its finally handler releasing this reference.
        return previous.then(() => {
          if (session.orderedDriving === previous) session.orderedDriving = null
          return session.startOrderedHold(true)
        })
      }
      const driving = session.enqueueOrdered(() => session.driveOrderedHold(retry))
      session.orderedDriving = driving
      driving.finally(() => {
        if (session.orderedDriving === driving) session.orderedDriving = null
      })
      return driving
    }
    return session
  }
  async function enter(handle) {
    const host = selectedHostAccount && selectedHostAccount()
    if (!host || !host.accountId) { active = null; emit(); return false }
    const accountId = host.accountId, token = ++sequence
    active = { accountId, loading: true, ready: false, inventory: { state: () => ({}) }, workspace: { state: () => ({}) } }
    emit()
    try {
      const [remoteInventory, remoteWorkspace, local] = await Promise.all([getInventory(accountId), getWorkspace(accountId), handle.getCloudBusinessSnapshot()])
      if (token !== sequence || selectedHostAccount()?.accountId !== accountId) return false
      const snapshot = {
        inventory: inventoryExists(remoteInventory) ? businessInventory(remoteInventory) : local.inventory,
        ...(workspaceExists(remoteWorkspace) ? workspaceFields(remoteWorkspace) : { planTargets: local.planTargets, bag: local.bag, experience: local.experience }),
      }
      // validate and atomically hydrate before creating writers; an invalid cloud
      // document rejects here and leaves the full local workspace intact.
      if (inventoryExists(remoteInventory) || workspaceExists(remoteWorkspace)) await handle.applyCloudBusinessSnapshot(snapshot)
      if (token !== sequence || selectedHostAccount()?.accountId !== accountId) return false
      // Re-read and replace the account writer on every entry. The writer key
      // revokes an older same-account instance without touching other accounts.
      const session = createSession(accountId, remoteInventory, remoteWorkspace, snapshot)
      sessions.set(accountId, session)
      // Keep `active` identical to the session object. Its queue methods close
      // over this object, including the held Inventory draft for a
      // Workspace-then-Inventory commit.
      session.loading = false
      session.ready = true
      active = session
      emit()
      // Bootstrap each empty cloud domain independently. Hydration cannot loop:
      // applyCloudBusinessSnapshot intentionally emits no business commit event.
      if (!inventoryExists(remoteInventory)) void session.inventory.save({ revision: 0, inventory: snapshot.inventory })
      if (!workspaceExists(remoteWorkspace)) void session.workspace.save({ revision: 0, ...workspaceFields({}), inventory: snapshot.inventory, planTargets: snapshot.planTargets, bag: snapshot.bag, experience: snapshot.experience })
      return true
    } catch (error) {
      if (token === sequence) {
        active = { accountId, loading: false, ready: false, error: new Error(errorMessage(error, '星石云端状态加载失败。')), inventory: { state: () => ({ error }) }, workspace: { state: () => ({ error }) } }
        emit()
      }
      return false
    }
  }
  function committed(event) {
    const session = active
    if (!session || !session.ready || session.replacing || event.accountId !== session.accountId || selectedHostAccount()?.accountId !== event.accountId) return false
    const saveInventory = () => session.inventory.save({ revision: session.inventory.state().revision, inventory: clone(event.snapshot.inventory) })
    const saveWorkspace = () => session.workspace.save({ revision: session.workspace.state().revision, ...workspaceFields({}), inventory: clone(event.snapshot.inventory), planTargets: clone(event.snapshot.planTargets), bag: clone(event.snapshot.bag), experience: clone(event.snapshot.experience) })
    if (event.inventoryChanged && event.workspaceChanged || session.orderedHold) {
      if (!session.coalesceOrderedHold(event.snapshot)) return false
      void session.startOrderedHold(false)
    } else if (event.inventoryChanged) void session.enqueue(saveInventory)
    else if (event.workspaceChanged) void session.enqueue(saveWorkspace)
    return event.inventoryChanged || event.workspaceChanged
  }
  function needsRetry() {
    if (!active?.ready) return false
    const inventory = active.inventory.state(), workspace = active.workspace.state()
    return Boolean(active.orderedHold || inventory.pending || inventory.error || workspace.pending || workspace.error)
  }
  async function replaceImport(snapshot) {
    if (!active?.ready || !selectedHostAccount()?.accountId || selectedHostAccount().accountId !== active.accountId) throw new Error('星石云端状态尚未就绪，请重新加载后重试。')
    const inventory = active.inventory.state(), workspace = active.workspace.state()
    if (active.orderedHold || inventory.pending || inventory.saving || inventory.error || workspace.pending || workspace.saving || workspace.error) {
      throw Object.assign(new Error('存在未完成的星石云端保存，请重新加载后重试。'), { status: 409 })
    }
    active.replacing = true
    emit()
    try {
      const saved = await replace(replacementBody(active.accountId, snapshot, inventory.revision, workspace.revision, active.nextEffectiveAt))
      if (!active?.replacing || selectedHostAccount()?.accountId !== active.accountId) throw new Error('账号已切换，导入结果未写入当前工作区。')
      const adoptedInventory = active.inventory.adopt(inventoryState(saved.inventory))
      const adoptedWorkspace = active.workspace.adopt(workspaceState(saved.workspace, snapshot))
      if (!adoptedInventory || !adoptedWorkspace) throw new Error('本地云端版本已变化，请重新加载后重试。')
      return saved
    } finally {
      if (active) active.replacing = false
      emit()
    }
  }
  return {
    enter,
    committed,
    retry: async () => {
      const session = active
      if (!session?.inventory?.retry || !session.workspace?.retry) return [false, false]
      if (!session.orderedHold) return Promise.all([session.inventory.retry(), session.workspace.retry()])
      if (session.restoredHoldAwaitingRetry) {
        session.restoredHoldAwaitingRetry = false
        emit()
      }
      const completed = await session.startOrderedHold(true)
      return [completed, completed]
    },
    needsRetry,
    replaceImport,
    state: () => active,
  }
}

export { cloudInventory, workspaceBody, replacementBody, inventorySame, workspaceSame }
