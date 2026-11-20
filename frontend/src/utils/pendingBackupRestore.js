import { onScopeDispose, shallowReactive, shallowReadonly, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { activeAccount } from '../store/activeAccount.js'
import { auth } from '../store/auth.js'
import { BACKUP_PARTS } from './backupFile.js'

const pending = shallowRef(null)
const selectedBackup = shallowRef(null)
export const fullBackupRestore = shallowReadonly(selectedBackup)
let release = () => {}
let releaseSelectedBackup = () => {}

export function backupRestoreOwner() {
  return JSON.stringify([auth.isLoggedIn, auth.userInfo?.id, activeAccount.id, activeAccount.gameFor(activeAccount.id)])
}

export function rememberFullBackup(backup, filename) {
  releaseSelectedBackup()
  const entry = { backup, filename, owner: backupRestoreOwner(), id: Symbol(), openedParts: shallowReactive(new Set()) }
  const stop = watch(backupRestoreOwner, () => releaseSelectedBackup(), { flush: 'sync' })
  const timer = setTimeout(() => releaseSelectedBackup(), 30 * 60 * 1000)
  releaseSelectedBackup = () => {
    stop()
    clearTimeout(timer)
    releaseSelectedBackup = () => {}
    selectedBackup.value = null
  }
  selectedBackup.value = entry
}

export function clearFullBackupRestore() {
  releaseSelectedBackup()
}

export function stageBackupRestore(key, file, sourceGame) {
  release()
  const owner = backupRestoreOwner(), backup = fullBackupRestore.value
  const entry = { key, file, sourceGame, owner, backupId: backup?.owner === owner ? backup.id : undefined }
  const stop = watch(backupRestoreOwner, () => release(), { flush: 'sync' })
  const timer = setTimeout(() => release(), 5 * 60 * 1000)
  release = () => {
    stop()
    clearTimeout(timer)
    pending.value = null
    release = () => {}
  }
  pending.value = entry
  return () => { if (pending.value === entry) release() }
}

export function hasPendingBackupRestore(key) {
  return pending.value?.key === key && pending.value.owner === backupRestoreOwner()
}

export function usePendingBackupRestore(keys, ready, openFile) {
  const router = useRouter()
  if (!router?.currentRoute) return
  let disposed = false, handling = false, observedEntry = null
  onScopeDispose(() => {
    disposed = true
    if (observedEntry && pending.value === observedEntry) release()
  })
  watch(() => {
    const route = router.currentRoute.value
    const key = route.query?.restore
    if (!keys.includes(key) || route.name !== BACKUP_PARTS[key].route) return null
    const entry = hasPendingBackupRestore(key) ? pending.value : null
    return { key, entry, ready: !!entry && ready(key) }
  }, async request => {
    if (!request || handling) return
    observedEntry = request.entry
    if (request.entry && !request.ready) return
    handling = true
    const { entry, key } = request
    const route = router.currentRoute.value
    const { restore, ...query } = route.query
    let ownerChanged = false
    const stop = watch(backupRestoreOwner, () => { ownerChanged = true }, { flush: 'sync' })
    try {
      if (entry) release()
      try { if (await router.replace({ path: route.path, query, hash: route.hash })) return } catch { return }
      const current = () => {
        const activeRoute = router.currentRoute.value
        return !disposed && !ownerChanged && activeRoute.name === route.name && !activeRoute.query.restore &&
          entry?.owner === backupRestoreOwner() && ready(key)
      }
      if (entry && current()) await openFile(entry, () => {
        if (!current()) return false
        const backup = fullBackupRestore.value
        if (backup && backup.id === entry.backupId) backup.openedParts.add(key)
        return true
      })
    } finally {
      stop()
      handling = false
    }
  }, { immediate: true, flush: 'post' })
}
