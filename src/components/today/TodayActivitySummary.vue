<template>
  <section v-if="visible && enabled" class="today-activity-summary" aria-labelledby="today-activity-title" :aria-busy="loading">
    <header class="activity-heading">
      <div>
        <h2 id="today-activity-title"><CalendarDays :size="19" aria-hidden="true" /> 游戏活动</h2>
        <p>{{ game || '全部游戏' }} · 公开活动与招募</p>
      </div>
      <router-link class="activity-link" :to="calendarTo">活动日历 <ArrowRight :size="14" aria-hidden="true" /></router-link>
    </header>
    <p v-if="loading" class="activity-message" role="status">正在读取今日活动…</p>
    <div v-else-if="error" class="activity-error" role="alert">
      <p>游戏活动暂时无法读取，可以重试或查看完整日历。</p>
      <button type="button" @click="load">重试</button>
    </div>
    <template v-else>
      <div v-if="currentItems.length" class="activity-counts" role="group" aria-label="游戏活动状态">
        <button v-for="group in groups" :key="group.key" type="button" :aria-pressed="activeGroup === group.key" @click="selectedGroup = group.key">{{ group.label }} <strong>{{ group.items.length }}</strong></button>
      </div>
      <ul v-if="preview.length" class="activity-preview" aria-label="游戏活动预览">
        <li v-for="item in preview" :key="item.id" :class="{ 'is-ending': endingToday(item) }">
          <span class="activity-emblem"><Layers3 v-if="item.category === 'RECRUITMENT'" :size="22" aria-hidden="true" /><CalendarDays v-else :size="22" aria-hidden="true" /><span>{{ item.category === 'RECRUITMENT' ? '招募' : CALENDAR_CATEGORIES[item.category] }}</span></span>
          <div class="activity-entry">
            <router-link class="activity-title" :to="activityTo(item)">{{ item.title }}</router-link>
            <span class="activity-status" :class="{ 'is-ending': endingToday(item), 'is-upcoming': calendarTimeBounds(item).start > now }">{{ statusLabel(item) }}</span>
            <span class="activity-detail">{{ detailLabel(item) }}</span>
          </div>
        </li>
      </ul>
      <p v-else class="activity-message">{{ !currentItems.length ? (game || '全部游戏') + '近期暂无公开活动，可在日历查看其他日期。' : activeGroup === 'ending' ? '今天没有即将结束的活动。' : activeGroup === 'upcoming' ? '未来 7 天暂无即将开始的活动。' : '当前没有进行中的活动。' }}</p>
      <p v-if="activeItems.length > preview.length" class="activity-message">另有 {{ activeItems.length - preview.length }} 项，查看活动日历了解详情。</p>
      <button v-if="activeGroup !== 'upcoming' && upcoming.length" class="activity-next" type="button" @click="selectedGroup = 'upcoming'"><span>即将开始</span><strong>{{ upcoming[0].title }}</strong><ChevronRight :size="14" aria-hidden="true" /></button>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowRight, CalendarDays, ChevronRight, Layers3 } from '@lucide/vue'
import { listActivityCalendar } from '../../api/activityCalendar.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { addCalendarDays, CALENDAR_CATEGORIES, calendarDateLabel, calendarEnded, calendarTimeBounds, millisecondsUntilServerMidnight, normalizeCalendarItems, SERVER_TIME_ZONE, serverToday } from '../../data/activityCalendar.js'

const props = defineProps({ visible: { type: Boolean, default: true }, game: { type: String, default: '' } })
const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const today = ref(serverToday())
const now = ref(Date.now())
const items = ref([]), loading = ref(false), error = ref(false)
const currentItems = computed(() => items.value.filter(item => !calendarEnded(item, today.value, now.value)))
const selectedGroup = ref('')
const endingToday = item => (item.end_at ? serverToday(new Date(item.end_at)) : item.end_date) === today.value && calendarTimeBounds(item).start <= now.value
const ongoing = computed(() => currentItems.value.filter(item => calendarTimeBounds(item).start <= now.value)
  .sort((a, b) => calendarTimeBounds(a).end - calendarTimeBounds(b).end || a.id.localeCompare(b.id)))
const upcoming = computed(() => currentItems.value.filter(item => calendarTimeBounds(item).start > now.value)
  .sort((a, b) => calendarTimeBounds(a).start - calendarTimeBounds(b).start || a.id.localeCompare(b.id)))
const groups = computed(() => [
  { key: 'ongoing', label: '进行中', items: ongoing.value },
  { key: 'ending', label: '今日结束', items: ongoing.value.filter(endingToday) },
  { key: 'upcoming', label: '即将开始', items: upcoming.value }
])
const activeGroup = computed(() => selectedGroup.value || (ongoing.value.length ? 'ongoing' : upcoming.value.length ? 'upcoming' : 'ongoing'))
const activeItems = computed(() => groups.value.find(group => group.key === activeGroup.value).items)
const preview = computed(() => activeItems.value.slice(0, 3))
const calendarTo = computed(() => ({ path: '/calendar', query: props.game ? { game: props.game } : {} }))
const activityTo = item => ({ path: '/calendar', query: { ...calendarTo.value.query, view: 'month', date: item.start_date > today.value ? item.start_date : today.value, event: item.id } })
function statusLabel(item) {
  if (calendarTimeBounds(item).start > now.value) return '即将开始'
  if (endingToday(item)) return '今日结束'
  return (item.start_at ? serverToday(new Date(item.start_at)) : item.start_date) === today.value ? '今日开始' : '进行中'
}
function detailLabel(item) {
  const starting = calendarTimeBounds(item).start > now.value
  const instant = starting ? item.start_at : item.end_at
  const date = instant ? serverToday(new Date(instant)) : starting ? item.start_date : item.end_date
  if (!date) return '持续进行'
  const day = date === today.value ? '今天' : calendarDateLabel(date, { month: 'numeric', day: 'numeric' })
  const time = instant ? new Intl.DateTimeFormat('zh-CN', { timeZone: SERVER_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant)) : ''
  return day + (time ? ' ' + time : '') + (starting ? '开始' : '截止') + (instant ? ' · 北京时间' : '（仅日期）')
}
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
watch(() => props.game, () => { selectedGroup.value = ''; void load() }, { immediate: true, flush: 'sync' })
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
.today-activity-summary { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
.activity-heading h2 { color: var(--tea); font: 800 20px/1.5 var(--font-s); }
.activity-heading p, .activity-message, .activity-detail { color: var(--ink-60); line-height: 1.6; }
.activity-link { color: var(--tea); font-weight: 500; text-decoration: none; }
.activity-link:hover { text-decoration: underline; }
.activity-counts { background: var(--cream); border: 1px solid var(--line); }
.activity-counts button { border: 0; background: transparent; color: var(--tea); font: 500 12px/1.5 var(--font-b); cursor: pointer; }
.activity-counts button[aria-pressed="true"] { background: var(--tea); color: var(--cream); }
.activity-counts strong { font-family: var(--font-d); font-weight: 700; }
.activity-preview { list-style: none; }
.activity-preview li { border-bottom: 1px solid var(--line); }
.activity-preview li:last-child { border-bottom: 0; }
.activity-emblem { border: 1px solid var(--line); color: var(--tea); background: var(--cream); }
.activity-preview .is-ending .activity-emblem { color: var(--rouge); background: color-mix(in srgb, var(--rouge) 5%, var(--surface)); }
.activity-title { color: var(--tea); text-decoration: none; font-weight: 750; }
.activity-title:hover { color: var(--accent-strong); }
.activity-status { color: #365b43; background: #e5eee5; border: 1px solid #c6dacd; font-weight: 500; }
.activity-status.is-ending { color: var(--rouge); border-color: color-mix(in srgb, var(--rouge) 25%, var(--line)); background: color-mix(in srgb, var(--rouge) 6%, var(--surface)); }
.activity-status.is-upcoming { color: var(--brand-blue); background: color-mix(in srgb, var(--brand-blue) 8%, var(--surface)); border-color: color-mix(in srgb, var(--brand-blue) 20%, var(--line)); }
.activity-detail { font-variant-numeric: tabular-nums; }
.activity-error p { color: var(--rouge); }
.activity-error button, .activity-next { border: 1px solid var(--line); background: var(--cream); color: var(--tea); cursor: pointer; }
.activity-next span { color: var(--ink-60); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
</style>
<style scoped src="./todayActivityDesktop.css"></style>
<style scoped src="./todayActivityMobile.css"></style>
