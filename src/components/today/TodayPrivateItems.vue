<template>
  <section v-if="!hideEmpty || !identity || !accountId || loading || error || items.length" class="today-private-items" aria-labelledby="today-private-title" :aria-busy="loading">
    <header class="private-heading">
      <h2 id="today-private-title">我的事项与备注</h2>
      <router-link :to="calendarTo()">查看全部</router-link>
    </header>
    <p class="private-hint"><span v-if="items.length">{{ items.length }} 项事项 · </span>仅当前账号可见</p>
    <p v-if="!identity || !accountId">登录并选择游戏账号后，可查看自己的事项与备注。</p>
    <template v-else>
      <p v-if="loading && !items.length" role="status">正在读取私人事项…</p>
      <div v-if="error" class="private-error" role="alert">
        <p>{{ error }}</p>
        <p v-if="items.length" class="private-hint">下方保留上次读取内容。</p>
        <button v-if="!denied" type="button" :disabled="loading" @click="load">重试读取</button>
      </div>
      <p v-if="!loading && !error && !items.length">还没有私人事项，可去我的日历记下计划和备注。</p>
      <ul v-if="items.length" class="private-list">
        <li v-for="item in items.slice(0, 2)" :key="item.id">
          <router-link class="private-title" :to="calendarTo(item)">{{ item.title }}</router-link>
          <p class="private-hint">{{ calendarRangeLabel(item) }}</p>
          <p v-if="item.note" class="private-note">{{ item.note.length > 80 ? item.note.slice(0, 80) + '…' : item.note }}</p>
        </li>
      </ul>
      <p v-if="items.length > 2" class="private-hint">还有 {{ items.length - 2 }} 项，可在日历查看。</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { auth } from '../../store/auth.js'
import { listCalendarPrivateItems } from '../../api/calendarPrivateItems.js'
import { privateCalendarItem } from '../../data/calendarPrivateItems.js'
import { addCalendarDays, calendarRangeLabel, millisecondsUntilServerMidnight, serverToday } from '../../data/activityCalendar.js'

const props = defineProps({ accountId: { type: String, default: '' }, game: { type: String, default: '' }, hideEmpty: Boolean })
const identity = computed(() => auth.isLoggedIn ? auth.userInfo?.id || '' : '')
const key = computed(() => JSON.stringify([identity.value, props.accountId, props.game]))
const items = ref([]), loading = ref(false), error = ref(''), denied = ref(false)
let generation = 0, timer = null, lastVisible = 0
function calendarTo(item) {
  return { path: '/calendar', query: { scope: 'mine', task: 'todo', game: props.game, view: 'list', date: item && item.start_date > serverToday() ? item.start_date : serverToday(), ...(item ? { event: item.id } : {}) } }
}
async function load() {
  if (!identity.value || !props.accountId || denied.value) return
  const token = ++generation, account = { id: props.accountId, game: props.game }
  const from = serverToday(), to = addCalendarDays(from, 90)
  clearTimeout(timer)
  loading.value = true; error.value = ''
  try {
    const result = await listCalendarPrivateItems({ account_id: account.id, from, to }, identity.value)
    if (token !== generation) return
    const values = Array.isArray(result?.items) ? result.items.map(value => privateCalendarItem(value, account)) : null
    if (!values || values.some(value => !value)) throw new Error('私人事项读取结果不完整，请重试。')
    items.value = values.filter(item => item.end_date >= from && item.start_date <= to)
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || (a.start_time || '').localeCompare(b.start_time || '') || a.id.localeCompare(b.id))
  } catch (err) {
    if (token !== generation) return
    if ([401, 403].includes(err?.status) || err?.status === 404 && err?.code === 'account_not_found') {
      items.value = []; denied.value = true
      error.value = '身份、权限或账号已失效，请重新登录或选择账号。'
    } else error.value = err?.message || '私人事项暂时无法读取，请重试。'
  } finally {
    if (token === generation) {
      loading.value = false
      if (!denied.value) timer = setTimeout(load, serverToday() === from ? millisecondsUntilServerMidnight() + 100 : 0)
    }
  }
}
watch(key, () => {
  generation++; clearTimeout(timer)
  items.value = []; loading.value = false; error.value = ''; denied.value = false
  void load()
}, { immediate: true, flush: 'sync' })
function refresh() {
  if (document.visibilityState === 'hidden' || Date.now() - lastVisible < 1000) return
  lastVisible = Date.now(); void load()
}
onMounted(() => { document.addEventListener('visibilitychange', refresh); window.addEventListener('pageshow', refresh) })
onBeforeUnmount(() => {
  generation++; clearTimeout(timer)
  document.removeEventListener('visibilitychange', refresh); window.removeEventListener('pageshow', refresh)
})
</script>

<style scoped>
.today-private-items { border: 1px solid var(--line); background: var(--cream); color: var(--ink); }
h2 { color: var(--tea); font: 900 20px/1.5 var(--font-s); }
p { line-height: 1.7; }
.private-hint { color: var(--ink-60); }
.private-list { list-style: none; }
.private-list li { border-top: 1px solid var(--line); }
.private-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
a, button { color: var(--tea); font-weight: 700; }
.private-heading a { font-size: 12px; font-weight: 500; text-decoration: none; }
.private-heading a:hover { text-decoration: underline; }
.private-error { color: var(--rouge); }
button { border: 1px solid var(--line); background: var(--cream); cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
</style>
<style scoped src="./todayPrivateItemsDesktop.css"></style>
<style scoped src="./todayPrivateItemsMobile.css"></style>
