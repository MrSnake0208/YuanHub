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
            <div><div class="k">待处理</div><div class="v">{{ pendingCount }}<small>条</small></div></div>
            <div><div class="k">已回复</div><div class="v">{{ repliedCount }}<small>条</small></div></div>
            <div><div class="k">已完成</div><div class="v">{{ resolvedCount }}<small>条</small></div></div>
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
                v-for="t in ['全部', '待处理', '处理中', '已回复', '已完成']"
                :key="t"
                :class="{ on: filterStatus === t }"
                @click="setFilter(t)"
              >{{ t }}</button>
            </div>
            <div class="search">
              <span class="ic" aria-hidden="true">⌕</span>
              <input v-model="q" type="search" aria-label="搜索反馈" placeholder="搜标题 / 内容…">
            </div>
          </div>

          <!-- 新建反馈表单 -->
          <div v-if="showNewForm" class="new-feedback-card" v-reveal>
            <h2>提交反馈</h2>
            <form @submit.prevent="submitFeedback">
              <div class="form-row">
                <label class="field-label" for="feedback-type">类型</label>
                <select id="feedback-type" v-model="newFeedback.type" class="form-control" required>
                  <option value="">请选择类型</option>
                  <option value="bug">问题报告（Bug）</option>
                  <option value="feature">功能建议</option>
                  <option value="improvement">体验优化</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div class="form-row">
                <label class="field-label" for="feedback-category">分类</label>
                <select id="feedback-category" v-model="newFeedback.category" class="form-control">
                  <option value="">请选择分类（可选）</option>
                  <option value="inventory">库存管理</option>
                  <option value="operator">密探养成</option>
                  <option value="ledger">广陵账房</option>
                  <option value="plaza">作业广场</option>
                  <option value="account">账号与连接</option>
                  <option value="ui">界面与交互</option>
                </select>
              </div>
              <div class="form-row">
                <label class="field-label" for="feedback-content">详细描述</label>
                <textarea
                  id="feedback-content"
                  v-model="newFeedback.content"
                  class="form-control"
                  rows="5"
                  placeholder="请详细描述您遇到的问题或建议…"
                  required
                ></textarea>
              </div>
              <div class="form-row">
                <label class="field-label">
                  <input type="checkbox" v-model="newFeedback.clientInfoConsent" />
                  <span>允许附加客户端信息（浏览器版本、操作系统等），帮助定位问题</span>
                </label>
              </div>
              <div class="form-actions">
                <button type="button" class="act-btn" @click="showNewForm = false">取消</button>
                <button type="submit" class="act-btn primary" :disabled="submitting">
                  {{ submitting ? '提交中…' : '提交反馈' }}
                </button>
              </div>
            </form>
          </div>

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
                    <span class="fc-type" :class="'type-' + item.type">{{ typeLabel(item.type) }}</span>
                    <span class="fc-status" :class="'status-' + item.status">{{ statusLabel(item.status) }}</span>
                    <span class="fc-date">{{ formatDate(item.createdAt) }}</span>
                  </div>
                  <h3 class="fc-title">{{ item.content | truncate(80) }}</h3>
                  <div class="fc-expand-indicator">{{ expandedId === item.id ? '收起' : '展开' }}</div>
                </div>
                <div v-if="expandedId === item.id" class="fc-body">
                  <div class="fc-content">{{ item.content }}</div>
                  <div v-if="item.mediaIds && item.mediaIds.length" class="fc-media">
                    <span class="fc-media-label">附件：</span>
                    <span class="fc-media-count">{{ item.mediaIds.length }} 个文件</span>
                  </div>
                  <div v-if="item.messages && item.messages.length" class="fc-messages">
                    <h4>对话记录</h4>
                    <div v-for="msg in item.messages" :key="msg.id" class="fc-message" :class="{ 'is-admin': msg.isAdmin }">
                      <div class="fc-msg-head">
                        <span class="fc-msg-author">{{ msg.isAdmin ? '管理员' : '我' }}</span>
                        <span class="fc-msg-date">{{ formatDate(msg.createdAt) }}</span>
                      </div>
                      <div class="fc-msg-content">{{ msg.content }}</div>
                    </div>
                  </div>
                  <div class="fc-actions">
                    <button
                      v-if="item.status === 'pending' || item.status === 'in_progress'"
                      class="act-btn small"
                      @click="showReplyForm(item.id)"
                    >追加消息</button>
                    <button
                      v-if="item.status !== 'resolved' && item.status !== 'closed'"
                      class="act-btn small"
                      @click="closeFeedback(item.id)"
                    >标记完成</button>
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
              <button :disabled="page <= 1" @click="page--">‹</button>
            </div>
            <button class="btn-more" :disabled="noMore" @click="loadMore">{{ noMore ? '没有更多了' : '加载更多' }}</button>
            <div class="pg">
              <button :disabled="noMore" @click="page++">›</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import { auth } from '@/store/auth.js'
import {
  createFeedback,
  listFeedback,
  getFeedback,
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
const expandedId = ref(null)

// 新建表单
const showNewForm = ref(false)
const submitting = ref(false)
const newFeedback = ref({
  type: '',
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
const pendingCount = computed(() => feedbacks.value.filter(f => f.status === 'pending').length)
const repliedCount = computed(() => feedbacks.value.filter(f => f.status === 'in_progress' || f.status === 'replied').length)
const resolvedCount = computed(() => feedbacks.value.filter(f => f.status === 'resolved' || f.status === 'closed').length)

// 过滤后的列表
const filtered = computed(() => {
  let list = feedbacks.value
  if (filterStatus.value !== '全部') {
    const statusMap = { '待处理': 'pending', '处理中': 'in_progress', '已回复': 'replied', '已完成': 'resolved' }
    const s = statusMap[filterStatus.value]
    if (s) list = list.filter(f => f.status === s)
  }
  if (q.value) {
    const kw = q.value.toLowerCase()
    list = list.filter(f => f.content.toLowerCase().includes(kw))
  }
  return list
})

function setFilter(status) {
  filterStatus.value = status
  page.value = 1
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function typeLabel(type) {
  const map = { bug: '问题报告', feature: '功能建议', improvement: '体验优化', other: '其他' }
  return map[type] || type
}

function statusLabel(status) {
  const map = { pending: '待处理', in_progress: '处理中', replied: '已回复', resolved: '已完成', closed: '已关闭' }
  return map[status] || status
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadFeedback() {
  loading.value = true
  error.value = null
  try {
    const data = await listFeedback({ page: page.value, pageSize })
    feedbacks.value = data.items || data || []
    noMore.value = !data.nextCursor && (!data.items || data.items.length < pageSize)
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  page.value++
  await loadFeedback()
}

async function submitFeedback() {
  if (!newFeedback.value.content || !newFeedback.value.type) return
  submitting.value = true
  try {
    await createFeedback(newFeedback.value)
    showNewForm.value = false
    newFeedback.value = { type: '', category: '', content: '', clientInfoConsent: false }
    page.value = 1
    await loadFeedback()
  } catch (e) {
    error.value = e.message || '提交失败'
  } finally {
    submitting.value = false
  }
}

function showReplyForm(id) {
  replyTarget.value = id
  replyContent.value = ''
}

async function submitReply(id) {
  if (!replyContent.value) return
  replying.value = true
  try {
    await appendFeedbackMessage(id, { content: replyContent.value })
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
    await updateFeedbackStatus(id, 'resolved')
    await loadFeedback()
  } catch (e) {
    error.value = e.message || '操作失败'
  }
}

onMounted(() => {
  loadFeedback()
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

/* 新建反馈卡片 */
.new-feedback-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 28px 32px;
  margin-bottom: 24px;
}

.new-feedback-card h2 {
  font-family: var(--font-s);
  font-weight: 900;
  font-size: 20px;
  letter-spacing: 0.06em;
  color: var(--ink);
  margin-bottom: 20px;
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

.fc-type {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.fc-type.type-bug { background: var(--rouge); color: #fff; }
.fc-type.type-feature { background: var(--accent); color: #fff; }
.fc-type.type-improvement { background: var(--yellow); color: var(--ink); }
.fc-type.type-other { background: var(--mist); color: var(--ink); }

.fc-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  border: 1.5px solid transparent;
}

.fc-status.status-pending { border-color: var(--accent); color: var(--accent-strong); }
.fc-status.status-in_progress { border-color: var(--brand-blue); color: var(--brand-blue); }
.fc-status.status-replied { border-color: var(--yellow-deep); color: var(--tea-deep); }
.fc-status.status-resolved { border-color: #BFDCC0; color: #2d6a2d; }
.fc-status.status-closed { border-color: var(--line); color: var(--ink-60); }

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