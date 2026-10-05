<template>
  <div class="calendar-page calendar-community"><IslandSidebar /><main id="main-content">
    <header class="calendar-header wrap">
      <router-link class="calendar-source-link" to="/calendar">← 返回活动日历</router-link>
      <h1>我的活动建议</h1>
      <p>查看你提交的活动资料与审核结果。</p>
      <nav class="calendar-submission-nav" aria-label="活动建议"><router-link class="calendar-primary-link" to="/calendar/suggestions/new">建议补充活动</router-link></nav>
    </header>
    <div class="wrap calendar-content">
      <p v-if="!permitted" class="calendar-panel" role="alert">请登录后查看自己的建议。</p>
      <template v-else>
        <div v-if="error" ref="errorSummary" class="calendar-panel calendar-error" role="alert" tabindex="-1"><p>{{ error }}</p><button type="button" @click="selectedId ? openDetail(selectedId) : load()">重试</button></div>
        <section v-if="selectedId" ref="detailRegion" class="calendar-section" tabindex="-1" aria-labelledby="suggestion-detail-title"><button type="button" @click="closeDetail">返回我的建议列表</button><h2 id="suggestion-detail-title">建议详情</h2><p v-if="detailLoading" role="status">正在读取建议详情…</p><template v-if="detail"><CalendarSuggestionOriginal :suggestion="detail" /><CalendarSuggestionResult :suggestion="detail" /></template></section>
        <section v-else ref="listRegion" class="calendar-list" tabindex="-1" aria-labelledby="my-suggestions-title">
          <h2 id="my-suggestions-title">我的建议列表</h2>
          <form class="calendar-panel calendar-form calendar-suggestion-filters" @submit.prevent="page = 1; load()"><div class="calendar-fields"><label>状态<select v-model="status"><option value="">全部状态</option><option v-for="(label, key) in SUGGESTION_STATUSES" :key="key" :value="key">{{ label }}</option></select></label></div><button type="submit" :disabled="loading">{{ loading ? '读取中…' : '筛选 / 刷新' }}</button></form>
          <p v-if="loading" role="status">正在读取我的建议…</p><p v-else-if="!entries.length && !error" class="calendar-panel">还没有符合条件的建议。发现漏掉的活动时可以提交资料。</p>
          <article v-for="entry in entries" :key="entry.id" class="calendar-panel calendar-suggestion-card"><div class="calendar-badges"><span class="calendar-game">{{ entry.original.game }}</span><span class="calendar-state" :data-status="entry.status">{{ SUGGESTION_STATUSES[entry.status] }}</span></div><h3>{{ entry.original.title }}</h3><p class="calendar-range">{{ calendarRangeLabel(entry.original) }}</p><p class="calendar-hint">提交时间：{{ suggestionTimestamp(entry.created_at) }}</p><button type="button" @click="openDetail(entry.id)">查看资料与审核结果</button></article>
          <nav class="calendar-actions calendar-suggestion-pagination" aria-label="建议分页"><button type="button" :disabled="loading || page <= 1" @click="changePage(-1)">上一页</button><span class="calendar-pagination" role="status">第 {{ page }} 页 · 共 {{ total }} 条</span><button type="button" :disabled="loading || page * pageSize >= total" @click="changePage(1)">下一页</button></nav>
        </section>
      </template>
    </div><SiteFooter />
  </main></div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import CalendarSuggestionOriginal from '@/components/calendar/CalendarSuggestionOriginal.vue'
import CalendarSuggestionResult from '@/components/calendar/CalendarSuggestionResult.vue'
import { auth } from '@/store/auth.js'
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'
import { getActivityCalendarSuggestion, listMyActivityCalendarSuggestions } from '@/api/activityCalendar.js'
import { calendarRangeLabel } from '@/data/activityCalendar.js'
import { SUGGESTION_STATUSES, suggestionTimestamp } from '@/data/activityCalendarSuggestions.js'
import './calendar.css'
const route = useRoute(), enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
const permitted = computed(() => enabled && !!identity.value)
const status = ref(''), page = ref(1), pageSize = 20, entries = ref([]), total = ref(0)
const selectedId = ref(''), detail = ref(null), loading = ref(false), detailLoading = ref(false), error = ref('')
const errorSummary = ref(null), detailRegion = ref(null), listRegion = ref(null)
let generation = 0, readGeneration = 0, detailGeneration = 0, alive = true
const capture = () => ({ generation, identity: identity.value })
const current = token => alive && permitted.value && token.generation === generation && token.identity === identity.value
async function showError(message) { const token = capture(); error.value = message; await nextTick(); if (current(token) && error.value === message) errorSummary.value?.focus() }
async function load() {
  if (!permitted.value || selectedId.value) return
  const token = capture(), read = ++readGeneration
  loading.value = true; error.value = ''; entries.value = []
  try { const response = await listMyActivityCalendarSuggestions({ status: status.value, page: page.value, page_size: pageSize }); if (!current(token) || read !== readGeneration) return; entries.value = response.items || []; total.value = response.total || 0; const lastPage = Math.max(1, Math.ceil(total.value / pageSize)); if (page.value > lastPage) { page.value = lastPage; await load() } }
  catch (err) { if (current(token) && read === readGeneration) await showError(err.message || '建议列表读取失败。') }
  finally { if (current(token) && read === readGeneration) loading.value = false }
}
async function openDetail(id) {
  if (!permitted.value || typeof id !== 'string' || !id) return
  const token = capture(), read = ++detailGeneration
  readGeneration++; loading.value = false
  selectedId.value = id; detail.value = null; error.value = ''; detailLoading.value = true
  await nextTick(); if (!current(token) || read !== detailGeneration || selectedId.value !== id) return; detailRegion.value?.focus()
  try { const response = await getActivityCalendarSuggestion(id); if (current(token) && read === detailGeneration && selectedId.value === id) detail.value = response }
  catch (err) { if (current(token) && read === detailGeneration) await showError(err.message || '建议详情读取失败。') }
  finally { if (current(token) && read === detailGeneration) detailLoading.value = false }
}
async function closeDetail() { const token = capture(); detailGeneration++; selectedId.value = ''; detail.value = null; detailLoading.value = false; error.value = ''; await nextTick(); if (!current(token) || selectedId.value) return; listRegion.value?.focus(); if (!entries.value.length) await load() }
async function changePage(offset) { const token = capture(); page.value += offset; await load(); await nextTick(); if (current(token) && !selectedId.value) listRegion.value?.focus() }
watch(identity, () => {
  generation++; readGeneration++; detailGeneration++; entries.value = []; total.value = 0; page.value = 1; selectedId.value = ''; detail.value = null; loading.value = false; detailLoading.value = false; error.value = ''
  if (permitted.value) { if (typeof route.query.id === 'string' && route.query.id) void openDetail(route.query.id); else void load() }
}, { immediate: true, flush: 'sync' })
watch(() => route.query.id, id => { if (typeof id === 'string' && id) void openDetail(id); else if (selectedId.value) void closeDetail() })
onBeforeUnmount(() => { alive = false; generation++; readGeneration++; detailGeneration++ })
</script>

<style scoped>
.calendar-community .calendar-header { padding-top: 20px; padding-bottom: 12px; gap: 8px; }
.calendar-community .calendar-header h1 { margin: 0; color: var(--tea); font: 900 30px/1.3 var(--font-s); letter-spacing: .035em; overflow-wrap: anywhere; }
.calendar-community .calendar-header > p { color: var(--ink-60); font-size: 13px; line-height: 1.7; }
.calendar-community .calendar-header > .calendar-source-link { color: var(--ink-60); font-size: 13px; font-weight: 700; }
@media (min-width: 700px) {
  .calendar-community .calendar-header { grid-template-columns: minmax(0, 1fr) auto; }
  .calendar-community .calendar-header > .calendar-source-link { grid-column: 1 / -1; }
  .calendar-community .calendar-header h1, .calendar-community .calendar-header > p { grid-column: 1; }
  .calendar-community .calendar-header > nav { grid-column: 2; grid-row: 2 / 4; align-self: start; }
}
</style>
