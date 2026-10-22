<template>
  <div class="feedback-ticket-detail">
    <div v-if="loading" class="detail-state" role="status">正在加载详情…</div>
    <div v-else-if="error" class="detail-state error" role="alert">{{ error }}</div>

    <div v-if="showReporter" class="detail-reporter">
      <span>提交人</span>
      <strong>{{ item.reporterName || item.reporter?.userName || '未知用户' }}</strong>
      <code>{{ item.reporter?.id || item.reporterUserId || '' }}</code>
    </div>

    <!-- 应用诊断信息：版本与 Build 即使未勾选 consent 也会记录；旧工单没有该字段时不渲染。 -->
    <p v-if="showReporter && diagnosticsLine" class="detail-build" :title="diagnosticsTitle">
      {{ diagnosticsLine }}
    </p>

    <section v-if="!item.messages || !item.messages.length" class="detail-section">
      <h3>反馈内容</h3>
      <p class="detail-content">{{ item.content }}</p>
    </section>

    <section v-if="item.messages && item.messages.length" class="detail-section conversation-section">
      <h3>沟通记录 <span>{{ item.messages.length }}</span></h3>
      <article
        v-for="msg in item.messages"
        :key="msg.id"
        class="detail-message"
        :class="[msg.isAdmin ? 'is-admin' : 'is-reporter', isOwnMessage(msg) ? 'is-self' : 'is-other']"
      >
        <header>
          <span v-if="msg.isAdmin" class="detail-admin-label">
            <ShieldCheck :size="13" aria-hidden="true" />
            <strong>管理员</strong>
          </span>
          <strong v-else>{{ isOwnMessage(msg) ? '我' : reporterLabel }}</strong>
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

    <section
      v-if="!loading && (item.status === 'RESOLVED' || item.status === 'DISMISSED')"
      class="detail-closure"
      :class="item.status === 'RESOLVED' ? 'is-resolved' : 'is-dismissed'"
      role="status"
    >
      <CheckCircle2 v-if="item.status === 'RESOLVED'" :size="20" class="detail-closure-icon" aria-hidden="true" />
      <CircleX v-else :size="20" class="detail-closure-icon" aria-hidden="true" />
      <div>
        <strong>{{ item.status === 'RESOLVED' ? '此反馈已处理完成' : '此反馈已结束处理' }}</strong>
        <p>
          {{ item.status === 'RESOLVED'
            ? '当前工单已结案，无法继续补充；如仍有问题，请新建一条反馈。'
            : '当前工单已结束，无法继续补充；如果情况有变化，可以重新提交反馈。' }}
        </p>
        <div v-if="item.handler?.userName" class="detail-closure-meta">
          <span>最近处理</span>
          <strong>{{ item.handler.userName }}</strong>
          <time v-if="item.updatedAt" :datetime="item.updatedAt">{{ formatDate(item.updatedAt) }}</time>
        </div>
      </div>
    </section>

    <div v-if="!loading && !error && $slots.management" class="detail-management-area">
      <slot name="management" :item="item" />
    </div>

    <div v-if="!loading && (item.status === 'OPEN' || showClosedActions)" class="detail-action-area">
      <slot name="actions" :item="item" />
      <slot name="composer" :item="item" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { CheckCircle2, CircleX, Download, File, FileArchive, FileJson, FileText, LoaderCircle, ShieldCheck } from '@lucide/vue'
import { downloadFeedbackAttachment } from '@/api/feedback.js'
import { formatBuildInfo } from '@/config/buildInfo.js'

const props = defineProps({
  item: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  showReporter: { type: Boolean, default: false },
  showClosedActions: { type: Boolean, default: false },
  reporterLabel: { type: String, default: '我' },
  viewerUserId: { type: String, default: '' },
  viewerActorMode: {
    type: String,
    default: 'REPORTER',
    validator: value => ['REPORTER', 'ADMIN'].includes(value)
  },
  formatDate: { type: Function, required: true }
})

function isOwnMessage(message) {
  const authorId = String(message?.author?.id || '').trim()
  const viewerUserId = String(props.viewerUserId || '').trim()
  const senderKind = String(
    message?.senderKind || (message?.isAdmin ? 'ADMIN' : 'REPORTER')
  ).trim().toUpperCase()

  return Boolean(
    authorId &&
    viewerUserId &&
    authorId === viewerUserId &&
    senderKind === props.viewerActorMode
  )
}

const failedImages = ref(new Set())
const downloadingId = ref('')
const downloadErrors = ref({})

// 只在后端确实返回了产品版本时展示，避免旧工单或缺失字段出现占位版本号。
const diagnosticsLine = computed(() => {
  const info = props.item?.diagnostics
  return info && info.productVersion ? formatBuildInfo(info) : ''
})
const diagnosticsTitle = computed(() => {
  const info = props.item?.diagnostics
  if (!info || !info.buildTime || info.buildTime === 'unknown') return diagnosticsLine.value
  return diagnosticsLine.value + ' · 构建于 ' + info.buildTime
})

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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.detail-state { color: var(--feedback-text-muted); }
.detail-state.error { color: var(--feedback-danger); }
.detail-reporter { border-bottom: 1px solid var(--feedback-line); }
.detail-reporter span,.detail-reporter code { color: var(--feedback-text-dim); }
.detail-reporter strong { color: var(--feedback-text); }
/* 应用诊断行：低视觉权重，单行显示，不参与对话消息的左右布局。 */
.detail-build { color: var(--feedback-text-dim); }
.detail-section { border-bottom: 1px solid var(--feedback-line); }
.detail-section h3 { color: var(--feedback-text); }
.detail-section h3 span { color: var(--feedback-text-dim); }
.detail-content,.detail-message p { color: var(--feedback-text); }
.detail-message { background: transparent; }
.detail-message header strong { color: var(--feedback-text); }
.detail-admin-label { color: var(--theme-strong-text, var(--tea)); }
.detail-message.is-admin header strong { color: var(--theme-strong-text, var(--tea)); }
.detail-message header time { color: var(--feedback-text-dim); }
.detail-message > p { border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--surface); }
.detail-message.is-reporter > p { border-color: var(--feedback-line); background: var(--surface); }
.detail-message.is-reporter.is-self > p {
  border-color: color-mix(in srgb, var(--feedback-line-strong) 74%, var(--tea));
  border-right: 2px solid color-mix(in srgb, var(--tea) 58%, var(--feedback-line-strong));
  background: color-mix(in srgb, var(--feedback-panel) 86%, var(--tea) 14%);
}
.detail-message.is-reporter.is-self header > strong { color: var(--theme-strong-text, var(--tea)); }
.detail-message.is-admin > p { border-color: var(--yellow-deep); background: var(--yellow); }
.detail-message.is-admin.is-self > p { border-right: 3px solid var(--tea); }
.detail-message.is-admin.is-other > p { border-left: 3px solid var(--tea); }
.detail-media-grid a { border: 1px solid var(--feedback-line); border-radius: 6px; background: var(--feedback-panel); }
.detail-media-fallback { color: var(--feedback-text-muted); }
.detail-file-row { border: 1px solid var(--feedback-line); border-radius: 6px; background: var(--feedback-panel); color: var(--feedback-text-muted); }
.detail-file-copy strong { color: var(--feedback-text); }
.detail-file-copy small { color: var(--feedback-text-dim); }
.detail-file-copy .detail-file-error { color: var(--feedback-danger); }
.detail-file-row button { border: 1px solid var(--feedback-line); border-radius: 6px; background: var(--feedback-panel-deep); color: var(--feedback-text); cursor: pointer; }
.detail-file-row button:disabled { opacity: .55; cursor: default; }
.is-spinning { animation: detail-file-spin .8s linear infinite; }
@keyframes detail-file-spin { to { transform: rotate(360deg); } }
.detail-closure { border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--feedback-panel); }
.detail-closure-icon { color: var(--feedback-text-dim); }
.detail-closure.is-resolved .detail-closure-icon { color: var(--feedback-success); }
.detail-closure.is-dismissed .detail-closure-icon { color: var(--feedback-danger); }
.detail-closure > div > strong { color: var(--feedback-text); }
.detail-closure p { color: var(--feedback-text-muted); }
.detail-closure-meta { border-top: 1px solid var(--feedback-line); }
.detail-closure-meta span { color: var(--feedback-text-dim); }
.detail-closure-meta strong { color: var(--feedback-text); }
.detail-closure-meta time { color: var(--feedback-text-dim); }
.detail-action-area { background: var(--theme-surface, rgba(255, 253, 246, .96)); border-top: 1px solid var(--feedback-line); backdrop-filter: blur(10px); }
</style>
<style scoped src="./feedbackTicketDetailDesktop.css"></style>
<style scoped src="./feedbackTicketDetailMobile.css"></style>
