<template>
  <div class="wish-pool">
    <p class="wish-notice" role="note">
      支持数量用于帮助开发者了解大家的需求，不代表最终开发优先级或上线顺序。
    </p>

    <div class="feedback-command-bar">
      <form class="feedback-search" role="search" @submit.prevent="reloadFromFirstPage">
        <Search :size="18" aria-hidden="true" />
        <input
          v-model="keyword"
          type="search"
          name="wish-search"
          aria-label="搜索功能建议"
          placeholder="搜索功能建议..."
          @input="scheduleSearch"
        />
        <button type="submit" title="搜索" aria-label="搜索"><ArrowRight :size="16" /></button>
      </form>
      <div class="feedback-status-tabs" role="tablist" aria-label="排序">
        <button
          v-for="option in sortOptions"
          :key="option.key"
          type="button"
          role="tab"
          :aria-selected="sort === option.key"
          :class="{ on: sort === option.key }"
          @click="setSort(option.key)"
        >{{ option.label }}</button>
      </div>
    </div>

    <div class="feedback-filter-row">
      <label class="feedback-filter">
        <span>状态</span>
        <select v-model="status" @change="reloadFromFirstPage">
          <option value="">全部状态</option>
          <option v-for="option in statusOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
        </select>
      </label>
      <span class="feedback-result-meta">共 {{ total }} 条</span>
    </div>

    <div v-if="loading" class="wish-grid" aria-busy="true" aria-live="polite">
      <div v-for="n in 6" :key="n" class="wish-skeleton"><span></span><span></span><span></span></div>
    </div>
    <div v-else-if="error" class="wish-state error" role="alert">
      <span>{{ error }}</span>
      <button class="feedback-button" type="button" @click="load"><RefreshCw :size="15" />重新加载</button>
    </div>
    <div v-else-if="!items.length" class="wish-state empty">
      <Lightbulb :size="24" aria-hidden="true" />
      <strong>暂时还没有公开的功能建议。</strong>
      <span>有想法？欢迎提交反馈告诉我们。</span>
      <button class="feedback-primary-action" type="button" @click="goSubmit">提交功能建议</button>
    </div>
    <div v-else class="wish-grid">
      <PublicFeedbackCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        :format-date="formatDate"
        show-support
        @open="openDetail"
        @updated="onUpdated"
      />
    </div>

    <footer v-if="!loading && !error && items.length" class="wish-pagination" aria-label="许愿池分页">
      <span>第 {{ page }} / {{ totalPages }} 页 · 共 {{ total }} 条</span>
      <div>
        <button type="button" :disabled="page <= 1" aria-label="上一页" title="上一页" @click="changePage(page - 1)"><ChevronLeft :size="18" /></button>
        <button type="button" :disabled="page >= totalPages" aria-label="下一页" title="下一页" @click="changePage(page + 1)"><ChevronRight :size="18" /></button>
      </div>
    </footer>

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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, ChevronLeft, ChevronRight, Lightbulb, RefreshCw, Search } from '@lucide/vue'
import PublicFeedbackCard from '@/components/co-creation/PublicFeedbackCard.vue'
import PublicFeedbackDetailModal from '@/components/co-creation/PublicFeedbackDetailModal.vue'
import { getPublicFeedback, listPublicFeedback } from '@/api/coCreation.js'
import { PUBLIC_SORT_OPTIONS, PUBLIC_STATUS_OPTIONS } from '@/utils/feedbackPublic.js'

const PAGE_SIZE = 12
const WISH_TYPE = 'FEATURE'
const sortOptions = PUBLIC_SORT_OPTIONS.filter(option => option.key !== 'updated')
const statusOptions = PUBLIC_STATUS_OPTIONS

const items = ref([])
const total = ref(0)
const page = ref(1)
const keyword = ref('')
const status = ref('')
const sort = ref('hot')
const loading = ref(false)
const error = ref('')

const detailOpen = ref(false)
const detail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')

const router = useRouter()
let loadRequestId = 0
let detailRequestId = 0
let searchTimer = null
let isMounted = false

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

async function load() {
  const requestId = ++loadRequestId
  loading.value = true
  error.value = ''
  try {
    const data = await listPublicFeedback({
      page: page.value,
      pageSize: PAGE_SIZE,
      type: WISH_TYPE,
      status: status.value || undefined,
      keyword: keyword.value.trim() || undefined,
      sort: sort.value
    })
    if (!isMounted || requestId !== loadRequestId) return
    items.value = data.items || []
    total.value = Number(data.total ?? items.value.length)
  } catch (_) {
    if (isMounted && requestId === loadRequestId) error.value = '反馈加载失败，请稍后重试。'
  } finally {
    if (isMounted && requestId === loadRequestId) loading.value = false
  }
}

function reloadFromFirstPage() {
  page.value = 1
  closeDetail()
  load()
}

function changePage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || loading.value) return
  page.value = nextPage
  closeDetail()
  load()
}

function setSort(value) {
  if (sort.value === value) return
  sort.value = value
  reloadFromFirstPage()
}

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(reloadFromFirstPage, 350)
}

function goSubmit() {
  router.push('/feedback')
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
  const index = items.value.findIndex(item => item.id === updated.id)
  if (index >= 0) items.value.splice(index, 1, { ...items.value[index], ...updated })
}

onMounted(() => {
  isMounted = true
  load()
})

onBeforeUnmount(() => {
  isMounted = false
  loadRequestId += 1
  detailRequestId += 1
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<style scoped>
.wish-pool { padding-bottom: 56px; }
.wish-notice { margin-top: 18px; padding: 11px 14px; border: 1px dashed var(--yellow-deep); border-radius: 8px; background: rgba(239, 210, 142, .18); color: var(--feedback-text-muted); font-size: 12px; line-height: 1.7; }
.wish-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; margin-top: 18px; }
.wish-skeleton { min-height: 176px; display: grid; gap: 12px; padding: 16px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.wish-skeleton span { display: block; height: 12px; border-radius: 6px; background: linear-gradient(90deg, rgba(156, 122, 77, .12), rgba(156, 122, 77, .22), rgba(156, 122, 77, .12)); background-size: 200% 100%; animation: wish-shimmer 1.3s ease-in-out infinite; }
.wish-skeleton span:first-child { width: 45%; }
.wish-skeleton span:nth-child(2) { width: 82%; height: 16px; }
.wish-skeleton span:last-child { width: 60%; }
@keyframes wish-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.wish-state { min-height: 240px; display: grid; place-content: center; justify-items: center; gap: 10px; margin-top: 18px; padding: 28px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); color: var(--feedback-text-muted); font-size: 13px; text-align: center; }
.wish-state strong { color: var(--feedback-text); }
.wish-state.error { color: var(--feedback-danger); }
.wish-pagination { min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 18px; color: var(--feedback-text-dim); font: 11px var(--font-d); }
.wish-pagination > div { display: flex; overflow: hidden; border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--feedback-panel); }
.wish-pagination button { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-left: 1px solid var(--feedback-line); background: transparent; color: var(--feedback-text-muted); cursor: pointer; }
.wish-pagination button:first-child { border-left: 0; }
.wish-pagination button:disabled { opacity: .3; cursor: default; }
@media (max-width: 767px) {
  .wish-grid { grid-template-columns: 1fr; }
}
</style>
