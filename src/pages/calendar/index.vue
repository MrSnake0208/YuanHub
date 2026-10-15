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
            <button type="button" :aria-pressed="mine" @click="setScope(true)">我的日历</button>
          </div>
          <button ref="filterTrigger" class="calendar-filter-trigger" type="button" aria-haspopup="dialog" :aria-expanded="filterOpen" aria-controls="calendar-filter-sheet" :aria-label="`筛选活动，当前：${filterSummary}，已启用 ${activeFilterCount} 个筛选条件`" @click="openFilters">
            <SlidersHorizontal :size="17" aria-hidden="true" /><span>筛选</span>
            <span v-if="activeFilterCount" class="calendar-filter-count" aria-hidden="true">{{ activeFilterCount }}</span>
          </button>
          <AccountSwitcher v-if="!subscriptions.accountLoading.value && !subscriptions.accountError.value" :accounts="subscriptions.accounts.value"
            :account-id="subscriptions.account.value?.id || ''" :before-switch="subscriptions.switchAccount" />
          <p v-else-if="subscriptions.accountLoading.value" role="status">正在读取游戏账号…</p>
          <p v-else-if="subscriptions.accountError.value" role="alert">{{ subscriptions.accountError.value }} <button type="button" @click="subscriptions.loadAccounts">重试</button></p>
          <label v-if="mine" class="calendar-task-filter">个人活动
            <select :value="taskStatus" aria-label="个人活动状态" @change="setTask($event.target.value, $event.target)">
              <option value="todo">我的待办</option><option value="completed">已完成</option><option value="all">全部订阅</option>
            </select>
          </label>
          <button v-if="mine" type="button" class="calendar-private-add" :disabled="!privateItems.ready.value" @click="privateItems.open(null, anchorDate)"><Plus :size="17" aria-hidden="true" /> 添加私人事项</button>
          <p v-if="mine && subscriptions.account.value" class="calendar-hint calendar-account-scope">{{ filters.game }}（账号锁定） · 订阅即本期待办，截止不会自动完成；历史档期可调整日期查看。私人事项仅当前账号可见。</p>
          <p v-if="subscriptions.contextNotice.value" class="calendar-hint" role="status">{{ subscriptions.contextNotice.value }}</p>
        </section>
        <div v-if="activeFilterCount" class="calendar-filter-state" aria-label="已启用的筛选">
          <p class="calendar-filter-summary">{{ filterSummary }}</p>
          <div class="calendar-active-filters">
            <button v-for="condition in activeFilters" :key="condition.key" type="button" :aria-label="`取消筛选：${condition.label}`" @click="removeFilter(condition)">
              {{ condition.label }}<X :size="14" aria-hidden="true" />
            </button>
          </div>
          <button class="calendar-filter-clear" type="button" @click="resetFilters">清除筛选</button>
        </div>
        <CalendarFilterSheet :open="filterOpen" :anchor="filterTrigger" :filters="filters" :lock-game="mine" :games="CALENDAR_GAMES" :categories="CALENDAR_CATEGORIES" @change="setFilter" @reset="resetFilters" @close="filterOpen = false" />
        <CalendarTodaySummary :today="today" :counts="todayCounts" :loading="loading" :error="error" />
        <p v-if="!mine && subscriptions.error.value" class="calendar-error" role="alert">个人订阅状态读取失败，公共活动仍可浏览。<button type="button" @click="subscriptions.load">重试订阅</button></p>
        <p v-if="mine && privateItems.notice.value" class="calendar-panel" role="status">{{ privateItems.notice.value }}</p>
        <p v-if="mine && privateItemsHidden" class="calendar-hint">当前类型、时间状态或已完成视图仅显示订阅活动，私人事项已隐藏；清除类型/时间筛选或切回我的待办即可查看。</p>
        <p v-if="mine && !subscriptions.account.value" class="calendar-panel" role="status">请先通过上方账号切换器选择或新建游戏账号，再使用我的日历。</p>
        <div v-else-if="!viewLoading && !viewError && !visibleItems.length" class="calendar-panel calendar-filter-empty" role="status">
          <p>{{ mine && !subscriptions.count.value && !privateItems.records.value.length ? '我的日历还是空的，可以添加私人事项，或去全部活动订阅。' : mine ? '当前条件下无事项，试试清除筛选或调整日期。' : '当前条件下无活动，试试清除筛选或调整日期。' }}</p>
          <button v-if="activeFilterCount" type="button" @click="resetFilters">清除筛选</button>
          <button v-if="mine" type="button" @click="setScope(false)">浏览全部活动</button>
          <button v-else type="button" @click="goToday">回到今天</button>
        </div>
        <div class="calendar-view-content" :aria-busy="viewLoading">
          <p v-if="viewLoading" class="calendar-panel" role="status">正在读取活动日程…</p>
          <div v-else-if="viewError" class="calendar-panel calendar-error" role="alert">
            <p>{{ viewError }}</p><button type="button" @click="retry">重试</button>
          </div>
          <CalendarAgendaView v-if="currentView === 'agenda'" :items="visibleItems" :today="today" :anchor-date="anchorDate" :locate-request="locateRequest" :loading="viewLoading" :error="!!viewError" />
          <CalendarTimelineView v-else-if="currentView === 'timeline'" :items="visibleItems" :today="today" :anchor-date="anchorDate" :locate-request="locateRequest" :loading="viewLoading" :error="!!viewError" @select-date="setDate" />
          <CalendarMonthView v-else :items="visibleItems" :today="today" :anchor-date="anchorDate" :loading="viewLoading" :error="!!viewError" :can-create="privateItems.ready.value" @select-date="(date, afterSelect) => setDate(date).then(afterSelect)" @create-private="privateItems.open(null, $event)" />
        </div>
        <section v-if="mine && visibleUnavailable.length" class="calendar-panel" aria-label="不可用的订阅">
          <h2>活动已停用或不可用</h2>
          <article v-for="record in visibleUnavailable" :key="record.event_id" class="calendar-event">
            <p>这项活动已停止提醒，个人记录仍保留。</p>
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
            <router-link class="calendar-contribution-secondary" :to="{ path: '/feedback', query: { new: '1', category: 'CALENDAR' } }">反馈日历问题</router-link>
          </nav>
        </section>
      </div>
      <CalendarPrivateItemEditor v-if="subscriptions.account.value" :account="subscriptions.account.value" />
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCalendarSubscriptions } from '@/composables/useCalendarSubscriptions.js'
import { useCalendarPrivateItems } from '@/composables/useCalendarPrivateItems.js'
import CalendarPrivateItemEditor from '@/components/calendar/CalendarPrivateItemEditor.vue'
import { subscriptionScope, subscriptionTask, subscriptionScopeQuery, subscriptionMatchesTask } from '@/data/activityCalendarSubscriptions.js'
import CalendarSubscriptionControls from '@/components/calendar/CalendarSubscriptionControls.vue'
import AccountSwitcher from '@/components/AccountSwitcher.vue'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'
import { X, LocateFixed, SlidersHorizontal, Plus } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import CalendarViewSwitcher from '@/components/calendar/CalendarViewSwitcher.vue'
import CalendarTodaySummary from '@/components/calendar/CalendarTodaySummary.vue'
import CalendarAgendaView from '@/components/calendar/CalendarAgendaView.vue'
import CalendarTimelineView from '@/components/calendar/CalendarTimelineView.vue'
import CalendarMonthView from '@/components/calendar/CalendarMonthView.vue'
import CalendarFilterSheet from '@/components/calendar/CalendarFilterSheet.vue'
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'
import { listActivityCalendar } from '@/api/activityCalendar.js'
import { CALENDAR_CATEGORIES, CALENDAR_GAMES, CALENDAR_TIME_FILTERS, CALENDAR_VIEW_STORAGE_KEY, calendarAnchorDate, calendarFilterQuery, calendarFilters, calendarRequestRange, calendarView, calendarViewQuery, filterCalendarItems, millisecondsUntilServerMidnight, nextCalendarBoundary, normalizeCalendarItems, serverToday, summarizeCalendarDay } from '@/data/activityCalendar.js'

const route = useRoute(), router = useRouter()
const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const today = ref(serverToday())
// Width chooses only the initial fallback. User navigation never listens to resize.
const wide = typeof window !== 'undefined' && window.innerWidth >= 1024
let savedView = ''
try { if (enabled) savedView = localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) || '' } catch { /* Storage can be unavailable in private browsers. */ }
const preferredView = ref(calendarView({}, savedView, wide))
const mine = computed(() => subscriptionScope(route.query))
const taskStatus = computed(() => subscriptionTask(route.query))
const filters = computed(() => ({ ...calendarFilters(route.query), ...(mine.value ? { game: subscriptions.account.value?.game || '' } : {}) }))
const filterOpen = ref(false), filterTrigger = ref(null)
const activeFilters = computed(() => [
  !mine.value && filters.value.game && { key: 'game', label: filters.value.game, clear: '' },
  filters.value.category && { key: 'category', label: CALENDAR_CATEGORIES[filters.value.category], clear: '' },
  filters.value.exclude_recruitment && { key: 'exclude_recruitment', label: '不含招募', clear: false },
  filters.value.status && { key: 'status', label: CALENDAR_TIME_FILTERS[filters.value.status], clear: '' },
].filter(Boolean))
const filterSummary = computed(() => activeFilters.value.map(condition => condition.label).join(' · ') || '未启用筛选')
const activeFilterCount = computed(() => activeFilters.value.length)
function openFilters(event) {
  event.currentTarget.focus()
  filterOpen.value = true
}
const currentView = computed(() => calendarView(route.query, preferredView.value, wide))
const anchorDate = computed(() => calendarAnchorDate(route.query, today.value))
const requestRange = computed(() => calendarRequestRange(currentView.value, anchorDate.value, today.value))
const privateDirty = ref(false)
const subscriptions = useCalendarSubscriptions(enabled, requestRange, computed(() => calendarFilters(route.query).category), privateDirty)
const privateItems = useCalendarPrivateItems(subscriptions, requestRange, mine)
watch(privateItems.dirty, value => { privateDirty.value = value }, { immediate: true, flush: 'sync' })
// A committed query update has already passed the shared leave confirmation.
watch(() => route.fullPath, () => { if (subscriptions.dirty.value) subscriptions.discardDrafts(); privateItems.dismiss() }, { flush: 'sync' })
const requestKey = computed(() => JSON.stringify({ game: filters.value.game, category: filters.value.category, ...requestRange.value, today: today.value, identity: subscriptions.identity.value }))
const items = ref([]), summaryItems = ref([]), loading = ref(false), error = ref(''), locateRequest = ref(0)
const todayCounts = computed(() => summarizeCalendarDay(filterCalendarItems(summaryItems.value, { ...filters.value, status: '' }), today.value))
const privateItemsHidden = computed(() => !!(filters.value.category || filters.value.status || (mine.value && taskStatus.value === 'completed')))
const visibleItems = computed(() => {
  const values = mine.value
    ? normalizeCalendarItems(subscriptions.records.value.filter(record => subscriptionMatchesTask(record, taskStatus.value)).map(record => record.item))
    : items.value
  const publicItems = filterCalendarItems(values, filters.value, subscriptions.now.value)
  return [...publicItems, ...(mine.value && !privateItemsHidden.value ? privateItems.records.value : [])]
    .filter(item => (item.end_date == null || item.end_date >= requestRange.value.from) && item.start_date <= requestRange.value.to)
})
const visibleUnavailable = computed(() => subscriptions.unavailable.value.filter(record => subscriptionMatchesTask(record, taskStatus.value)))
let locatedEvent = ''
watch(() => [route.query.event, visibleItems.value, currentView.value, anchorDate.value], async () => {
  const eventId = Array.isArray(route.query.event) ? route.query.event[0] : route.query.event
  if (!eventId) { locatedEvent = ''; return }
  if (locatedEvent === eventId) return
  const path = route.fullPath
  await nextTick()
  if (path !== route.fullPath || locatedEvent === eventId) return
  const card = [...document.querySelectorAll('article.calendar-event[data-event-id]')].find(node => node.dataset.eventId === eventId)
  // 链接定位只消费一次，后续选日或切视图由当前操作接管滚动。
  if (card) locatedEvent = eventId
  card?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
  card?.querySelector('h4')?.focus({ preventScroll: true })
}, { flush: 'post' })
const viewLoading = computed(() => mine.value ? subscriptions.loading.value || privateItems.loading.value : loading.value)
const viewError = computed(() => mine.value ? subscriptions.error.value || privateItems.error.value : error.value)
function retry() { if (mine.value) { void subscriptions.load(); void privateItems.load() } else void load() }
function setScope(value) { return router.replace({ query: subscriptionScopeQuery(route.query, value) }) }
function setTask(value, input) {
  if (input) input.value = taskStatus.value
  const query = { ...route.query, task: value }; delete query.pending
  return router.replace({ query })
}
let generation = 0, publicContext = ''
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
  const wasDeferred = deferredRefresh
  deferredRefresh = false
  checkServerDate()
  subscriptions.now.value = Date.now()
  scheduleBoundary()
  if ((!wasDeferred && Date.now() - lastRefresh < 1000) || subscriptions.dirty.value) return
  lastRefresh = Date.now()
  void subscriptions.load()
  void privateItems.load()
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
    if (subscriptions.dirty.value) { deferredRefresh = true; return }
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
async function removeFilter(condition) {
  const failure = await setFilter({ [condition.key]: condition.clear })
  if (failure) return
  await nextTick()
  filterTrigger.value?.focus({ preventScroll: true })
}
async function resetFilters() {
  const query = calendarFilterQuery(route.query, { ...(mine.value ? {} : { game: '' }), category: '', exclude_recruitment: false, status: '' })
  if (mine.value && !route.query.task && taskStatus.value === 'all') query.task = 'all'
  delete query.pending
  const failure = await router.replace({ query })
  if (failure || filterOpen.value) return failure
  await nextTick()
  filterTrigger.value?.focus({ preventScroll: true })
}
async function setView(view) {
  const query = calendarViewQuery(route.query, { view }, today.value)
  delete query.event
  const failure = await router.replace({ query })
  if (failure) return
  preferredView.value = view
  try { localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, view) } catch { /* In-memory preference still works. */ }
}
function setDate(date) {
  const query = calendarViewQuery(route.query, { view: currentView.value, date }, today.value)
  delete query.event
  return router.replace({ query })
}
async function goToday() {
  const failure = await setDate(today.value)
  if (!failure || isNavigationFailure(failure, NavigationFailureType.duplicated)) locateRequest.value++
}
async function load() {
  if (!enabled) return
  if (subscriptions.dirty.value) { deferredRefresh = true; return }
  const token = ++generation
  const replacing = publicContext !== requestKey.value
  publicContext = requestKey.value
  const selectedFilters = { game: filters.value.game, category: filters.value.category }, range = { ...requestRange.value }, date = today.value
  loading.value = replacing || !items.value.length
  error.value = ''
  if (replacing) { items.value = []; summaryItems.value = [] }
  const needsSummary = date < range.from || date > range.to
  const normalize = values => normalizeCalendarItems(values).filter(item => (!selectedFilters.game || item.game === selectedFilters.game) && (!selectedFilters.category || item.category === selectedFilters.category))
  try {
    const [result, summary] = await Promise.all([
      listActivityCalendar({ ...selectedFilters, ...range }),
      needsSummary ? listActivityCalendar({ ...selectedFilters, from: date, to: date }) : Promise.resolve(null),
    ])
    if (token !== generation) return
    if (subscriptions.dirty.value) { deferredRefresh = true; return }
    items.value = normalize(result?.items).filter(item => (item.end_date == null || item.end_date >= range.from) && item.start_date <= range.to)
    summaryItems.value = needsSummary ? normalize(summary?.items) : items.value
  } catch (err) {
    if (token === generation) {
      if (subscriptions.dirty.value) deferredRefresh = true
      else error.value = err?.message || '活动日程读取失败，请重试。'
    }
  } finally {
    if (token === generation) loading.value = false
  }
}
watch(requestKey, load, { immediate: true, flush: 'sync' })
watch(subscriptions.dirty, value => { if (!value && deferredRefresh) refreshVisible() })
function scheduleBoundary() {
  clearTimeout(boundaryTimer)
  if (!subscriptions.dirty.value) subscriptions.now.value = Date.now()
  const next = nextCalendarBoundary([...items.value, ...normalizeCalendarItems(subscriptions.records.value.map(record => record.item))])
  if (Number.isFinite(next)) boundaryTimer = setTimeout(() => {
    if (subscriptions.dirty.value) { deferredRefresh = true; return }
    subscriptions.now.value = Date.now()
    const crossed = subscriptions.records.value.some(record => record.item?.end_at && Date.parse(record.item.end_at) > previousNow && Date.parse(record.item.end_at) <= subscriptions.now.value)
    previousNow = subscriptions.now.value
    if (crossed) void subscriptions.load()
    scheduleBoundary()
  }, Math.min(2147483647, next - Date.now() + 50))
}
watch(() => [items.value, subscriptions.records.value], scheduleBoundary)
</script>

<style src="./calendar.css"></style>
<style src="./calendarDesktop.css"></style>
<style src="./calendarMobile.css"></style>
<style src="./public-calendar.css"></style>
<style src="./public-calendarDesktop.css"></style>
<style src="./public-calendarMobile.css"></style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.calendar-public .calendar-header h1 { color: var(--tea); }
</style>
<style scoped src="./calendarPageDesktop.css"></style>
<style scoped src="./calendarPageMobile.css"></style>
