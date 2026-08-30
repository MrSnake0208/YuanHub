<template>
  <div class="feedback-ticket-detail">
    <div v-if="loading" class="detail-state" role="status">正在加载详情…</div>
    <div v-else-if="error" class="detail-state error" role="alert">{{ error }}</div>

    <div v-if="showReporter" class="detail-reporter">
      <span>提交人</span>
      <strong>{{ item.reporterName || item.reporter?.userName || '未知用户' }}</strong>
      <code>{{ item.reporter?.id || item.reporterUserId || '' }}</code>
    </div>

    <section class="detail-section">
      <h3>反馈内容</h3>
      <p class="detail-content">{{ item.content }}</p>
    </section>

    <section v-if="item.messages && item.messages.length" class="detail-section conversation-section">
      <h3>对话记录 <span>{{ item.messages.length }}</span></h3>
      <article v-for="msg in item.messages" :key="msg.id" class="detail-message" :class="{ 'is-admin': msg.isAdmin }">
        <header>
          <strong>{{ msg.isAdmin ? '管理员' : reporterLabel }}</strong>
          <time :datetime="msg.createdAt">{{ formatDate(msg.createdAt) }}</time>
        </header>
        <p>{{ msg.content }}</p>
        <div v-if="msg.images && msg.images.length" class="detail-media-grid">
          <a v-for="image in msg.images" :key="image.id" :href="image.url" target="_blank" rel="noopener noreferrer">
            <div v-if="failedImages.has(imageKey(msg, image))" class="detail-media-fallback" role="img" aria-label="反馈附件无法加载">图片暂时无法加载</div>
            <img v-else :src="image.url" :alt="'反馈附件 ' + image.id" loading="lazy" @error="markImageError(imageKey(msg, image))" />
          </a>
        </div>
        <div v-if="msg.files && msg.files.length" class="detail-file-list">
          <div v-for="file in msg.files" :key="file.id" class="detail-file-row">
            <component :is="fileIcon(file)" :size="20" aria-hidden="true" />
            <span class="detail-file-copy">
              <strong :title="file.name">{{ file.name }}</strong>
              <small>{{ fileType(file) }} · {{ formatSize(file.size) }}</small>
              <small v-if="downloadErrors[file.id]" class="detail-file-error" role="alert">{{ downloadErrors[file.id] }}</small>
            </span>
            <button
              type="button"
              :disabled="downloadingId === file.id"
              :aria-label="`下载附件 ${file.name}`"
              :title="downloadingId === file.id ? '正在下载' : '下载附件'"
              @click="downloadFile(file)"
            >
              <LoaderCircle v-if="downloadingId === file.id" :size="17" class="is-spinning" aria-hidden="true" />
              <Download v-else :size="17" aria-hidden="true" />
            </button>
          </div>
        </div>
      </article>
    </section>

    <div class="detail-action-area">
      <slot name="actions" :item="item" />
      <slot name="composer" :item="item" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Download, File, FileArchive, FileJson, FileText, LoaderCircle } from '@lucide/vue'
import { downloadFeedbackAttachment } from '@/api/feedback.js'

const props = defineProps({
  item: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  showReporter: { type: Boolean, default: false },
  reporterLabel: { type: String, default: '我' },
  formatDate: { type: Function, required: true }
})

const failedImages = ref(new Set())
const downloadingId = ref('')
const downloadErrors = ref({})

function imageKey(message, image) {
  return `${message.id || ''}:${image.id || image.url || ''}`
}

function markImageError(key) {
  const next = new Set(failedImages.value)
  next.add(key)
  failedImages.value = next
}

function extension(file) {
  return String(file?.name || '').split('.').pop().toLowerCase()
}

function fileIcon(file) {
  return { zip: FileArchive, json: FileJson, txt: FileText, log: FileText }[extension(file)] || File
}

function fileType(file) {
  return extension(file).toUpperCase() || 'FILE'
}

function formatSize(size) {
  const bytes = Number(size || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

async function downloadFile(file) {
  if (downloadingId.value) return
  downloadingId.value = file.id
  downloadErrors.value = { ...downloadErrors.value, [file.id]: '' }
  try {
    const result = await downloadFeedbackAttachment(props.item.id, file.id)
    const objectUrl = URL.createObjectURL(result.blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = file.name || 'attachment'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch (error) {
    downloadErrors.value = {
      ...downloadErrors.value,
      [file.id]: error?.message || '下载失败'
    }
  } finally {
    downloadingId.value = ''
  }
}

watch(() => props.item?.id, () => {
  failedImages.value = new Set()
  downloadingId.value = ''
  downloadErrors.value = {}
})
</script>

<style scoped>
.detail-state { padding: 18px 0; color: var(--ink-60); font-size: 13px; }
.detail-state.error { color: var(--rouge); }
.detail-reporter { display: flex; align-items: baseline; gap: 8px; padding: 16px 0 12px; border-bottom: 1px solid var(--line); font-size: 12px; }
.detail-reporter span,.detail-reporter code { color: var(--ink-35); }
.detail-reporter strong { color: var(--ink); }
.detail-reporter code { margin-left: auto; }
.detail-section { padding: 18px 0; border-bottom: 1px solid var(--line); }
.detail-section h3 { margin-bottom: 10px; color: var(--ink); font-size: 13px; font-weight: 900; }
.detail-section h3 span { margin-left: 5px; color: var(--ink-35); font-size: 11px; }
.detail-content,.detail-message p { color: var(--ink); font-size: 13.5px; line-height: 1.75; white-space: pre-wrap; }
.conversation-section { display: grid; gap: 9px; }
.conversation-section h3 { margin-bottom: 1px; }
.detail-message { padding: 12px 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper); }
.detail-message.is-admin { border-left: 3px solid var(--yellow-deep); background: rgba(239, 210, 142, .13); }
.detail-message header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 7px; }
.detail-message header strong { color: var(--ink); font-size: 11.5px; }
.detail-message header time { color: var(--ink-35); font: 10.5px var(--font-d); }
.detail-media-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.detail-media-grid a { position: relative; display: block; overflow: hidden; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); aspect-ratio: 4 / 3; }
.detail-media-grid img { width: 100%; height: 100%; display: block; object-fit: cover; }
.detail-media-fallback { width: 100%; height: 100%; display: grid; place-items: center; padding: 8px; color: var(--ink-60); font-size: 11px; text-align: center; }
.detail-file-list { display: grid; gap: 7px; margin-top: 10px; }
.detail-file-row { min-width: 0; display: grid; grid-template-columns: 20px minmax(0, 1fr) 34px; align-items: center; gap: 9px; padding: 8px 9px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink-60); }
.detail-file-copy { min-width: 0; display: grid; gap: 2px; }
.detail-file-copy strong { overflow: hidden; color: var(--ink); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.detail-file-copy small { color: var(--ink-35); font: 10.5px var(--font-d); }
.detail-file-copy .detail-file-error { color: var(--rouge); font-family: var(--font-b); }
.detail-file-row button { width: 34px; height: 34px; display: grid; place-items: center; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: var(--cream); color: var(--ink); cursor: pointer; }
.detail-file-row button:disabled { opacity: .55; cursor: default; }
.is-spinning { animation: detail-file-spin .8s linear infinite; }
@keyframes detail-file-spin { to { transform: rotate(360deg); } }
.detail-action-area { position: sticky; bottom: -20px; margin: 0 -20px -20px; padding: 14px 20px 20px; background: rgba(255, 248, 236, .96); border-top: 1px solid var(--line); backdrop-filter: blur(10px); }

@media (max-width: 767px) {
  .detail-reporter { align-items: flex-start; flex-wrap: wrap; }
  .detail-reporter code { width: 100%; margin-left: 0; overflow-wrap: anywhere; }
  .detail-media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-action-area { bottom: calc(-24px - env(safe-area-inset-bottom)); margin: 0 -16px calc(-24px - env(safe-area-inset-bottom)); padding: 14px 16px calc(18px + env(safe-area-inset-bottom)); }
}
</style>
