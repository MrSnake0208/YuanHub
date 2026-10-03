<template>
  <div class="calendar-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="calendar-header wrap">
        <p class="calendar-kicker"><CalendarDays :size="20" aria-hidden="true" /> 两个世界，一份日程</p>
        <h1>活动日历</h1>
        <p>看看今天开始、结束和正在进行的活动，再安排接下来的日程。</p>
        <p class="calendar-hint">今天 {{ today }} · 按游戏服务器日期（Asia/Shanghai） · 展示未来约 90 天</p>
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

        <p v-if="loading" class="calendar-panel" role="status">正在读取活动日程…</p>
        <div v-else-if="error" class="calendar-panel calendar-error" role="alert">
          <p>{{ error }}</p><button type="button" @click="load">重试</button>
        </div>
        <template v-else>
          <section class="calendar-panel calendar-today" aria-labelledby="today-summary-title">
            <h2 id="today-summary-title">今天 · {{ today }}</h2>
            <div class="calendar-counts">
              <p><strong>{{ todayCounts.starts }}</strong> 今日开始</p>
              <p><strong>{{ todayCounts.ends }}</strong> 今日结束</p>
              <p><strong>{{ todayCounts.ongoing }}</strong> 今日进行中</p>
            </div>
            <p v-if="!todayItems.length" class="calendar-hint">当前筛选下，今天暂无活动。可以看看接下来的日程。</p>
          </section>
          <p v-if="!items.length" class="calendar-panel" role="status">当前筛选下暂无近期活动，试试其它游戏或类型。</p>
          <section v-for="section in sections.filter(section => section.groups.length)" :key="section.key" class="calendar-section" :aria-labelledby="'section-' + section.key">
            <h2 :id="'section-' + section.key">{{ section.title }}</h2>
            <div v-for="group in section.groups" :key="group.date" class="calendar-date-group">
              <h3><time :datetime="group.date">{{ group.date }}</time></h3>
              <div class="calendar-event-list">
                <article v-for="item in group.items" :key="item.id" class="calendar-panel calendar-event">
                  <div class="calendar-badges"><span class="calendar-game">{{ item.game }}</span><span class="calendar-category">{{ CALENDAR_CATEGORIES[item.category] }}</span></div>
                  <h4>{{ item.title }}</h4>
                  <div class="calendar-badges"><span v-for="status in calendarStatuses(item, today)" :key="status" class="calendar-state">{{ status }}</span></div>
                  <p class="calendar-range">{{ calendarRangeLabel(item) }}<span v-if="item.start_time"> · {{ item.time_zone }}</span></p>
                  <p v-if="item.description" class="calendar-description">{{ item.description }}</p>
                  <div class="calendar-event-foot">
                    <span class="calendar-hint">{{ item.source_type === 'RECRUITMENT_POOL' ? '来自招募卡池' : '手工整理' }}</span>
                    <a v-if="item.source_url" :href="item.source_url" target="_blank" rel="noopener noreferrer">查看来源 <ExternalLink :size="16" aria-hidden="true" /></a>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </template>
      </div>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarDays, ExternalLink } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { FEATURE_KEYS, isFeatureEnabled } from '@/config/features.js'
import { listActivityCalendar } from '@/api/activityCalendar.js'
import { addCalendarDays, CALENDAR_CATEGORIES, CALENDAR_GAMES, calendarFilterQuery, calendarFilters, calendarRangeLabel, calendarStatuses, groupCalendarItems, millisecondsUntilServerMidnight, normalizeCalendarItems, serverToday } from '@/data/activityCalendar.js'
import './calendar.css'

const route = useRoute(), router = useRouter()
const enabled = isFeatureEnabled(FEATURE_KEYS.ACTIVITY_CALENDAR)
const today = ref(serverToday())
const filters = computed(() => calendarFilters(route.query))
const filterKey = computed(() => JSON.stringify(filters.value))
const items = ref([]), loading = ref(false), error = ref('')
const sections = computed(() => groupCalendarItems(items.value, today.value))
const todayItems = computed(() => sections.value[0].groups.flatMap(group => group.items))
const todayCounts = computed(() => ({ starts: todayItems.value.filter(item => item.start_date === today.value).length, ends: todayItems.value.filter(item => item.end_date === today.value).length, ongoing: todayItems.value.filter(item => item.start_date < today.value && item.end_date > today.value).length }))
let generation = 0
let dayTimer = null
function checkServerDate() {
  if (serverToday() !== today.value) void load()
  clearTimeout(dayTimer)
  dayTimer = setTimeout(checkServerDate, millisecondsUntilServerMidnight() + 100)
}
function onVisibilityChange() { if (document.visibilityState === 'visible') checkServerDate() }
onMounted(() => {
  if (!enabled) return
  checkServerDate()
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onBeforeUnmount(() => {
  generation++
  clearTimeout(dayTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
function setFilter(patch) { return router.replace({ query: calendarFilterQuery(route.query, patch) }) }
async function load() {
  if (!enabled) return
  const token = ++generation
  today.value = serverToday()
  loading.value = true
  error.value = ''
  items.value = []
  try {
    const result = await listActivityCalendar({ ...filters.value, from: today.value, to: addCalendarDays(today.value, 90) })
    if (token !== generation) return
    items.value = normalizeCalendarItems(result?.items).filter(item => item.end_date >= today.value && (!filters.value.game || item.game === filters.value.game) && (!filters.value.category || item.category === filters.value.category))
  } catch (err) {
    if (token === generation) error.value = err.message || '活动日程读取失败，请重试。'
  } finally {
    if (token === generation) loading.value = false
  }
}
watch(filterKey, load, { immediate: true })
</script>
