<template>
  <section class="admin-public-panel" aria-label="反馈广场发布面板">
    <header class="admin-public-head">
      <div>
        <span class="admin-public-kicker">PLAZA / PUBLISH</span>
        <h3>{{ isPublic ? '已发布到反馈广场' : '发布到反馈广场' }}</h3>
      </div>
      <span v-if="isPublic" class="admin-public-flag">PUBLIC</span>
    </header>

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
      <button class="feedback-button" type="button" :disabled="busy" @click="$emit('merge')">
        合并反馈
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { PUBLIC_STATUS_OPTIONS } from '@/utils/feedbackPublic.js'

const props = defineProps({
  item: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  message: { type: String, default: '' },
  error: { type: String, default: '' },
  formatDate: { type: Function, required: true }
})

const emit = defineEmits(['save', 'unpublish', 'merge'])

const statusOptions = PUBLIC_STATUS_OPTIONS
const isPublic = computed(() => String(props.item?.visibility || '').toUpperCase() === 'PUBLIC')

const form = reactive({ publicTitle: '', publicSummary: '', publicStatus: 'COLLECTING' })

function sync() {
  form.publicTitle = props.item?.publicTitle || props.item?.title || ''
  form.publicSummary = props.item?.publicSummary || ''
  form.publicStatus = props.item?.publicStatus || 'COLLECTING'
}

watch(() => [props.item?.id, props.item?.visibility], sync, { immediate: true })

function save() {
  const publicTitle = form.publicTitle.trim()
  if (!publicTitle || props.busy) return
  emit('save', {
    publicTitle,
    publicSummary: form.publicSummary.trim() || null,
    publicStatus: form.publicStatus || 'COLLECTING'
  })
}
</script>

<style scoped>
.admin-public-panel { margin: 0 0 16px; padding: 16px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.admin-public-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.admin-public-kicker { display: block; margin-bottom: 5px; color: var(--accent-strong); font: 800 10px var(--font-d); letter-spacing: .16em; }
.admin-public-head h3 { color: var(--feedback-text); font-family: var(--font-s); font-size: 17px; font-weight: 900; }
.admin-public-flag { padding: 3px 8px; border: 1px solid var(--brand-blue); border-radius: 5px; color: var(--brand-blue); font: 800 10px var(--font-d); letter-spacing: .1em; }
.admin-public-hint { margin-top: 9px; color: var(--feedback-text-muted); font-size: 12px; line-height: 1.7; }
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
  .admin-public-grid { grid-template-columns: 1fr; }
  .admin-public-grid .full { grid-column: auto; }
}
</style>
