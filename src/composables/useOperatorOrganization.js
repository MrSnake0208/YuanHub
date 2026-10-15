import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getOperatorOrganization, putOperatorOrganization } from '../api/operator.js'
import { emptyOperatorOrganization, operatorOrganizationContent } from '../utils/operatorOrganization.js'

export function useOperatorOrganization(accountId, enabled) {
  const data = ref({ ...emptyOperatorOrganization(), revision: 0 })
  const loading = ref(false), saving = ref(false), loaded = ref(false), error = ref(''), conflicted = ref(false)
  let scope = 0, readSequence = 0, disposed = false
  const current = (target, generation) => !disposed && scope === generation && accountId.value === target && enabled.value
  const ready = computed(() => loaded.value && !loading.value && !saving.value && !conflicted.value)

  function response(value, target) {
    if (value?.account_id !== target || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('分类响应账号或版本无效')
    return { ...operatorOrganizationContent(value), revision: value.revision }
  }

  async function reload() {
    if (!accountId.value || !enabled.value || saving.value) return false
    const target = accountId.value, generation = scope, sequence = ++readSequence
    loading.value = true; error.value = ''
    try {
      const incoming = response(await getOperatorOrganization(target), target)
      if (!current(target, generation) || sequence !== readSequence) return false
      if (incoming.revision >= data.value.revision) data.value = incoming
      loaded.value = true; conflicted.value = false
      return true
    } catch (err) {
      if (current(target, generation) && sequence === readSequence) error.value = err.message || '分类加载失败，请重试'
      return false
    } finally {
      if (current(target, generation) && sequence === readSequence) loading.value = false
    }
  }

  async function save(content, expectedRevision = data.value.revision) {
    if (!ready.value) return false
    const target = accountId.value, generation = scope
    saving.value = true; error.value = ''; ++readSequence
    try {
      const incoming = response(await putOperatorOrganization(target, { ...operatorOrganizationContent(content), expected_revision: expectedRevision }), target)
      if (!current(target, generation)) return false
      data.value = incoming
      return true
    } catch (err) {
      if (current(target, generation)) {
        error.value = err.message || '分类保存失败，请重试'
        conflicted.value = err.code === 'operator_organization_revision_conflict' || err.status === 409
      }
      return false
    } finally {
      if (current(target, generation)) saving.value = false
    }
  }

  watch(() => enabled.value ? accountId.value : '', () => {
    ++scope; ++readSequence
    data.value = { ...emptyOperatorOrganization(), revision: 0 }
    loading.value = saving.value = loaded.value = conflicted.value = false; error.value = ''
    void reload()
  }, { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => { disposed = true; ++scope; ++readSequence })
  return { data, loading, saving, loaded, error, conflicted, ready, reload, save }
}
