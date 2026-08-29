<template>
  <div class="page-feedback">
    <IslandSidebar />

    <main id="main-content">
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">反馈中心</span>
            <span class="pill">我的反馈</span>
            <span class="pill">提交反馈</span>
          </div>
          <h1>反馈中心<span class="small">工单 · 建议 · 问题追踪</span></h1>
          <p class="hero-sub">遇到问题或有建议？提交反馈工单，我们会尽快回复处理。你也可以在这里追踪已有工单的处理进度。</p>
          <div class="hero-stats">
            <div><div class="k">我的工单</div><div class="v">{{ myCount }}<small>条</small></div></div>
            <div><div class="k">本页待处理</div><div class="v">{{ pendingCount }}<small>条</small></div></div>
            <div><div class="k">本页有回复</div><div class="v">{{ repliedCount }}<small>条</small></div></div>
            <div><div class="k">本页已结束</div><div class="v">{{ resolvedCount }}<small>条</small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- 工具栏 -->
          <div class="toolbar" v-reveal>
            <button class="act-btn primary" @click="showNewForm = true">
              <span aria-hidden="true">+</span> 提交反馈
            </button>
            <div class="sp"></div>
            <div class="tabs">
              <button
                v-for="t in ['全部', '待处理', '已回复', '已完成', '已驳回']"
                :key="t"
                :class="{ on: filterStatus === t }"
                @click="setFilter(t)"
              >{{ t }}</button>
            </div>
            <div class="search">
              <span class="ic" aria-hidden="true">⌕</span>
              <input v-model="q" type="search" name="feedback-search" aria-label="搜索反馈" placeholder="搜标题 / 内容…">
            </div>
          </div>

          <div class="feedback-scope-bar">
            <div v-if="canManageFeedback" class="scope-tabs" role="group" aria-label="反馈视图">
              <button :class="{ on: viewMode === 'mine' }" type="button" @click="setViewMode('mine')">我的反馈</button>
              <button :class="{ on: viewMode === 'managed' }" type="button" @click="setViewMode('managed')">待管理</button>
            </div>
            <label class="area-filter">
              <span>反馈类型</span>
              <select v-model="filterType" @change="reloadFromFirstPage">
                <option value="">全部类型</option>
                <option v-for="option in feedbackTypeOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
              </select>
            </label>
            <label class="area-filter">
              <span>反馈板块</span>
              <select v-model="filterCategory" @change="reloadFromFirstPage">
                <option value="">全部板块</option>
                <option v-for="option in visibleCategoryOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
              </select>
            </label>
            <router-link v-if="access.superAdmin" class="access-admin-link" to="/feedback/admin">权限配置</router-link>
          </div>

          <!-- 新建反馈表单 -->
          <Teleport to="body">
            <div
              v-if="showNewForm"
              class="modal-mask feedback-modal-mask"
              role="presentation"
              @click.self="closeNewFeedback"
            >
              <div
                class="modal feedback-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="feedback-modal-title"
                @keydown.esc.prevent="closeNewFeedback"
              >
                <div class="modal-head">
                  <h2 id="feedback-modal-title">提交反馈</h2>
                  <button type="button" aria-label="关闭提交反馈弹窗" @click="closeNewFeedback">
                    <X :size="20" />
                  </button>
                </div>
                <form @submit.prevent="submitFeedback">
                  <div class="form-row">
                    <label class="field-label" for="feedback-type">反馈类型</label>
                    <select id="feedback-type" v-model="newFeedback.type" class="form-control" required>
                      <option v-for="option in feedbackTypeOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                    </select>
                  </div>
                  <div class="form-row">
                    <label class="field-label" for="feedback-category">反馈板块</label>
                    <select id="feedback-category" v-model="newFeedback.category" class="form-control" required>
                      <option value="">请选择反馈板块</option>
                      <option v-for="option in categoryOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
                    </select>
                  </div>
                  <div class="form-row">
                    <label class="field-label" for="feedback-content">详细描述</label>
                    <textarea
                      id="feedback-content"
                      v-model="newFeedback.content"
                      class="form-control"
                      rows="5"
                      maxlength="1000"
                      placeholder="请详细描述您遇到的问题或建议…"
                      required
                    ></textarea>
                  </div>
                  <div class="form-row">
                    <label class="field-label consent-label" for="feedback-client-info">
                      <input id="feedback-client-info" type="checkbox" v-model="newFeedback.clientInfoConsent" />
                      <span>允许附加客户端信息（浏览器版本、操作系统等），帮助定位问题</span>
                    </label>
                  </div>
                  <div v-if="formError" class="form-error" role="alert">{{ formError }}</div>
                  <div class="form-actions modal-foot">
                    <button type="button" class="act-btn" @click="closeNewFeedback">取消</button>
                    <button type="submit" class="act-btn primary" :disabled="submitting">
                      {{ submitting ? '提交中…' : '提交反馈' }}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Teleport>

          <!-- 反馈列表 -->
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
                v-reveal
              >
                <div class="fc-head" @click="toggleExpand(item.id)">
                  <div class="fc-meta">
                    <span class="fc-type">{{ typeLabel(item.type) }}</span>
                    <span v-if="item.category" class="fc-category">{{ categoryLabel(item.category) }}</span>
                    <span class="fc-status" :class="'status-' + item.status">{{ statusLabel(item.status, item.hasAdminReply) }}</span>
                    <span class="fc-date">{{ formatDate(item.createdAt) }}</span>
                  </div>
                  <h3 class="fc-title">{{ truncate(item.content, 80) }}</h3>
                  <div class="fc-expand-indicator">{{ expandedId === item.id ? '收起' : '展开' }}</div>
                </div>
                <div v-if="expandedId === item.id" class="fc-body">
                  <div v-if="detailLoading" class="detail-loading" role="status">加载详情中…</div>
                  <div v-else-if="detailError" class="detail-error" role="alert">{{ detailError }}</div>
                  <div class="fc-content">{{ item.content }}</div>
                  <div v-if="item.mediaIds && item.mediaIds.length" class="fc-media">
                    <span class="fc-media-label">附件：</span>
                    <span class="fc-media-count">{{ item.mediaIds.length }} 个文件</span>
                  </div>
                  <div v-if="item.messages && item.messages.length" class="fc-messages">
                    <h4>对话记录</h4>
                    <div v-for="msg in item.messages" :key="msg.id" class="fc-message" :class="{ 'is-admin': msg.isAdmin }">
                      <div class="fc-msg-head">
                        <span class="fc-msg-author">{{ msg.isAdmin ? '管理员' : (viewMode === 'managed' ? '提交人' : '我') }}</span>
                        <span class="fc-msg-date">{{ formatDate(msg.createdAt) }}</span>
                      </div>
                      <div class="fc-msg-content">{{ msg.content }}</div>
                    </div>
                  </div>
                  <div class="fc-actions">
                    <button
                      v-if="item.status === 'OPEN' && item.quota && item.quota.canAppend"
                      class="act-btn small"
                      @click="showReplyForm(item.id)"
                    >追加消息</button>
                    <button
                      v-if="item.status === 'OPEN' && (item.viewerIsReporter || item.viewerCanManage)"
                      class="act-btn small"
                      @click="closeFeedback(item.id)"
                    >标记完成</button>
                    <button
                      v-if="viewMode === 'managed' && item.status === 'OPEN'"
                      class="act-btn small danger"
                      @click="dismissFeedback(item.id)"
                    >驳回</button>
                  </div>
                  <div v-if="replyTarget === item.id" class="fc-reply-form">
                    <textarea
                      v-model="replyContent"
                      class="form-control"
                      rows="3"
                      placeholder="输入回复内容…"
                    ></textarea>
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
            <div v-else class="empty" :class="{ show: !loading }">
              暂无反馈工单<br>
              <span style="font-size:12px;font-weight:600">点击上方「提交反馈」创建第一条工单</span>
            </div>
          </div>

          <!-- 加载更多 -->
          <div class="more-row" v-reveal>
            <div class="pg">
              <button :disabled="page <= 1 || loading" @click="changePage(page - 1)">‹</button>
            </div>
            <button class="btn-more" :disabled="noMore || loading" @click="loadMore">{{ noMore ? '没有更多了' : '加载更多' }}</button>
            <div class="pg">
              <button :disabled="noMore || loading" @click="changePage(page + 1)">›</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import IslandSidebar from '@/components/IslandSidebar.vue'
import { X } from '@lucide/vue'
import {
  createFeedback,
  listFeedback,
  getFeedback,
  getFeedbackAccess,
  appendFeedbackMessage,
  updateFeedbackStatus
} from '@/api/feedback.js'

// 列表状态
const feedbacks = ref([])
const loading = ref(false)
const error = ref(null)
const page = ref(1)
const pageSize = 20
const noMore = ref(false)
const q = ref('')
const filterStatus = ref('全部')
const filterType = ref('')
const filterCategory = ref('')
const viewMode = ref('mine')
const access = ref({ superAdmin: false, receiveAreas: [], manageAreas: [], availableAreas: [] })
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
const categoryOptions = computed(() => access.value.availableAreas.length ? access.value.availableAreas : DEFAULT_AREAS)
const canManageFeedback = computed(() => access.value.manageAreas.length > 0)
const visibleCategoryOptions = computed(() => {
  if (viewMode.value === 'mine') return categoryOptions.value
  return categoryOptions.value.filter(option => access.value.manageAreas.includes(option.key))
})
const expandedId = ref(null)
const detailLoading = ref(false)
const detailError = ref(null)
const route = useRoute()

// 新建表单
const showNewForm = ref(false)
const submitting = ref(false)
const formError = ref('')
const newFeedback = ref({
  type: 'BUG',
  category: '',
  content: '',
  clientInfoConsent: false
})

// 回复
const replyTarget = ref(null)
const replying = ref(false)
const replyContent = ref('')

// 统计数据
const myCount = computed(() => feedbacks.value.length)
const pendingCount = computed(() => feedbacks.value.filter(f => f.status === 'OPEN' && !f.hasAdminReply).length)
const repliedCount = computed(() => feedbacks.value.filter(f => f.status === 'OPEN' && f.hasAdminReply).length)
const resolvedCount = computed(() => feedbacks.value.filter(f => f.status === 'RESOLVED' || f.status === 'DISMISSED').length)

// 过滤后的列表。列表接口只提供 OPEN/RESOLVED/DISMISSED，OPEN 再按管理员回复区分展示。
const filtered = computed(() => {
  let list = feedbacks.value
  if (filterStatus.value !== '全部') {
    const match = {
      '待处理': f => f.status === 'OPEN' && !f.hasAdminReply,
      '已回复': f => f.status === 'OPEN' && f.hasAdminReply,
      '已完成': f => f.status === 'RESOLVED',
      '已驳回': f => f.status === 'DISMISSED'
    }[filterStatus.value]
    if (match) list = list.filter(match)
  }
  if (q.value.trim()) {
    const kw = q.value.trim().toLowerCase()
    list = list.filter(f => String(f.content || '').toLowerCase().includes(kw))
  }
  return list
})

function statusParam() {
  return { '待处理': 'OPEN', '已回复': 'OPEN', '已完成': 'RESOLVED', '已驳回': 'DISMISSED' }[filterStatus.value]
}

function reloadFromFirstPage() {
  page.value = 1
  loadFeedback()
}

function setFilter(status) {
  filterStatus.value = status
  reloadFromFirstPage()
}

function setViewMode(mode) {
  viewMode.value = mode
  if (mode === 'managed' && filterCategory.value && !access.value.manageAreas.includes(filterCategory.value)) {
    filterCategory.value = ''
  }
  reloadFromFirstPage()
}

async function loadAccess() {
  try {
    const data = await getFeedbackAccess()
    const rawAreas = data.availableCategories || data.available_categories || data.availableAreas || data.available_areas || []
    access.value = {
      superAdmin: Boolean(data.superAdmin ?? data.super_admin),
      receiveAreas: data.receiveCategories || data.receive_categories || data.receiveAreas || data.receive_areas || [],
      manageAreas: data.manageCategories || data.manage_categories || data.manageAreas || data.manage_areas || [],
      availableAreas: rawAreas.map(option => ({
        key: option.key,
        label: option.label
      }))
    }
  } catch (_e) {
    access.value = { superAdmin: false, receiveAreas: [], manageAreas: [], availableAreas: [] }
  }
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
  detailError.value = null
  try {
    const detail = await getFeedback(id)
    const index = feedbacks.value.findIndex(feedback => feedback.id === id)
    if (index !== -1) {
      feedbacks.value.splice(index, 1, detail)
    } else {
      feedbacks.value.unshift(detail)
    }
    expandedId.value = id
  } catch (e) {
    detailError.value = e.message || '详情加载失败'
  } finally {
    detailLoading.value = false
  }
}

function categoryLabel(category) {
  const option = categoryOptions.value.find(item => item.key === category)
  return option ? option.label : (category || '其他模块')
}

function typeLabel(type) {
  return feedbackTypeOptions.find(option => option.key === type)?.label || type || '其他'
}

function statusLabel(status, hasAdminReply) {
  if (status === 'OPEN') return hasAdminReply ? '已回复' : '待处理'
  const map = { RESOLVED: '已完成', DISMISSED: '已驳回' }
  return map[status] || status || '未知状态'
}

function truncate(value, length) {
  const text = String(value || '')
  return text.length > length ? text.slice(0, length) + '…' : text
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadFeedback({ append = false } = {}) {
  loading.value = true
  error.value = null
  try {
    const data = await listFeedback({
      page: page.value,
      pageSize,
      status: statusParam(),
      type: filterType.value || undefined,
      category: filterCategory.value || undefined,
      mine: viewMode.value === 'mine',
      q: q.value.trim() || undefined
    })
    const items = data.items || []
    feedbacks.value = append ? [...feedbacks.value, ...items] : items
    noMore.value = data.total != null
      ? page.value * pageSize >= data.total
      : items.length < pageSize
  } catch (e) {
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
  page.value++
  await loadFeedback({ append: true })
}

function closeNewFeedback() {
  if (!submitting.value) {
    showNewForm.value = false
    formError.value = ''
  }
}

function handleWindowKeydown(event) {
  if (event.key === 'Escape') closeNewFeedback()
}

async function submitFeedback() {
  const content = newFeedback.value.content.trim()
  if (!content || !newFeedback.value.type || !newFeedback.value.category) return
  formError.value = ''
  submitting.value = true
  try {
    await createFeedback({ ...newFeedback.value, content })
    showNewForm.value = false
    newFeedback.value = { type: 'BUG', category: '', content: '', clientInfoConsent: false }
    page.value = 1
    await loadFeedback()
  } catch (e) {
    formError.value = e.message || '提交失败'
  } finally {
    submitting.value = false
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
    error.value = e.message || '发送失败'
  } finally {
    replying.value = false
  }
}

async function closeFeedback(id) {
  try {
    await updateFeedbackStatus(id, 'RESOLVED')
    await loadFeedback()
  } catch (e) {
    error.value = e.message || '操作失败'
  }
}

async function dismissFeedback(id) {
  try {
    await updateFeedbackStatus(id, 'DISMISSED')
    await loadFeedback()
  } catch (e) {
    error.value = e.message || '操作失败'
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleWindowKeydown)
  await loadAccess()
  await loadFeedback()
  const reportId = route.query.id ? String(route.query.id) : ''
  if (reportId) {
    const item = feedbacks.value.find(feedback => feedback.id === reportId)
    if (item && item.messages.length) {
      expandedId.value = reportId
    } else {
      await loadFeedbackDetail(reportId)
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<style scoped>
/* 页面整体布局 — 继承全局设计规范 */
.page-feedback {
  min-height: 100vh;
}

/* Hero 区 */
.page-feedback .hero {
  --wm: '反馈';
}

.feedback-scope-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}

.scope-tabs {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}

.scope-tabs button {
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-right: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  font-weight: 700;
  cursor: pointer;
}

.scope-tabs button:last-child { border-right: 0; }
.scope-tabs button.on { background: var(--tea); color: var(--cream); }

.area-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 700;
}

.area-filter select {
  min-height: 34px;
  padding: 0 30px 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
}

.access-admin-link {
  margin-left: auto;
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 700;
}

/* 新建反馈弹窗 */
.feedback-modal {
  max-width: 560px;
}

.feedback-modal .modal-head h2 {
  font-family: var(--font-s);
  font-weight: 900;
  font-size: 20px;
  letter-spacing: 0.06em;
  color: var(--ink);
}

.feedback-modal .form-actions {
  margin-top: 4px;
}

.feedback-modal .consent-label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 0;
}

.feedback-modal .consent-label input {
  width: auto;
  flex: none;
  margin-top: 3px;
}

.form-row {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-60);
  margin-bottom: 6px;
}

.form-control {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font-size: 14px;
  font-family: var(--font-b);
  transition: border-color 0.2s;
}

.form-control:focus {
  outline: none;
  border-color: var(--accent);
}

textarea.form-control {
  resize: vertical;
  min-height: 80px;
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

/* 反馈列表 */
.feedback-list {
  margin-top: 20px;
}

.feedback-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  margin-bottom: 12px;
  overflow: hidden;
  transition: box-shadow 0.3s var(--ease);
}

.feedback-card:hover {
  box-shadow: 0 4px 16px rgba(73, 59, 44, 0.08);
}

.fc-head {
  padding: 16px 20px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fc-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.fc-area {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 6px;
  background: var(--yellow);
  color: var(--ink);
  font-size: 11px;
  font-weight: 700;
}

.fc-category {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink-60);
  font-size: 11px;
  font-weight: 700;
}

.fc-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  border: 1.5px solid transparent;
}

.fc-status.status-OPEN { border-color: var(--accent); color: var(--accent-strong); }
.fc-status.status-RESOLVED { border-color: #BFDCC0; color: #2d6a2d; }
.fc-status.status-DISMISSED { border-color: var(--line); color: var(--ink-60); }

.fc-date {
  font-size: 12px;
  color: var(--ink-35);
  font-family: var(--font-d);
  margin-left: auto;
}

.fc-title {
  font-family: var(--font-b);
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.5;
}

.fc-expand-indicator {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
  align-self: flex-end;
}

/* 展开内容 */
.fc-body {
  padding: 0 20px 20px;
  border-top: 1px solid var(--line);
}

.detail-loading,
.detail-error {
  padding-top: 14px;
  font-size: 13px;
  color: var(--ink-60);
}

.detail-error,
.form-error {
  color: var(--rouge);
}

.fc-content {
  padding: 16px 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink);
  white-space: pre-wrap;
}

.fc-media {
  padding: 8px 0;
  font-size: 13px;
  color: var(--ink-60);
}

.fc-media-label {
  font-weight: 600;
}

.fc-messages {
  padding: 12px 0;
}

.fc-messages h4 {
  font-family: var(--font-s);
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0.04em;
  color: var(--ink);
  margin-bottom: 12px;
}

.fc-message {
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 8px;
  background: var(--cream);
}

.fc-message.is-admin {
  background: rgba(213, 185, 110, 0.12);
  border-left: 3px solid var(--yellow-deep);
}

.fc-msg-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.fc-msg-author {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
}

.fc-msg-date {
  font-size: 11px;
  color: var(--ink-35);
  font-family: var(--font-d);
}

.fc-msg-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink);
  white-space: pre-wrap;
}

.fc-actions {
  display: flex;
  gap: 8px;
  padding: 12px 0 8px;
}

.fc-reply-form {
  padding: 12px 0;
  border-top: 1px dashed var(--line);
}

/* 状态提示 */
.loading-state,
.error-state {
  text-align: center;
  padding: 40px 20px;
  font-size: 14px;
  color: var(--ink-60);
}

.error-state {
  color: var(--rouge);
}

.text-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-weight: 700;
  cursor: pointer;
  font-size: 13px;
  text-decoration: underline;
}

/* 空状态 */
.empty {
  display: none;
  text-align: center;
  padding: 60px 20px;
  font-size: 14px;
  color: var(--ink-60);
  line-height: 1.8;
}

.empty.show {
  display: block;
}

/* 操作按钮 */
.act-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-b);
}

.act-btn:hover {
  border-color: var(--accent);
  color: var(--accent-strong);
}

.act-btn.primary {
  background: var(--tea);
  border-color: var(--tea);
  color: var(--cream);
}

.act-btn.primary:hover {
  background: var(--tea-deep);
  border-color: var(--tea-deep);
}

.act-btn.small {
  padding: 5px 12px;
  font-size: 12px;
}

.act-btn.danger {
  border-color: var(--rouge);
  color: var(--rouge);
}

.act-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 分页 */
.more-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 0 48px;
}

.btn-more {
  padding: 10px 32px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-b);
}

.btn-more:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-strong);
}

.btn-more:disabled {
  opacity: 0.4;
  cursor: default;
}

.pg button {
  width: 36px;
  height: 36px;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-d);
  font-weight: 700;
}

.pg button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-strong);
}

.pg button:disabled {
  opacity: 0.3;
  cursor: default;
}

/* 工具栏 tabs 复用全局样式 */
.toolbar .tabs button.on {
  background: var(--yellow);
  color: var(--ink);
}
</style>
