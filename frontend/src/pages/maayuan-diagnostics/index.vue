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
      <section class="wrap diagnostic-content" aria-label="诊断问题与详情">
        <div v-if="forbidden" class="diagnostic-state" role="alert">你没有 MaaYuan 区诊断的查看权限。<router-link to="/feedback/manage">返回反馈工作台</router-link></div>
        <template v-else>
          <div class="diagnostic-toolbar">
            <div class="diagnostic-segments" role="group" aria-label="问题状态">
              <button v-for="key in statuses" :key="key" type="button" :aria-pressed="status === key" @click="setFilter('status', key)">{{ diagnosticStatusLabels[key] }} <span>{{ statusCount(key) }}</span></button>
            </div>
            <label><span>原因</span><select :value="reason" @change="setFilter('reason', $event.target.value, $event)"><option value="">全部原因</option><option v-for="([key, count]) in reasonOptions" :key="key" :value="key">{{ diagnosticReason(key).label }}（{{ count }}）</option></select></label>
            <label class="diagnostic-search"><span>搜索</span><input v-model="searchText" type="search" maxlength="100" placeholder="密探名 / 节点 / OCR 文本" /></label>
            <label><span>排序</span><select :value="sort" @change="setFilter('sort', $event.target.value, $event)"><option value="lastSeen">最近出现</option><option value="count">出现次数</option><option value="firstSeen">首次出现</option></select></label>
          </div>
          <div class="diagnostic-workspace">
            <div v-show="!compact || !selectedId" ref="listPanel" class="diagnostic-list-panel">
              <div v-if="loading" class="diagnostic-state" role="status">正在加载诊断问题…</div>
              <div v-else-if="error" class="diagnostic-state diagnostic-error" role="alert">{{ error }}<button type="button" @click="load">重试</button></div>
              <div v-else-if="data && !data.items.length" class="diagnostic-state">当前筛选下没有诊断问题。</div>
              <template v-else-if="data">
                <div class="diagnostic-list" aria-label="诊断问题列表">
                  <button v-for="item in data.items" :key="item.id" type="button" class="diagnostic-row" :aria-current="selectedId === item.id ? 'true' : undefined" @click="selectIssue(item.id)">
                    <span class="diagnostic-row-heading"><span class="diagnostic-row-title">{{ diagnosticIssueTitle(item) }}</span><small v-if="item.status === 'NEW' && item.regressedAt" class="diagnostic-regressed">修复后复发</small></span>
                    <span class="diagnostic-row-meta"><span>{{ item.eventCount }} 次</span> · <time :datetime="item.lastSeenAt" :title="formatTime(item.lastSeenAt)">{{ relativeTime(item.lastSeenAt) }}</time> · <span :title="item.resourceVersions?.join('、')">{{ versionSummary(item) }}</span></span>
                  </button>
                </div>
                <nav class="diagnostic-pagination" aria-label="诊断问题分页">
                  <button type="button" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
                  <span>第 {{ page }} / {{ totalPages }} 页 · {{ data.total }} 组</span>
                  <button type="button" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
                </nav>
              </template>
            </div>
            <div v-if="selectedId || !compact" ref="detailRegion" class="diagnostic-detail-region">
              <MaayuanDiagnosticDetail v-if="selectedId" ref="detailPanel" :id="selectedId" :issue-ids="issueIds" :compact="compact" @back="backToList" @navigate="selectIssue" @updated="load" />
              <p v-else class="diagnostic-detail diagnostic-state" role="status">{{ loading ? '正在加载诊断问题…' : error ? '问题列表加载失败，请重试' : '当前筛选下没有诊断问题' }}</p>
            </div>
          </div>
        </template>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import MaayuanDiagnosticDetail from '@/components/diagnostics/MaayuanDiagnosticDetail.vue'
import { listDiagnosticIssues } from '@/api/maayuanDiagnostics.js'
import { diagnosticIssueTitle, diagnosticReason, diagnosticStatusLabels } from '@/data/maayuanDiagnostics.js'
import { auth } from '@/store/auth.js'
import '@/styles/page-header.css'

const statuses = ['NEW', 'FIXED', 'IGNORED', 'ALL']
const status = ref('NEW'), reason = ref(''), q = ref(''), sort = ref('lastSeen'), page = ref(1)
const filters = { status, reason, q, sort }
const searchText = ref('')
const data = ref(null), loading = ref(false), error = ref(''), forbidden = ref(false), selectedId = ref('')
const detailPanel = ref(null), listPanel = ref(null), detailRegion = ref(null)
const media = window.matchMedia('(max-width: 1080px)')
const compact = ref(media.matches)
const issueIds = computed(() => (data.value?.items || []).map(item => item.id))
let generation = 0, searchTimer, listScrollY = 0, checkingLeave = false
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
function versionSummary(item) {
  const versions = item.resourceVersions || []
  return versions.length ? `${versions[versions.length - 1]}${versions.length > 1 ? ` +${versions.length - 1}` : ''}` : '未提供'
}
function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`
  return `${Math.floor(minutes / 1440)} 天前`
}
async function canLeaveDetail() {
  if (checkingLeave) return false
  checkingLeave = true
  try { return !detailPanel.value || await detailPanel.value.canLeave() }
  finally { checkingLeave = false }
}
async function load() {
  const token = ++generation
  loading.value = true; error.value = ''; forbidden.value = false
  try {
    const result = await listDiagnosticIssues({ status: status.value, reason: reason.value, q: q.value.trim(), sort: sort.value, page: page.value, pageSize: 20 })
    if (token !== generation) return
    data.value = result
    if (page.value > totalPages.value) { page.value = totalPages.value; return load() }
    if (!compact.value && !selectedId.value) selectedId.value = result.items[0]?.id || ''
  } catch (failure) {
    if (token !== generation) return
    forbidden.value = failure.status === 403
    if (forbidden.value) { selectedId.value = ''; data.value = null }
    error.value = failure.message || '诊断问题加载失败'
  } finally { if (token === generation) loading.value = false }
}
async function setFilter(key, value, event) {
  if (filters[key].value === value) return
  if (!await canLeaveDetail()) {
    if (event) event.target.value = filters[key].value
    if (key === 'q') searchText.value = q.value
    return
  }
  filters[key].value = value; page.value = 1
  void load()
}
async function changePage(value) {
  if (!await canLeaveDetail()) return
  page.value = value
  void load()
}
async function selectIssue(id) {
  if (id === selectedId.value || !await canLeaveDetail()) return
  if (compact.value && !selectedId.value) listScrollY = window.scrollY
  selectedId.value = id
}
async function backToList() {
  if (!await canLeaveDetail()) return
  const previousId = selectedId.value
  selectedId.value = ''
  await nextTick()
  window.scrollTo({ top: listScrollY })
  const previousRow = [...(listPanel.value?.querySelectorAll('.diagnostic-row') || [])].find((_, index) => issueIds.value[index] === previousId)
  previousRow?.focus({ preventScroll: true })
}
function onMediaChange(event) {
  if (event.matches && selectedId.value) listScrollY = window.scrollY
  compact.value = event.matches
}
media.addEventListener('change', onMediaChange)
watch(compact, value => {
  if (!value && !selectedId.value) selectedId.value = issueIds.value[0] || ''
})
watch([selectedId, issueIds], async ([id], [previousId]) => {
  if (!id) return
  await nextTick()
  if (compact.value) {
    if (id !== previousId) {
      detailRegion.value?.scrollIntoView({ block: 'start' })
      detailRegion.value?.querySelector('h2')?.focus({ preventScroll: true })
    }
  } else {
    listPanel.value?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }
})
watch(searchText, value => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { void setFilter('q', value) }, 300) })
watch(() => auth.userInfo?.id, () => { selectedId.value = ''; data.value = null; page.value = 1; void load() }, { immediate: true })
onBeforeUnmount(() => { generation++; clearTimeout(searchTimer); media.removeEventListener('change', onMediaChange) })
</script>

<style src="./diagnostics.css"></style>
<style scoped src="./diagnosticsDesktop.css"></style>
<style scoped src="./diagnosticsMobile.css"></style>
