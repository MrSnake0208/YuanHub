<template>
  <div class="diagnostic-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header page-header--mobile-context page-header--keep-title">
        <div class="wrap">
          <router-link class="page-header-back" to="/feedback/manage">返回反馈工作台</router-link>
          <h1 class="page-header-title">MaaYuan 诊断</h1>
          <dl v-if="data && !forbidden" class="diagnostic-stats">
            <div><dt>待处理组数</dt><dd>{{ data.pendingCount }}</dd></div>
            <div><dt>近 7 天事件数</dt><dd>{{ data.recentEventCount }}</dd></div>
            <div><dt>修复后复发组数</dt><dd>{{ data.regressedCount }}</dd></div>
          </dl>
        </div>
      </header>
      <section class="wrap diagnostic-content" aria-label="诊断问题列表">
        <div v-if="forbidden" class="diagnostic-state" role="alert">你没有 MaaYuan 区诊断的查看权限。<router-link to="/feedback/manage">返回反馈工作台</router-link></div>
        <template v-else>
          <div class="diagnostic-toolbar">
            <div class="diagnostic-segments" role="group" aria-label="问题状态">
              <button v-for="key in statuses" :key="key" type="button" :aria-pressed="status === key" @click="status = key">{{ diagnosticStatusLabels[key] }} <span>{{ statusCount(key) }}</span></button>
            </div>
            <label><span>原因</span><select v-model="reason"><option value="">全部原因</option><option v-for="([key, count]) in reasonOptions" :key="key" :value="key">{{ diagnosticReason(key).label }}（{{ count }}）</option></select></label>
            <label class="diagnostic-search"><span>搜索</span><input v-model="q" type="search" maxlength="100" placeholder="密探名 / 节点 / OCR 文本" /></label>
            <label><span>排序</span><select v-model="sort"><option value="lastSeen">最近出现</option><option value="count">出现次数</option><option value="firstSeen">首次出现</option></select></label>
          </div>
          <div v-if="loading" class="diagnostic-state" role="status">正在加载诊断问题…</div>
          <div v-else-if="error" class="diagnostic-state diagnostic-error" role="alert">{{ error }}<button type="button" @click="load">重试</button></div>
          <div v-else-if="data && !data.items.length" class="diagnostic-state">当前筛选下没有诊断问题。</div>
          <template v-else-if="data">
            <table class="diagnostic-table">
              <thead><tr><th>问题</th><th>原因</th><th>次数</th><th>最近出现</th><th>涉及版本</th></tr></thead>
              <tbody><tr v-for="item in data.items" :key="item.id">
                <td><button type="button" class="diagnostic-title-button" @click="selectIssue(item.id)">{{ diagnosticIssueTitle(item) }}</button><small v-if="item.status === 'NEW' && item.regressedAt" class="diagnostic-regressed">修复后复发</small></td>
                <td><span class="diagnostic-badge">{{ diagnosticReasonLabel(item) }}</span></td>
                <td class="diagnostic-number">{{ item.eventCount }}</td>
                <td><time :datetime="item.lastSeenAt" :title="formatTime(item.lastSeenAt)">{{ relativeTime(item.lastSeenAt) }}</time></td>
                <td>{{ item.resourceVersions?.join('、') || '未提供' }}</td>
              </tr></tbody>
            </table>
            <div class="diagnostic-cards">
              <article v-for="item in data.items" :key="item.id" class="diagnostic-card">
                <button type="button" class="diagnostic-title-button" @click="selectIssue(item.id)">{{ diagnosticIssueTitle(item) }}</button>
                <span class="diagnostic-badge">{{ diagnosticReasonLabel(item) }}</span>
                <small v-if="item.status === 'NEW' && item.regressedAt" class="diagnostic-regressed">修复后复发</small>
                <p>{{ item.eventCount }} 次 · <time :datetime="item.lastSeenAt" :title="formatTime(item.lastSeenAt)">{{ relativeTime(item.lastSeenAt) }}</time></p>
                <p>资源版本：{{ item.resourceVersions?.join('、') || '未提供' }}</p>
              </article>
            </div>
            <nav class="diagnostic-pagination" aria-label="诊断问题分页">
              <button type="button" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
              <span>第 {{ page }} / {{ totalPages }} 页 · {{ data.total }} 组</span>
              <button type="button" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
            </nav>
          </template>
        </template>
      </section>
    </main>
    <MaayuanDiagnosticDrawer v-if="selectedId" :id="selectedId" :issue-ids="drawerIssueIds" @close="selectedId = ''" @navigate="selectedId = $event" @updated="load" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import MaayuanDiagnosticDrawer from '@/components/diagnostics/MaayuanDiagnosticDrawer.vue'
import { listDiagnosticIssues } from '@/api/maayuanDiagnostics.js'
import { diagnosticIssueTitle, diagnosticReason, diagnosticReasonLabel, diagnosticStatusLabels } from '@/data/maayuanDiagnostics.js'
import { auth } from '@/store/auth.js'
import '@/styles/page-header.css'

const statuses = ['NEW', 'FIXED', 'IGNORED', 'ALL']
const status = ref('NEW'), reason = ref(''), q = ref(''), sort = ref('lastSeen'), page = ref(1)
const data = ref(null), loading = ref(false), error = ref(''), forbidden = ref(false), selectedId = ref('')
const drawerIssueIds = ref([])
let generation = 0, searchTimer
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total || 0) / 20)))
const reasonOptions = computed(() => {
  const counts = { ...(data.value?.reasonCounts || {}) }
  if (reason.value && !(reason.value in counts)) counts[reason.value] = 0
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})
function statusCount(key) {
  if (!data.value) return '—'
  const counts = data.value.statusCounts || {}
  return key === 'ALL' ? Object.values(counts).reduce((sum, count) => sum + count, 0) : counts[key] || 0
}
function formatTime(value) { return value ? new Date(value).toLocaleString('zh-CN') : '' }
function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`
  return `${Math.floor(minutes / 1440)} 天前`
}
async function load() {
  const token = ++generation
  loading.value = true; error.value = ''; forbidden.value = false
  try {
    const result = await listDiagnosticIssues({ status: status.value, reason: reason.value, q: q.value.trim(), sort: sort.value, page: page.value, pageSize: 20 })
    if (token !== generation) return
    data.value = result
    if (page.value > totalPages.value) { page.value = totalPages.value; return load() }
  } catch (failure) {
    if (token !== generation) return
    forbidden.value = failure.status === 403
    if (forbidden.value) { selectedId.value = ''; data.value = null }
    error.value = failure.message || '诊断问题加载失败'
  } finally { if (token === generation) loading.value = false }
}
function reload() { page.value = 1; void load() }
function changePage(value) { page.value = value; void load() }
function selectIssue(id) { drawerIssueIds.value = data.value.items.map(item => item.id); selectedId.value = id }
watch([status, reason, sort], reload)
watch(q, () => { clearTimeout(searchTimer); searchTimer = setTimeout(reload, 300) })
watch(() => auth.userInfo?.id, () => { selectedId.value = ''; data.value = null; reload() }, { immediate: true })
onBeforeUnmount(() => { generation++; clearTimeout(searchTimer) })
</script>

<style src="./diagnostics.css"></style>
<style scoped src="./diagnosticsDesktop.css"></style>
<style scoped src="./diagnosticsMobile.css"></style>
