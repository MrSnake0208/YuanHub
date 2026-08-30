<template>
  <div class="page-feedback manage-feedback">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">反馈中心</span>
            <span class="pill">待处理反馈</span>
            <span class="pill">反馈工作台</span>
          </div>
          <h1>反馈工作台<span class="small">授权板块 · 工单处理</span></h1>
          <p class="hero-sub">集中查看和处理你负责板块中的反馈工单。个人提交的反馈请前往“我的反馈”。</p>
          <div class="hero-stats">
            <div><div class="k">授权工单</div><div class="v">{{ feedbacks.length }}<small>条</small></div></div>
            <div><div class="k">待处理</div><div class="v">{{ pendingCount }}<small>条</small></div></div>
            <div><div class="k">已回复</div><div class="v">{{ repliedCount }}<small>条</small></div></div>
            <div><div class="k">已结束</div><div class="v">{{ resolvedCount }}<small>条</small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <div class="manage-links">
            <router-link class="act-btn" to="/feedback">我的反馈</router-link>
            <router-link v-if="canConfigureFeedback" class="act-btn" to="/feedback/admin">权限配置</router-link>
          </div>
          <div v-if="loadingAccess" class="loading-state" role="status">正在检查反馈权限…</div>
          <div v-else-if="!hasPermission" class="permission-state" role="alert">
            <strong>暂无板块管理权限</strong>
            <span>当前账号可以提交和跟踪自己的反馈，但没有可处理的板块工单。</span>
            <router-link class="act-btn primary" to="/feedback">前往我的反馈</router-link>
          </div>
          <template v-else>
            <div class="feedback-scope-bar">
              <div class="tabs">
                <button v-for="status in statusTabs" :key="status" :class="{ on: filterStatus === status }" @click="setFilter(status)">{{ status }}</button>
              </div>
              <label class="area-filter">
                <span>反馈类型</span>
                <select v-model="filterType" @change="reloadFromFirstPage">
                  <option value="">全部类型</option>
                  <option v-for="option in feedbackTypeOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                </select>
              </label>
              <label class="area-filter">
                <span>负责板块</span>
                <select v-model="filterCategory" @change="reloadFromFirstPage">
                  <option value="">全部板块</option>
                  <option v-for="option in categoryOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                </select>
              </label>
              <div class="search manage-search">
                <span class="ic" aria-hidden="true">⌕</span>
                <input v-model="q" type="search" name="managed-feedback-search" aria-label="搜索待处理反馈" placeholder="搜内容或提交人…">
              </div>
            </div>

            <div class="feedback-list">
              <div v-if="loading" class="loading-state" role="status">加载中…</div>
              <div v-else-if="error" class="error-state" role="alert">
                <span>{{ error }}</span>
                <button class="text-btn" @click="loadFeedback">重新加载</button>
              </div>
              <template v-else-if="filtered.length">
                <article
                  v-for="item in filtered"
                  :key="item.id"
                  class="feedback-card"
                  :class="{ expanded: expandedId === item.id }"
                >
                  <div class="fc-head" @click="toggleExpand(item.id)">
                    <div class="fc-meta">
                      <span class="fc-type">{{ typeLabel(item.type) }}</span>
                      <span class="fc-category">{{ categoryLabel(item.category) }}</span>
                      <span class="fc-status" :class="'status-' + item.status">{{ statusLabel(item.status, item.hasAdminReply) }}</span>
                      <span class="fc-date">{{ formatDate(item.createdAt) }}</span>
                    </div>
                    <h3 class="fc-title">{{ truncate(item.content, 80) }}</h3>
                    <div class="fc-expand-indicator">{{ expandedId === item.id ? '收起' : '展开' }}</div>
                  </div>
                  <div v-if="expandedId === item.id" class="fc-body">
                    <div v-if="detailLoading" class="detail-loading" role="status">加载详情中…</div>
                    <div v-else-if="detailError" class="detail-error" role="alert">{{ detailError }}</div>
                    <div class="reporter-line">提交人：{{ item.reporter?.userName || '未知用户' }} <code>{{ item.reporter?.id || item.reporterUserId || '' }}</code></div>
                    <div class="fc-content">{{ item.content }}</div>
                    <div v-if="item.messages && item.messages.length" class="fc-messages">
                      <h4>对话记录</h4>
                      <div v-for="msg in item.messages" :key="msg.id" class="fc-message" :class="{ 'is-admin': msg.isAdmin }">
                        <div class="fc-msg-head">
                          <span class="fc-msg-author">{{ msg.isAdmin ? '管理员' : '提交人' }}</span>
                          <span class="fc-msg-date">{{ formatDate(msg.createdAt) }}</span>
                        </div>
                        <div class="fc-msg-content">{{ msg.content }}</div>
                      </div>
                    </div>
                    <div v-if="item.viewerCanManage" class="fc-actions">
                      <button v-if="item.status === 'OPEN'" class="act-btn small" @click="showReplyForm(item.id)">回复</button>
                      <button v-if="item.status === 'OPEN'" class="act-btn small" @click="resolveFeedback(item.id)">标记完成</button>
                      <button v-if="item.status === 'OPEN'" class="act-btn small danger" @click="dismissFeedback(item.id)">驳回</button>
                    </div>
                    <div v-if="replyTarget === item.id" class="fc-reply-form">
                      <textarea v-model="replyContent" class="form-control" rows="3" placeholder="输入回复内容…"></textarea>
                      <div class="form-actions">
                        <button class="act-btn" @click="replyTarget = null">取消</button>
                        <button class="act-btn primary" :disabled="replying" @click="submitReply(item.id)">
                          {{ replying ? '发送中…' : '发送' }}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              </template>
              <div v-else class="empty show">暂无符合条件的待处理反馈</div>
            </div>
            <div class="more-row">
              <div class="pg"><button :disabled="page <= 1 || loading" @click="changePage(page - 1)">‹</button></div>
              <button class="btn-more" :disabled="noMore || loading" @click="loadMore">{{ noMore ? '没有更多了' : '加载更多' }}</button>
              <div class="pg"><button :disabled="noMore || loading" @click="changePage(page + 1)">›</button></div>
            </div>
          </template>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IslandSidebar from '@/components/IslandSidebar.vue'
import {
  appendFeedbackMessage,
  getFeedback,
  getFeedbackAccess,
  listManagedFeedback,
  updateFeedbackStatus
} from '@/api/feedback.js'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, canManageAnyFeedback, hasPermission as hasAdminPermission } from '@/utils/authPermissions.js'

const route = useRoute()
const router = useRouter()
const PAGE_SIZE = 20
const feedbacks = ref([])
const access = ref({ superAdmin: false, manageAreas: [], availableAreas: [] })
const loadingAccess = ref(true)
const loading = ref(false)
const error = ref('')
const page = ref(1)
const noMore = ref(false)
const q = ref('')
const filterStatus = ref('全部')
const filterType = ref('')
const filterCategory = ref('')
const expandedId = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const replyTarget = ref(null)
const replyContent = ref('')
const replying = ref(false)

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

const hasPermission = computed(() => canManageAnyFeedback(auth.adminAccess))
const canConfigureFeedback = computed(() => hasAdminPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE))
const categoryOptions = computed(() => {
  const all = access.value.availableAreas.length ? access.value.availableAreas : DEFAULT_AREAS
  return all.filter(option => access.value.manageAreas.includes(option.key))
})
const filtered = computed(() => {
  let list = feedbacks.value
  if (filterStatus.value !== '全部') {
    const match = {
      '待处理': item => item.status === 'OPEN' && !item.hasAdminReply,
      '已回复': item => item.status === 'OPEN' && item.hasAdminReply,
      '已完成': item => item.status === 'RESOLVED',
      '已驳回': item => item.status === 'DISMISSED'
    }[filterStatus.value]
    if (match) list = list.filter(match)
  }
  if (filterType.value) list = list.filter(item => item.type === filterType.value)
  if (filterCategory.value) list = list.filter(item => item.category === filterCategory.value)
  if (q.value.trim()) {
    const keyword = q.value.trim().toLowerCase()
    list = list.filter(item => (String(item.content || '') + ' ' + String(item.reporter?.userName || '')).toLowerCase().includes(keyword))
  }
  return list
})
const pendingCount = computed(() => feedbacks.value.filter(item => item.status === 'OPEN' && !item.hasAdminReply).length)
const repliedCount = computed(() => feedbacks.value.filter(item => item.status === 'OPEN' && item.hasAdminReply).length)
const resolvedCount = computed(() => feedbacks.value.filter(item => item.status === 'RESOLVED' || item.status === 'DISMISSED').length)
const statusTabs = ['全部', '待处理', '已回复', '已完成', '已驳回']

function statusParam() {
  return { '待处理': 'OPEN', '已回复': 'OPEN', '已完成': 'RESOLVED', '已驳回': 'DISMISSED' }[filterStatus.value]
}

function areaLabel(key) {
  return categoryOptions.value.find(option => option.key === key)?.label || key
}
function categoryLabel(key) {
  return areaLabel(key) || '其他模块'
}
function typeLabel(type) {
  return feedbackTypeOptions.find(option => option.key === type)?.label || type || '其他'
}
function statusLabel(status, hasAdminReply) {
  if (status === 'OPEN') return hasAdminReply ? '已回复' : '待处理'
  return { RESOLVED: '已完成', DISMISSED: '已驳回' }[status] || status || '未知状态'
}
function truncate(value, length) {
  const text = String(value || '')
  return text.length > length ? text.slice(0, length) + '…' : text
}
function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function reloadFromFirstPage() {
  page.value = 1
  loadFeedback()
}
function setFilter(status) {
  filterStatus.value = status
  reloadFromFirstPage()
}

async function loadAccess() {
  try {
    const data = await getFeedbackAccess()
    const rawAreas = data.availableCategories || data.available_categories || data.availableAreas || data.available_areas || []
    access.value = {
      superAdmin: Boolean(data.superAdmin ?? data.super_admin),
      manageAreas: auth.adminAccess?.manageAreas || [],
      availableAreas: rawAreas.map(option => ({ key: option.key, label: option.label }))
    }
  } catch (e) {
    if (await handleForbidden(e)) return
    error.value = e.message || '反馈权限加载失败'
  } finally {
    loadingAccess.value = false
  }
}

async function loadFeedback({ append = false } = {}) {
  if (!hasPermission.value) return
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
    const items = data.items || []
    feedbacks.value = append ? [...feedbacks.value, ...items] : items
    noMore.value = data.total != null ? page.value * PAGE_SIZE >= data.total : items.length < PAGE_SIZE
  } catch (e) {
    if (await handleForbidden(e)) return
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}
async function changePage(nextPage) {
  if (nextPage < 1 || loading.value) return
  page.value = nextPage
  await loadFeedback()
}
async function loadMore() {
  if (noMore.value || loading.value) return
  page.value += 1
  await loadFeedback({ append: true })
}
async function toggleExpand(id) {
  if (expandedId.value === id) {
    expandedId.value = null
    return
  }
  expandedId.value = id
  const item = feedbacks.value.find(feedback => feedback.id === id)
  if (!item || item.messages.length) return
  await loadFeedbackDetail(id)
}
async function loadFeedbackDetail(id) {
  detailLoading.value = true
  detailError.value = ''
  try {
    const detail = await getFeedback(id)
    const index = feedbacks.value.findIndex(feedback => feedback.id === id)
    if (index === -1 && !detail.viewerCanManage) {
      expandedId.value = null
      detailError.value = '该工单不在当前管理范围内'
      return
    }
    if (index !== -1) feedbacks.value.splice(index, 1, detail)
    else feedbacks.value.unshift(detail)
    expandedId.value = id
  } catch (e) {
    if (await handleForbidden(e)) return
    detailError.value = e.message || '详情加载失败'
  } finally {
    detailLoading.value = false
  }
}
function showReplyForm(id) {
  replyTarget.value = id
  replyContent.value = ''
}
async function submitReply(id) {
  const content = replyContent.value.trim()
  if (!content) return
  replying.value = true
  try {
    await appendFeedbackMessage(id, { content })
    replyTarget.value = null
    replyContent.value = ''
    await loadFeedback()
  } catch (e) {
    if (await handleForbidden(e)) return
    error.value = e.message || '发送失败'
  } finally {
    replying.value = false
  }
}
async function resolveFeedback(id) {
  await updateStatus(id, 'RESOLVED')
}
async function dismissFeedback(id) {
  await updateStatus(id, 'DISMISSED')
}
async function updateStatus(id, status) {
  try {
    await updateFeedbackStatus(id, status)
    await loadFeedback()
  } catch (e) {
    if (await handleForbidden(e)) return
    error.value = e.message || '操作失败'
  }
}

async function handleForbidden(errorValue) {
  if (!errorValue || errorValue.status !== 403) return false
  feedbacks.value = []
  expandedId.value = null
  replyTarget.value = null
  await router.replace({ path: '/forbidden', query: { from: '/feedback/manage' } })
  return true
}

onMounted(async () => {
  await loadAccess()
  await loadFeedback()
  const reportId = route.query.id ? String(route.query.id) : ''
  if (reportId && hasPermission.value) {
    const item = feedbacks.value.find(feedback => feedback.id === reportId)
    if (item && item.messages.length) expandedId.value = reportId
    else await loadFeedbackDetail(reportId)
  }
})
onBeforeUnmount(() => {
  replyTarget.value = null
})
</script>

<style scoped>
.manage-feedback .hero { --wm: '工作台'; }
.manage-links { display: flex; gap: 10px; padding: 18px 0 4px; }
.feedback-scope-bar { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.area-filter { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-60); font-size: 12px; font-weight: 700; }
.area-filter select { min-height: 34px; padding: 0 30px 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); }
.manage-search { margin-left: auto; }
.permission-state { display: grid; justify-items: start; gap: 10px; margin: 28px 0; padding: 28px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-60); }
.permission-state strong { color: var(--ink); font-size: 18px; }
.permission-state .act-btn { margin-top: 8px; }
.reporter-line { padding-top: 14px; color: var(--ink-60); font-size: 12px; }
.reporter-line code { margin-left: 8px; color: var(--ink-35); }
.feedback-list { margin-top: 20px; }
.feedback-card { margin-bottom: 12px; overflow: hidden; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; }
.fc-head { display: flex; flex-direction: column; gap: 8px; padding: 16px 20px; cursor: pointer; }
.fc-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.fc-type,.fc-category,.fc-status { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.fc-type { background: var(--yellow); color: var(--ink); }
.fc-category { border: 1px solid var(--line); color: var(--ink-60); }
.fc-status { border: 1.5px solid transparent; }
.fc-status.status-OPEN { border-color: var(--accent); color: var(--accent-strong); }
.fc-status.status-RESOLVED { border-color: #BFDCC0; color: #2d6a2d; }
.fc-status.status-DISMISSED { border-color: var(--line); color: var(--ink-60); }
.fc-date { margin-left: auto; color: var(--ink-35); font-size: 12px; }
.fc-title { color: var(--ink); font-size: 14px; line-height: 1.5; }
.fc-expand-indicator { align-self: flex-end; color: var(--accent); font-size: 12px; font-weight: 700; }
.fc-body { padding: 0 20px 20px; border-top: 1px solid var(--line); }
.fc-content { padding: 16px 0; color: var(--ink); font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
.fc-messages { padding: 12px 0; }
.fc-messages h4 { margin-bottom: 12px; color: var(--ink); font-size: 14px; }
.fc-message { margin-bottom: 8px; padding: 12px 16px; border-radius: 12px; background: var(--cream); }
.fc-message.is-admin { border-left: 3px solid var(--yellow-deep); background: rgba(213, 185, 110, .12); }
.fc-msg-head { display: flex; gap: 10px; margin-bottom: 6px; }
.fc-msg-author { color: var(--ink); font-size: 12px; font-weight: 700; }
.fc-msg-date { color: var(--ink-35); font-size: 11px; }
.fc-msg-content { color: var(--ink); font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.fc-actions { display: flex; gap: 8px; padding: 12px 0 8px; }
.fc-reply-form { padding: 12px 0; border-top: 1px dashed var(--line); }
.form-control { width: 100%; padding: 10px 14px; border: 1.5px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); font: 14px var(--font-b); }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
.loading-state,.error-state { padding: 40px 20px; color: var(--ink-60); text-align: center; }
.error-state { color: var(--rouge); }
.text-btn { border: 0; background: transparent; color: var(--accent); font-weight: 700; cursor: pointer; }
.empty.show { display: block; padding: 60px 20px; color: var(--ink-60); text-align: center; }
.more-row { display: flex; justify-content: center; gap: 16px; padding: 32px 0 48px; }
.btn-more { padding: 10px 32px; border: 1.5px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); font-weight: 700; cursor: pointer; }
.btn-more:disabled,.pg button:disabled { opacity: .5; cursor: default; }
.pg button { min-width: 38px; min-height: 38px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); cursor: pointer; }
@media (max-width: 720px) {
  .feedback-scope-bar { flex-wrap: wrap; }
  .manage-search { width: 100%; margin-left: 0; }
}
</style>
