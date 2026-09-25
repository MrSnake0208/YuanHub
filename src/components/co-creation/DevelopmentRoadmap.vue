<template>
  <div class="roadmap">
    <p class="roadmap-notice" role="note">开发进度依据公开状态自动生成，实际排期可能调整。</p>

    <div v-if="loading" class="roadmap-columns" aria-busy="true" aria-live="polite">
      <div v-for="n in 3" :key="n" class="roadmap-skeleton"><span></span><span></span><span></span></div>
    </div>
    <div v-else-if="error" class="roadmap-state error" role="alert">
      <span>{{ error }}</span>
      <button class="feedback-button" type="button" @click="load"><RefreshCw :size="15" />重新加载</button>
    </div>
    <div v-else class="roadmap-columns">
      <section v-for="column in columns" :key="column.status" class="roadmap-column" :aria-label="column.label">
        <header class="roadmap-column-head">
          <h3>{{ column.label }}</h3>
          <span>{{ column.items.length }}</span>
        </header>
        <p v-if="!column.items.length" class="roadmap-empty">暂时没有内容</p>
        <template v-else>
          <PublicFeedbackCard
            v-for="item in column.items"
            :key="item.id"
            :item="item"
            :format-date="formatDate"
            show-version
            @open="openDetail"
          />
        </template>
      </section>
    </div>

    <PublicFeedbackDetailModal
      :open="detailOpen"
      :item="detail"
      :loading="detailLoading"
      :error="detailError"
      :format-date="formatDate"
      @close="closeDetail"
      @updated="onUpdated"
    />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'
import PublicFeedbackCard from '@/components/co-creation/PublicFeedbackCard.vue'
import PublicFeedbackDetailModal from '@/components/co-creation/PublicFeedbackDetailModal.vue'
import { getPublicFeedback, listPublicFeedback } from '@/api/coCreation.js'

const columns = ref([
  { status: 'PLANNED', label: '计划中', items: [] },
  { status: 'IN_PROGRESS', label: '开发中', items: [] },
  { status: 'COMPLETED', label: '最近完成', items: [] }
])

const loading = ref(false)
const error = ref('')
const detailOpen = ref(false)
const detail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')

let loadRequestId = 0
let detailRequestId = 0
let isMounted = false

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

async function load() {
  const requestId = ++loadRequestId
  loading.value = true
  error.value = ''
  try {
    const pages = await Promise.all(columns.value.map(column => listPublicFeedback({
      page: 1,
      pageSize: 12,
      status: column.status,
      sort: column.status === 'COMPLETED' ? 'updated' : 'hot'
    })))
    if (!isMounted || requestId !== loadRequestId) return
    columns.value = columns.value.map((column, index) => ({ ...column, items: pages[index]?.items || [] }))
  } catch (_) {
    if (isMounted && requestId === loadRequestId) error.value = '反馈加载失败，请稍后重试。'
  } finally {
    if (isMounted && requestId === loadRequestId) loading.value = false
  }
}

async function openDetail(item) {
  detailOpen.value = true
  const requestId = ++detailRequestId
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  try {
    const data = await getPublicFeedback(item.id)
    if (!isMounted || requestId !== detailRequestId) return
    detail.value = data
  } catch (_) {
    if (isMounted && requestId === detailRequestId) detailError.value = '反馈加载失败，请稍后重试。'
  } finally {
    if (isMounted && requestId === detailRequestId) detailLoading.value = false
  }
}

function closeDetail() {
  detailRequestId += 1
  detailOpen.value = false
  detail.value = null
  detailError.value = ''
  detailLoading.value = false
}

function onUpdated(updated) {
  if (!updated) return
  if (detail.value && detail.value.id === updated.id) detail.value = updated
  for (const column of columns.value) {
    const index = column.items.findIndex(item => item.id === updated.id)
    if (index >= 0) column.items.splice(index, 1, { ...column.items[index], ...updated })
  }
}

onMounted(() => {
  isMounted = true
  load()
})

onBeforeUnmount(() => {
  isMounted = false
  loadRequestId += 1
  detailRequestId += 1
})
</script>

<style scoped>
.roadmap { padding-bottom: 56px; }
.roadmap-notice { margin-top: 18px; padding: 11px 14px; border: 1px dashed var(--feedback-line-strong); border-radius: 8px; background: var(--feedback-panel); color: var(--feedback-text-muted); font-size: 12px; line-height: 1.7; }
.roadmap-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 18px; align-items: start; }
.roadmap-column { min-width: 0; display: grid; gap: 10px; }
.roadmap-column-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 10px 12px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel-deep); }
.roadmap-column-head h3 { color: var(--feedback-text); font-family: var(--font-s); font-size: 15px; font-weight: 900; }
.roadmap-column-head span { color: var(--feedback-text-dim); font: 11px var(--font-d); }
.roadmap-empty { padding: 18px 12px; border: 1px dashed var(--feedback-line); border-radius: 8px; color: var(--feedback-text-dim); font-size: 12px; text-align: center; }
.roadmap-skeleton { min-height: 220px; display: grid; gap: 12px; padding: 16px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.roadmap-skeleton span { display: block; height: 12px; border-radius: 6px; background: linear-gradient(90deg, rgba(156, 122, 77, .12), rgba(156, 122, 77, .22), rgba(156, 122, 77, .12)); background-size: 200% 100%; animation: roadmap-shimmer 1.3s ease-in-out infinite; }
.roadmap-skeleton span:first-child { width: 40%; }
.roadmap-skeleton span:nth-child(2) { width: 78%; height: 16px; }
.roadmap-skeleton span:last-child { width: 56%; }
@keyframes roadmap-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.roadmap-state { min-height: 240px; display: grid; place-content: center; justify-items: center; gap: 10px; margin-top: 18px; padding: 28px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); color: var(--feedback-danger); font-size: 13px; text-align: center; }
@media (max-width: 900px) {
  .roadmap-columns { grid-template-columns: 1fr; }
}
</style>
