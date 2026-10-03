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
      <div class="activity-counts" aria-label="今日活动统计">
        <p>进行中 <strong>{{ counts.ongoing }}</strong></p>
        <p>今日开始 <strong>{{ counts.starts }}</strong></p>
        <p>今日结束 <strong>{{ counts.ends }}</strong></p>
      </div>
      <ul v-if="counts.total" class="activity-preview" aria-label="今日活动预览">
        <li v-for="item in preview" :key="item.id">
          <span class="activity-title">{{ item.title }}</span>
          <span class="activity-detail">{{ item.game }} · {{ calendarStatuses(item, today).join(' / ') }}</span>
        </li>
      </ul>
      <p v-else class="activity-message">{{ game || '全部游戏' }}今天暂无公开活动，可以查看接下来的日程。</p>
      <p v-if="counts.total > preview.length" class="activity-message">另有 {{ counts.total - preview.length }} 项，查看活动日历了解详情。</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowRight, CalendarDays } from '@lucide/vue'
import { listActivityCalendar } from '../../api/activityCalendar.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { calendarStatuses, groupCalendarItems, millisecondsUntilServerMidnight, normalizeCalendarItems, serverToday, summarizeCalendarDay } from '../../data/activityCalendar.js'

const props = defineProps({ game: { type: String, default: '' } })
const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const today = ref(serverToday())
const items = ref([]), loading = ref(false), error = ref(false)
const counts = computed(() => summarizeCalendarDay(items.value, today.value))
const preview = computed(() => groupCalendarItems(items.value, today.value)[0].groups.flatMap(group => group.items).slice(0, 3))
const calendarTo = computed(() => ({ path: '/calendar', query: props.game ? { game: props.game } : {} }))
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
    const result = await listActivityCalendar({ game, from: today.value, to: today.value })
    if (token !== generation) return
    const normalized = normalizeCalendarItems(result?.items).filter(item => !game || item.game === game)
    items.value = [...new Map(normalized.map(item => [item.id, item])).values()]
  } catch {
    if (token === generation) error.value = true
  } finally {
    if (token === generation) loading.value = false
  }
}

function checkServerDate() {
  if (serverToday() !== today.value) void load()
  clearTimeout(dayTimer)
  dayTimer = setTimeout(checkServerDate, millisecondsUntilServerMidnight() + 100)
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
.today-activity-summary { min-width: 0; margin-bottom: 24px; padding: 20px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--ink); }
.activity-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; }
.activity-heading > div { min-width: 0; }
.activity-heading h2 { display: flex; align-items: center; gap: 8px; font: 900 22px/1.5 var(--font-s); overflow-wrap: anywhere; }
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
.activity-title { display: block; font-size: 13px; font-weight: 800; line-height: 1.6; overflow-wrap: anywhere; }
.activity-detail { display: block; }
.activity-message { margin-top: 12px; }
.activity-error { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 16px; }
.activity-error p { flex: 1 1 200px; color: var(--tea); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
@media (min-width: 768px) { .today-activity-summary { padding: 24px; } }
</style>
