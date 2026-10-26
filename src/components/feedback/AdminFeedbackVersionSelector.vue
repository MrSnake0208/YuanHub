<template>
  <section class="admin-version-panel" :class="{ open: open || dialog, dialog }" aria-label="关联版本设置">
    <button
      v-if="!dialog"
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

    <div v-show="open || dialog" :id="panelId" class="admin-version-body">
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
  dialog: { type: Boolean, default: false },
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
    options.value = await listFeedbackVersionOptions(props.item.spaceId || 'yuanhub')
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.admin-version-panel { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.admin-version-panel.dialog { border: 0; border-radius: 0; background: transparent; }
.admin-version-panel.dialog .admin-version-body { border-top: 0; }
.admin-version-trigger { border: 0; background: transparent; color: var(--feedback-text); cursor: pointer; }
.admin-version-trigger:hover { background: var(--feedback-panel-hover); }
.admin-version-trigger:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: -2px; }
.admin-version-trigger:disabled { cursor: wait; }
.admin-version-kicker { color: var(--theme-accent-text, var(--accent-strong)); }
.admin-version-heading strong { color: var(--feedback-text); }
.admin-version-summary-text { color: var(--feedback-text-muted); }
.admin-version-chevron { color: var(--feedback-text-dim); transition: transform .16s ease; }
.admin-version-body { border-top: 1px solid var(--feedback-line); }
.admin-version-hint { color: var(--feedback-text-muted); }
.admin-version-grid label > span { color: var(--feedback-text-muted); }
.admin-version-state { color: var(--feedback-text-muted); }
.admin-version-state.error,.admin-version-error { color: var(--feedback-danger); }
.admin-version-message { color: var(--feedback-success); }
</style>
<style scoped src="./adminFeedbackVersionSelectorDesktop.css"></style>
<style scoped src="./adminFeedbackVersionSelectorMobile.css"></style>
