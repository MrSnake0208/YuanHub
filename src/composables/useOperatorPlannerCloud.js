import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import * as api from '../api/operatorPlanner.js'
import { emptyTrainingWorkspace } from '../data/operatorTrainingPlans.js'
import { buildPlannerMigration, migrationKey, readLocalPlannerBundle, readScheduleCache, scheduleBody, scheduleFromRemote, workspaceBody, workspaceFromRemote, writeScheduleCache } from '../data/operatorPlannerRemote.js'
import { createPlannerSnapshotWriter } from '../data/plannerSnapshotWriter.js'

const idle = () => ({ pending: null, saving: false, error: null, latest: null })
export function useOperatorPlannerCloud(props, targets, emit) {
  const workspace = ref(emptyTrainingWorkspace(props.accountId))
  const snapshot = shallowRef(null)
  const workspaceState = shallowRef(idle()), scheduleState = shallowRef(idle())
  const loading = ref(false), scheduleLoading = ref(false), error = ref('')
  const migration = shallowRef(null), migrationBusy = ref(false)
  let workspaceWriter = null, scheduleWriter = null, generation = 0, scheduleGeneration = 0, refreshPromise = null
  let localBundle = null, refreshAgain = false
  const workspacePending = computed(() => Boolean(workspaceState.value.pending || workspaceState.value.saving))
  const schedulePending = computed(() => Boolean(scheduleState.value.pending || scheduleState.value.saving))
  const blocked = computed(() => !props.isLoggedIn || !props.accountId || loading.value || scheduleLoading.value || Boolean(error.value)
    || migrationBusy.value || Boolean(migration.value) || workspacePending.value || Boolean(workspaceState.value.error || scheduleState.value.error))
  const getWorkspace = async account => workspaceFromRemote(await api.getTrainingWorkspace(account), account)
  const getSchedule = async (account, plan) => scheduleFromRemote(await api.getStaminaSchedule(account, plan), account)
  const storageKey = (account, name) => 'yuanhub:planner-cloud-draft:v1:' + account + ':' + name

  function installWorkspace(remote, token) {
    const account = remote.accountId
    workspace.value = remote
    workspaceWriter = createPlannerSnapshotWriter({ initial: remote, read: () => getWorkspace(account),
      write: async body => workspaceFromRemote(await api.putTrainingWorkspace(account, body), account), body: workspaceBody,
      storage: localStorage, key: storageKey(account, 'workspace'),
      onChange: state => { if (token === generation) workspaceState.value = state },
      onSaved: saved => { if (token === generation) workspace.value = saved }
    })
    workspaceState.value = workspaceWriter.state()
  }
  async function load() {
    const token = ++generation
    ++scheduleGeneration
    refreshPromise = null
    workspaceWriter = null; scheduleWriter = null
    workspaceState.value = idle(); scheduleState.value = idle(); snapshot.value = null
    workspace.value = emptyTrainingWorkspace(props.accountId)
    migration.value = null; localBundle = null; error.value = ''; scheduleLoading.value = false; migrationBusy.value = false; refreshAgain = false
    if (!props.isLoggedIn || !props.accountId) { loading.value = false; return }
    const account = props.accountId
    loading.value = true
    try {
      const remote = await getWorkspace(account)
      if (token !== generation) return
      installWorkspace(remote, token)
      const record = JSON.parse(localStorage.getItem(migrationKey(account)) || 'null')
      if (record?.request) migration.value = { request: record.request, resume: true }
      else if (!record?.done) {
        try {
          localBundle = readLocalPlannerBundle(localStorage, account)
          if (localBundle) migration.value = { local: localBundle, existingCloud: remote.revision > 0 }
        } catch (err) { migration.value = { localError: err.message } }
      }
    } catch (err) { if (token === generation) error.value = '云端培养计划读取失败：' + err.message }
    finally { if (token === generation) loading.value = false }
  }
  async function loadSchedule() {
    const token = ++scheduleGeneration, account = props.accountId, plan = workspace.value.activePlanId
    scheduleWriter = null; snapshot.value = null; scheduleState.value = idle()
    if (loading.value || !workspaceWriter || !props.isLoggedIn || !account) return
    const cached = readScheduleCache(localStorage, account, plan)
    if (cached) snapshot.value = cached
    scheduleLoading.value = true
    try {
      const remote = await getSchedule(account, plan)
      if (token !== scheduleGeneration) return
      writeScheduleCache(localStorage, account, plan, remote)
      scheduleWriter = createPlannerSnapshotWriter({ initial: remote, read: () => getSchedule(account, plan),
        write: async body => scheduleFromRemote(await api.putStaminaSchedule(account, plan, body), account), body: scheduleBody,
        storage: localStorage, key: storageKey(account, 'schedule:' + plan),
        onChange: state => { if (token === scheduleGeneration) scheduleState.value = state },
        onSaved: (saved, hasPending) => { if (token === scheduleGeneration && !hasPending) { snapshot.value = saved; writeScheduleCache(localStorage, account, plan, saved) } }
      })
      scheduleState.value = scheduleWriter.state()
      snapshot.value = scheduleState.value.pending || remote
    } catch (err) { if (token === scheduleGeneration) error.value = '云端日程读取失败：' + err.message }
    finally { if (token === scheduleGeneration) scheduleLoading.value = false }
  }
  async function saveWorkspace(next) {
    if (blocked.value || schedulePending.value || !workspaceWriter) return false
    return workspaceWriter.save(next)
  }
  function saveSchedule(next) {
    if (blocked.value || !scheduleWriter) return false
    // Keep input responsive while subsequent edits queue behind the current write.
    scheduleWriter.save(next)
    return !scheduleWriter.state().error
  }
  async function removeMember(plan, operator, graduate, annotationRevision) {
    if (blocked.value || schedulePending.value) return false
    const token = generation, account = props.accountId
    loading.value = true
    try {
      const data = await api.removeTrainingMember(account, plan, operator, {
        expected_revision: workspace.value.revision, graduate,
        ...(graduate ? { expected_annotation_revision: annotationRevision } : {})
      })
      if (token !== generation) return false
      installWorkspace(workspaceFromRemote(data.workspace, account), token)
      if (data.annotation) emit('annotation-updated', data.annotation)
      return true
    } catch (err) {
      if (token === generation) {
        // The transaction may have committed even when its response was lost.
        try { await workspaceWriter.refresh(); emit('refresh-operators'); emit('refresh-annotations') } catch (_) {}
      }
      throw err
    } finally { if (token === generation) loading.value = false }
  }
  function prepareMigration() {
    if (!localBundle || migrationBusy.value) return
    migration.value = { ...migration.value, request: buildPlannerMigration(localBundle, workspace.value, props.favoriteIds, targets.value), preview: true }
  }
  async function importLocal() {
    if (!migration.value?.request || migrationBusy.value) return
    const account = props.accountId, token = generation, request = migration.value.request
    migrationBusy.value = true; error.value = ''
    try {
      // Persist the exact request before sending: same receipt ID on every retry.
      localStorage.setItem(migrationKey(account), JSON.stringify({ request }))
      await api.importLocalTrainingWorkspace(account, request)
      localStorage.setItem(migrationKey(account), JSON.stringify({ done: true }))
      if (token === generation) await load()
    } catch (err) { if (token === generation) { migration.value = { ...migration.value, conflict: err.status === 409 }; error.value = '本机计划导入未完成，原数据仍保留：' + err.message } }
    finally { if (token === generation) migrationBusy.value = false }
  }
  async function keepCloud() {
    if (migrationBusy.value) return
    try {
      localStorage.setItem(migrationKey(props.accountId), JSON.stringify({ done: true }))
      await load()
    } catch (err) { error.value = '本机导入选择未保存：' + err.message }
  }
  async function compareMigrationAgain() {
    if (!migration.value?.conflict || migrationBusy.value) return
    try { localStorage.removeItem(migrationKey(props.accountId)); await load() }
    catch (err) { error.value = '无法重新比较本机计划：' + err.message }
  }
  async function recover(kind, discard = false) {
    const writer = kind === 'workspace' ? workspaceWriter : scheduleWriter
    if (!writer) return
    await (discard ? writer.discard() : writer.retry())
  }
  async function refresh() {
    if (workspacePending.value || schedulePending.value) { refreshAgain = true; return }
    if (loading.value || scheduleLoading.value || migration.value || error.value || !workspaceWriter || !scheduleWriter) return
    if (refreshPromise) { refreshAgain = true; return refreshPromise }
    refreshAgain = false
    const token = generation
    const workspaceReader = workspaceWriter, scheduleReader = scheduleWriter
    const currentRefresh = refreshPromise = (async () => {
      try {
        await Promise.all([workspaceReader.refresh(), scheduleReader.refresh()])
      } catch (err) { if (token === generation) error.value = '云端计划同步失败：' + err.message; return false }
      return true
    })()
    try { return await currentRefresh } finally {
      if (refreshPromise === currentRefresh) {
        refreshPromise = null
        if (refreshAgain && !workspacePending.value && !schedulePending.value && !loading.value && !scheduleLoading.value && !migration.value && !error.value) void refresh()
      }
    }
  }
  watch(() => [props.accountId, props.isLoggedIn], load, { immediate: true })
  watch(() => [workspace.value.accountId, workspace.value.activePlanId, loading.value], () => {
    if (!loading.value) loadSchedule()
  })
  watch(() => [workspacePending.value, schedulePending.value], () => {
    if (refreshAgain && !workspacePending.value && !schedulePending.value) refresh()
  })
  onBeforeUnmount(() => { ++generation; ++scheduleGeneration })
  return { workspace, snapshot, workspaceState, scheduleState, cloudLoading: loading, scheduleLoading, cloudError: error,
    migration, migrationBusy, cloudBlocked: blocked, workspacePending, schedulePending,
    loadCloud: load, saveWorkspace, saveSchedule, removeMember, prepareMigration, importLocal, keepCloud, compareMigrationAgain, recover, refreshCloud: refresh }
}
