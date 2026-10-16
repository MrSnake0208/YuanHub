<template>
  <section v-if="enabled" class="today-activity-summary" aria-labelledby="today-activity-title" :aria-busy="loading">
    <header class="activity-heading">
      <div>
        <h2 id="today-activity-title"><CalendarDays :size="18" aria-hidden="true" /> 游戏日程</h2>
        <p>{{ game || '全部游戏' }} · <time :datetime="today">{{ today }}</time> · 服务器日期</p>
      </div>
      <router-link class="activity-link" :to="calendarTo">查看活动日历 <ArrowRight :size="16" aria-hidden="true" /></router-link>
    </header>
    <p v-if="loading" class="activity-message" role="status">正在读取今日活动…</p>
    <div v-else-if="error" class="activity-error" role="alert">
      <p>活动日程暂时无法读取，可以重试或查看完整日历。</p>
      <button type="button" @click="load">重试</button>
    </div>
    <template v-else>
      <div v-if="counts.total" class="activity-counts" aria-label="今日活动统计">
        <p>进行中 <strong>{{ counts.ongoing }}</strong></p>
        <p>今日开始 <strong>{{ counts.starts }}</strong></p>
        <p>今日结束 <strong>{{ counts.ends }}</strong></p>
      </div>
      <ul v-if="counts.total" class="activity-preview" aria-label="今日活动预览">
        <li v-for="item in preview" :key="item.id">
          <time class="activity-date" :datetime="item.start_date" :aria-label="'开始日期 ' + item.start_date" :title="item.start_date"><span>始于</span>{{ item.start_date.slice(5).replace('-', '/') }}</time>
          <div class="activity-entry">
            <router-link class="activity-title" :to="activityTo(item)">{{ item.title }}<ArrowRight :size="14" aria-hidden="true" /></router-link>
            <span class="activity-status">{{ calendarStatuses(item, today, now).join(' / ') }}</span>
            <span class="activity-detail"><template v-if="item.end_date">截止 {{ item.end_date }}{{ item.end_time ? ' ' + item.end_time + ' · ' + item.time_zone : '（仅日期）' }}</template><template v-else>持续进行</template></span>
          </div>
        </li>
      </ul>
      <p v-else class="activity-message">{{ game || '全部游戏' }}今天暂无公开活动，可以查看接下来的日程。</p>
      <p v-if="counts.total > preview.length" class="activity-message">另有 {{ counts.total - preview.length }} 项，查看活动日历了解详情。</p>
      <section v-if="upcoming.length" class="activity-upcoming" aria-labelledby="activity-upcoming-title">
        <h3 id="activity-upcoming-title">接下来 7 天</h3>
        <ul class="activity-preview">
          <li v-for="item in upcoming.slice(0, 1)" :key="item.id">
            <time class="activity-date" :datetime="item.start_date" :aria-label="'开始日期 ' + item.start_date" :title="item.start_date"><span>开始</span>{{ item.start_date.slice(5).replace('-', '/') }}</time>
            <div class="activity-entry">
              <router-link class="activity-title" :to="activityTo(item)">{{ item.title }}<ArrowRight :size="14" aria-hidden="true" /></router-link>
              <span class="activity-detail">{{ item.start_date }}{{ item.start_time ? ' ' + item.start_time : '' }} 开始 · {{ item.end_date ? '截止 ' + item.end_date : '持续进行' }}</span>
            </div>
          </li>
        </ul>
        <p v-if="upcoming.length > 1" class="activity-message">另有 {{ upcoming.length - 1 }} 项即将开始，可在日历查看。</p>
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
  Number(!a.end_date) - Number(!b.end_date) || (a.end_date || '').localeCompare(b.end_date || '') || (a.end_time || '23:59').localeCompare(b.end_time || '23:59') || Number(b.start_date === today.value) - Number(a.start_date === today.value) || a.id.localeCompare(b.id)))
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
    const normalized = normalizeCalendarItems(result?.items).filter(item => (!game || item.game === game) && (item.end_date == null || item.end_date >= today.value) && item.start_date <= through)
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
/* 刻意共享的字段外观，不持有双端布局。 */

.today-activity-summary { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
.activity-heading h2 { font: 900 20px/1.5 var(--font-s); }
.activity-heading h2 svg { color: var(--tea); }
.activity-heading p, .activity-message, .activity-detail { color: var(--tea); line-height: 1.7; }
.activity-link, .activity-error button { border: 1px solid var(--line); background: var(--cream); color: var(--tea); font: 800 12px/1.5 var(--font-b); text-decoration: none; cursor: pointer; }
.activity-link:hover, .activity-error button:hover { border-color: var(--tea); }
.activity-link:focus-visible, .activity-error button:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.activity-counts p { line-height: 1.8; }
.activity-counts strong { color: var(--tea); font: 800 20px/1 var(--font-d); }
.activity-preview { list-style: none; }
.activity-preview li { border-top: 1px solid var(--line); }
.activity-date { color: var(--tea); font-family: var(--font-d); font-variant-numeric: tabular-nums; background: var(--cream); }
.activity-date span { color: var(--ink-60); font-family: var(--font-b); }
.activity-status { color: var(--tea); font-weight: 600; }
.activity-title { color: var(--tea); text-decoration: none; font-weight: 800; line-height: 1.6; }
.activity-title:hover { color: var(--accent-strong); }
.activity-title:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.activity-upcoming h3 { color: var(--tea); font: 900 18px/1.5 var(--font-s); }
.activity-heading time, .activity-detail { font-variant-numeric: tabular-nums; font-family: var(--font-d); }
.activity-error p { color: var(--tea); line-height: 1.7; }
</style>
<style scoped src="./todayActivityDesktop.css"></style>
<style scoped src="./todayActivityMobile.css"></style>
