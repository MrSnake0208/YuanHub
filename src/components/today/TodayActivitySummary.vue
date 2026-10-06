<template>
  <section v-if="enabled" class="today-activity-summary" aria-labelledby="today-activity-title" :aria-busy="loading">
    <header class="activity-heading">
      <div>
        <h2 id="today-activity-title"><CalendarDays :size="20" aria-hidden="true" /> 今日活动 · {{ game || '全部游戏' }}</h2>
        <p><time :datetime="today">{{ today }}</time> · 公开日程 · 按服务器日期</p>
      </div>
      <router-link class="activity-link" :to="calendarTo">查看活动日历 <ArrowRight :size="16" aria-hidden="true" /></router-link>
    </header>
    <p v-if="loading" class="activity-message" role="status">正在读取今日活动…</p>
    <div v-else-if="error" class="activity-error" role="alert">
      <p>活动日程暂时无法读取，可以重试或查看完整日历。</p>
      <button type="button" @click="load">重试</button>
    </div>
    <template v-else>
      <ul v-if="counts.total" class="activity-preview" aria-label="今日活动预览">
        <li v-for="item in preview" :key="item.id">
          <router-link class="activity-title" :to="activityTo(item)">{{ item.title }}<ArrowRight :size="14" aria-hidden="true" /></router-link>
          <span class="activity-detail">{{ calendarStatuses(item, today, now).join(' / ') }} · 截止 {{ item.end_date }}{{ item.end_time ? ' ' + item.end_time + ' · ' + item.time_zone : ' · 具体时间未提供' }}</span>
        </li>
      </ul>
      <p v-else class="activity-message">{{ game || '全部游戏' }}今天暂无公开活动，可以查看接下来的日程。</p>
      <p v-if="counts.total > preview.length" class="activity-message">另有 {{ counts.total - preview.length }} 项，查看活动日历了解详情。</p>
      <div v-if="counts.total" class="activity-counts" aria-label="今日活动统计">
        <p>进行中 <strong>{{ counts.ongoing }}</strong></p>
        <p>今日开始 <strong>{{ counts.starts }}</strong></p>
        <p>今日结束 <strong>{{ counts.ends }}</strong></p>
      </div>
      <section v-if="upcoming.length" class="activity-upcoming" aria-labelledby="activity-upcoming-title">
        <h3 id="activity-upcoming-title">接下来 7 天</h3>
        <ul class="activity-preview">
          <li v-for="item in upcoming.slice(0, 2)" :key="item.id">
            <router-link class="activity-title" :to="activityTo(item)">{{ item.title }}<ArrowRight :size="14" aria-hidden="true" /></router-link>
            <span class="activity-detail">{{ item.start_date }}{{ item.start_time ? ' ' + item.start_time : '' }} 开始 · 截止 {{ item.end_date }}</span>
          </li>
        </ul>
        <p v-if="upcoming.length > 2" class="activity-message">另有 {{ upcoming.length - 2 }} 项即将开始，可在日历查看。</p>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowRight, CalendarDays } from '@lucide/vue'
import { listActivityCalendar } from '../../api/activityCalendar.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { addCalendarDays, calendarEnded, calendarStatuses, millisecondsUntilServerMidnight, normalizeCalendarItems, serverToday, summarizeCalendarDay } from '../../data/activityCalendar.js'

const props = defineProps({ game: { type: String, default: '' } })
const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const today = ref(serverToday())
const now = ref(Date.now())
const items = ref([]), loading = ref(false), error = ref(false)
const currentItems = computed(() => items.value.filter(item => !calendarEnded(item, today.value, now.value)))
const todayItems = computed(() => currentItems.value.filter(item => item.start_date <= today.value).sort((a, b) =>
  a.end_date.localeCompare(b.end_date) || (a.end_time || '23:59').localeCompare(b.end_time || '23:59') || Number(b.start_date === today.value) - Number(a.start_date === today.value) || a.id.localeCompare(b.id)))
const counts = computed(() => summarizeCalendarDay(todayItems.value, today.value))
const preview = computed(() => todayItems.value.slice(0, 3))
const upcoming = computed(() => currentItems.value.filter(item => item.start_date > today.value).sort((a, b) => a.start_date.localeCompare(b.start_date) || (a.start_time || '').localeCompare(b.start_time || '') || a.id.localeCompare(b.id)))
const calendarTo = computed(() => ({ path: '/calendar', query: props.game ? { game: props.game } : {} }))
const activityTo = item => ({ path: '/calendar', query: { ...calendarTo.value.query, view: 'month', date: item.start_date > today.value ? item.start_date : today.value } })
let generation = 0
let dayTimer = null

async function load() {
  if (!enabled) return
  const token = ++generation
  const game = props.game
  today.value = serverToday()
  loading.value = true
  error.value = false
  items.value = []
  try {
    const through = addCalendarDays(today.value, 7)
    const result = await listActivityCalendar({ game, from: today.value, to: through })
    if (token !== generation) return
    const normalized = normalizeCalendarItems(result?.items).filter(item => (!game || item.game === game) && item.end_date >= today.value && item.start_date <= through)
    items.value = [...new Map(normalized.map(item => [item.id, item])).values()]
  } catch {
    if (token === generation) error.value = true
  } finally {
    if (token === generation) { loading.value = false; scheduleCheck() }
  }
}

function checkServerDate() {
  now.value = Date.now()
  if (serverToday() !== today.value) void load()
  scheduleCheck()
}
function scheduleCheck() {
  clearTimeout(dayTimer)
  const time = Date.now()
  now.value = time
  const changes = items.value.flatMap(item => [item.start_at, item.end_at]).map(Date.parse).filter(value => value > time)
  dayTimer = setTimeout(checkServerDate, Math.min(millisecondsUntilServerMidnight() + 100, ...changes.map(value => value - time + 50)))
}
function onVisibilityChange() { if (document.visibilityState === 'visible') checkServerDate() }
watch(() => props.game, load, { immediate: true, flush: 'sync' })
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
</script>

<style scoped>
.today-activity-summary { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--ink); }
.activity-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; }
.activity-heading > div { min-width: 0; }
.activity-heading h2 { display: flex; align-items: center; gap: 8px; font: 900 20px/1.5 var(--font-s); overflow-wrap: anywhere; }
.activity-heading h2 svg { flex: 0 0 auto; color: var(--tea); }
.activity-heading p, .activity-message, .activity-detail { color: var(--tea); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.activity-link, .activity-error button { display: inline-flex; min-height: 44px; min-width: 44px; align-items: center; justify-content: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--cream); color: var(--tea); font: 800 12px/1.5 var(--font-b); text-decoration: none; cursor: pointer; }
.activity-link svg { flex: 0 0 auto; }
.activity-link:hover, .activity-error button:hover { border-color: var(--tea); }
.activity-link:focus-visible, .activity-error button:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.activity-counts { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 16px; }
.activity-counts p { font-size: 13px; line-height: 1.8; }
.activity-counts strong { color: var(--tea); font: 800 20px/1 var(--font-d); }
.activity-preview { display: grid; gap: 8px; margin: 16px 0 0; padding: 0; list-style: none; }
.activity-preview li { min-width: 0; padding-top: 8px; border-top: 1px solid var(--line); }
.activity-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; color: var(--tea); text-decoration: none; font-size: 14px; font-weight: 800; line-height: 1.6; overflow-wrap: anywhere; }
.activity-title svg { flex: none; }
.activity-title:hover { color: var(--accent-strong); }
.activity-title:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.activity-upcoming { margin-top: 20px; }
.activity-upcoming h3 { color: var(--tea); font: 900 18px/1.5 var(--font-s); }
.activity-detail { display: block; }
.activity-heading time, .activity-detail { font-variant-numeric: tabular-nums; font-family: var(--font-d); }
.activity-message { margin-top: 12px; }
.activity-error { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 16px; }
.activity-error p { flex: 1 1 200px; color: var(--tea); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
@media (min-width: 768px) { .today-activity-summary { padding: 24px; } }
</style>
