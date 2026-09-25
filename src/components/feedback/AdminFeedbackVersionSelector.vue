<template>
  <section class="admin-version-panel" :class="{ open }" aria-label="关联版本设置">
    <button
      class="admin-version-trigger"
      type="button"
      :aria-expanded="open"
      :aria-controls="panelId"
      :disabled="busy"
      @click="open = !open"
    >
      <span class="admin-version-heading">
        <span class="admin-version-kicker">VERSION / LINK</span>
        <strong>关联版本</strong>
      </span>
      <span class="admin-version-summary">
        <span class="admin-version-summary-text">{{ summaryText }}</span>
        <ChevronDown :size="17" class="admin-version-chevron" aria-hidden="true" />
      </span>
    </button>

    <div v-show="open" :id="panelId" class="admin-version-body">
      <p class="admin-version-hint">目标版本可以选择尚未发布的草稿；完成版本只允许关联已经发布的更新日志。</p>

      <div class="admin-version-grid">
        <label>
          <span>目标版本</span>
          <select v-model="targetId" class="feedback-form-control">
            <option value="">未指定</option>
            <option v-for="option in options" :key="'t-' + option.id" :value="option.id">
              {{ option.versionLabel }}{{ option.published ? '' : '（草稿）' }}
            </option>
          </select>
        </label>
        <label>
          <span>完成版本</span>
          <select v-model="completedId" class="feedback-form-control">
            <option value="">未指定</option>
            <option v-for="option in publishedOptions" :key="'c-' + option.id" :value="option.id">{{ option.versionLabel }}</option>
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
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { listFeedbackVersionOptions } from '@/api/feedback.js'

const props = defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  message: { type: String, default: '' },
  error: { type: String, default: '' }
})

const emit = defineEmits(['save'])

const options = ref([])
const publishedOptions = computed(() => options.value.filter(option => option.published))
const loadingVersions = ref(false)
const versionError = ref('')
const targetId = ref('')
const completedId = ref('')
const open = ref(false)
const panelId = computed(() => `admin-feedback-version-${String(props.item?.id || 'current').replace(/[^a-zA-Z0-9_-]/g, '-')}`)
const summaryText = computed(() => {
  const targetId = String(props.item?.targetVersionId || '')
  const completedId = String(props.item?.completedVersionId || '')
  const target = props.item?.targetVersionLabel || options.value.find(option => String(option.id) === targetId)?.versionLabel || ''
  const completed = props.item?.completedVersionLabel || options.value.find(option => String(option.id) === completedId)?.versionLabel || ''
  if (target && completed) return `目标 ${target} · 完成 ${completed}`
  if (target) return `目标 ${target}`
  if (completed) return `完成 ${completed}`
  return '尚未关联版本'
})

function sync() {
  targetId.value = props.item?.targetVersionId || ''
  completedId.value = props.item?.completedVersionId || ''
}

watch(() => props.item?.id, sync, { immediate: true })
watch(() => props.item?.id, () => { open.value = false })

async function loadVersions() {
  loadingVersions.value = true
  versionError.value = ''
  try {
    options.value = await listFeedbackVersionOptions()
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
.admin-version-panel { overflow: hidden; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.admin-version-trigger { width: 100%; min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 14px; border: 0; background: transparent; color: var(--feedback-text); text-align: left; cursor: pointer; }
.admin-version-trigger:hover { background: var(--feedback-panel-hover); }
.admin-version-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.admin-version-trigger:disabled { cursor: wait; }
.admin-version-heading { min-width: 0; display: block; }
.admin-version-kicker { display: block; margin-bottom: 5px; color: var(--accent-strong); font: 800 10px var(--font-d); letter-spacing: .16em; }
.admin-version-heading strong { display: block; color: var(--feedback-text); font-family: var(--font-s); font-size: 15px; font-weight: 900; }
.admin-version-summary { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.admin-version-summary-text { max-width: 320px; overflow: hidden; color: var(--feedback-text-muted); font-size: 11.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.admin-version-chevron { flex: none; color: var(--feedback-text-dim); transition: transform .16s ease; }
.admin-version-panel.open .admin-version-chevron { transform: rotate(180deg); }
.admin-version-body { padding: 0 14px 14px; border-top: 1px solid var(--feedback-line); }
.admin-version-hint { margin-top: 12px; color: var(--feedback-text-muted); font-size: 12px; line-height: 1.7; }
.admin-version-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
.admin-version-grid label { min-width: 0; display: grid; gap: 6px; }
.admin-version-grid label > span { color: var(--feedback-text-muted); font-size: 12px; font-weight: 800; }
.admin-version-state { margin-top: 12px; color: var(--feedback-text-muted); font-size: 12px; }
.admin-version-state.error,.admin-version-error { margin-top: 12px; color: var(--feedback-danger); font-size: 12px; font-weight: 700; }
.admin-version-message { margin-top: 12px; color: var(--feedback-success); font-size: 12px; font-weight: 700; }
.admin-version-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
@media (max-width: 640px) {
  .admin-version-trigger { align-items: flex-start; }
  .admin-version-summary { align-items: flex-end; flex-direction: column; gap: 5px; }
  .admin-version-summary-text { max-width: 180px; }
  .admin-version-grid { grid-template-columns: 1fr; }
}
</style>
