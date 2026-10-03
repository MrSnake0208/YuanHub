<template>
  <div class="calendar-page calendar-public">
    <IslandSidebar />
    <main id="main-content">
      <header class="calendar-header wrap">
        <div class="calendar-header-copy">
          <h1>活动日历</h1>
          <nav v-if="enabled" class="calendar-actions" aria-label="活动资料补充"><router-link class="calendar-source-link" :to="{ path: '/calendar/suggestions/new', query: filters.game ? { game: filters.game } : {} }">建议补充活动</router-link><router-link class="calendar-source-link" to="/calendar/suggestions">我的建议</router-link></nav>
        </div>
        <div v-if="enabled" class="calendar-view-tools">
          <button class="calendar-today-action" type="button" @click="goToday"><LocateFixed :size="17" aria-hidden="true" /> 今天</button>
          <CalendarViewSwitcher :model-value="currentView" @update:model-value="setView" />
        </div>
      </header>
      <div v-if="enabled" class="wrap calendar-content">
        <section class="calendar-filter-inline" aria-label="活动筛选">
          <CalendarFilterControls :filters="filters" :games="CALENDAR_GAMES" :categories="CALENDAR_CATEGORIES" @change="setFilter" />
        </section>
        <button class="calendar-filter-mobile-trigger" type="button" aria-haspopup="dialog" :aria-expanded="filterOpen" aria-controls="calendar-filter-sheet" :aria-label="`筛选活动，当前：${filterSummary}，已启用 ${activeFilterCount} 个筛选条件`" @click="openFilters">
          <SlidersHorizontal :size="17" aria-hidden="true" />
          <span>筛选</span>
          <span class="calendar-filter-summary">{{ filterSummary }}</span>
          <span v-if="activeFilterCount" class="calendar-filter-count" aria-hidden="true">{{ activeFilterCount }}</span>
          <ChevronRight :size="17" aria-hidden="true" />
        </button>
        <CalendarFilterSheet :open="filterOpen" :filters="filters" :games="CALENDAR_GAMES" :categories="CALENDAR_CATEGORIES" @change="setFilter" @reset="setFilter({ game: '', category: '' })" @close="filterOpen = false" />
        <CalendarTodaySummary :today="today" :counts="todayCounts" :loading="loading" :error="error" />
        <div class="calendar-view-content" :aria-busy="loading">
          <p v-if="loading" class="calendar-panel" role="status">正在读取活动日程…</p>
          <div v-else-if="error" class="calendar-panel calendar-error" role="alert">
            <p>{{ error }}</p><button type="button" @click="load">重试</button>
          </div>
          <CalendarAgendaView v-if="currentView === 'agenda'" :items="items" :today="today" :anchor-date="anchorDate" :locate-request="locateRequest" :loading="loading" :error="!!error" />
          <CalendarTimelineView v-else-if="currentView === 'timeline'" :items="items" :today="today" :anchor-date="anchorDate" :locate-request="locateRequest" :loading="loading" :error="!!error" @select-date="setDate" />
          <CalendarMonthView v-else :items="items" :today="today" :anchor-date="anchorDate" :loading="loading" :error="!!error" @select-date="setDate" />
        </div>
        <p v-if="!loading && !error && !items.length" class="calendar-panel calendar-hint">发现漏掉的游戏活动？<router-link class="calendar-source-link" :to="{ path: '/calendar/suggestions/new', query: filters.game ? { game: filters.game } : {} }">提交资料，审核通过后会加入日历。</router-link></p>
      </div>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const filters = computed(() => calendarFilters(route.query))
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
const requestKey = computed(() => JSON.stringify({ ...filters.value, ...requestRange.value, today: today.value }))
const items = ref([]), summaryItems = ref([]), loading = ref(false), error = ref(''), locateRequest = ref(0)
const todayCounts = computed(() => summarizeCalendarDay(summaryItems.value, today.value))
let generation = 0
let dayTimer = null
function checkServerDate() {
  today.value = serverToday()
  clearTimeout(dayTimer)
  dayTimer = setTimeout(checkServerDate, millisecondsUntilServerMidnight() + 100)
}
function onVisibilityChange() { if (document.visibilityState === 'visible') checkServerDate() }
onMounted(() => {
  if (!enabled) return
  checkServerDate()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', checkServerDate)
})
onBeforeUnmount(() => {
  generation++
  clearTimeout(dayTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pageshow', checkServerDate)
})
function setFilter(patch) { return router.replace({ query: calendarFilterQuery(route.query, patch) }) }
function setView(view) {
  // The page keeps the preference in memory even when storage writes fail.
  preferredView.value = view
  try { localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, view) } catch { /* In-memory preference still works. */ }
  return router.replace({ query: calendarViewQuery(route.query, { view }, today.value) })
}
function setDate(date) {
  return router.replace({ query: calendarViewQuery(route.query, { view: currentView.value, date }, today.value) })
}
async function goToday() {
  await setDate(today.value)
  locateRequest.value++
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
</script>
