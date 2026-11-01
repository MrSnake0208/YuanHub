import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { auth } from '../store/auth.js'
import { getCustomSpendTemplates, putCustomSpendTemplates } from '../api/customSpendTemplates.js'
import { validateCustomSpendTemplates } from '../data/customPlannerSpends.js'
import { createPlannerSnapshotWriter } from '../data/plannerSnapshotWriter.js'

export const customSpendTemplatesBody = (value, revision) => ({ schema_version: 1, expected_revision: revision,
  templates: validateCustomSpendTemplates(value.templates).map(({ costPer, ...item }) => ({ ...item, cost_per: costPer })) })

export function decodeCustomSpendTemplates(data) {
  if (data?.schema_version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('常用支出版本无效，请更新页面后重试')
  return { revision: data.revision, templates: validateCustomSpendTemplates(data.templates.map(({ cost_per, ...item }) => ({ ...item, costPer: cost_per }))) }
}

export function useCustomSpendTemplates() {
  const owner = computed(() => auth.isLoggedIn ? String(auth.userInfo?.id || '') : '')
  const remote = shallowRef({ templates: [], revision: 0 }), state = shallowRef({}), loading = ref(false), loadError = ref('')
  const templates = computed(() => state.value.pending?.templates || remote.value.templates)
  const error = computed(() => loadError.value || state.value.error?.message || '')
  const blocked = computed(() => !owner.value || loading.value || !!error.value || !!state.value.saving)
  let writer = null, epoch = 0, alive = true
  const current = (user, token) => alive && owner.value === user && epoch === token
  async function load() {
    const user = owner.value, token = ++epoch
    writer = null; state.value = {}; remote.value = { templates: [], revision: 0 }; loadError.value = ''
    if (!user) { loading.value = false; return }
    loading.value = true
    const read = async () => decodeCustomSpendTemplates(await getCustomSpendTemplates(user))
    try {
      const initial = await read()
      if (!current(user, token)) return
      remote.value = initial
      writer = createPlannerSnapshotWriter({ initial, read, write: async body => {
        if (!current(user, token)) throw new Error('登录账号已切换，请重新打开常用支出')
        return decodeCustomSpendTemplates(await putCustomSpendTemplates(body, user))
      }, body: customSpendTemplatesBody, storage: localStorage,
      key: 'yuanhub:custom-spend-templates:draft:v1:' + encodeURIComponent(user),
      onChange: value => { if (current(user, token)) state.value = value },
      onSaved: value => { if (current(user, token)) remote.value = value } })
      state.value = writer.state()
      return true
    } catch (err) { if (current(user, token)) loadError.value = err.message || '常用支出读取失败，请重试'; return false }
    finally { if (current(user, token)) loading.value = false }
  }
  async function save(items) {
    if (!writer || blocked.value) return false
    const user = owner.value, token = epoch
    const next = validateCustomSpendTemplates(items)
    if (JSON.stringify(customSpendTemplatesBody({ templates: next }, 0)) === JSON.stringify(customSpendTemplatesBody(remote.value, 0))) return true
    const ok = await writer.save({ templates: next })
    return ok && current(user, token)
  }
  watch(owner, load, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => { alive = false; epoch++ })
  return { owner, templates, loading, state, error, blocked, save, reload: load,
    retry: () => writer ? writer.retry() : load(), discard: async () => {
      if (writer) return writer.discard()
      if (owner.value) localStorage.removeItem('yuanhub:custom-spend-templates:draft:v1:' + encodeURIComponent(owner.value))
      return load()
    } }
}
