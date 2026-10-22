import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getRelationshipCatalog, getRelationships, patchRelationships } from '../api/operatorRelationships.js'
export function useOperatorRelationships(scope) {
  const data = ref(null), catalog = ref(null), loading = ref(false), saving = ref(false), error = ref(''), conflicted = ref(false)
  let generation = 0, sequence = 0, disposed = false
  const current = (key, gen) => !disposed && gen === generation && key === scope.value.key
  const ready = computed(() => !!data.value && !!catalog.value && !loading.value && !saving.value && !conflicted.value)
  function validate(value, target, rules) {
    if (value?.account_id !== target.accountId || value?.game !== target.game || value?.catalog_version !== rules?.version || rules?.game !== target.game || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('账号或规则版本不一致，请重新读取')
    return value
  }
  async function reload() {
    const target = { ...scope.value }, gen = generation, seq = ++sequence
    if (!target.enabled || saving.value) return false
    loading.value = true; error.value = ''
    try {
      const [rules, records] = await Promise.all([getRelationshipCatalog(target.game), getRelationships(target.accountId)])
      validate(records, target, rules)
      if (!current(target.key, gen) || sequence !== seq) return false
      data.value = records; catalog.value = rules; conflicted.value = false
      return true
    } catch (err) {
      if (current(target.key, gen) && sequence === seq) { error.value = err.message || '读取失败'; conflicted.value = true }
      return false
    } finally { if (current(target.key, gen) && sequence === seq) loading.value = false }
  }
  async function save(entries, expectedRevision = data.value?.revision) {
    if (!ready.value) return false
    const target = { ...scope.value }, gen = generation, rules = catalog.value
    saving.value = true; error.value = ''; ++sequence
    try {
      const incoming = validate(await patchRelationships(target.accountId, { expected_revision: expectedRevision, catalog_version: rules.version, entries }), target, rules)
      if (!current(target.key, gen)) return false
      data.value = incoming; return true
    } catch (err) {
      if (current(target.key, gen)) { error.value = err.message || '保存失败'; conflicted.value = err.status === 409 || err.code === 'operator_relationship_conflict' }
      return false
    } finally { if (current(target.key, gen)) saving.value = false }
  }
  watch(() => scope.value.key, () => {
    generation++; sequence++; data.value = catalog.value = null; loading.value = saving.value = conflicted.value = false; error.value = ''
    void reload()
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => { disposed = true; generation++ })
  return { data, catalog, loading, saving, error, conflicted, ready, reload, save }
}
