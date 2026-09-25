<template>
  <div class="feedback-page manage-feedback">
    <IslandSidebar />

    <main id="main-content">
      <header class="hero feedback-hero">
        <div class="wrap">
          <AdminBackLink />
          <div class="feedback-hero-kicker">ADMIN / FEEDBACK CENTER</div>
          <div class="feedback-hero-layout">
            <div>
              <h1>反馈工作台</h1>
              <p class="hero-sub">集中处理授权板块的反馈，查看提交记录，并在同一工单内完成回复、结案或驳回。</p>
            </div>
          </div>
        </div>
      </header>

      <section class="feedback-content">
        <div class="wrap">
          <FeedbackWorkspaceNav active="manage" :can-manage="hasManagePermission" :show-management="false" :has-unread-feedback="hasManagePermission && feedbackUnreadState.count > 0" :can-configure="canConfigureFeedback" />

          <div v-if="loadingAccess" class="permission-state" role="status">正在检查反馈权限…</div>
          <div v-else-if="!hasManagePermission" class="permission-state" role="alert">
            <ShieldAlert :size="24" aria-hidden="true" />
            <strong>暂无板块管理权限</strong>
            <span>当前账号仍可提交和跟踪自己的反馈。</span>
            <router-link class="feedback-primary-action" to="/feedback">前往我的反馈</router-link>
          </div>

          <template v-else>
            <div class="feedback-command-bar">
              <form class="feedback-search" role="search" @submit.prevent="searchFeedback">
                <Search :size="18" aria-hidden="true" />
                <input v-model="q" type="search" name="managed-feedback-search" aria-label="搜索待处理反馈" placeholder="搜索反馈内容或工单编号..." />
                <button type="submit" title="搜索" aria-label="搜索"><ArrowRight :size="16" /></button>
              </form>
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
              <div class="feedback-result-tools">
                <span class="feedback-result-meta">第 {{ page }} / {{ totalPages }} 页，每页 {{ PAGE_SIZE }} 条</span>
                <button
                  class="feedback-button feedback-mark-read-button"
                  type="button"
                  :disabled="markingAllRead || feedbackUnreadState.loading || feedbackUnreadState.count === 0"
                  :title="markAllReadHint"
                  :aria-label="markAllReadHint"
                  @click="markAllUnreadFeedback"
                >
                  <CheckCheck :size="15" aria-hidden="true" />
                  <span>{{ markingAllRead ? '标记中…' : '一键已读' }}</span>
                  <span v-if="feedbackUnreadState.count > 0" class="feedback-mark-read-count" aria-hidden="true">
                    {{ feedbackUnreadState.count > 99 ? '99+' : feedbackUnreadState.count }}
                  </span>
                </button>
              </div>
            </div>

            <FeedbackTicketWorkspace
              :items="feedbacks"
              :selected-id="selectedId"
              :selected-item="selectedDetail"
              :loading="loading"
              :error="error"
              :total="totalCount"
              :page="page"
              :total-pages="totalPages"
              :type-label="typeLabel"
              :category-label="categoryLabel"
              :status-label="statusLabel"
              :format-date="formatDate"
              :unread-feedback-ids="unreadFeedbackIds"
              show-reporter
              empty-message="暂无符合条件的授权工单"
              @select="selectTicket"
              @close="closeDetail"
              @retry="loadFeedback"
              @page="changePage"
            >
              <template #detail="{ item }">
                <AdminFeedbackPublishPanel
                  v-if="item.viewerCanManage"
                  :item="item"
                  :busy="publicBusy"
                  :message="publicMessage"
                  :error="publicError"
                  :format-date="formatDate"
                  @save="savePublicInfo"
                  @unpublish="unpublishPublicInfo"
                  @merge="openMergeDialog"
                />
                <AdminFeedbackVersionSelector
                  v-if="item.viewerCanManage"
                  :item="item"
                  :busy="versionBusy"
                  :message="versionMessage"
                  :error="versionError"
                  @save="saveVersions"
                />
                <FeedbackTicketDetail
                  :item="item"
                  :loading="detailLoading"
                  :error="detailError"
                  :format-date="formatDate"
                  :viewer-user-id="currentUserId()"
                  viewer-actor-mode="ADMIN"
                  reporter-label="提交人"
                >
                  <template #actions>
                    <div v-if="item.viewerCanManage" class="feedback-detail-actions">
                      <button v-if="item.status === 'OPEN'" class="feedback-button" type="button" @click="showReplyForm(item.id)">
                        <MessageSquarePlus :size="16" />回复
                      </button>
                      <button v-if="item.status === 'OPEN'" class="feedback-button" type="button" :disabled="updatingStatus || replying || detailLoading" @click="updateStatus(item.id, 'RESOLVED')">
                        <CheckCircle2 :size="16" />标记完成
                      </button>
                      <button v-if="item.status === 'OPEN'" class="feedback-button danger" type="button" :disabled="updatingStatus || replying || detailLoading" @click="updateStatus(item.id, 'DISMISSED')">
                        <CircleX :size="16" />驳回
                      </button>
                    </div>
                  </template>
                  <template #composer>
                    <div v-if="replyTarget === item.id" class="feedback-reply-form">
                      <textarea v-model="replyContent" class="feedback-form-control" rows="3" maxlength="1000" placeholder="输入处理回复" @paste="handleReplyMediaPaste"></textarea>
                      <FeedbackAttachmentPicker :media="replyMedia" :busy="replying" />
                      <div class="feedback-form-actions">
                        <button class="feedback-button" type="button" :disabled="replying" @click="cancelReply">取消</button>
                        <button class="feedback-primary-action" type="button" :disabled="replying || replyMedia.uploading || replyMedia.optimizing" @click="submitReply(item.id)">
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

    <AdminFeedbackMergeDialog
      :open="mergeOpen"
      :source-id="selectedId"
      :busy="mergeBusy"
      @close="mergeOpen = false"
      @confirm="confirmMerge"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, CheckCheck, CheckCircle2, CircleX, MessageSquarePlus, Search, Send, ShieldAlert } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import AdminBackLink from '@/components/admin/AdminBackLink.vue'
import AdminFeedbackMergeDialog from '@/components/feedback/AdminFeedbackMergeDialog.vue'
import AdminFeedbackPublishPanel from '@/components/feedback/AdminFeedbackPublishPanel.vue'
import AdminFeedbackVersionSelector from '@/components/feedback/AdminFeedbackVersionSelector.vue'
import FeedbackAttachmentPicker from '@/components/feedback/FeedbackAttachmentPicker.vue'
import FeedbackTicketDetail from '@/components/feedback/FeedbackTicketDetail.vue'
import FeedbackTicketWorkspace from '@/components/feedback/FeedbackTicketWorkspace.vue'
import FeedbackWorkspaceNav from '@/components/feedback/FeedbackWorkspaceNav.vue'
import {
  appendManagedFeedbackMessage,
  getFeedback,
  getFeedbackAccess,
  listManagedFeedback,
  mergeFeedback,
  publishFeedback,
  unpublishFeedback,
  updateFeedbackVersions,
  updateManagedFeedbackStatus
} from '@/api/feedback.js'
import { auth } from '@/store/auth.js'
import * as feedbackUnreadStore from '@/store/feedbackUnread.js'
import { ADMIN_PERMISSIONS, hasPermission } from '@/utils/authPermissions.js'
import { useFeedbackMedia } from '@/utils/feedbackMedia.js'
import { markFeedbackRead } from '@/utils/feedbackReadState.js'
import '@/styles/feedback-workspace.css'

const { feedbackUnreadState, subscribeFeedbackUnread } = feedbackUnreadStore
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
const selectedDetail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const replyTarget = ref('')
const replyContent = ref('')
const replying = ref(false)
const updatingStatus = ref(false)
const markingAllRead = ref(false)
const publicBusy = ref(false)
const publicMessage = ref('')
const publicError = ref('')
const versionBusy = ref(false)
const versionMessage = ref('')
const versionError = ref('')
const mergeOpen = ref(false)
const mergeBusy = ref(false)
const replyMedia = useFeedbackMedia()
let isMounted = false
let ready = false
let loadRequestId = 0
let detailRequestId = 0
let feedbackRefreshTimer = null
let stopFeedbackUnread = null

const canConfigureFeedback = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE))
const hasManagePermission = computed(() => access.value.superAdmin || access.value.manageAreas.length > 0)
const categoryOptions = computed(() => {
  const all = access.value.availableAreas.length ? access.value.availableAreas : DEFAULT_AREAS
  return access.value.superAdmin ? all : all.filter(option => access.value.manageAreas.includes(option.key))
})
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))
const unreadFeedbackIds = computed(() => feedbackUnreadState.ids)
const markAllReadHint = computed(() => feedbackUnreadState.count > 0
  ? `将当前管理范围内 ${feedbackUnreadState.count} 条未读反馈全部标记为已读`
  : '当前没有未读反馈')

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

function currentUserId() {
  const user = auth.userInfo
  return user && (user.id || user.userId || user.user_id) ? String(user.id || user.userId || user.user_id) : ''
}

async function loadAccess() {
  loadingAccess.value = true
  try {
    const data = await getFeedbackAccess()
    if (!isMounted) return
    const rawAreas = data.availableCategories || data.available_categories || data.availableAreas || data.available_areas || []
    access.value = {
      superAdmin: Boolean(data.superAdmin ?? data.super_admin),
      manageAreas: data.manageCategories || data.manage_categories || data.manageAreas || data.manage_areas || [],
      availableAreas: rawAreas.map(option => ({ key: option.key, label: option.label }))
    }
  } catch (e) {
    if (isMounted && !await handleForbidden(e)) error.value = e.message || '反馈权限加载失败'
  } finally {
    loadingAccess.value = false
  }
}

async function loadFeedback({ background = false } = {}) {
  if (!isMounted || !hasManagePermission.value || (background && loading.value)) return
  const requestId = ++loadRequestId
  if (!background) {
    loading.value = true
    error.value = ''
  }
  try {
    const data = await listManagedFeedback({
      page: page.value,
      pageSize: PAGE_SIZE,
      status: statusParam(),
      type: filterType.value || undefined,
      category: filterCategory.value || undefined,
      q: q.value.trim() || undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    })
    if (requestId !== loadRequestId) return
    feedbacks.value = data.items || []
    totalCount.value = Number(data.total ?? feedbacks.value.length)
  } catch (e) {
    if (requestId === loadRequestId && !await handleForbidden(e) && !background) error.value = e.message || '反馈加载失败'
  } finally {
    if (requestId === loadRequestId && !background) loading.value = false
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

async function markAllUnreadFeedback() {
  if (markingAllRead.value || feedbackUnreadState.loading || feedbackUnreadState.count === 0) return
  const markAllRead = feedbackUnreadStore.markAllManagedFeedbackRead
  if (typeof markAllRead !== 'function') return
  markingAllRead.value = true
  try {
    await markAllRead()
  } finally {
    markingAllRead.value = false
  }
}

async function changePage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || loading.value) return
  page.value = nextPage
  closeDetail()
  await loadFeedback()
}

async function selectTicket(id) {
  selectedId.value = String(id)
  cancelReply()
  resetPublicPanel()
  selectedDetail.value = { id: String(id) }
  await loadFeedbackDetail(String(id))
}

function handleReplyMediaPaste(event) {
  if (replying.value) return
  replyMedia.handlePaste(event)
}

function isCurrentDetail(requestId, id, userId) {
  return isMounted && requestId === detailRequestId && selectedId.value === id && currentUserId() === userId
}

async function loadFeedbackDetail(id) {
  const requestId = ++detailRequestId
  const userId = currentUserId()
  detailLoading.value = true
  detailError.value = ''
  try {
    const detail = await getFeedback(id)
    if (!isCurrentDetail(requestId, id, userId)) return
    if (!detail.viewerCanManage) throw new Error('该工单不在当前管理范围内')
    replaceTicket(detail)
    await nextTick()
    if (!isCurrentDetail(requestId, id, userId)) return
    selectedId.value = id
    markFeedbackRead(currentUserId(), detail.id || id, detail)
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) detailError.value = e.message || '详情加载失败'
  } finally {
    if (isCurrentDetail(requestId, id, userId)) detailLoading.value = false
  }
}

function replaceTicket(detail) {
  selectedDetail.value = detail
  const index = feedbacks.value.findIndex(item => item.id === detail.id)
  if (index >= 0) feedbacks.value.splice(index, 1, detail)
}

function closeDetail() {
  detailRequestId += 1
  detailLoading.value = false
  selectedId.value = ''
  selectedDetail.value = null
  detailError.value = ''
  cancelReply()
  resetPublicPanel()
}

function resetPublicPanel() {
  publicBusy.value = false
  publicMessage.value = ''
  publicError.value = ''
  mergeOpen.value = false
  mergeBusy.value = false
  versionBusy.value = false
  versionMessage.value = ''
  versionError.value = ''
}

async function saveVersions(payload) {
  const id = selectedId.value
  if (!id || versionBusy.value) return
  const requestId = detailRequestId
  const userId = currentUserId()
  versionBusy.value = true
  versionMessage.value = ''
  versionError.value = ''
  try {
    const detail = await updateFeedbackVersions(id, payload)
    if (!isCurrentDetail(requestId, id, userId)) return
    replaceTicket(detail)
    versionMessage.value = '版本关联已更新'
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) versionError.value = e.message || '版本关联失败'
  } finally {
    versionBusy.value = false
  }
}

async function savePublicInfo(payload) {
  const id = selectedId.value
  if (!id || publicBusy.value) return
  const requestId = detailRequestId
  const userId = currentUserId()
  publicBusy.value = true
  publicMessage.value = ''
  publicError.value = ''
  try {
    const detail = await publishFeedback(id, payload)
    if (!isCurrentDetail(requestId, id, userId)) return
    replaceTicket(detail)
    publicMessage.value = detail.visibility === 'PUBLIC' ? '已发布到反馈广场' : '已更新公开信息'
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) publicError.value = e.message || '操作失败'
  } finally {
    publicBusy.value = false
  }
}

async function unpublishPublicInfo() {
  const id = selectedId.value
  if (!id || publicBusy.value) return
  const requestId = detailRequestId
  const userId = currentUserId()
  publicBusy.value = true
  publicMessage.value = ''
  publicError.value = ''
  try {
    const detail = await unpublishFeedback(id)
    if (!isCurrentDetail(requestId, id, userId)) return
    replaceTicket(detail)
    publicMessage.value = '已取消公开；已记录的支持会保留。'
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) publicError.value = e.message || '操作失败'
  } finally {
    publicBusy.value = false
  }
}

function openMergeDialog() {
  publicMessage.value = ''
  publicError.value = ''
  mergeOpen.value = true
}

async function confirmMerge(targetId) {
  const id = selectedId.value
  if (!id || mergeBusy.value) return
  const requestId = detailRequestId
  const userId = currentUserId()
  mergeBusy.value = true
  publicError.value = ''
  try {
    const detail = await mergeFeedback(id, targetId)
    if (!isCurrentDetail(requestId, id, userId)) return
    replaceTicket(detail)
    mergeOpen.value = false
    publicMessage.value = '已合并到主反馈；后续进度统一跟随主反馈。'
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) publicError.value = e.message || '合并失败'
  } finally {
    mergeBusy.value = false
  }
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
  if (!content || replying.value || updatingStatus.value || detailLoading.value) return
  if (content.length > 1000) {
    detailError.value = '消息长度不能超过 1000 字符'
    return
  }
  const requestId = detailRequestId
  const userId = currentUserId()
  replying.value = true
  detailError.value = ''
  try {
    const mediaIds = await replyMedia.uploadAll()
    if (!isCurrentDetail(requestId, id, userId)) return
    const detail = await appendManagedFeedbackMessage(id, { content, mediaIds })
    if (!isCurrentDetail(requestId, id, userId)) return
    replaceTicket(detail)
    cancelReply()
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) detailError.value = e.message || '发送失败'
  } finally {
    replying.value = false
  }
}

async function updateStatus(id, status) {
  if (updatingStatus.value || replying.value || detailLoading.value) return
  const requestId = detailRequestId
  const userId = currentUserId()
  updatingStatus.value = true
  detailError.value = ''
  try {
    await updateManagedFeedbackStatus(id, status)
    if (isCurrentDetail(requestId, id, userId)) await reloadFromFirstPage()
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId) && !await handleForbidden(e)) detailError.value = e.message || '操作失败'
  } finally {
    updatingStatus.value = false
  }
}

async function handleForbidden(value) {
  if (!isMounted || !value || value.status !== 403) return false
  loadRequestId += 1
  feedbacks.value = []
  closeDetail()
  await router.replace({ path: '/forbidden', query: { from: '/feedback/manage' } })
  return true
}

onMounted(async () => {
  isMounted = true
  stopFeedbackUnread = subscribeFeedbackUnread()
  await loadAccess()
  if (!isMounted || !hasManagePermission.value) return
  await loadFeedback()
  if (!isMounted) return
  ready = true
  feedbackRefreshTimer = setInterval(() => {
    if (hasManagePermission.value) loadFeedback({ background: true })
  }, 30000)
  const reportId = route.query.id ? String(route.query.id) : ''
  if (reportId) await selectTicket(reportId)
})

watch(() => route.query.id, id => {
  if (!isMounted || !ready || !hasManagePermission.value) return
  if (id) selectTicket(String(id))
  else closeDetail()
})

onBeforeUnmount(() => {
  isMounted = false
  ready = false
  loadRequestId += 1
  detailRequestId += 1
  if (feedbackRefreshTimer) {
    clearInterval(feedbackRefreshTimer)
    feedbackRefreshTimer = null
  }
  if (stopFeedbackUnread) stopFeedbackUnread()
})
</script>

<style scoped>
.permission-state { min-height: 220px; display: grid; place-content: center; justify-items: center; gap: 10px; margin: 16px 0 48px; padding: 28px; border: 1px solid var(--feedback-line); background: var(--feedback-panel); color: var(--feedback-text-muted); text-align: center; }
.permission-state strong { color: var(--feedback-text); font-size: 18px; }
.permission-state .feedback-primary-action { margin-top: 8px; text-decoration: none; }
</style>
