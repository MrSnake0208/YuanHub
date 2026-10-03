<template>
  <div class="calendar-page calendar-public">
    <IslandSidebar />
    <main id="main-content">
      <header class="calendar-header wrap">
        <p class="calendar-kicker"><CalendarDays :size="20" aria-hidden="true" /> 两个世界，一份日程</p>
        <h1>活动日历</h1>
        <p>看看今天正在进行、即将开始和快结束的活动。</p>
        <p class="calendar-hint">今天 {{ today }} · 按游戏服务器日期（Asia/Shanghai）</p>
      </header>
      <div v-if="enabled" class="wrap calendar-content">
        <section class="calendar-panel calendar-filters" aria-label="活动筛选">
          <fieldset>
            <legend>游戏</legend>
            <div class="calendar-chips">
              <button v-for="game in ['', ...CALENDAR_GAMES]" :key="game" type="button" :aria-pressed="filters.game === game" @click="setFilter({ game })">{{ game || '全部游戏' }}</button>
            </div>
          </fieldset>
          <fieldset>
            <legend>类型</legend>
            <div class="calendar-chips">
              <button type="button" :aria-pressed="!filters.category" @click="setFilter({ category: '' })">全部类型</button>
              <button v-for="(label, category) in CALENDAR_CATEGORIES" :key="category" type="button" :aria-pressed="filters.category === category" @click="setFilter({ category })">{{ label }}</button>
            </div>
          </fieldset>
        </section>
        <div class="calendar-shared-tools">
          <CalendarTodaySummary :today="today" :counts="todayCounts" :loading="loading" :error="error" />
          <div class="calendar-view-tools">
            <button class="calendar-today-action" type="button" @click="goToday"><LocateFixed :size="17" aria-hidden="true" /> 今天</button>
            <CalendarViewSwitcher :model-value="currentView" @update:model-value="setView" />
          </div>
        </div>
        <div class="calendar-view-content" :aria-busy="loading">
          <p v-if="loading" class="calendar-panel" role="status">正在读取活动日程…</p>
          <div v-else-if="error" class="calendar-panel calendar-error" role="alert">
            <p>{{ error }}</p><button type="button" @click="load">重试</button>
          </div>
          <CalendarAgendaView v-if="currentView === 'agenda'" :items="items" :today="today" :anchor-date="anchorDate" :locate-request="locateRequest" :loading="loading" :error="!!error" />
          <CalendarTimelineView v-else-if="currentView === 'timeline'" :items="items" :today="today" :anchor-date="anchorDate" :locate-request="locateRequest" :loading="loading" :error="!!error" @select-date="setDate" />
          <CalendarMonthView v-else :items="items" :today="today" :anchor-date="anchorDate" :loading="loading" :error="!!error" @select-date="setDate" />
        </div>
      </div>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarDays, LocateFixed } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import CalendarViewSwitcher from '@/components/calendar/CalendarViewSwitcher.vue'
import CalendarTodaySummary from '@/components/calendar/CalendarTodaySummary.vue'
import CalendarAgendaView from '@/components/calendar/CalendarAgendaView.vue'
import CalendarTimelineView from '@/components/calendar/CalendarTimelineView.vue'
import CalendarMonthView from '@/components/calendar/CalendarMonthView.vue'
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
