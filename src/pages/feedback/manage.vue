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
              <p class="hero-sub">按负责板块接单、回复、转程序并跟进处理结果。</p>
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
              <div class="feedback-status-tabs" role="tablist" aria-label="工作队列">
                <button
                  v-for="status in statusTabs"
                  :key="status.key"
                  type="button"
                  role="tab"
                  :aria-selected="filterStatus === status.key"
                  :class="{ on: filterStatus === status.key }"
                  @click="setFilter(status)"
                >{{ status.label }}</button>
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
              workflow
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
                  :viewer-user-id="currentUserId()"
                  viewer-actor-mode="ADMIN"
                  reporter-label="提交人"
                  :show-closed-actions="item.viewerCanManage && !item.mergedIntoId"
                >
                  <template #management>
                    <section v-if="item.mergedIntoId || item.mergedSourceIds?.length" class="feedback-admin-settings feedback-merge-relations" aria-label="反馈合并关系">
                      <div v-if="item.mergedIntoId"><strong>已合并至</strong><router-link :to="{ path: '/feedback/manage', query: { id: item.mergedIntoId } }">{{ item.mergedIntoId }}</router-link></div>
                      <div v-if="item.mergedSourceIds?.length"><strong>已归并 {{ item.mergedCount }} 条反馈</strong><ul><li v-for="sourceId in item.mergedSourceIds" :key="sourceId"><router-link :to="{ path: '/feedback/manage', query: { id: sourceId } }">{{ sourceId }}</router-link></li></ul></div>
                    </section>
                    <div v-if="canManageSettings(item)" class="feedback-management-summary" aria-label="反馈管理状态">
                      <span>反馈广场：{{ item.visibility === 'PUBLIC' ? '已发布' : '未发布' }}</span>
                    </div>
                  </template>
                  <template #actions>
                    <div v-if="!item.mergedIntoId" class="feedback-ticket-actions">
                      <p v-if="workflowMessage" class="feedback-workflow-message" role="status">{{ workflowMessage }}</p>
                      <p v-if="detailError" class="feedback-workflow-error" aria-hidden="true">{{ detailError }}</p>
                      <div v-if="!workflowMode && replyTarget !== item.id" ref="workflowToolbar" class="feedback-detail-actions feedback-action-toolbar" role="group" aria-label="工单操作">
                        <button v-if="item.status !== 'OPEN' && item.viewerCanManage" class="feedback-primary-action" type="button" :disabled="actionBusy" @click="updateStatus(item.id, 'OPEN')">重新打开</button>
                        <button v-if="item.status === 'OPEN' && item.workflowStage === 'UNASSIGNED' && item.viewerCanManage" class="feedback-primary-action" type="button" :disabled="actionBusy" @click="runWorkflow('claim', item)">接单</button>
                        <button v-if="item.status === 'OPEN' && item.viewerCanTakeOver" class="feedback-primary-action" type="button" :disabled="actionBusy" @click="openWorkflow('takeover')">接手</button>
                        <button v-if="item.status === 'OPEN' && item.viewerCanManage" :class="item.workflowStage === 'UNASSIGNED' ? 'feedback-button' : 'feedback-primary-action'" type="button" :disabled="actionBusy" @click="showReplyForm(item.id)"><MessageSquarePlus :size="16" aria-hidden="true" />回复</button>
                        <button v-if="item.status === 'OPEN' && item.viewerCanManage && item.workflowStage === 'PROCESSING'" class="feedback-button" type="button" :disabled="actionBusy" @click="updateStatus(item.id, 'RESOLVED')"><CheckCircle2 :size="16" aria-hidden="true" />标记完成</button>
                        <button v-if="item.status === 'OPEN' && ((item.viewerCanManage && ['PROCESSING', 'DEV_HANDOFF'].includes(item.workflowStage)) || item.viewerCanDevelop)" ref="workflowMenuButton" class="feedback-button" type="button" :disabled="actionBusy" :aria-expanded="workflowMenuOpen" :aria-controls="workflowMenuOpen ? 'feedback-workflow-options' : undefined" @click="toggleWorkflowMenu">工单流转<ChevronDown :size="16" aria-hidden="true" /></button>
                        <button v-if="item.status === 'OPEN' && item.viewerCanDevelop" class="feedback-primary-action" type="button" :disabled="actionBusy" @click="openWorkflow('return')">填写结果并交回</button>
                        <button v-if="canManageSettings(item)" ref="managementMenuButton" class="feedback-button" type="button" :disabled="actionBusy" :aria-expanded="managementMenuOpen" :aria-controls="managementMenuOpen ? 'feedback-management-options' : undefined" @click="toggleManagementMenu">管理操作<ChevronDown :size="16" aria-hidden="true" /></button>
                        <button v-if="item.status === 'OPEN' && item.viewerCanManage && item.workflowStage !== 'DEV_HANDOFF'" class="feedback-button danger" type="button" :disabled="actionBusy" @click="updateStatus(item.id, 'DISMISSED')"><CircleX :size="16" aria-hidden="true" />驳回</button>
                      </div>
                      <div v-if="workflowMenuOpen && !workflowMode" id="feedback-workflow-options" class="feedback-workflow-options" role="group" aria-label="流转操作">
                        <template v-if="item.viewerCanManage && item.workflowStage === 'PROCESSING'">
                          <button class="feedback-button" type="button" @click="openWorkflow('assign')">转交运营</button>
                          <button class="feedback-button" type="button" @click="openWorkflow('handoff')">转程序</button>
                          <button class="feedback-button" type="button" @click="openWorkflow('area')">调整板块</button>
                        </template>
                        <button v-if="item.viewerCanManage && item.workflowStage === 'DEV_HANDOFF'" class="feedback-button" type="button" @click="openWorkflow('withdraw')">撤回交接</button>
                        <button class="feedback-button" type="button" @click="openWorkflowHistory(item.id)">处理记录</button>
                      </div>
                      <div v-if="managementMenuOpen && !workflowMode" id="feedback-management-options" class="feedback-workflow-options" role="group" aria-label="管理操作选项">
                        <button class="feedback-button" type="button" @click="openManagementPanel('public')">反馈广场</button>
                        <button v-if="canMergeFeedback(item)" class="feedback-button" type="button" @click="openManagementPanel('merge')">合并反馈</button>
                      </div>
                      <form v-if="workflowMode" ref="workflowForm" class="feedback-workflow-form" tabindex="-1" :aria-label="workflowModeLabel(workflowMode)" @submit.prevent="runWorkflow(workflowMode, item)">
                        <strong>{{ workflowModeLabel(workflowMode) }}</strong>
                        <label v-if="workflowMode === 'assign'">新运营负责人<select v-model="workflowTarget" required :disabled="assigneesLoading || !!assigneesError || !workflowAssignees.length"><option value="">选择运营负责人</option><option v-for="assignee in workflowAssignees" :key="assignee.id" :value="assignee.id">{{ assignee.userName }}（{{ assignee.id }}）</option></select></label>
                        <p v-if="workflowMode === 'assign' && assigneesLoading" class="feedback-workflow-hint" role="status">正在加载可转交的运营负责人…</p>
                        <p v-else-if="workflowMode === 'assign' && assigneesError" class="feedback-workflow-error" role="alert">{{ assigneesError }} <button type="button" @click="loadWorkflowAssignees(item.id)">重试</button></p>
                        <p v-else-if="workflowMode === 'assign' && !workflowAssignees.length" class="feedback-workflow-hint">当前板块没有其他可转交的运营负责人。</p>
                        <p v-if="workflowMode === 'handoff'" class="feedback-workflow-hint">转交当前负责板块「{{ categoryLabel(item.workArea) }}」的程序岗处理。</p>
                        <label v-if="workflowMode === 'area'">新的反馈板块<select v-model="workflowArea" required><option value="">选择板块</option><option v-for="area in operatorCategoryOptions" :key="area.key" :value="area.key">{{ area.label }}</option></select></label>
                        <label>处理说明<textarea v-model.trim="workflowNote" rows="3" required maxlength="1000" /></label>
                        <div class="feedback-form-actions"><button class="feedback-button" type="button" @click="cancelWorkflow">取消</button><button class="feedback-primary-action" type="submit" :disabled="workflowBusy || (workflowMode === 'assign' && (assigneesLoading || !workflowTarget))">{{ workflowBusy ? '处理中…' : '确认' }}</button></div>
                      </form>
                    </div>
                  </template>
                  <template #composer>
                    <div v-if="replyTarget === item.id && !item.mergedIntoId" class="feedback-reply-form">
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
    <Teleport to="body">
      <div v-if="managementDialog === 'public' && selectedDetail && canManageSettings(selectedDetail)" class="modal-mask is-raised" role="presentation" @click.self="closeManagementDialog">
        <section class="modal feedback-modal feedback-management-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-management-title" @keydown.esc.stop.prevent="closeManagementDialog">
          <header class="modal-head"><h2 id="feedback-management-title">反馈广场</h2><button ref="managementDialogCloseButton" type="button" aria-label="关闭管理弹窗" title="关闭" @click="closeManagementDialog"><X :size="20" aria-hidden="true" /></button></header>
          <div class="feedback-management-body">
            <AdminFeedbackPublishPanel
              :item="selectedDetail"
              :busy="publicBusy"
              :message="publicMessage"
              :error="publicError"
              :format-date="formatDate"
              dialog
              @save="savePublicInfo"
              @unpublish="unpublishPublicInfo"
            />
          </div>
        </section>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="workflowHistoryOpen" class="modal-mask is-raised" role="presentation" @click.self="closeWorkflowHistory">
        <section class="modal feedback-modal feedback-history-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-history-title" @keydown.esc.stop.prevent="closeWorkflowHistory">
          <header class="modal-head"><div><h2 id="feedback-history-title">处理记录</h2><small>工单 {{ selectedId }}</small></div><button ref="workflowHistoryCloseButton" type="button" aria-label="关闭处理记录" title="关闭" @click="closeWorkflowHistory"><X :size="20" aria-hidden="true" /></button></header>
          <div class="feedback-history-body">
            <p v-if="workflowEventsLoading" role="status">正在加载处理记录…</p>
            <p v-else-if="workflowEventsError" class="feedback-workflow-error" role="alert">{{ workflowEventsError }} <button type="button" @click="loadWorkflowEvents(selectedId)">重试</button></p>
            <ol v-else-if="workflowEvents.length" class="feedback-workflow-events"><li v-for="event in workflowEvents" :key="event.id"><div><b>{{ workflowActionLabel(event.action) }}</b><time v-if="event.createdAt" :datetime="event.createdAt">{{ formatDate(event.createdAt) }}</time></div><span v-if="event.actorUserId">操作人 {{ event.actorUserId }}</span><p v-if="event.note && event.note !== workflowActionLabel(event.action)">{{ event.note }}</p></li></ol>
            <p v-else>暂无处理记录</p>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, CheckCheck, CheckCircle2, ChevronDown, CircleX, MessageSquarePlus, Search, Send, ShieldAlert, X } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import AdminBackLink from '@/components/admin/AdminBackLink.vue'
import AdminFeedbackMergeDialog from '@/components/feedback/AdminFeedbackMergeDialog.vue'
import AdminFeedbackPublishPanel from '@/components/feedback/AdminFeedbackPublishPanel.vue'
import FeedbackAttachmentPicker from '@/components/feedback/FeedbackAttachmentPicker.vue'
import FeedbackTicketDetail from '@/components/feedback/FeedbackTicketDetail.vue'
import FeedbackTicketWorkspace from '@/components/feedback/FeedbackTicketWorkspace.vue'
import FeedbackWorkspaceNav from '@/components/feedback/FeedbackWorkspaceNav.vue'
import {
  appendManagedFeedbackMessage,
  claimFeedback,
  assignFeedback,
  handoffFeedback,
  changeFeedbackWorkArea,
  returnFeedback,
  listFeedbackWorkflowEvents,
  listFeedbackAssignees,
  getManagedFeedback,
  getFeedbackAccess,
  listWorkflowFeedback,
  mergeFeedback,
  publishFeedback,
  unpublishFeedback,
  updateFeedbackType,
  updateManagedFeedbackStatus
} from '@/api/feedback.js'
import { auth } from '@/store/auth.js'
import * as feedbackUnreadStore from '@/store/feedbackUnread.js'
import { ADMIN_PERMISSIONS, hasPermission } from '@/utils/authPermissions.js'
import { useFeedbackMedia } from '@/utils/feedbackMedia.js'
import '@/styles/feedback-workspace.css'

const { feedbackUnreadState, subscribeFeedbackUnread } = feedbackUnreadStore
const PAGE_SIZE = 20
const allStatusTabs = [
  { key: 'UNASSIGNED', label: '待接单' },
  { key: 'MINE', label: '我负责' },
  { key: 'DEV', label: '待程序' },
  { key: 'RETURNED', label: '已交回运营' },
  { key: 'CLOSED', label: '已结束' },
  { key: 'ALL', label: '全部' }
]
const feedbackTypeOptions = [
  { key: 'BUG', label: '问题报告' },
  { key: 'FEATURE', label: '功能建议' },
  { key: 'CONTENT', label: '内容问题' },
  { key: 'ACCOUNT', label: '账号问题' },
  { key: 'REPORT', label: '举报' },
  { key: 'OTHER', label: '其他' }
]
const route = useRoute()
const router = useRouter()
const feedbacks = ref([])
const access = ref({ superAdmin: false, operatorAreas: [], developerAreas: [], availableWorkAreas: [] })
const loadingAccess = ref(true)
const loading = ref(false)
const error = ref('')
const page = ref(1)
const totalCount = ref(0)
const q = ref('')
const filterStatus = ref('UNASSIGNED')
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
const mergeOpen = ref(false)
const mergeBusy = ref(false)
const managementMenuOpen = ref(false)
const managementMenuButton = ref(null)
const managementDialog = ref('')
const managementDialogCloseButton = ref(null)
const workflowMode = ref('')
const workflowTarget = ref('')
const workflowArea = ref('')
const workflowNote = ref('')
const workflowBusy = ref(false)
const workflowMenuOpen = ref(false)
const workflowMenuButton = ref(null)
const workflowToolbar = ref(null)
const workflowForm = ref(null)
const workflowMessage = ref('')
const workflowHistoryOpen = ref(false)
const workflowHistoryCloseButton = ref(null)
const workflowEvents = ref([])
const workflowEventsLoading = ref(false)
const workflowEventsError = ref('')
const workflowAssignees = ref([])
const assigneesLoading = ref(false)
const assigneesError = ref('')
const replyMedia = useFeedbackMedia()
const actionBusy = computed(() => workflowBusy.value || updatingStatus.value || replying.value || detailLoading.value)
let isMounted = false
let ready = false
let loadRequestId = 0
let detailRequestId = 0
let workflowEventsRequestId = 0
let assigneesRequestId = 0
let feedbackRefreshTimer = null
let stopFeedbackUnread = null

const canConfigureFeedback = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE))
const hasManagePermission = computed(() => access.value.superAdmin || access.value.operatorAreas.length > 0 || access.value.developerAreas.length > 0)
const statusTabs = computed(() => allStatusTabs.filter(tab => {
  if (access.value.superAdmin) return true
  if (['UNASSIGNED', 'MINE', 'CLOSED', 'ALL'].includes(tab.key)) return access.value.operatorAreas.length > 0
  return access.value.developerAreas.length > 0 || (tab.key === 'DEV' && access.value.operatorAreas.length > 0)
}))
const categoryOptions = computed(() => {
  const all = access.value.availableWorkAreas
  return access.value.superAdmin ? all : all.filter(option => access.value.operatorAreas.includes(option.key) || access.value.developerAreas.includes(option.key))
})
const operatorCategoryOptions = computed(() => categoryOptions.value.filter(option => access.value.superAdmin || access.value.operatorAreas.includes(option.key)))
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))
const unreadFeedbackIds = computed(() => feedbackUnreadState.ids)
const markAllReadHint = computed(() => feedbackUnreadState.count > 0
  ? `将当前管理范围内 ${feedbackUnreadState.count} 条未读反馈全部标记为已读`
  : '当前没有未读反馈')

function typeLabel(type) {
  return feedbackTypeOptions.find(option => option.key === type)?.label || type || '其他'
}

function categoryLabel(category) {
  return categoryOptions.value.find(option => option.key === category)?.label || category || '其他模块'
}

function statusLabel(status, hasAdminReply, item) {
  if (item?.mergedIntoId) return '已合并'
  if (status === 'OPEN') return { UNASSIGNED: '待接单', PROCESSING: '处理中', DEV_HANDOFF: '转程序' }[item?.workflowStage] || '待接单'
  return { RESOLVED: '已完成', DISMISSED: '已驳回' }[status] || status || '未知状态'
}

function canManageSettings(item) {
  return Boolean(item?.viewerCanManage && item.workflowStage !== 'UNASSIGNED' && !item.mergedIntoId)
}

function canMergeFeedback(item) {
  return canManageSettings(item) && item.status === 'OPEN' && !item.mergedCount
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
    if (!rawAreas.length) throw new Error('反馈板块目录为空')
    access.value = {
      superAdmin: Boolean(data.superAdmin ?? data.super_admin),
      operatorAreas: data.operatorAreas || data.operator_areas || [],
      developerAreas: data.developerAreas || data.developer_areas || [],
      availableWorkAreas: rawAreas.map(option => ({ key: option.key, label: option.label }))
    }
    if (!access.value.operatorAreas.length && access.value.developerAreas.length) filterStatus.value = 'DEV'
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
    const data = await listWorkflowFeedback({
      page: page.value,
      pageSize: PAGE_SIZE,
      queue: filterStatus.value,
      type: filterType.value || undefined,
      workArea: filterCategory.value || undefined,
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
  if (filterStatus.value === status.key) return
  filterStatus.value = status.key
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
  closeDetail()
  selectedId.value = String(id)
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
  resetWorkflowHistory()
  detailLoading.value = true
  detailError.value = ''
  try {
    const detail = await getManagedFeedback(id)
    if (!isCurrentDetail(requestId, id, userId)) return
    replaceTicket(detail)
    await nextTick()
    if (!isCurrentDetail(requestId, id, userId)) return
    selectedId.value = id
    void feedbackUnreadStore.refreshFeedbackUnread({ force: true })
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
  assigneesRequestId += 1
  detailLoading.value = false
  selectedId.value = ''
  selectedDetail.value = null
  detailError.value = ''
  cancelReply()
  resetPublicPanel()
  workflowMode.value = ''
  workflowMenuOpen.value = false
  managementMenuOpen.value = false
  workflowMessage.value = ''
  resetWorkflowHistory()
  workflowAssignees.value = []
  assigneesLoading.value = false
  assigneesError.value = ''
}

function resetPublicPanel() {
  publicBusy.value = false
  publicMessage.value = ''
  publicError.value = ''
  mergeOpen.value = false
  mergeBusy.value = false
  managementDialog.value = ''
}

function openWorkflow(mode) {
  assigneesRequestId += 1
  workflowMenuOpen.value = false
  managementMenuOpen.value = false
  workflowMode.value = mode
  workflowTarget.value = ''
  workflowArea.value = selectedDetail.value?.workArea || ''
  workflowNote.value = ''
  workflowMessage.value = ''
  detailError.value = ''
  workflowAssignees.value = []
  assigneesError.value = ''
  assigneesLoading.value = false
  if (mode === 'assign' && selectedId.value) void loadWorkflowAssignees(selectedId.value)
  if (mode) nextTick(() => workflowForm.value?.focus())
}

function cancelWorkflow() {
  openWorkflow('')
  nextTick(() => workflowToolbar.value?.querySelector('button')?.focus())
}

function toggleWorkflowMenu() {
  const next = !workflowMenuOpen.value
  openWorkflow('')
  workflowMenuOpen.value = next
}

function toggleManagementMenu() {
  managementMenuOpen.value = !managementMenuOpen.value
  workflowMenuOpen.value = false
}

function openManagementPanel(panel) {
  if (!canManageSettings(selectedDetail.value)) return
  if (panel === 'merge') {
    if (!canMergeFeedback(selectedDetail.value)) return
    managementMenuButton.value?.focus()
    managementMenuOpen.value = false
    openMergeDialog()
    return
  }
  if (panel !== 'public') return
  managementMenuOpen.value = false
  publicMessage.value = ''
  publicError.value = ''
  managementDialog.value = 'public'
  nextTick(() => managementDialogCloseButton.value?.focus())
}

function closeManagementDialog() {
  if (publicBusy.value) return
  managementDialog.value = ''
  nextTick(() => managementMenuButton.value?.focus())
}

function workflowModeLabel(mode) {
  return { takeover: '接手工单', assign: '转交运营', handoff: '转程序', area: '调整板块', withdraw: '撤回交接', return: '填写结果并交回' }[mode] || ''
}

async function loadWorkflowAssignees(id) {
  const requestId = ++assigneesRequestId
  assigneesLoading.value = true
  assigneesError.value = ''
  try {
    const users = await listFeedbackAssignees(id)
    if (requestId === assigneesRequestId && selectedId.value === id && workflowMode.value === 'assign') workflowAssignees.value = users
  } catch (e) {
    if (requestId === assigneesRequestId && selectedId.value === id && workflowMode.value === 'assign' && !await handleForbidden(e)) assigneesError.value = e.message || '运营负责人加载失败'
  } finally {
    if (requestId === assigneesRequestId) assigneesLoading.value = false
  }
}

function workflowActionLabel(action) {
  return { CLAIM: '接单', ASSIGN: '转交运营', HANDOFF: '转程序', CHANGE_AREA: '调整板块', RETURN: '交回运营', WITHDRAW: '撤回交接', REQUEUE: '重新待接单', DISMISS: '驳回工单' }[action] || action
}

function resetWorkflowHistory() {
  workflowEventsRequestId += 1
  workflowHistoryOpen.value = false
  workflowEvents.value = []
  workflowEventsLoading.value = false
  workflowEventsError.value = ''
}

function openWorkflowHistory(id) {
  workflowMenuOpen.value = false
  workflowHistoryOpen.value = true
  workflowEvents.value = []
  void loadWorkflowEvents(id)
  nextTick(() => workflowHistoryCloseButton.value?.focus())
}

function closeWorkflowHistory() {
  workflowEventsRequestId += 1
  workflowHistoryOpen.value = false
  workflowEventsLoading.value = false
  nextTick(() => workflowMenuButton.value?.focus())
}

async function loadWorkflowEvents(id) {
  const requestId = ++workflowEventsRequestId
  const detailId = detailRequestId
  const userId = currentUserId()
  workflowEventsLoading.value = true
  workflowEventsError.value = ''
  try {
    const events = await listFeedbackWorkflowEvents(id)
    if (requestId === workflowEventsRequestId && isCurrentDetail(detailId, id, userId) && workflowHistoryOpen.value) {
      workflowEvents.value = events
    }
  } catch (e) {
    if (requestId === workflowEventsRequestId && isCurrentDetail(detailId, id, userId) && workflowHistoryOpen.value && !await handleForbidden(e)) workflowEventsError.value = e.message || '处理记录加载失败'
  } finally {
    if (requestId === workflowEventsRequestId) workflowEventsLoading.value = false
  }
}

async function runWorkflow(mode, item) {
  if (workflowBusy.value || !item?.id) return
  const note = workflowNote.value.trim()
  const actionLabel = { claim: '接单', takeover: '接手', assign: '转交运营', handoff: '转程序', area: '调整板块', withdraw: '撤回交接', return: '交回运营' }[mode]
  if (mode !== 'claim' && !note) { detailError.value = '请填写处理说明'; return }
  if (mode === 'assign' && !workflowAssignees.value.some(user => user.id === workflowTarget.value)) { detailError.value = '请选择可转交的运营负责人'; return }
  if (mode === 'area' && !workflowArea.value) { detailError.value = '请选择反馈板块'; return }
  if (mode !== 'claim' && !window.confirm(`${actionLabel}工单 ${item.id}？${mode === 'assign' ? `新负责人：${workflowTarget.value}` : ''}`)) return
  const requestId = detailRequestId
  const userId = currentUserId()
  workflowBusy.value = true
  detailError.value = ''
  try {
    const detail = mode === 'claim' ? await claimFeedback(item.id)
      : mode === 'takeover' ? await assignFeedback(item.id, userId, note)
        : mode === 'assign' ? await assignFeedback(item.id, workflowTarget.value, note)
          : mode === 'handoff' ? await handoffFeedback(item.id, item.workArea, note)
            : mode === 'area' ? await changeFeedbackWorkArea(item.id, workflowArea.value, note)
            : await returnFeedback(item.id, note, mode === 'withdraw' ? 'WITHDRAW' : 'RETURN')
    if (!isCurrentDetail(requestId, item.id, userId)) return
    replaceTicket(detail)
    workflowMode.value = ''
    workflowMenuOpen.value = false
    if (mode === 'claim' && filterStatus.value === 'UNASSIGNED') {
      filterStatus.value = 'MINE'
      page.value = 1
    }
    workflowMessage.value = mode === 'claim' ? '接单成功，工单已移至「我负责」' : `${actionLabel}成功`
    void loadFeedback({ background: true })
  } catch (e) {
    if (isCurrentDetail(requestId, item.id, userId) && !await handleForbidden(e)) {
      detailError.value = e.message || `${actionLabel}失败`
      if (e.status === 409) { void loadFeedback({ background: true }); void loadFeedbackDetail(item.id) }
    }
  } finally {
    workflowBusy.value = false
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
    if (payload.type && payload.type !== selectedDetail.value?.type) {
      await updateFeedbackType(id, payload.type)
      if (!isCurrentDetail(requestId, id, userId)) return
    }
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
  workflowMenuOpen.value = false
  managementMenuOpen.value = false
  detailError.value = ''
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
  const reason = status === 'DISMISSED' ? window.prompt(`驳回工单 ${id} 的原因`) : null
  if (status === 'DISMISSED' && !reason?.trim()) return
  if (status === 'RESOLVED' && !window.confirm(`确认完成工单 ${id}？`)) return
  if (status === 'OPEN' && !window.confirm(`重新打开工单 ${id}？`)) return
  const requestId = detailRequestId
  const userId = currentUserId()
  updatingStatus.value = true
  detailError.value = ''
  try {
    await updateManagedFeedbackStatus(id, status, reason)
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
.feedback-admin-settings { display: grid; gap: 10px; }
.feedback-merge-relations { padding: 14px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.feedback-merge-relations > div { min-width: 0; display: grid; gap: 8px; }
.feedback-merge-relations strong { color: var(--feedback-text); font-family: var(--font-s); font-size: 14px; }
.feedback-merge-relations ul { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.feedback-merge-relations li { min-width: 0; max-width: 100%; }
.feedback-merge-relations a { display: inline-block; max-width: 100%; padding: 8px 10px; border: 1px solid var(--feedback-line); border-radius: 6px; background: var(--surface); color: var(--feedback-text); font-size: 12px; overflow-wrap: anywhere; text-decoration: underline; text-underline-offset: 2px; }
.feedback-merge-relations a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.feedback-management-summary { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; color: var(--feedback-text-muted); font-size: 11px; line-height: 1.5; }
.feedback-management-summary span { overflow-wrap: anywhere; }
.feedback-ticket-actions { display: grid; gap: 10px; }
.feedback-action-toolbar .danger { margin-left: auto; }
.feedback-action-toolbar [aria-expanded="true"] svg { transform: rotate(180deg); }
.feedback-workflow-options { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.feedback-management-dialog { width: min(640px, calc(100vw - 28px)); max-width: 640px; max-height: min(760px, calc(100dvh - 32px)); display: flex; flex-direction: column; overflow: hidden; }
.feedback-management-dialog .modal-head button { min-width: 44px; min-height: 44px; }
.feedback-management-body { min-height: 0; overflow-y: auto; padding: 16px 20px 20px; }
.feedback-workflow-form { display: grid; gap: 12px; max-height: min(60vh, 420px); max-height: min(60dvh, 420px); overflow-y: auto; padding: 14px; border: 1px solid var(--feedback-line); border-radius: 8px; background: var(--feedback-panel); }
.feedback-workflow-form > strong { color: var(--feedback-text); font-family: var(--font-s); font-size: 14px; }
.feedback-workflow-form label { min-width: 0; display: grid; gap: 6px; color: var(--feedback-text); font-size: 12px; font-weight: 800; }
.feedback-workflow-form select, .feedback-workflow-form textarea { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--surface); color: var(--feedback-text); font: 14px var(--font-b); }
.feedback-workflow-form textarea { min-height: 86px; resize: vertical; }
.feedback-workflow-form select:focus-visible, .feedback-workflow-form textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.feedback-workflow-hint, .feedback-workflow-error { margin: 0; color: var(--feedback-text-muted); font-size: 12px; line-height: 1.6; }
.feedback-workflow-error { color: var(--feedback-danger); }
.feedback-workflow-error button { border: 0; background: none; color: inherit; font: inherit; font-weight: 800; text-decoration: underline; cursor: pointer; }
.feedback-workflow-message { margin: 0; padding: 10px 12px; border-left: 3px solid var(--feedback-success); border-radius: 5px; background: var(--feedback-panel); color: var(--feedback-text); font-size: 12px; font-weight: 800; }
.feedback-history-dialog { width: min(640px, calc(100vw - 28px)); max-height: min(760px, calc(100dvh - 32px)); display: flex; flex-direction: column; overflow: hidden; }
.feedback-history-dialog .modal-head small { display: block; margin-top: 4px; color: var(--feedback-text-dim); font: 11px var(--font-d); overflow-wrap: anywhere; }
.feedback-history-dialog .modal-head button { min-width: 44px; min-height: 44px; }
.feedback-history-body { min-height: 0; overflow-y: auto; padding: 16px 20px; }
.feedback-history-body > p { color: var(--feedback-text-muted); font-size: 12px; line-height: 1.6; }
.feedback-history-body > .feedback-workflow-error { color: var(--feedback-danger); }
.feedback-workflow-events { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.feedback-workflow-events li { min-width: 0; display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--surface); overflow-wrap: anywhere; }
.feedback-workflow-events li > div { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 5px 12px; }
.feedback-workflow-events b { color: var(--feedback-text); font-size: 12px; }
.feedback-workflow-events time, .feedback-workflow-events span { color: var(--feedback-text-dim); font-size: 11px; }
.feedback-workflow-events p { margin: 0; color: var(--feedback-text-muted); font-size: 12px; line-height: 1.6; }
@media (max-width: 640px) {
  .feedback-management-dialog { width: 100%; max-height: min(92dvh, 760px); }
  .feedback-management-body { padding: 14px 16px 18px; }
  .feedback-history-dialog { width: 100%; max-height: min(92dvh, 760px); }
  .feedback-action-toolbar > button { flex: 1 1 calc(50% - 4px); }
  .feedback-action-toolbar .danger { margin-left: 0; }
  .feedback-workflow-options > button { flex: 1 1 calc(50% - 4px); }
  .feedback-workflow-form select, .feedback-workflow-form textarea { font-size: 16px; }
  .feedback-workflow-form .feedback-form-actions { flex-wrap: wrap; }
}
</style>
