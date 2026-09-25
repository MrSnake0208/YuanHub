<template>
  <section class="admin-version-panel" aria-label="关联版本">
    <header class="admin-version-head">
      <div>
        <span class="admin-version-kicker">VERSION / LINK</span>
        <h3>关联版本</h3>
      </div>
    </header>
    <p class="admin-version-hint">关联更新日志中的版本，不需要重复维护更新记录。</p>

    <div class="admin-version-grid">
      <label>
        <span>目标版本</span>
        <select v-model="targetId" class="feedback-form-control">
          <option value="">未指定</option>
          <option v-for="option in options" :key="'t-' + option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </label>
      <label>
        <span>完成版本</span>
        <select v-model="completedId" class="feedback-form-control">
          <option value="">未指定</option>
          <option v-for="option in options" :key="'c-' + option.id" :value="option.id">{{ option.label }}</option>
        </select>
      </label>
    </div>

    <p v-if="loadingVersions" class="admin-version-state" role="status">正在加载版本列表…</p>
    <p v-else-if="versionError" class="admin-version-state error" role="alert">{{ versionError }}</p>
    <p v-if="message" class="admin-version-message" role="status">{{ message }}</p>
    <p v-if="error" class="admin-version-error" role="alert">{{ error }}</p>

    <div class="admin-version-actions">
      <button class="feedback-primary-action" type="button" :disabled="busy || loadingVersions" @click="save">
        {{ busy ? '保存中…' : '保存版本关联' }}
      </button>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { listChangelog } from '@/api/changelog.js'

const props = defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  message: { type: String, default: '' },
  error: { type: String, default: '' }
})

const emit = defineEmits(['save'])

const options = ref([])
const loadingVersions = ref(false)
const versionError = ref('')
const targetId = ref('')
const completedId = ref('')

function sync() {
  targetId.value = props.item?.targetVersionId || ''
  completedId.value = props.item?.completedVersionId || ''
}

watch(() => props.item?.id, sync, { immediate: true })

async function loadVersions() {
  loadingVersions.value = true
  versionError.value = ''
  try {
    const result = await listChangelog({ page: 1, size: 100 })
    options.value = (result.data || [])
      .filter(entry => entry.id && entry.versionLabel)
      .map(entry => ({ id: entry.id, label: entry.versionLabel }))
  } catch (e) {
    versionError.value = e.message || '版本列表加载失败'
  } finally {
    loadingVersions.value = false
  }
}

function save() {
  if (props.busy) return
  emit('save', {
    targetVersionId: targetId.value || null,
    completedVersionId: completedId.value || null
  })
}

onMounted(loadVersions)
</script>

<style scoped>
.admin-version-panel { margin: 0 0 16px; padding: 16px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.admin-version-kicker { display: block; margin-bottom: 5px; color: var(--accent-strong); font: 800 10px var(--font-d); letter-spacing: .16em; }
.admin-version-head h3 { color: var(--feedback-text); font-family: var(--font-s); font-size: 17px; font-weight: 900; }
.admin-version-hint { margin-top: 9px; color: var(--feedback-text-muted); font-size: 12px; line-height: 1.7; }
.admin-version-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
.admin-version-grid label { min-width: 0; display: grid; gap: 6px; }
.admin-version-grid label > span { color: var(--feedback-text-muted); font-size: 12px; font-weight: 800; }
.admin-version-state { margin-top: 12px; color: var(--feedback-text-muted); font-size: 12px; }
.admin-version-state.error,.admin-version-error { margin-top: 12px; color: var(--feedback-danger); font-size: 12px; font-weight: 700; }
.admin-version-message { margin-top: 12px; color: var(--feedback-success); font-size: 12px; font-weight: 700; }
.admin-version-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
@media (max-width: 640px) {
  .admin-version-grid { grid-template-columns: 1fr; }
}
</style>
