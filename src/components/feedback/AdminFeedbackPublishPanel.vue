<template>
  <section class="admin-public-panel" :class="{ open: open || dialog, dialog }" aria-label="反馈广场发布设置">
    <button
      v-if="!dialog"
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

    <div v-show="open || dialog" :id="panelId" class="admin-public-body">
      <p class="admin-public-hint">
        {{ isReport ? '举报工单仅供私下处理，不能发布到反馈广场。' : canPublish ? '用户已允许整理到反馈广场。发布后只展示公开标题与摘要；原始正文、附件与账号信息不会公开。' : '用户未授权发布到反馈广场，不能发布或修改公开正文；已公开的内容仍可更新状态或取消公开。' }}
      </p>

      <div class="admin-public-grid">
        <label class="full">
          <span>公开标题</span>
          <input v-model="form.publicTitle" class="feedback-form-control" :disabled="!canPublish" maxlength="120" placeholder="整理后的公开标题" />
        </label>
        <label class="full">
          <span>公开摘要</span>
          <textarea v-model="form.publicSummary" class="feedback-form-control" :disabled="!canPublish" rows="3" maxlength="1000" placeholder="适合公开展示的描述，不要包含用户隐私"></textarea>
        </label>
        <label>
          <span>公开状态</span>
          <small>管理员结案时可同步完成；其余进度在这里维护。</small>
          <select v-model="form.publicStatus" class="feedback-form-control" :disabled="!canPublish && !isPublic">
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
        <button class="feedback-primary-action" type="button" :disabled="busy || (!canPublish && !isPublic) || (canPublish && !form.publicTitle.trim())" @click="save">
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
import { PUBLIC_STATUS_OPTIONS } from '@/utils/feedbackPublic.js'

const props = defineProps({
  item: { type: Object, required: true },
  dialog: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  message: { type: String, default: '' },
  error: { type: String, default: '' },
  formatDate: { type: Function, required: true }
})

const emit = defineEmits(['save', 'unpublish'])

const statusOptions = PUBLIC_STATUS_OPTIONS
const isPublic = computed(() => String(props.item?.visibility || '').toUpperCase() === 'PUBLIC')
const isReport = computed(() => props.item?.type === 'REPORT' || (props.item?.type === 'FEEDBACK' && props.item?.category === 'REPORT'))
const canPublish = computed(() => props.item?.publicConsent === true && !isReport.value)
const open = ref(false)
const panelId = computed(() => `admin-feedback-public-${String(props.item?.id || 'current').replace(/[^a-zA-Z0-9_-]/g, '-')}`)
const summaryText = computed(() => {
  if (!isPublic.value) return '未发布'
  const publicStatus = String(props.item?.publicStatus || '').trim().toUpperCase()
  const state = statusOptions.find(option => option.key === publicStatus)?.label || '已发布'
  return `${state} · ${Number(props.item?.supportCount || 0)} 人支持`
})

const form = reactive({ publicTitle: '', publicSummary: '', publicStatus: 'COLLECTING' })
const hasDraft = computed(() => form.publicStatus !== (props.item?.publicStatus || 'COLLECTING') || (canPublish.value && (
  form.publicTitle.trim() !== (props.item?.publicTitle || props.item?.title || '').trim() ||
  form.publicSummary.trim() !== (props.item?.publicSummary || '').trim()
)))
defineExpose({ hasDraft })

function sync() {
  form.publicTitle = props.item?.publicTitle || props.item?.title || ''
  form.publicSummary = props.item?.publicSummary || ''
  form.publicStatus = props.item?.publicStatus || 'COLLECTING'
}

watch(() => [props.item?.id, props.item?.visibility], sync, { immediate: true })
watch(() => props.item?.id, () => { open.value = false })

function save() {
  const publicTitle = form.publicTitle.trim()
  if ((!canPublish.value && !isPublic.value) || (canPublish.value && !publicTitle) || props.busy) return
  emit('save', {
    publicTitle,
    publicSummary: form.publicSummary.trim() || null,
    publicStatus: form.publicStatus || 'COLLECTING'
  })
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.admin-public-panel { border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.admin-public-panel.dialog { border: 0; border-radius: 0; background: transparent; }
.admin-public-panel.dialog .admin-public-body { border-top: 0; }
.admin-public-trigger { border: 0; background: transparent; color: var(--feedback-text); cursor: pointer; }
.admin-public-trigger:hover { background: var(--feedback-panel-hover); }
.admin-public-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.admin-public-trigger:disabled { cursor: wait; }
.admin-public-kicker { color: var(--accent-strong); }
.admin-public-heading strong { color: var(--feedback-text); }
.admin-public-summary-text { color: var(--feedback-text-muted); }
.admin-public-flag { border: 1px solid var(--brand-blue); border-radius: 5px; color: var(--brand-blue); }
.admin-public-chevron { color: var(--feedback-text-dim); transition: transform .16s ease; }
.admin-public-body { border-top: 1px solid var(--feedback-line); }
.admin-public-hint { color: var(--feedback-text-muted); }
.admin-public-grid label > span { color: var(--feedback-text-muted); }
.admin-public-stats dt { color: var(--feedback-text-dim); }
.admin-public-stats dd { color: var(--feedback-text); }
.admin-public-message { color: var(--feedback-success); }
.admin-public-error { color: var(--feedback-danger); }
</style>
<style scoped src="./adminFeedbackPublishPanelDesktop.css"></style>
<style scoped src="./adminFeedbackPublishPanelMobile.css"></style>
