<template>
  <div class="feedback-page page-feedback">
    <IslandSidebar />

    <main id="main-content">
      <header class="hero feedback-hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">反馈中心</span>
            <span class="pill">我的反馈</span>
          </div>
          <h1>反馈中心<span class="small">提交 · 跟进 · 处理记录</span></h1>
          <p class="hero-sub">提交问题或建议，并在同一处查看回复、补充信息和处理进度。</p>
          <div class="hero-stats">
            <div><div class="k">筛选结果</div><div class="v">{{ totalCount }}<small>条</small></div></div>
            <div><div class="k">本页待回复</div><div class="v">{{ pendingCount }}<small>条</small></div></div>
            <div><div class="k">本页有回复</div><div class="v">{{ repliedCount }}<small>条</small></div></div>
            <div><div class="k">本页已结束</div><div class="v">{{ resolvedCount }}<small>条</small></div></div>
          </div>
        </div>
      </header>

      <section class="feedback-content">
        <div class="wrap">
          <FeedbackWorkspaceNav
            active="mine"
            :can-manage="canManageFeedback"
            :can-configure="canConfigureFeedback"
          />

          <div class="feedback-command-bar">
            <button class="feedback-primary-action" type="button" @click="showNewForm = true">
              <Plus :size="17" aria-hidden="true" />
              提交反馈
            </button>
            <div class="feedback-status-tabs" role="tablist" aria-label="工单状态">
              <button
                v-for="status in statusTabs"
                :key="status"
                type="button"
                role="tab"
                :aria-selected="filterStatus === status"
                :class="{ on: filterStatus === status }"
                @click="setFilter(status)"
              >{{ status }}</button>
            </div>
            <form class="feedback-search" role="search" @submit.prevent="searchFeedback">
              <Search :size="17" aria-hidden="true" />
              <input v-model="q" type="search" name="feedback-search" aria-label="搜索反馈" placeholder="搜索内容或工单 ID" />
              <button type="submit" title="搜索" aria-label="搜索"><ArrowRight :size="16" /></button>
            </form>
          </div>

          <div class="feedback-filter-row">
            <label class="feedback-filter">
              <span>反馈类型</span>
              <select v-model="filterType" @change="reloadFromFirstPage">
                <option value="">全部类型</option>
                <option v-for="option in feedbackTypeOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
              </select>
            </label>
            <label class="feedback-filter">
              <span>反馈板块</span>
              <select v-model="filterCategory" @change="reloadFromFirstPage">
                <option value="">全部板块</option>
                <option v-for="option in categoryOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
              </select>
            </label>
            <span class="feedback-result-meta">第 {{ page }} / {{ totalPages }} 页，每页 {{ PAGE_SIZE }} 条</span>
          </div>

          <FeedbackTicketWorkspace
            :items="feedbacks"
            :selected-id="selectedId"
            :loading="loading"
            :error="error"
            :total="totalCount"
            :page="page"
            :total-pages="totalPages"
            :type-label="typeLabel"
            :category-label="categoryLabel"
            :status-label="statusLabel"
            :format-date="formatDate"
            empty-message="暂无符合条件的反馈工单"
            @select="selectTicket"
            @close="closeDetail"
            @retry="loadFeedback"
            @page="changePage"
          >
            <template #detail="{ item }">
              <FeedbackTicketDetail
                :item="item"
                :loading="detailLoading"
                :error="detailError"
                :format-date="formatDate"
              >
                <template #actions>
                  <div class="feedback-detail-actions">
                    <button
                      v-if="item.status === 'OPEN' && item.quota?.canAppend"
                      class="feedback-button"
                      type="button"
                      @click="showReplyForm(item.id)"
                    >
                      <MessageSquarePlus :size="16" />追加消息
                    </button>
                    <button
                      v-if="item.status === 'OPEN' && item.viewerIsReporter"
                      class="feedback-button"
                      type="button"
                      @click="closeFeedback(item.id)"
                    >
                      <CheckCircle2 :size="16" />标记完成
                    </button>
                  </div>
                </template>
                <template #composer>
                  <div v-if="replyTarget === item.id" class="feedback-reply-form">
                    <textarea v-model="replyContent" class="feedback-form-control" rows="3" placeholder="补充问题细节或回复内容"></textarea>
                    <div class="feedback-form-actions">
                      <button class="feedback-button" type="button" @click="cancelReply">取消</button>
                      <button class="feedback-primary-action" type="button" :disabled="replying" @click="submitReply(item.id)">
                        <Send :size="16" />{{ replying ? '发送中…' : '发送' }}
                      </button>
                    </div>
                  </div>
                </template>
              </FeedbackTicketDetail>
            </template>
          </FeedbackTicketWorkspace>
        </div>
      </section>
    </main>

    <Teleport to="body">
      <div v-if="showNewForm" class="modal-mask" role="presentation" @click.self="closeNewFeedback">
        <div class="modal feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title" @keydown.esc.prevent="closeNewFeedback">
          <div class="modal-head">
            <h2 id="feedback-modal-title">提交反馈</h2>
            <button type="button" aria-label="关闭提交反馈弹窗" @click="closeNewFeedback"><X :size="20" /></button>
          </div>
          <form @submit.prevent="submitFeedback">
            <div class="feedback-form-grid">
              <label>
                <span>反馈类型</span>
                <select v-model="newFeedback.type" class="feedback-form-control" required>
                  <option v-for="option in feedbackTypeOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                </select>
              </label>
              <label>
                <span>反馈板块</span>
                <select v-model="newFeedback.category" class="feedback-form-control" required>
                  <option value="">请选择反馈板块</option>
                  <option v-for="option in categoryOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                </select>
              </label>
              <label class="full">
                <span>详细描述</span>
                <textarea v-model="newFeedback.content" class="feedback-form-control" rows="6" maxlength="1000" placeholder="请描述复现步骤、期望结果或具体建议" required></textarea>
                <small>{{ newFeedback.content.length }} / 1000</small>
              </label>
              <label class="feedback-consent full">
                <input v-model="newFeedback.clientInfoConsent" type="checkbox" />
                <span>允许附加浏览器和操作系统信息，帮助定位问题</span>
              </label>
            </div>
            <div v-if="formError" class="feedback-form-error" role="alert">{{ formError }}</div>
            <div class="modal-foot">
              <button type="button" class="feedback-button" @click="closeNewFeedback">取消</button>
              <button type="submit" class="feedback-primary-action" :disabled="submitting">
                <Send :size="16" />{{ submitting ? '提交中…' : '提交反馈' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, CheckCircle2, MessageSquarePlus, Plus, Search, Send, X } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import FeedbackTicketDetail from '@/components/feedback/FeedbackTicketDetail.vue'
import FeedbackTicketWorkspace from '@/components/feedback/FeedbackTicketWorkspace.vue'
import FeedbackWorkspaceNav from '@/components/feedback/FeedbackWorkspaceNav.vue'
import {
  appendFeedbackMessage,
  createFeedback,
  getFeedback,
  getFeedbackAccess,
  listMyFeedback,
  updateFeedbackStatus
} from '@/api/feedback.js'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, canManageAnyFeedback, hasPermission } from '@/utils/authPermissions.js'
import '@/styles/feedback-workspace.css'

const PAGE_SIZE = 20
const statusTabs = ['全部', '处理中', '已完成', '已驳回']
const feedbackTypeOptions = [
  { key: 'BUG', label: '问题报告' },
  { key: 'FEATURE', label: '功能建议' },
  { key: 'CONTENT', label: '内容问题' },
  { key: 'ACCOUNT', label: '账号问题' },
  { key: 'REPORT', label: '举报' },
  { key: 'OTHER', label: '其他' }
]
const DEFAULT_AREAS = [
  { key: 'INVENTORY', label: '库存管理' },
  { key: 'OPERATOR', label: '密探养成' },
  { key: 'LEDGER', label: '广陵账房' },
  { key: 'PLAZA', label: '作业广场' },
  { key: 'ACCOUNT', label: '账号与连接' },
  { key: 'UI', label: '界面与交互' },
  { key: 'OTHER', label: '其他模块' }
]

const route = useRoute()
const feedbacks = ref([])
const access = ref({ availableAreas: [] })
const loading = ref(false)
const error = ref('')
const page = ref(1)
const totalCount = ref(0)
const q = ref('')
const filterStatus = ref('全部')
const filterType = ref('')
const filterCategory = ref('')
const selectedId = ref('')
const detailLoading = ref(false)
const detailError = ref('')
const showNewForm = ref(false)
const submitting = ref(false)
const formError = ref('')
const replyTarget = ref('')
const replying = ref(false)
const replyContent = ref('')
const newFeedback = ref({ type: 'BUG', category: '', content: '', clientInfoConsent: false })
let loadRequestId = 0

const categoryOptions = computed(() => access.value.availableAreas.length ? access.value.availableAreas : DEFAULT_AREAS)
const canManageFeedback = computed(() => canManageAnyFeedback(auth.adminAccess))
const canConfigureFeedback = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE))
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))
const pendingCount = computed(() => feedbacks.value.filter(item => item.status === 'OPEN' && !item.hasAdminReply).length)
const repliedCount = computed(() => feedbacks.value.filter(item => item.status === 'OPEN' && item.hasAdminReply).length)
const resolvedCount = computed(() => feedbacks.value.filter(item => item.status !== 'OPEN').length)

function statusParam() {
  return { '处理中': 'OPEN', '已完成': 'RESOLVED', '已驳回': 'DISMISSED' }[filterStatus.value]
}

function typeLabel(type) {
  return feedbackTypeOptions.find(option => option.key === type)?.label || type || '其他'
}

function categoryLabel(category) {
  return categoryOptions.value.find(option => option.key === category)?.label || category || '其他模块'
}

function statusLabel(status, hasAdminReply) {
  if (status === 'OPEN') return hasAdminReply ? '已回复' : '待回复'
  return { RESOLVED: '已完成', DISMISSED: '已驳回' }[status] || status || '未知状态'
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadAccess() {
  try {
    const data = await getFeedbackAccess()
    const rawAreas = data.availableCategories || data.available_categories || data.availableAreas || data.available_areas || []
    access.value.availableAreas = rawAreas.map(option => ({ key: option.key, label: option.label }))
  } catch (_) {
    access.value.availableAreas = []
  }
}

async function loadFeedback() {
  const requestId = ++loadRequestId
  loading.value = true
  error.value = ''
  try {
    const data = await listMyFeedback({
      page: page.value,
      pageSize: PAGE_SIZE,
      status: statusParam(),
      type: filterType.value || undefined,
      category: filterCategory.value || undefined,
      q: q.value.trim() || undefined
    })
    if (requestId !== loadRequestId) return
    feedbacks.value = data.items || []
    totalCount.value = Number(data.total ?? feedbacks.value.length)
    if (!feedbacks.value.some(item => item.id === selectedId.value)) closeDetail()
  } catch (e) {
    if (requestId === loadRequestId) error.value = e.message || '反馈加载失败'
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

async function reloadFromFirstPage() {
  page.value = 1
  closeDetail()
  await loadFeedback()
}

function setFilter(status) {
  if (filterStatus.value === status) return
  filterStatus.value = status
  reloadFromFirstPage()
}

function searchFeedback() {
  reloadFromFirstPage()
}

async function changePage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || loading.value) return
  page.value = nextPage
  closeDetail()
  await loadFeedback()
}

async function selectTicket(id) {
  selectedId.value = id
  replyTarget.value = ''
  const item = feedbacks.value.find(ticket => ticket.id === id)
  if (!item || (item.messages && item.messages.length)) return
  await loadFeedbackDetail(id)
}

async function loadFeedbackDetail(id) {
  detailLoading.value = true
  detailError.value = ''
  try {
    const detail = await getFeedback(id)
    if (!detail.viewerIsReporter) throw new Error('该工单不属于我的反馈')
    replaceTicket(detail)
    selectedId.value = id
  } catch (e) {
    detailError.value = e.message || '详情加载失败'
  } finally {
    detailLoading.value = false
  }
}

function replaceTicket(detail) {
  const index = feedbacks.value.findIndex(item => item.id === detail.id)
  if (index >= 0) feedbacks.value.splice(index, 1, detail)
  else feedbacks.value.unshift(detail)
}

function closeDetail() {
  selectedId.value = ''
  detailError.value = ''
  cancelReply()
}

function showReplyForm(id) {
  replyTarget.value = id
  replyContent.value = ''
}

function cancelReply() {
  replyTarget.value = ''
  replyContent.value = ''
}

async function submitReply(id) {
  const content = replyContent.value.trim()
  if (!content) return
  replying.value = true
  try {
    replaceTicket(await appendFeedbackMessage(id, { content }))
    cancelReply()
  } catch (e) {
    detailError.value = e.message || '发送失败'
  } finally {
    replying.value = false
  }
}

async function closeFeedback(id) {
  try {
    await updateFeedbackStatus(id, 'RESOLVED')
    await reloadFromFirstPage()
  } catch (e) {
    detailError.value = e.message || '操作失败'
  }
}

function closeNewFeedback() {
  if (submitting.value) return
  showNewForm.value = false
  formError.value = ''
}

async function submitFeedback() {
  const content = newFeedback.value.content.trim()
  if (!content || !newFeedback.value.category) return
  submitting.value = true
  formError.value = ''
  try {
    const created = await createFeedback({ ...newFeedback.value, content })
    newFeedback.value = { type: 'BUG', category: '', content: '', clientInfoConsent: false }
    showNewForm.value = false
    filterStatus.value = '全部'
    page.value = 1
    await loadFeedback()
    if (feedbacks.value.some(item => item.id === created.id)) await selectTicket(created.id)
  } catch (e) {
    formError.value = e.message || '提交失败'
  } finally {
    submitting.value = false
  }
}

function handleWindowKeydown(event) {
  if (event.key === 'Escape' && selectedId.value) closeDetail()
}

onMounted(async () => {
  window.addEventListener('keydown', handleWindowKeydown)
  await Promise.all([loadAccess(), loadFeedback()])
  const reportId = route.query.id ? String(route.query.id) : ''
  if (reportId) await selectTicket(reportId)
})

onBeforeUnmount(() => {
  loadRequestId += 1
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<style scoped>
.page-feedback .feedback-hero { --wm: '反馈'; }
.feedback-modal { max-width: 620px; }
.feedback-modal .modal-head h2 { color: var(--ink); font-family: var(--font-s); font-size: 19px; font-weight: 900; }
.feedback-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.feedback-form-grid label { min-width: 0; margin: 0; }
.feedback-form-grid label > span { display: block; margin-bottom: 6px; color: var(--ink-60); font-size: 12px; font-weight: 800; }
.feedback-form-grid .full { grid-column: 1 / -1; }
.feedback-form-grid small { display: block; margin-top: 5px; color: var(--ink-35); font-size: 11px; text-align: right; }
.feedback-form-grid .feedback-consent { display: flex; align-items: flex-start; gap: 8px; }
.feedback-form-grid .feedback-consent input { width: auto; flex: none; margin-top: 3px; }
.feedback-form-grid .feedback-consent span { margin: 0; line-height: 1.6; }
.feedback-form-error { color: var(--rouge); font-size: 12px; font-weight: 700; }

@media (max-width: 767px) {
  .feedback-form-grid { grid-template-columns: 1fr; }
  .feedback-form-grid .full { grid-column: auto; }
}
</style>
