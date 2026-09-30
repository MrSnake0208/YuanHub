<template>
  <div class="feedback-page page-feedback">
    <IslandSidebar />

    <main id="main-content">
      <header class="hero feedback-hero">
        <div class="wrap">
          <div class="feedback-hero-kicker">ME / FEEDBACK CENTER</div>
          <div class="feedback-hero-layout">
            <div>
              <h1>反馈中心</h1>
              <p class="hero-sub">提交并跟进你的反馈。管理员回复后会收到站内通知，工单处理期间可补充说明与附件。</p>
            </div>
            <button class="feedback-primary-action feedback-hero-action" type="button" @click="showNewForm = true">
              <Plus :size="18" aria-hidden="true" />
              新建反馈
            </button>
          </div>
        </div>
      </header>

      <section class="feedback-content">
        <div class="wrap">
          <FeedbackWorkspaceNav
            active="mine"
            :can-manage="canManageFeedback"
            :has-unread-feedback="canManageFeedback && feedbackUnreadState.count > 0"
            :can-configure="canConfigureFeedback"
          />

          <div v-if="publicNotice" class="feedback-public-notice" role="status">
            <span>{{ publicNotice }}</span>
            <button type="button" aria-label="关闭提示" title="关闭" @click="publicNotice = ''">×</button>
          </div>

          <div class="feedback-command-bar">
            <form class="feedback-search" role="search" @submit.prevent="searchFeedback">
              <Search :size="18" aria-hidden="true" />
              <input v-model="q" type="search" name="feedback-search" aria-label="搜索反馈" placeholder="搜索反馈内容或工单编号..." />
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
              <span>反馈板块</span>
              <select v-model="filterCategory" :disabled="!categoryOptions.length" @change="reloadFromFirstPage">
                <option value="">全部板块</option>
                <option v-for="option in categoryOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
              </select>
            </label>
            <span class="feedback-result-meta">第 {{ page }} / {{ totalPages }} 页，每页 {{ PAGE_SIZE }} 条</span>
            <span v-if="accessError" class="feedback-form-error" role="alert">{{ accessError }}</span>
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
            :empty-message="hasFilters ? '没有找到符合条件的反馈' : '还没有提交过反馈'"
            @select="selectTicket"
            @close="closeDetail"
            @retry="loadFeedback"
            @page="changePage"
          >
            <template #empty>
              <template v-if="hasFilters">
                <p>试试其他关键词，或清除筛选查看全部反馈。</p>
                <button class="feedback-button" type="button" @click="clearFilters">清除筛选</button>
              </template>
              <template v-else>
                <p>遇到问题或有新想法？提交后可在这里查看回复。</p>
                <div class="feedback-empty-actions">
                  <button class="feedback-primary-action" type="button" @click="showNewForm = true"><Plus :size="16" aria-hidden="true" />提交第一条反馈</button>
                  <RouterLink class="feedback-button" to="/feedback/plaza">先看看反馈广场</RouterLink>
                </div>
              </template>
            </template>
            <template #detail="{ item }">
              <FeedbackTicketDetail
                :item="item"
                :loading="detailLoading"
                :error="detailError"
                :format-date="formatDate"
                :viewer-user-id="currentUserId()"
                viewer-actor-mode="REPORTER"
              >
                <template #actions>
                  <p v-if="item.status === 'OPEN' && item.viewerIsReporter && item.quota?.canAppend === false" class="feedback-result-meta" role="status">
                    连续补充已达 {{ item.quota.pendingLimit }} 条，请等待管理员回复后继续补充。
                  </p>
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
                      :disabled="updatingStatus || replying || detailLoading"
                      @click="closeFeedback(item.id)"
                    >
                      <CheckCircle2 :size="16" />问题已解决 · 标记完成
                    </button>
                  </div>
                </template>
                <template #composer>
                  <div v-if="replyTarget === item.id" class="feedback-reply-form">
                      <textarea v-model="replyContent" class="feedback-form-control" rows="3" maxlength="1000" placeholder="补充问题细节或回复内容" @paste="handleReplyMediaPaste"></textarea>
                      <FeedbackAttachmentPicker :media="replyMedia" :busy="replying" />
                      <div class="feedback-form-actions">
                        <button class="feedback-button" type="button" :disabled="replying" @click="cancelReply">取消</button>
                        <button class="feedback-primary-action" type="button" :disabled="replying || replyMedia.uploading || replyMedia.optimizing" @click="submitReply(item.id)">
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
        <div ref="newFormPanel" class="modal feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title" tabindex="-1" @keydown.esc.prevent="closeNewFeedback">
          <div class="modal-head">
            <div>
              <span class="feedback-modal-kicker">NEW / FEEDBACK</span>
              <h2 id="feedback-modal-title">新建反馈</h2>
            </div>
            <button type="button" aria-label="关闭提交反馈弹窗" @click="closeNewFeedback"><X :size="20" /></button>
          </div>
          <form @submit.prevent="submitFeedback">
            <p class="feedback-submission-note">反馈先由你和管理员沟通。适合共同跟进的问题会整理到反馈广场，原始正文、附件与账号信息不会直接公开。</p>
            <p v-if="publicNotice" class="feedback-submission-note" role="status">{{ publicNotice }}</p>
            <div class="feedback-form-grid">
              <label>
                <span>反馈类型</span>
                <select v-model="newFeedback.type" class="feedback-form-control" required @change="scheduleSimilarSearch">
                  <option v-for="option in feedbackTypeOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                </select>
              </label>
              <label>
                <span>反馈板块</span>
                <select v-model="newFeedback.category" class="feedback-form-control" required :disabled="!categoryOptions.length">
                  <option value="">{{ accessError ? '反馈板块加载失败' : categoryOptions.length ? '请选择反馈板块' : '正在加载反馈板块' }}</option>
                  <option v-for="option in categoryOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                </select>
              </label>
              <label class="full">
                <span>标题</span>
                <input v-model="newFeedback.title" class="feedback-form-control" type="text" maxlength="120" :aria-invalid="Boolean(formError && !newFeedback.title.trim())" placeholder="用一句话描述问题或建议" @input="formError = ''; scheduleSimilarSearch()" />
                <small v-if="formError && !newFeedback.title.trim()" class="feedback-form-error" role="alert">请填写标题</small>
              </label>
              <SimilarFeedbackList
                class="full"
                :items="similarItems"
                :loading="similarLoading"
                @support="handleSimilarSupport"
              />
              <label class="full">
                <span>详细描述</span>
                <textarea v-model="newFeedback.content" class="feedback-form-control" rows="6" maxlength="1000" placeholder="请描述复现步骤、期望结果或具体建议" required @paste="handleNewMediaPaste"></textarea>
                <small>{{ newFeedback.content.length }} / 1000</small>
              </label>
              <FeedbackAttachmentPicker class="full" :media="newMedia" :busy="submitting" />
              <label class="feedback-consent full">
                <input v-model="newFeedback.clientInfoConsent" type="checkbox" />
                <span>允许附加浏览器、操作系统和 IP 地址信息，帮助定位问题</span>
              </label>
            </div>
            <div v-if="formError" class="feedback-form-error" role="alert">{{ formError }}</div>
            <div v-if="accessError" class="feedback-form-error" role="alert">{{ accessError }}</div>
            <div class="modal-foot">
              <button type="button" class="feedback-button" @click="closeNewFeedback">取消</button>
              <button type="submit" class="feedback-primary-action" :disabled="submitting || newMedia.uploading || newMedia.optimizing || !categoryOptions.length">
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, CheckCircle2, MessageSquarePlus, Plus, Search, Send, X } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import FeedbackAttachmentPicker from '@/components/feedback/FeedbackAttachmentPicker.vue'
import FeedbackTicketDetail from '@/components/feedback/FeedbackTicketDetail.vue'
import FeedbackTicketWorkspace from '@/components/feedback/FeedbackTicketWorkspace.vue'
import FeedbackWorkspaceNav from '@/components/feedback/FeedbackWorkspaceNav.vue'
import SimilarFeedbackList from '@/components/co-creation/SimilarFeedbackList.vue'
import {
  appendMyFeedbackMessage,
  createFeedback,
  getFeedback,
  getFeedbackAccess,
  listMyFeedback,
  updateMyFeedbackStatus
} from '@/api/feedback.js'
import { findSimilarFeedback } from '@/api/coCreation.js'
import { markFeedbackNotificationsRead } from '@/api/notifications.js'
import { auth } from '@/store/auth.js'
import { feedbackUnreadState, subscribeFeedbackUnread } from '@/store/feedbackUnread.js'
import {
  notificationUnreadState,
  refreshNotificationUnreadDetails,
  removeNotificationUnreadItems,
  subscribeNotificationUnread
} from '@/store/notificationUnread.js'
import { ADMIN_PERMISSIONS, canManageAnyFeedback, hasPermission } from '@/utils/authPermissions.js'
import { useFeedbackMedia } from '@/utils/feedbackMedia.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { dialog } from '@/utils/dialog.js'
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
const route = useRoute()
const feedbacks = ref([])
const access = ref({ availableAreas: [] })
const accessError = ref('')
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
const showNewForm = ref(false)
const newFormPanel = ref(null)
useModalFocus(() => showNewForm.value, newFormPanel, {
  initialFocus: () => newFormPanel.value?.querySelector('select'),
  onEscape: closeNewFeedback
})
const submitting = ref(false)
const formError = ref('')
const replyTarget = ref('')
const replying = ref(false)
const updatingStatus = ref(false)
const replyContent = ref('')
const newFeedback = ref({ type: 'BUG', category: '', title: '', content: '', clientInfoConsent: false })
const newMedia = useFeedbackMedia()
const newFeedbackDirty = computed(() => showNewForm.value && (
  Boolean(newFeedback.value.title.trim() || newFeedback.value.content.trim() || newFeedback.value.category || newFeedback.value.clientInfoConsent || newFeedback.value.type !== 'BUG') || newMedia.items.length > 0
))
const confirmNewFeedbackDiscard = useUnsavedChanges(newFeedbackDirty, '反馈草稿')
const similarItems = ref([])
const similarLoading = ref(false)
const publicNotice = ref('')
let similarTimer = null
let similarRequestId = 0
const replyMedia = useFeedbackMedia()
const unreadFeedbackIds = computed(() => notificationUnreadState.feedbackRefIds)
let loadRequestId = 0
let detailRequestId = 0
let ready = false
let stopNotificationUnread = null
let stopFeedbackUnread = null
let isMounted = false

const categoryOptions = computed(() => access.value.availableAreas)
const canManageFeedback = computed(() => canManageAnyFeedback(auth.adminAccess))
const canConfigureFeedback = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE))
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))
const hasFilters = computed(() => Boolean(q.value.trim() || filterType.value || filterCategory.value || filterStatus.value !== '全部'))

function clearFilters() {
  q.value = ''
  filterType.value = ''
  filterCategory.value = ''
  filterStatus.value = '全部'
  reloadFromFirstPage()
}

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
  accessError.value = ''
  try {
    const data = await getFeedbackAccess()
    const rawAreas = data.availableCategories || data.available_categories || data.availableAreas || data.available_areas || []
    if (!rawAreas.length) throw new Error('反馈板块目录为空')
    access.value.availableAreas = rawAreas.map(option => ({ key: option.key, label: option.label }))
  } catch (_) {
    access.value.availableAreas = []
    accessError.value = '反馈板块加载失败，请刷新页面重试。'
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
  } catch (e) {
    if (requestId === loadRequestId) error.value = e.message || '反馈加载失败'
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

async function clearFeedbackNotifications(id) {
  const reportId = id == null ? '' : String(id)
  if (!reportId) return
  try {
    const unreadNotifications = await refreshNotificationUnreadDetails()
    const marked = await markFeedbackNotificationsRead(reportId, unreadNotifications)
    if (marked.length > 0) removeNotificationUnreadItems(marked.map(item => item && item.id))
  } catch (_) {
    // 标记失败时保留标识，避免伪造已读状态。
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
  selectedId.value = String(id)
  selectedDetail.value = { id: String(id) }
  cancelReply()
  await loadFeedbackDetail(String(id))
}

function handleNewMediaPaste(event) {
  if (submitting.value) return
  newMedia.handlePaste(event)
}

function handleReplyMediaPaste(event) {
  if (replying.value) return
  replyMedia.handlePaste(event)
}

function currentUserId() {
  const user = auth.userInfo || {}
  return String(user.id || user.userId || user.user_id || '')
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
    if (!detail.viewerIsReporter) throw new Error('该工单不属于我的反馈')
    replaceTicket(detail)
    await nextTick()
    if (!isCurrentDetail(requestId, id, userId)) return
    await clearFeedbackNotifications(detail.id || id)
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId)) detailError.value = e.message || '详情加载失败'
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
  selectedDetail.value = null
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
    const detail = await appendMyFeedbackMessage(id, { content, mediaIds })
    if (!isCurrentDetail(requestId, id, userId)) return
    replaceTicket(detail)
    cancelReply()
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId)) detailError.value = e.message || '发送失败'
  } finally {
    replying.value = false
  }
}

async function closeFeedback(id) {
  if (updatingStatus.value || replying.value || detailLoading.value) return
  const requestId = detailRequestId
  const userId = currentUserId()
  updatingStatus.value = true
  try {
    const confirmed = await dialog.confirm({ title: '确认问题已解决？', message: '结案后将移至「已完成」，不能再追加消息。若仍有问题，请先补充说明。', confirmText: '标记完成' })
    if (!confirmed || !isCurrentDetail(requestId, id, userId)) return
    detailError.value = ''
    await updateMyFeedbackStatus(id, 'RESOLVED')
    if (isCurrentDetail(requestId, id, userId)) {
      filterStatus.value = '已完成'
      await reloadFromFirstPage()
      publicNotice.value = '工单已完成，已切换到「已完成」列表。'
      await nextTick()
      document.querySelector('.feedback-public-notice')?.scrollIntoView?.({ block: 'nearest' })
    }
  } catch (e) {
    if (isCurrentDetail(requestId, id, userId)) detailError.value = e.message || '操作失败'
  } finally {
    updatingStatus.value = false
  }
}

async function closeNewFeedback() {
  if (submitting.value) return
  if (!await confirmNewFeedbackDiscard()) return
  showNewForm.value = false
  formError.value = ''
  newFeedback.value = { type: 'BUG', category: '', title: '', content: '', clientInfoConsent: false }
  newMedia.clear()
  resetSimilar()
}

function resetSimilar() {
  similarRequestId += 1
  if (similarTimer) clearTimeout(similarTimer)
  similarTimer = null
  similarItems.value = []
  similarLoading.value = false
}

function scheduleSimilarSearch() {
  if (similarTimer) clearTimeout(similarTimer)
  const title = newFeedback.value.title.trim()
  if (title.length < 2) {
    resetSimilar()
    return
  }
  similarLoading.value = true
  const requestId = ++similarRequestId
  similarTimer = setTimeout(() => runSimilarSearch(requestId, title), 350)
}

async function runSimilarSearch(requestId, title) {
  try {
    const items = await findSimilarFeedback(title, newFeedback.value.type)
    if (!isMounted || requestId !== similarRequestId || !showNewForm.value) return
    similarItems.value = items
  } catch (_) {
    if (isMounted && requestId === similarRequestId) similarItems.value = []
  } finally {
    if (isMounted && requestId === similarRequestId) similarLoading.value = false
  }
}

function handleSimilarSupport(detail) {
  if (!detail) return
  similarItems.value = similarItems.value.map(item => item.id === detail.id ? { ...item, ...detail } : item)
  publicNotice.value = '已记录你的支持。草稿已保留，有不同的细节仍可继续提交。'
}

async function submitFeedback() {
  const title = newFeedback.value.title.trim()
  if (!title) { formError.value = '请填写标题'; return }
  const content = newFeedback.value.content.trim()
  if (!content || !newFeedback.value.category || submitting.value) return
  if (!categoryOptions.value.some(option => option.key === newFeedback.value.category)) {
    formError.value = '请选择有效的反馈板块'
    return
  }
  const payload = { ...newFeedback.value, title, content }
  const userId = currentUserId()
  submitting.value = true
  formError.value = ''
  try {
    const mediaIds = await newMedia.uploadAll()
    if (!isMounted || currentUserId() !== userId) return
    const created = await createFeedback({ ...payload, mediaIds })
    if (!isMounted || currentUserId() !== userId) return
    newMedia.clear()
    resetSimilar()
    newFeedback.value = { type: 'BUG', category: '', title: '', content: '', clientInfoConsent: false }
    showNewForm.value = false
    publicNotice.value = '反馈已提交。管理员回复后会收到站内通知，你也可以在这里继续补充。'
    filterStatus.value = '全部'
    filterType.value = ''
    filterCategory.value = ''
    q.value = ''
    page.value = 1
    await loadFeedback()
    if (isMounted && currentUserId() === userId) await selectTicket(created.id)
  } catch (e) {
    if (isMounted && currentUserId() === userId) formError.value = e.message || '提交失败'
  } finally {
    submitting.value = false
  }
}

function handleWindowKeydown(event) {
  if (event.key === 'Escape' && selectedId.value) closeDetail()
}

onMounted(async () => {
  isMounted = true
  stopNotificationUnread = subscribeNotificationUnread({ details: true })
  stopFeedbackUnread = subscribeFeedbackUnread()
  window.addEventListener('keydown', handleWindowKeydown)
  await Promise.all([loadAccess(), loadFeedback(), refreshNotificationUnreadDetails()])
  if (!isMounted) return
  ready = true
  const reportId = route.query.id ? String(route.query.id) : ''
  if (reportId) await selectTicket(reportId)
})

watch(() => route.query.new, value => {
  if (value !== '1') return
  const type = route.query.type
  if (feedbackTypeOptions.some(option => option.key === type)) newFeedback.value.type = type
  showNewForm.value = true
}, { immediate: true })

watch(() => route.query.id, id => {
  if (!isMounted || !ready) return
  if (id) selectTicket(String(id))
  else closeDetail()
})

onBeforeUnmount(() => {
  isMounted = false
  ready = false
  detailRequestId += 1
  loadRequestId += 1
  resetSimilar()
  if (stopNotificationUnread) stopNotificationUnread()
  if (stopFeedbackUnread) stopFeedbackUnread()
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<style scoped>
.feedback-public-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; padding: 10px 14px; border: 1px solid var(--feedback-success); border-radius: 8px; background: rgba(95, 127, 97, .1); color: var(--feedback-text); font-size: 12.5px; font-weight: 700; }
.feedback-public-notice button { border: 0; background: transparent; color: var(--feedback-text-muted); font-size: 18px; line-height: 1; cursor: pointer; }
.feedback-modal { max-width: 620px; }
.feedback-empty-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 100%; margin-top: 6px; }
.feedback-modal-kicker { display: block; margin-bottom: 5px; color: var(--feedback-accent); font: 800 10px var(--font-d); letter-spacing: .16em; }
.feedback-modal .modal-head h2 { color: var(--feedback-text); font-family: var(--font-s); font-size: 20px; font-weight: 900; letter-spacing: 0; }
.feedback-modal .modal-head button { color: var(--feedback-text-muted); }
.feedback-modal form { background: var(--feedback-panel-deep); }
.feedback-submission-note { margin: 0 0 16px; color: var(--feedback-text-muted); font-size: 12px; line-height: 1.7; }
.feedback-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.feedback-form-grid label { min-width: 0; margin: 0; }
.feedback-form-grid label > span { display: block; margin-bottom: 6px; color: var(--feedback-text-muted); font-size: 12px; font-weight: 800; }
.feedback-form-grid .full { grid-column: 1 / -1; }
.feedback-form-grid small { display: block; margin-top: 5px; color: var(--feedback-text-dim); font-size: 11px; text-align: right; }
.feedback-form-grid .feedback-consent { display: flex; align-items: flex-start; gap: 8px; }
.feedback-form-grid .feedback-consent input { width: auto; flex: none; margin-top: 3px; }
.feedback-form-grid .feedback-consent span { margin: 0; line-height: 1.6; }
.feedback-form-grid select option { background: var(--feedback-panel-deep); color: var(--feedback-text); }

@media (max-width: 767px) {
  .feedback-form-grid { grid-template-columns: 1fr; }
  .feedback-form-grid .full { grid-column: auto; }
}
</style>
