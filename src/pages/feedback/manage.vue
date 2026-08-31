<template>
  <div class="feedback-page manage-feedback">
    <IslandSidebar />

    <main id="main-content">
      <header class="hero feedback-hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">反馈中心</span>
            <span class="pill">反馈工作台</span>
          </div>
          <h1>反馈工作台<span class="small">扫描 · 回复 · 结案</span></h1>
          <p class="hero-sub">集中处理授权板块的反馈。列表用于快速扫描，选中工单后在独立详情区连续完成回复与状态操作。</p>
          <div class="hero-stats">
            <div><div class="k">筛选结果</div><div class="v">{{ totalCount }}<small>条</small></div></div>
            <div><div class="k">本页待回复</div><div class="v">{{ pendingCount }}<small>条</small></div></div>
            <div><div class="k">本页已回复</div><div class="v">{{ repliedCount }}<small>条</small></div></div>
            <div><div class="k">负责板块</div><div class="v">{{ categoryOptions.length }}<small>个</small></div></div>
          </div>
        </div>
      </header>

      <section class="feedback-content">
        <div class="wrap">
          <FeedbackWorkspaceNav active="manage" :can-manage="true" :can-configure="canConfigureFeedback" />

          <div v-if="loadingAccess" class="permission-state" role="status">正在检查反馈权限…</div>
          <div v-else-if="!hasManagePermission" class="permission-state" role="alert">
            <ShieldAlert :size="24" aria-hidden="true" />
            <strong>暂无板块管理权限</strong>
            <span>当前账号仍可提交和跟踪自己的反馈。</span>
            <router-link class="feedback-primary-action" to="/feedback">前往我的反馈</router-link>
          </div>

          <template v-else>
            <div class="feedback-command-bar">
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
                <input v-model="q" type="search" name="managed-feedback-search" aria-label="搜索待处理反馈" placeholder="搜索内容或工单 ID" />
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
                <span>负责板块</span>
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
              show-reporter
              empty-message="暂无符合条件的授权工单"
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
                  show-reporter
                  reporter-label="提交人"
                >
                  <template #actions>
                    <div v-if="item.viewerCanManage" class="feedback-detail-actions">
                      <button v-if="item.status === 'OPEN'" class="feedback-button" type="button" @click="showReplyForm(item.id)">
                        <MessageSquarePlus :size="16" />回复
                      </button>
                      <button v-if="item.status === 'OPEN'" class="feedback-button" type="button" @click="updateStatus(item.id, 'RESOLVED')">
                        <CheckCircle2 :size="16" />标记完成
                      </button>
                      <button v-if="item.status === 'OPEN'" class="feedback-button danger" type="button" @click="updateStatus(item.id, 'DISMISSED')">
                        <CircleX :size="16" />驳回
                      </button>
                    </div>
                  </template>
                  <template #composer>
                    <div v-if="replyTarget === item.id" class="feedback-reply-form">
                      <textarea v-model="replyContent" class="feedback-form-control" rows="3" placeholder="输入处理回复" @paste="handleReplyMediaPaste"></textarea>
                      <FeedbackAttachmentPicker :media="replyMedia" :busy="replying" />
                      <div class="feedback-form-actions">
                        <button class="feedback-button" type="button" :disabled="replying" @click="cancelReply">取消</button>
                        <button class="feedback-primary-action" type="button" :disabled="replying || replyMedia.uploading" @click="submitReply(item.id)">
                          <Send :size="16" />{{ replying ? '发送中…' : '发送回复' }}
                        </button>
                      </div>
                    </div>
                  </template>
                </FeedbackTicketDetail>
              </template>
            </FeedbackTicketWorkspace>
          </template>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, CheckCircle2, CircleX, MessageSquarePlus, Search, Send, ShieldAlert } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import FeedbackAttachmentPicker from '@/components/feedback/FeedbackAttachmentPicker.vue'
import FeedbackTicketDetail from '@/components/feedback/FeedbackTicketDetail.vue'
import FeedbackTicketWorkspace from '@/components/feedback/FeedbackTicketWorkspace.vue'
import FeedbackWorkspaceNav from '@/components/feedback/FeedbackWorkspaceNav.vue'
import {
  appendManagedFeedbackMessage,
  getFeedback,
  getFeedbackAccess,
  listManagedFeedback,
  updateManagedFeedbackStatus
} from '@/api/feedback.js'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '@/utils/authPermissions.js'
import { useFeedbackMedia } from '@/utils/feedbackMedia.js'
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
const router = useRouter()
const feedbacks = ref([])
const access = ref({ superAdmin: false, manageAreas: [], availableAreas: [] })
const loadingAccess = ref(true)
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
const replyTarget = ref('')
const replyContent = ref('')
const replying = ref(false)
const replyMedia = useFeedbackMedia()
let loadRequestId = 0

const canConfigureFeedback = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE))
const hasManagePermission = computed(() => access.value.superAdmin || access.value.manageAreas.length > 0)
const categoryOptions = computed(() => {
  const all = access.value.availableAreas.length ? access.value.availableAreas : DEFAULT_AREAS
  return access.value.superAdmin ? all : all.filter(option => access.value.manageAreas.includes(option.key))
})
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))
const pendingCount = computed(() => feedbacks.value.filter(item => item.status === 'OPEN' && !item.hasAdminReply).length)
const repliedCount = computed(() => feedbacks.value.filter(item => item.status === 'OPEN' && item.hasAdminReply).length)

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
  loadingAccess.value = true
  try {
    const data = await getFeedbackAccess()
    const rawAreas = data.availableCategories || data.available_categories || data.availableAreas || data.available_areas || []
    access.value = {
      superAdmin: Boolean(data.superAdmin ?? data.super_admin),
      manageAreas: data.manageCategories || data.manage_categories || data.manageAreas || data.manage_areas || [],
      availableAreas: rawAreas.map(option => ({ key: option.key, label: option.label }))
    }
  } catch (e) {
    if (!await handleForbidden(e)) error.value = e.message || '反馈权限加载失败'
  } finally {
    loadingAccess.value = false
  }
}

async function loadFeedback() {
  if (!hasManagePermission.value) return
  const requestId = ++loadRequestId
  loading.value = true
  error.value = ''
  try {
    const data = await listManagedFeedback({
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
    if (requestId === loadRequestId && !await handleForbidden(e)) error.value = e.message || '反馈加载失败'
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
  cancelReply()
  const item = feedbacks.value.find(ticket => ticket.id === id)
  if (!item || (item.messages && item.messages.length)) return
  await loadFeedbackDetail(id)
}

function handleReplyMediaPaste(event) {
  if (replying.value) return
  replyMedia.handlePaste(event)
}

async function loadFeedbackDetail(id) {
  detailLoading.value = true
  detailError.value = ''
  try {
    const detail = await getFeedback(id)
    if (!detail.viewerCanManage) throw new Error('该工单不在当前管理范围内')
    replaceTicket(detail)
    selectedId.value = id
  } catch (e) {
    if (!await handleForbidden(e)) detailError.value = e.message || '详情加载失败'
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
  replyMedia.clear()
  replyTarget.value = id
  replyContent.value = ''
}

function cancelReply() {
  replyMedia.clear()
  replyTarget.value = ''
  replyContent.value = ''
}

async function submitReply(id) {
  const content = replyContent.value.trim()
  if (!content) return
  replying.value = true
  try {
    const mediaIds = await replyMedia.uploadAll()
    replaceTicket(await appendManagedFeedbackMessage(id, { content, mediaIds }))
    cancelReply()
  } catch (e) {
    if (!await handleForbidden(e)) detailError.value = e.message || '发送失败'
  } finally {
    replying.value = false
  }
}

async function updateStatus(id, status) {
  try {
    await updateManagedFeedbackStatus(id, status)
    await reloadFromFirstPage()
  } catch (e) {
    if (!await handleForbidden(e)) detailError.value = e.message || '操作失败'
  }
}

async function handleForbidden(value) {
  if (!value || value.status !== 403) return false
  loadRequestId += 1
  feedbacks.value = []
  closeDetail()
  await router.replace({ path: '/forbidden', query: { from: '/feedback/manage' } })
  return true
}

onMounted(async () => {
  await loadAccess()
  if (!hasManagePermission.value) return
  await loadFeedback()
  const reportId = route.query.id ? String(route.query.id) : ''
  if (reportId) await selectTicket(reportId)
})

onBeforeUnmount(() => {
  loadRequestId += 1
})
</script>

<style scoped>
.manage-feedback .feedback-hero { --wm: '工作台'; }
.permission-state { min-height: 220px; display: grid; place-content: center; justify-items: center; gap: 10px; margin: 16px 0 48px; padding: 28px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink-60); text-align: center; }
.permission-state strong { color: var(--ink); font-size: 18px; }
.permission-state .feedback-primary-action { margin-top: 8px; text-decoration: none; }
</style>
