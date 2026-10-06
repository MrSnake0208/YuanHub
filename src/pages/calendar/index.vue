<template>
  <div class="calendar-page calendar-public">
    <IslandSidebar />
    <main id="main-content">
      <header class="calendar-header wrap">
        <div class="calendar-header-copy">
          <h1>活动日历</h1>
        </div>
        <div v-if="enabled" class="calendar-view-tools">
          <button class="calendar-today-action" type="button" @click="goToday"><LocateFixed :size="17" aria-hidden="true" /> 今天</button>
          <CalendarViewSwitcher :model-value="currentView" @update:model-value="setView" />
        </div>
      </header>
      <div v-if="enabled" class="wrap calendar-content">
        <section class="calendar-subscription-toolbar" aria-label="活动范围与账号">
          <div class="calendar-chips" role="group" aria-label="活动范围">
            <button type="button" :aria-pressed="!mine" @click="setScope(false)">全部活动</button>
            <button type="button" :aria-pressed="mine" @click="setScope(true)">我的订阅</button>
          </div>
          <AccountSwitcher v-if="!subscriptions.accountLoading.value && !subscriptions.accountError.value" :accounts="subscriptions.accounts.value"
            :account-id="subscriptions.account.value?.id || ''" :before-switch="subscriptions.confirmDiscard" />
          <p v-else-if="subscriptions.accountLoading.value" role="status">正在读取游戏账号…</p>
          <p v-else-if="subscriptions.accountError.value" role="alert">{{ subscriptions.accountError.value }} <button type="button" @click="subscriptions.loadAccounts">重试</button></p>
          <label v-if="mine" class="calendar-check-row"><input type="checkbox" :checked="pendingOnly" @change="setPending($event.target.checked)">仅未完成</label>
          <p v-if="mine && subscriptions.account.value" class="calendar-hint">订阅与关卡进度仅当前账号可见。</p>
        </section>
        <section class="calendar-filter-inline" aria-label="活动筛选">
          <CalendarFilterControls :filters="filters" :lock-game="mine" :games="CALENDAR_GAMES" :categories="CALENDAR_CATEGORIES" @change="setFilter" />
        </section>
        <button class="calendar-filter-mobile-trigger" type="button" aria-haspopup="dialog" :aria-expanded="filterOpen" aria-controls="calendar-filter-sheet" :aria-label="`筛选活动，当前：${filterSummary}，已启用 ${activeFilterCount} 个筛选条件`" @click="openFilters">
          <SlidersHorizontal :size="17" aria-hidden="true" />
          <span>筛选</span>
          <span class="calendar-filter-summary">{{ filterSummary }}</span>
          <span v-if="activeFilterCount" class="calendar-filter-count" aria-hidden="true">{{ activeFilterCount }}</span>
          <ChevronRight :size="17" aria-hidden="true" />
        </button>
        <CalendarFilterSheet :open="filterOpen" :filters="filters" :lock-game="mine" :games="CALENDAR_GAMES" :categories="CALENDAR_CATEGORIES" @change="setFilter" @reset="setFilter({ game: '', category: '' })" @close="filterOpen = false" />
        <CalendarTodaySummary :today="today" :counts="todayCounts" :loading="loading" :error="error" />
        <p v-if="mine" class="calendar-hint">以上为当前游戏与类型的公开活动统计，不是个人订阅数。</p>
        <p v-if="!mine && subscriptions.error.value" class="calendar-error" role="alert">个人订阅状态读取失败，公共活动仍可浏览。<button type="button" @click="subscriptions.load">重试订阅</button></p>
        <p v-if="mine && !subscriptions.account.value" class="calendar-panel" role="status">请选择游戏账号后查看我的订阅。</p>
        <p v-else-if="mine && !viewLoading && !viewError && !visibleItems.length" class="calendar-panel" role="status">{{ subscriptions.count.value ? '当前日期或筛选下没有订阅，试试调整日期或取消筛选。' : '还没有订阅活动，去全部活动中订阅本期吧。' }} <button v-if="!subscriptions.count.value" type="button" @click="setScope(false)">浏览全部活动</button></p>
        <div class="calendar-view-content" :aria-busy="viewLoading">
          <p v-if="viewLoading" class="calendar-panel" role="status">正在读取活动日程…</p>
          <div v-else-if="viewError" class="calendar-panel calendar-error" role="alert">
            <p>{{ viewError }}</p><button type="button" @click="mine ? subscriptions.load() : load()">重试</button>
          </div>
          <CalendarAgendaView v-if="currentView === 'agenda'" :items="visibleItems" :today="today" :anchor-date="anchorDate" :locate-request="locateRequest" :loading="viewLoading" :error="!!viewError" />
          <CalendarTimelineView v-else-if="currentView === 'timeline'" :items="visibleItems" :today="today" :anchor-date="anchorDate" :locate-request="locateRequest" :loading="viewLoading" :error="!!viewError" @select-date="setDate" />
          <CalendarMonthView v-else :items="visibleItems" :today="today" :anchor-date="anchorDate" :loading="viewLoading" :error="!!viewError" @select-date="setDate" />
        </div>
        <section v-if="mine && subscriptions.unavailable.value.length" class="calendar-panel" aria-label="不可用的订阅">
          <h2>活动已停用或不可用</h2>
          <article v-for="record in subscriptions.unavailable.value" :key="record.event_id" class="calendar-event">
            <p>这项活动已停止提醒，个人记录仍保留。</p>
            <ul v-if="record.checklist.length"><li v-for="entry in record.checklist" :key="entry.id">{{ entry.title }} · {{ entry.completed ? '已完成' : '未完成' }}</li></ul>
            <CalendarSubscriptionControls :unavailable="record" />
          </article>
        </section>
        <section class="calendar-contribution" aria-label="社区补充">
          <div class="calendar-contribution-copy">
            <p>发现漏掉的游戏活动？</p>
            <p class="calendar-hint">提交已公布的活动资料，审核通过后会加入日历。</p>
          </div>
          <nav class="calendar-submission-nav calendar-contribution-actions" aria-label="活动资料补充">
            <router-link :to="{ path: '/calendar/suggestions/new', query: filters.game ? { game: filters.game } : {} }">建议补充活动</router-link>
            <router-link class="calendar-contribution-secondary" to="/calendar/suggestions">我的建议</router-link>
          </nav>
        </section>
      </div>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCalendarSubscriptions } from '@/composables/useCalendarSubscriptions.js'
import { subscriptionScope, subscriptionPending, subscriptionScopeQuery } from '@/data/activityCalendarSubscriptions.js'
import CalendarSubscriptionControls from '@/components/calendar/CalendarSubscriptionControls.vue'
import AccountSwitcher from '@/components/AccountSwitcher.vue'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'
import { ChevronRight, LocateFixed, SlidersHorizontal } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import CalendarViewSwitcher from '@/components/calendar/CalendarViewSwitcher.vue'
import CalendarTodaySummary from '@/components/calendar/CalendarTodaySummary.vue'
import CalendarAgendaView from '@/components/calendar/CalendarAgendaView.vue'
import CalendarTimelineView from '@/components/calendar/CalendarTimelineView.vue'
import CalendarMonthView from '@/components/calendar/CalendarMonthView.vue'
import CalendarFilterControls from '@/components/calendar/CalendarFilterControls.vue'
import CalendarFilterSheet from '@/components/calendar/CalendarFilterSheet.vue'
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'
import { listActivityCalendar } from '@/api/activityCalendar.js'
import { CALENDAR_CATEGORIES, CALENDAR_GAMES, CALENDAR_VIEW_STORAGE_KEY, calendarAnchorDate, calendarFilterQuery, calendarFilters, calendarRequestRange, calendarView, calendarViewQuery, millisecondsUntilServerMidnight, normalizeCalendarItems, serverToday, summarizeCalendarDay } from '@/data/activityCalendar.js'
import './calendar.css'
import './public-calendar.css'

const route = useRoute(), router = useRouter()
const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const today = ref(serverToday())
// Width chooses only the initial fallback. User navigation never listens to resize.
const wide = typeof window !== 'undefined' && window.innerWidth >= 1024
let savedView = ''
try { if (enabled) savedView = localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) || '' } catch { /* Storage can be unavailable in private browsers. */ }
const preferredView = ref(calendarView({}, savedView, wide))
const mine = computed(() => subscriptionScope(route.query))
const pendingOnly = computed(() => mine.value && subscriptionPending(route.query))
const filters = computed(() => ({ ...calendarFilters(route.query), ...(mine.value ? { game: subscriptions.account.value?.game || '' } : {}) }))
const filterOpen = ref(false)
const filterSummary = computed(() => `${filters.value.game || '全部游戏'} · ${CALENDAR_CATEGORIES[filters.value.category] || '全部类型'}`)
const activeFilterCount = computed(() => Number(!!filters.value.game) + Number(!!filters.value.category))
function openFilters(event) {
  event.currentTarget.focus()
  filterOpen.value = true
}
const currentView = computed(() => calendarView(route.query, preferredView.value, wide))
const anchorDate = computed(() => calendarAnchorDate(route.query, today.value))
const requestRange = computed(() => calendarRequestRange(currentView.value, anchorDate.value, today.value))
const subscriptions = useCalendarSubscriptions(enabled, requestRange, computed(() => calendarFilters(route.query).category))
const requestKey = computed(() => JSON.stringify({ ...filters.value, ...requestRange.value, today: today.value, identity: subscriptions.identity.value }))
const items = ref([]), summaryItems = ref([]), loading = ref(false), error = ref(''), locateRequest = ref(0)
const todayCounts = computed(() => summarizeCalendarDay(summaryItems.value, today.value))
const visibleItems = computed(() => mine.value ? normalizeCalendarItems(subscriptions.records.value.filter(record => !pendingOnly.value || !record.completed).map(record => record.item)) : items.value)
const viewLoading = computed(() => mine.value ? subscriptions.loading.value : loading.value)
const viewError = computed(() => mine.value ? subscriptions.error.value : error.value)
function setScope(value) { return router.replace({ query: subscriptionScopeQuery(route.query, value) }) }
function setPending(value) { const query = { ...route.query }; if (value) query.pending = '1'; else delete query.pending; return router.replace({ query }) }
let generation = 0
let dayTimer = null, minuteTimer = null, boundaryTimer = null, lastRefresh = 0
let previousNow = Date.now(), deferredRefresh = false
function checkServerDate() {
  if (subscriptions.dirty.value) { deferredRefresh = true; return }
  today.value = serverToday()
  clearTimeout(dayTimer)
  dayTimer = setTimeout(checkServerDate, millisecondsUntilServerMidnight() + 100)
}
function refreshVisible() {
  if (subscriptions.dirty.value) { deferredRefresh = true; return }
  deferredRefresh = false
  checkServerDate()
  subscriptions.now.value = Date.now()
  if (Date.now() - lastRefresh < 1000 || subscriptions.dirty.value) return
  lastRefresh = Date.now()
  void subscriptions.load()
  if (subscriptions.permitted.value) void load()
}
function onVisibilityChange() { if (document.visibilityState === 'visible') refreshVisible() }
onMounted(() => {
  if (!enabled) return
  checkServerDate()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', refreshVisible)
  minuteTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return
    const next = Date.now()
    subscriptions.now.value = next
    const crossed = subscriptions.records.value.some(record => record.item?.end_at && Date.parse(record.item.end_at) > previousNow && Date.parse(record.item.end_at) <= next)
    previousNow = next
    if (crossed && !subscriptions.dirty.value) void subscriptions.load()
  }, 60000)
})
onBeforeUnmount(() => {
  generation++
  clearTimeout(dayTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pageshow', refreshVisible)
  clearInterval(minuteTimer)
  clearTimeout(boundaryTimer)
})
function setFilter(patch) { const value = { ...patch }; if (mine.value) delete value.game; return router.replace({ query: calendarFilterQuery(route.query, value) }) }
async function setView(view) {
  const failure = await router.replace({ query: calendarViewQuery(route.query, { view }, today.value) })
  if (failure) return
  preferredView.value = view
  try { localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, view) } catch { /* In-memory preference still works. */ }
}
function setDate(date) {
  return router.replace({ query: calendarViewQuery(route.query, { view: currentView.value, date }, today.value) })
}
async function goToday() {
  const failure = await setDate(today.value)
  if (!failure || isNavigationFailure(failure, NavigationFailureType.duplicated)) locateRequest.value++
}
async function load() {
  if (!enabled) return
  const token = ++generation
  const selectedFilters = { ...filters.value }, range = { ...requestRange.value }, date = today.value
  loading.value = true
  error.value = ''
  items.value = []
  summaryItems.value = []
  const needsSummary = date < range.from || date > range.to
  const normalize = values => normalizeCalendarItems(values).filter(item => (!selectedFilters.game || item.game === selectedFilters.game) && (!selectedFilters.category || item.category === selectedFilters.category))
  try {
    const [result, summary] = await Promise.all([
      listActivityCalendar({ ...selectedFilters, ...range }),
      needsSummary ? listActivityCalendar({ ...selectedFilters, from: date, to: date }) : Promise.resolve(null),
    ])
    if (token !== generation) return
    items.value = normalize(result?.items).filter(item => item.end_date >= range.from && item.start_date <= range.to)
    summaryItems.value = needsSummary ? normalize(summary?.items) : items.value
  } catch (err) {
    if (token === generation) error.value = err?.message || '活动日程读取失败，请重试。'
  } finally {
    if (token === generation) loading.value = false
  }
}
watch(requestKey, load, { immediate: true, flush: 'sync' })
watch(subscriptions.dirty, value => { if (!value && deferredRefresh) refreshVisible() })
function scheduleBoundary() {
  clearTimeout(boundaryTimer)
  const deadlines = [...items.value, ...subscriptions.records.value.map(record => record.item)].filter(Boolean).map(item => Date.parse(item.end_at)).filter(time => time > Date.now())
  if (deadlines.length) boundaryTimer = setTimeout(() => {
    subscriptions.now.value = Date.now()
    if (!subscriptions.dirty.value) void subscriptions.load()
    scheduleBoundary()
  }, Math.min(2147483647, Math.min(...deadlines) - Date.now() + 50))
}
watch(() => [...items.value, ...subscriptions.records.value.map(record => record.item)].filter(Boolean).map(item => item.end_at).join(','), scheduleBoundary)
</script>

<style scoped>
.calendar-public .calendar-content { grid-template-columns: minmax(0, 1fr); }
.calendar-public .calendar-header { padding-top: 20px; padding-bottom: 12px; gap: 12px; }
.calendar-public .calendar-header h1 { margin: 0; color: var(--tea); font: 900 30px/1.3 var(--font-s); letter-spacing: .035em; overflow-wrap: anywhere; }
@media (min-width: 768px) {
  .calendar-public .calendar-header { grid-template-columns: minmax(0, 1fr) auto; }
  .calendar-public .calendar-view-tools { grid-column: 2; grid-row: 1; }
}
</style>
