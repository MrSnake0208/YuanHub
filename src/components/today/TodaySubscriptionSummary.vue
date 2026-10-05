<template>
  <section class="today-subscriptions" aria-labelledby="today-subscriptions-title" :aria-busy="loading">
    <h2 id="today-subscriptions-title">我的订阅 · 即将截止</h2>
    <p v-if="!accountId">选择游戏账号后，在活动日历订阅你关注的本期活动。</p>
    <p v-else-if="loading" role="status">正在读取个人订阅…</p>
    <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="load">重试订阅</button></div>
    <template v-else>
      <ul v-if="items.length">
        <li v-for="record in items" :key="record.event_id">
          <router-link :to="{ path: '/calendar', query: { ...mineQuery, view: 'month', date: record.item.end_date } }">{{ record.item.title }}</router-link>
          <span>截止 {{ record.item.end_date }}{{ record.item.end_time ? ' ' + record.item.end_time + ' · ' + record.item.time_zone : ' · 具体时间未提供' }} · {{ calendarDeadline(record.item, today, now) }}</span>
          <span>{{ record.checklist.length ? `已完成 ${record.checklist.filter(entry => entry.completed).length}/${record.checklist.length}` : '本期未完成' }}</span>
        </li>
      </ul>
      <p v-else>{{ count ? '近期没有尚未完成的临期活动。' : '还没有订阅活动，去日历中订阅本期吧。' }}</p>
      <p v-if="total > items.length">另有 {{ total - items.length }} 项即将截止</p>
    </template>
    <router-link :to="{ path: '/calendar', query: mineQuery }">查看我的订阅</router-link>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { auth } from '@/store/auth.js'
import { calendarSubscriptionSummary } from '@/api/activityCalendarSubscriptions.js'
import { calendarDeadline, millisecondsUntilServerMidnight, serverToday } from '@/data/activityCalendar.js'
const props = defineProps({ accountId: { type: String, default: '' }, game: { type: String, default: '' } })
const identity = computed(() => auth.isLoggedIn && auth.isAdmin ? auth.userInfo?.id || '' : '')
const key = computed(() => JSON.stringify([identity.value, props.accountId, props.game]))
const mineQuery = computed(() => ({ scope: 'mine', ...(props.game ? { game: props.game } : {}) }))
const items = ref([]), count = ref(0), total = ref(0), loading = ref(false), error = ref(''), now = ref(Date.now())
const today = computed(() => serverToday(new Date(now.value)))
let generation = 0, alive = true, timer = null, minute = null, lastVisible = 0
function schedule() {
  clearTimeout(timer)
  const time = Date.now()
  const deadlines = items.value.map(record => Date.parse(record.item?.end_at)).filter(value => value > time)
  const wait = Math.min(millisecondsUntilServerMidnight(new Date(time)) + 100, ...deadlines.map(value => value - time + 50))
  if (props.accountId && identity.value) timer = setTimeout(load, wait)
}
async function load() {
  const token = ++generation, context = key.value
  clearTimeout(timer)
  now.value = Date.now(); error.value = ''; loading.value = false
  if (!identity.value || !props.accountId) { items.value = []; count.value = 0; total.value = 0; return }
  loading.value = true
  try {
    const result = await calendarSubscriptionSummary(props.accountId, identity.value)
    if (!alive || token !== generation || context !== key.value) return
    items.value = result.items || []; count.value = result.subscribed_count || 0; total.value = result.total_pending || 0
  } catch (err) {
    if (alive && token === generation && context === key.value) error.value = err?.message || '个人订阅暂时无法读取。'
  } finally {
    if (alive && token === generation) { loading.value = false; schedule() }
  }
}
function visible() {
  if (document.visibilityState === 'hidden' || Date.now() - lastVisible < 1000) return
  lastVisible = Date.now(); void load()
}
watch(key, () => {
  clearInterval(minute)
  if (identity.value && props.accountId) minute = setInterval(() => { if (document.visibilityState !== 'hidden') now.value = Date.now() }, 60000)
  items.value = []; count.value = 0; total.value = 0; void load()
}, { immediate: true, flush: 'sync' })
onMounted(() => {
  document.addEventListener('visibilitychange', visible); window.addEventListener('pageshow', visible)
})
onBeforeUnmount(() => { alive = false; generation++; clearTimeout(timer); clearInterval(minute); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', visible) })
</script>
<style scoped>
.today-subscriptions { padding: 16px; min-width: 0; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
h2 { color: var(--tea); font: 900 20px/1.5 var(--font-s); margin-bottom: 8px; }
p, span { color: var(--tea); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
ul { display: grid; gap: 12px; list-style: none; margin: 8px 0; padding: 0; }
span { display: block; }
a, button { display: inline-flex; align-items: center; min-height: 44px; color: var(--tea); font-weight: 700; overflow-wrap: anywhere; }
button { padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); }
a:focus-visible, button:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
</style>
