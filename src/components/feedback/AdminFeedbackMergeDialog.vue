<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask is-raised" role="presentation" @click.self="close">
      <div ref="panel" class="modal merge-dialog" role="dialog" aria-modal="true" aria-labelledby="merge-dialog-title" tabindex="-1">
        <div class="modal-head">
          <h2 id="merge-dialog-title">合并反馈</h2>
          <button ref="closeButton" type="button" aria-label="关闭" title="关闭" :disabled="busy" @click="close"><X :size="20" /></button>
        </div>
        <div class="merge-body">
          <p class="merge-lead">将「{{ sourceTitle || '当前反馈' }}」（{{ sourceId }}）合并至：</p>
          <input
            v-model="query"
            class="feedback-form-control"
            type="search"
            :disabled="busy"
            aria-label="搜索已有反馈"
            placeholder="搜索反馈内容或工单编号"
            @input="scheduleSearch"
          />
          <div v-if="loading" class="merge-state" role="status">正在搜索…</div>
          <div v-else-if="error" class="merge-state error" role="alert">{{ error }}</div>
          <ul v-else-if="candidates.length" class="merge-list">
            <li v-for="candidate in candidates" :key="candidate.id" :class="{ on: selectedId === candidate.id }">
              <button type="button" :disabled="busy" @click="selectedId = candidate.id">
                <span class="merge-item-main">
                  <strong>{{ candidate.publicTitle || candidate.content || '未命名反馈' }}</strong>
                  <small>{{ candidate.id }} · {{ candidate.supportCount || 0 }} 人支持 · {{ statusText(candidate) }}</small>
                </span>
                <span class="merge-pick">{{ selectedId === candidate.id ? '已选择' : '选择' }}</span>
              </button>
            </li>
          </ul>
          <div v-else class="merge-state">没有找到可合并的反馈。</div>
          <p v-if="selectedCandidate" class="merge-selected" role="status">主反馈：{{ selectedCandidate.publicTitle || selectedCandidate.title || selectedCandidate.content }}（{{ selectedCandidate.id }}）</p>
          <p class="merge-warning">
            合并后当前反馈仍会保留，但后续进度将统一跟随主反馈。公开反馈不能合并到未公开反馈。
          </p>
        </div>
        <div class="modal-foot">
          <button class="feedback-button" type="button" :disabled="busy" @click="close">取消</button>
          <button class="feedback-primary-action" type="button" :disabled="!selectedCandidate || busy || loading" @click="confirm">
            {{ busy ? '合并中…' : '确认合并' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { X } from '@lucide/vue'
import { listManagedFeedback } from '@/api/feedback.js'
import { publicStatusLabel } from '@/utils/feedbackPublic.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  sourceId: { type: String, default: '' },
  sourceTitle: { type: String, default: '' },
  busy: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'confirm'])

const query = ref('')
const candidates = ref([])
const loading = ref(false)
const error = ref('')
const selectedId = ref('')
const closeButton = ref(null)
const panel = ref(null)
const selectedCandidate = computed(() => candidates.value.find(item => item.id === selectedId.value))
useModalFocus(() => props.open, panel, { initialFocus: () => closeButton.value, onEscape: close })
let timer = null
let requestId = 0
let mounted = true

function statusText(candidate) {
  return publicStatusLabel(candidate.publicStatus) || { OPEN: '处理中', RESOLVED: '已完成', DISMISSED: '已驳回' }[candidate.status] || '处理中'
}

async function search() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const data = await listManagedFeedback({
      page: 1,
      pageSize: 8,
      q: query.value.trim() || undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    })
    if (!mounted || !props.open || id !== requestId) return
    candidates.value = (data.items || []).filter(item => item.id !== props.sourceId && !item.mergedIntoId)
  } catch (e) {
    if (mounted && id === requestId) error.value = e.message || '搜索失败'
  } finally {
    if (mounted && id === requestId) loading.value = false
  }
}

function scheduleSearch() {
  requestId += 1
  selectedId.value = ''
  candidates.value = []
  loading.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(search, 300)
}

function confirm() {
  if (!selectedCandidate.value || props.busy || loading.value) return
  emit('confirm', selectedId.value)
}

function close() {
  if (!props.busy) emit('close')
}

watch(() => [props.open, props.sourceId], ([open]) => {
  if (timer) clearTimeout(timer)
  requestId += 1
  if (open) {
    query.value = ''
    selectedId.value = ''
    error.value = ''
    candidates.value = []
    search()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  mounted = false
  requestId += 1
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.merge-lead { color: var(--ink); }
.merge-selected { color: var(--theme-strong-text, var(--tea)); }
.merge-list li button { border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); cursor: pointer; }
.merge-list li.on button { border-color: var(--yellow-deep); background: var(--yellow); }
.merge-item-main small { color: var(--ink-60); }
.merge-pick { color: var(--theme-strong-text, var(--tea)); }
.merge-state { color: var(--ink-60); }
.merge-state.error { color: var(--theme-danger-text, var(--rouge)); }
.merge-warning { border: 1px dashed var(--yellow-deep); border-radius: 7px; background: var(--theme-wash-strong, rgba(239, 210, 142, .22)); color: var(--ink-60); }
</style>
<style scoped src="./adminFeedbackMergeDialogDesktop.css"></style>
<style scoped src="./adminFeedbackMergeDialogMobile.css"></style>
