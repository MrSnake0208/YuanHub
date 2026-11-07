import { computed, ref, watch } from 'vue'
import { createBattleDraft, battleDraftDiscError } from '../utils/battleImages.js'
import { battleCloudCacheKey, battleDraftKey, decodeBattleCloudCache, decodeBattleDraft, encodeBattleCloudCache, encodeBattleDraft, validateBattleDraft } from '../utils/battleDraft.js'
import { createBattleDraft as createCloudDraft, deleteBattleDraft, getBattleDraft, listBattleDrafts, saveBattleDraft } from '../api/battleDrafts.js'
import { dialog } from '../utils/dialog.js'

export const BATTLE_CLOUD_DRAFT_LIMIT = 5
const SYNC_DELAY = 1500

/**
 * 游客或无游戏账号：单份本机草稿（原行为）。
 * 已登录且选中游戏账号：该账号下最多 5 份云草稿；编辑即时写入本机缓存，停顿后按版本号同步云端。
 */
export function useBattleDraft(userId, accountId, accountGame) {
  const draft = ref(createBattleDraft()), status = ref(''), storageError = ref(''), blocked = ref(false), revision = ref(0)
  const discError = computed(() => battleDraftDiscError(draft.value))
  const saveError = computed(() => discError.value ? discError.value + '修正后自动保存，原存档未覆盖。' : storageError.value)
  const cloud = computed(() => Boolean(userId.value && accountId.value))
  const drafts = ref([]), currentId = ref(''), cloudLoading = ref(false), cloudError = ref(''), conflict = ref(false), syncing = ref(false), cloudUnavailable = ref(false)
  const localKey = computed(() => battleDraftKey(userId.value, accountId.value))
  const cacheKey = computed(() => cloud.value ? battleCloudCacheKey(userId.value, accountId.value) : '')
  // 页面用 key 判断异步操作期间是否换了草稿；云模式下切换草稿也算换范围。
  const key = computed(() => cloud.value ? cacheKey.value + ':' + currentId.value : localKey.value)
  const saved = ref('')
  let restoring = false, degraded = false, scopeSeq = 0, baseRevision = 0, cloudSaved = '', syncTimer = 0, syncPromise = null
  const dirty = computed(() => JSON.stringify(draft.value) !== saved.value)
  const blank = () => ({ ...createBattleDraft(), game: accountGame.value || '如鸢' })

  function apply(value, persisted = JSON.stringify(value)) {
    restoring = true; draft.value = value; saved.value = persisted; revision.value++; restoring = false
  }

  function save() {
    if (blocked.value) return false
    if (discError.value) { status.value = '命盘待修正，尚未保存'; return false }
    if (cloud.value && !currentId.value) return false
    try {
      if (cloud.value) localStorage.setItem(cacheKey.value, encodeBattleCloudCache(currentId.value, baseRevision, draft.value))
      else localStorage.setItem(localKey.value, encodeBattleDraft(draft.value))
      saved.value = JSON.stringify(draft.value)
      storageError.value = ''
    } catch {
      status.value = ''
      storageError.value = cloud.value ? '本机缓存未保存，云端同步完成前请勿关闭页面。' : '本机草稿未保存，请导出草稿文件备份后再离开。'
      if (!cloud.value) return false
    }
    if (cloud.value) { status.value = '已保存到本机，等待同步'; scheduleSync() } else status.value = '已保存到本机'
    return true
  }

  // ---------- 云端同步 ----------
  const cloudPending = () => cloud.value && Boolean(currentId.value) && JSON.stringify(draft.value) !== cloudSaved
  function scheduleSync() {
    clearTimeout(syncTimer)
    syncTimer = setTimeout(() => { void flush() }, SYNC_DELAY)
  }
  function summarize(record) {
    return { id: record.id, title: record.title, game: record.game, revision: record.revision, updated_at: record.updated_at }
  }
  function upsertSummary(record) {
    drafts.value = [summarize(record), ...drafts.value.filter(item => item.id !== record.id)]
  }
  /** 立即同步当前草稿；返回 true 表示云端已是最新（或无需同步）。 */
  async function flush() {
    clearTimeout(syncTimer); syncTimer = 0
    while (syncPromise) await syncPromise
    if (!cloudPending()) return !conflict.value
    if (conflict.value || discError.value || cloudLoading.value) return false
    syncPromise = push().finally(() => { syncPromise = null })
    return syncPromise
  }
  async function push() {
    const seq = scopeSeq, id = currentId.value, text = JSON.stringify(draft.value)
    let body
    try { body = validateBattleDraft(draft.value) } catch (reason) { cloudError.value = reason.message; return false }
    syncing.value = true
    try {
      const record = await saveBattleDraft(userId.value, accountId.value, id, baseRevision, body)
      if (seq !== scopeSeq || id !== currentId.value) return false
      baseRevision = record.revision; cloudSaved = text; cloudError.value = ''
      upsertSummary(record)
      writeCache()
      if (cloudPending()) { status.value = '已保存到本机，等待同步'; scheduleSync() } else status.value = '已同步到云端'
      return true
    } catch (reason) {
      if (seq !== scopeSeq || id !== currentId.value) return false
      if (reason?.code === 'battle_draft_revision_conflict') {
        conflict.value = true; cloudError.value = '这份云草稿已在其他设备更新，本机修改尚未同步。'
      } else if (reason?.code === 'battle_draft_not_found') {
        conflict.value = true; cloudError.value = '这份云草稿已在其他设备删除，本机内容仍保留。'
      } else {
        cloudError.value = '云端同步失败，修改已保存在本机，继续编辑时会自动重试。'
      }
      status.value = '尚未同步到云端'
      return false
    } finally { if (seq === scopeSeq) syncing.value = false }
  }
  function writeCache() {
    try { localStorage.setItem(cacheKey.value, encodeBattleCloudCache(currentId.value, baseRevision, draft.value)) } catch { /* 命盘错误或存储已满时保留上次缓存 */ }
  }
  function readCache() {
    try {
      const raw = localStorage.getItem(cacheKey.value)
      return raw ? decodeBattleCloudCache(raw) : null
    } catch { return null }
  }

  /** 打开一份云草稿记录；cache 为同一份草稿的本机缓存时，恢复未同步修改或询问冲突。 */
  async function open(record, seq, cache) {
    const remote = validateBattleDraft(record.draft)
    let value = remote, pending = false
    const remoteText = JSON.stringify(remote)
    if (cache?.id === record.id && JSON.stringify(cache.draft) !== remoteText) {
      if (cache.revision === record.revision) { value = cache.draft; pending = true }
      else if (await dialog.confirm({ title: '保留本机未同步的修改？', message: `“${record.title || '未命名攻略'}”已在其他设备更新，本机还有尚未同步的修改。保留本机修改会覆盖云端版本；使用云端版本会丢弃本机修改。`, confirmText: '保留本机修改', cancelText: '使用云端版本' })) {
        value = cache.draft; pending = true
      }
      if (seq !== scopeSeq) return
    }
    baseRevision = record.revision; cloudSaved = remoteText; conflict.value = false; cloudError.value = ''
    currentId.value = record.id
    apply(value)
    writeCache()
    status.value = pending ? '已保存到本机，等待同步' : '已同步到云端'
    if (pending) scheduleSync()
  }

  function resetCloud() {
    clearTimeout(syncTimer); syncTimer = 0
    drafts.value = []; currentId.value = ''; conflict.value = false; cloudError.value = ''; cloudUnavailable.value = false; syncing.value = false
    baseRevision = 0; cloudSaved = ''; degraded = false
  }

  // 旧版单份本机草稿：首次进入云草稿时作为一份云草稿迁移，成功后才删除本机原件。
  async function migrateLegacy(list) {
    let legacy
    try {
      const raw = localStorage.getItem(localKey.value)
      if (!raw) return list
      legacy = decodeBattleDraft(raw)
    } catch { return list }
    const empty = JSON.stringify({ ...legacy, game: '' }) === JSON.stringify({ ...createBattleDraft(), game: '' })
    if (!empty) {
      if (list.length >= BATTLE_CLOUD_DRAFT_LIMIT || legacy.game !== accountGame.value) return list
      list = [summarize(await createCloudDraft(userId.value, accountId.value, legacy)), ...list]
    }
    try { localStorage.removeItem(localKey.value) } catch { /* 下次进入再迁移，草稿数量上限会阻止重复堆积 */ }
    return list
  }

  async function loadCloud() {
    const seq = ++scopeSeq
    resetCloud()
    apply(blank())
    if (!accountGame.value) { cloudLoading.value = true; return }
    cloudLoading.value = true; status.value = ''
    const cache = readCache()
    try {
      let list = (await listBattleDrafts(userId.value, accountId.value))?.drafts || []
      if (seq !== scopeSeq) return
      list = await migrateLegacy(list)
      if (seq !== scopeSeq) return
      if (!list.length) {
        const record = await createCloudDraft(userId.value, accountId.value, validateBattleDraft(blank()))
        if (seq !== scopeSeq) return
        drafts.value = [summarize(record)]
        await open(record, seq, null)
        return
      }
      drafts.value = list
      const id = list.some(item => item.id === cache?.id) ? cache.id : list[0].id
      const record = await getBattleDraft(userId.value, accountId.value, id)
      if (seq !== scopeSeq) return
      await open(record, seq, cache)
    } catch (reason) {
      if (seq !== scopeSeq) return
      // 云端不可用时用本机缓存继续编辑；同步按缓存记录的版本号进行，冲突时再提示。
      if (cache && cache.draft.game === accountGame.value) {
        currentId.value = cache.id; baseRevision = cache.revision
        drafts.value = [{ id: cache.id, title: cache.draft.title, game: cache.draft.game, revision: cache.revision, updated_at: null }]
        apply(cache.draft); cloudSaved = ''; degraded = true
        cloudError.value = '云草稿列表读取失败，正在编辑本机缓存的草稿，恢复连接后会自动同步。'
      } else {
        cloudUnavailable.value = true
        cloudError.value = reason?.message ? `云草稿读取失败：${reason.message}` : '云草稿读取失败，请重试。'
      }
    } finally { if (seq === scopeSeq) cloudLoading.value = false }
  }

  /** 切换到另一份云草稿；当前草稿未能同步时拒绝切换，避免本机缓存被覆盖。 */
  async function switchTo(id) {
    if (!cloud.value || id === currentId.value || cloudLoading.value) return true
    if (!await flush()) return false
    const seq = ++scopeSeq
    cloudLoading.value = true
    try {
      const record = await getBattleDraft(userId.value, accountId.value, id)
      if (seq !== scopeSeq) return false
      await open(record, seq, null)
      return true
    } catch (reason) {
      if (seq === scopeSeq) cloudError.value = reason?.message ? `草稿打开失败：${reason.message}` : '草稿打开失败，请重试。'
      return false
    } finally { if (seq === scopeSeq) cloudLoading.value = false }
  }

  async function create(value = blank()) {
    if (!cloud.value || cloudLoading.value) return false
    if (drafts.value.length >= BATTLE_CLOUD_DRAFT_LIMIT) { cloudError.value = `每个账号最多 ${BATTLE_CLOUD_DRAFT_LIMIT} 份云草稿，请先删除不需要的草稿。`; return false }
    if (!await flush()) return false
    const seq = ++scopeSeq
    cloudLoading.value = true
    try {
      const record = await createCloudDraft(userId.value, accountId.value, validateBattleDraft(value))
      if (seq !== scopeSeq) return false
      upsertSummary(record)
      await open(record, seq, null)
      return true
    } catch (reason) {
      if (seq === scopeSeq) cloudError.value = reason?.message || '新建云草稿失败，请重试。'
      return false
    } finally { if (seq === scopeSeq) cloudLoading.value = false }
  }

  async function remove(id) {
    if (!cloud.value || cloudLoading.value) return false
    const removingCurrent = id === currentId.value
    const seq = removingCurrent ? ++scopeSeq : scopeSeq
    if (removingCurrent) { clearTimeout(syncTimer); cloudLoading.value = true }
    try {
      await deleteBattleDraft(userId.value, accountId.value, id).catch(reason => { if (reason?.code !== 'battle_draft_not_found') throw reason })
      if (seq !== scopeSeq) return false
      drafts.value = drafts.value.filter(item => item.id !== id)
      if (!removingCurrent) return true
      try { localStorage.removeItem(cacheKey.value) } catch { /* 缓存 id 已不在列表中，下次加载会忽略 */ }
      const next = drafts.value[0]
      const record = next ? await getBattleDraft(userId.value, accountId.value, next.id) : await createCloudDraft(userId.value, accountId.value, validateBattleDraft(blank()))
      if (seq !== scopeSeq) return true
      upsertSummary(record)
      await open(record, seq, null)
      return true
    } catch (reason) {
      if (seq === scopeSeq) {
        cloudError.value = reason?.message ? `删除失败：${reason.message}` : '删除失败，请重试。'
        if (removingCurrent && !drafts.value.some(item => item.id === currentId.value)) void loadCloud()
      }
      return false
    } finally { if (removingCurrent && seq === scopeSeq) cloudLoading.value = false }
  }

  /** 处理同步冲突：keepLocal 用本机内容覆盖云端（云端已删除则另存为新草稿），否则载入云端版本。 */
  async function resolveConflict(keepLocal) {
    const seq = scopeSeq, id = currentId.value
    try {
      if (!keepLocal) {
        const record = await getBattleDraft(userId.value, accountId.value, id)
        if (seq === scopeSeq) await open(record, seq, null)
        return
      }
      let latest = null
      try { latest = await getBattleDraft(userId.value, accountId.value, id) } catch (reason) { if (reason?.code !== 'battle_draft_not_found') throw reason }
      if (seq !== scopeSeq) return
      if (latest) {
        baseRevision = latest.revision; conflict.value = false; cloudError.value = ''
        await flush()
        return
      }
      drafts.value = drafts.value.filter(item => item.id !== id)
      // 原草稿已不存在，不再向它同步；内容另存为新云草稿。
      cloudSaved = JSON.stringify(draft.value); conflict.value = false; cloudError.value = ''
      if (!await create(draft.value)) cloudError.value ||= '另存为新云草稿失败，请导出草稿备份。'
    } catch (reason) {
      if (seq === scopeSeq) cloudError.value = reason?.message || '操作失败，请重试。'
    }
  }

  // ---------- 本机模式（游客或无游戏账号） ----------
  function loadLocal() {
    ++scopeSeq
    resetCloud(); cloudLoading.value = false
    blocked.value = false; storageError.value = ''; status.value = ''
    let value = createBattleDraft()
    try {
      const raw = localStorage.getItem(localKey.value)
      if (raw) { value = decodeBattleDraft(raw); status.value = '已恢复本机草稿' }
    } catch {
      blocked.value = true
      storageError.value = '本机草稿无法读取，原存档未覆盖。可导入备份，或确认覆盖本机存档。'
    }
    apply(value)
  }

  watch(() => JSON.stringify([userId.value, accountId.value, cloud.value ? accountGame.value || '' : '']), () => {
    blocked.value = false; storageError.value = ''
    if (cloud.value) void loadCloud()
    else loadLocal()
  }, { immediate: true, flush: 'sync' })
  watch(draft, () => { if (!restoring) save() }, { deep: true, flush: 'sync' })
  function replace(value) { draft.value = value; revision.value++ }
  function overwrite() { blocked.value = false; return save() }
  function retryCloud() { return cloudUnavailable.value || degraded ? loadCloud() : flush() }
  return {
    draft, key, revision, dirty, status, saveError, discError, blocked, save, replace, overwrite,
    cloud, drafts, currentId, cloudLoading, cloudError, cloudUnavailable, conflict, syncing,
    flush, switchTo, create, remove, resolveConflict, retryCloud,
  }
}
