import { computed, ref, watch } from 'vue'
import { createBattleDraft, battleDraftDiscError } from '../utils/battleImages.js'
import { battleDraftKey, decodeBattleDraft, encodeBattleDraft } from '../utils/battleDraft.js'

export function useBattleDraft(userId, accountId) {
  const draft = ref(createBattleDraft()), status = ref(''), storageError = ref(''), blocked = ref(false), revision = ref(0)
  const discError = computed(() => battleDraftDiscError(draft.value))
  const saveError = computed(() => discError.value ? discError.value + '修正后自动保存，原存档未覆盖。' : storageError.value)
  const key = computed(() => battleDraftKey(userId.value, accountId.value))
  const saved = ref('')
  let restoring = false, currentKey = ''
  const dirty = computed(() => JSON.stringify(draft.value) !== saved.value)
  function save() {
    if (blocked.value) return false
    if (discError.value) { status.value = '命盘待修正，尚未保存'; return false }
    try {
      localStorage.setItem(currentKey, encodeBattleDraft(draft.value))
      saved.value = JSON.stringify(draft.value)
      storageError.value = ''; status.value = '已保存到本机'; return true
    } catch {
      status.value = ''
      storageError.value = '本机草稿未保存，请导出草稿文件备份后再离开。'
      return false
    }
  }
  watch(key, next => {
    restoring = true; currentKey = next; blocked.value = false; storageError.value = ''; status.value = ''
    let value = createBattleDraft()
    try {
      const raw = localStorage.getItem(next)
      if (raw) { value = decodeBattleDraft(raw); status.value = '已恢复本机草稿' }
    } catch {
      blocked.value = true
      storageError.value = '本机草稿无法读取，原存档未覆盖。可导入备份，或确认覆盖本机存档。'
    }
    draft.value = value; saved.value = JSON.stringify(value); revision.value++; restoring = false
  }, { immediate: true, flush: 'sync' })
  watch(draft, () => { if (!restoring) save() }, { deep: true, flush: 'sync' })
  function replace(value) { draft.value = value; revision.value++ }
  function overwrite() { blocked.value = false; return save() }
  return { draft, key, revision, dirty, status, saveError, discError, blocked, save, replace, overwrite }
}
