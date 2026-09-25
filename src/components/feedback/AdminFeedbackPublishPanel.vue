<template>
  <section class="admin-public-panel" :class="{ open }" aria-label="反馈广场发布设置">
    <button
      class="admin-public-trigger"
      type="button"
      :aria-expanded="open"
      :aria-controls="panelId"
      :disabled="busy"
      @click="open = !open"
    >
      <span class="admin-public-heading">
        <span class="admin-public-kicker">PLAZA / PUBLISH</span>
        <strong>{{ isPublic ? '反馈广场' : '发布到反馈广场' }}</strong>
      </span>
      <span class="admin-public-summary">
        <span v-if="isPublic" class="admin-public-flag">PUBLIC</span>
        <span class="admin-public-summary-text">{{ summaryText }}</span>
        <ChevronDown :size="17" class="admin-public-chevron" aria-hidden="true" />
      </span>
    </button>

    <div v-show="open" :id="panelId" class="admin-public-body">
      <p class="admin-public-hint">
        发布后只展示你填写的公开标题与摘要；用户原始正文、附件与账号信息不会公开。
      </p>

      <div class="admin-public-grid">
        <label class="full">
          <span>公开标题</span>
          <input v-model="form.publicTitle" class="feedback-form-control" maxlength="120" placeholder="整理后的公开标题" />
        </label>
        <label class="full">
          <span>公开摘要</span>
          <textarea v-model="form.publicSummary" class="feedback-form-control" rows="3" maxlength="1000" placeholder="适合公开展示的描述，不要包含用户隐私"></textarea>
        </label>
        <label>
          <span>反馈类型</span>
          <select v-model="form.type" class="feedback-form-control">
            <option v-for="option in typeOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
          </select>
        </label>
        <label>
          <span>公开状态</span>
          <select v-model="form.publicStatus" class="feedback-form-control">
            <option v-for="option in statusOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
          </select>
        </label>
      </div>

      <dl class="admin-public-stats">
        <div><dt>支持</dt><dd>{{ item.supportCount || 0 }}</dd></div>
        <div><dt>已合并</dt><dd>{{ item.mergedCount || 0 }}</dd></div>
        <div v-if="isPublic && item.publishedAt"><dt>公开于</dt><dd>{{ formatDate(item.publishedAt) }}</dd></div>
      </dl>

      <p v-if="message" class="admin-public-message" role="status">{{ message }}</p>
      <p v-if="error" class="admin-public-error" role="alert">{{ error }}</p>

      <div class="admin-public-actions">
        <button class="feedback-primary-action" type="button" :disabled="busy || !form.publicTitle.trim()" @click="save">
          {{ busy ? '处理中…' : (isPublic ? '保存修改' : '发布到反馈广场') }}
        </button>
        <button v-if="isPublic" class="feedback-button" type="button" :disabled="busy" @click="$emit('unpublish')">
          取消公开
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { PUBLIC_STATUS_OPTIONS, PUBLIC_TYPE_OPTIONS } from '@/utils/feedbackPublic.js'

const props = defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  message: { type: String, default: '' },
  error: { type: String, default: '' },
  formatDate: { type: Function, required: true }
})

const emit = defineEmits(['save', 'unpublish'])

const statusOptions = PUBLIC_STATUS_OPTIONS
const typeOptions = PUBLIC_TYPE_OPTIONS
const isPublic = computed(() => String(props.item?.visibility || '').toUpperCase() === 'PUBLIC')
const open = ref(false)
const panelId = computed(() => `admin-feedback-public-${String(props.item?.id || 'current').replace(/[^a-zA-Z0-9_-]/g, '-')}`)
const summaryText = computed(() => {
  if (!isPublic.value) return '未发布'
  const publicStatus = String(props.item?.publicStatus || '').trim().toUpperCase()
  const state = statusOptions.find(option => option.key === publicStatus)?.label || '已发布'
  return `${state} · ${Number(props.item?.supportCount || 0)} 人支持`
})

const form = reactive({ publicTitle: '', publicSummary: '', publicStatus: 'COLLECTING', type: 'BUG' })

function sync() {
  form.publicTitle = props.item?.publicTitle || props.item?.title || ''
  form.publicSummary = props.item?.publicSummary || ''
  form.publicStatus = props.item?.publicStatus || 'COLLECTING'
  form.type = props.item?.type || 'BUG'
}

watch(() => [props.item?.id, props.item?.visibility], sync, { immediate: true })
watch(() => props.item?.id, () => { open.value = false })

function save() {
  const publicTitle = form.publicTitle.trim()
  if (!publicTitle || props.busy) return
  emit('save', {
    publicTitle,
    publicSummary: form.publicSummary.trim() || null,
    publicStatus: form.publicStatus || 'COLLECTING',
    type: form.type || undefined
  })
}
</script>

<style scoped>
.admin-public-panel { overflow: hidden; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.admin-public-trigger { width: 100%; min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 14px; border: 0; background: transparent; color: var(--feedback-text); text-align: left; cursor: pointer; }
.admin-public-trigger:hover { background: var(--feedback-panel-hover); }
.admin-public-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.admin-public-trigger:disabled { cursor: wait; }
.admin-public-heading { min-width: 0; display: block; }
.admin-public-kicker { display: block; margin-bottom: 5px; color: var(--accent-strong); font: 800 10px var(--font-d); letter-spacing: .16em; }
.admin-public-heading strong { display: block; color: var(--feedback-text); font-family: var(--font-s); font-size: 15px; font-weight: 900; }
.admin-public-summary { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.admin-public-summary-text { max-width: 260px; overflow: hidden; color: var(--feedback-text-muted); font-size: 11.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.admin-public-flag { padding: 3px 8px; border: 1px solid var(--brand-blue); border-radius: 5px; color: var(--brand-blue); font: 800 10px var(--font-d); letter-spacing: .1em; }
.admin-public-chevron { flex: none; color: var(--feedback-text-dim); transition: transform .16s ease; }
.admin-public-panel.open .admin-public-chevron { transform: rotate(180deg); }
.admin-public-body { padding: 0 14px 14px; border-top: 1px solid var(--feedback-line); }
.admin-public-hint { margin-top: 12px; color: var(--feedback-text-muted); font-size: 12px; line-height: 1.7; }
.admin-public-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
.admin-public-grid label { min-width: 0; display: grid; gap: 6px; }
.admin-public-grid label > span { color: var(--feedback-text-muted); font-size: 12px; font-weight: 800; }
.admin-public-grid .full { grid-column: 1 / -1; }
.admin-public-stats { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 14px; }
.admin-public-stats div { display: inline-flex; align-items: baseline; gap: 6px; }
.admin-public-stats dt { color: var(--feedback-text-dim); font-size: 10px; font-weight: 800; }
.admin-public-stats dd { color: var(--feedback-text); font: 12px var(--font-d); font-weight: 700; }
.admin-public-message { margin-top: 12px; color: var(--feedback-success); font-size: 12px; font-weight: 700; }
.admin-public-error { margin-top: 12px; color: var(--feedback-danger); font-size: 12px; font-weight: 700; }
.admin-public-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
@media (max-width: 640px) {
  .admin-public-trigger { align-items: flex-start; }
  .admin-public-summary { align-items: flex-end; flex-direction: column; gap: 5px; }
  .admin-public-summary-text { max-width: 150px; }
  .admin-public-grid { grid-template-columns: 1fr; }
  .admin-public-grid .full { grid-column: auto; }
}
</style>
