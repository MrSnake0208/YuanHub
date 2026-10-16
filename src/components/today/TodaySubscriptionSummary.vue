<template>
  <section v-if="!hideEmpty || !ready || loading || error || count || total || unavailableCount || tasks.length || emptyRecords.length" ref="root" class="today-subscriptions" aria-labelledby="today-subscriptions-title" :aria-busy="loading">
    <header class="todo-heading">
      <h2 id="today-subscriptions-title"><ListChecks :size="19" aria-hidden="true" /> 活动待办</h2>
      <router-link :to="{ path: '/calendar', query: mineQuery }">查看全部</router-link>
    </header>
    <p v-if="!identity">登录并选择游戏账号后，可查看自己的活动待办。</p>
    <p v-else-if="!accountId">选择游戏账号后，在活动日历订阅你关注的本期活动。</p>
    <template v-else>
      <p v-if="loading && !ready" role="status">正在读取待办…</p>
      <div v-if="error" role="alert"><p>{{ error }}</p><button type="button" :disabled="loading || busy" @click="load">重试读取</button></div>
      <template v-if="ready">
        <p class="todo-scope"><template v-if="pendingTasks"><strong>{{ pendingTasks }}</strong> 项待办未完成</template><template v-else>来自已订阅活动的 Checklist</template></p>
        <p v-if="!tasks.length" class="todo-empty">{{ !count ? '还没有活动待办，去日历订阅活动并添加清单。' : !total ? '活动均已标记本期完成，可在日历查看已完成清单。' : '当前范围暂无待办。订阅活动不会自动创建 Checklist。' }}</p>
        <p v-else-if="!pendingTasks" class="todo-empty is-cleared"><CheckCheck :size="20" aria-hidden="true" /><span>当前范围的清单已全部勾选。<small>清单勾选与活动本期完成分别记录。</small></span></p>
        <ul v-if="visibleTasks.length" id="today-todo-list" class="todo-list" :class="{ 'is-expanded': showAll }">
          <li v-for="task in visibleTasks" :key="taskKey(task)" class="todo-row" :class="{ 'is-complete': task.entry.completed }">
            <label class="todo-check" :class="{ 'is-disabled': locked(task.record) }">
              <input type="checkbox" :checked="task.entry.completed" :data-todo-key="taskKey(task)" :aria-disabled="locked(task.record)" :aria-label="`${task.entry.completed ? '取消完成' : '完成'} ${task.entry.title}（${task.record.item.title}）`" @change="toggle(task, $event)">
            </label>
            <div class="todo-body">
              <span class="todo-title">{{ task.entry.title }}</span>
              <span class="todo-event">{{ task.record.item.title }}</span>
              <span v-if="actions[task.record.event_id]?.busy && actions[task.record.event_id]?.entryId === task.entry.id" class="todo-hint" role="status">保存中…</span>
            </div>
            <router-link class="todo-event-link" :aria-label="`查看活动 ${task.record.item.title}`" :to="eventLink(task.record)">
              <time v-if="task.record.item.end_date" :datetime="task.record.item.end_at || task.record.item.end_date" :title="task.record.item.end_at ? '活动截止时间已换算为北京时间' : '活动仅提供日期，按北京时间日历日判断'" :class="{ 'is-urgent': calendarTimeBounds(task.record.item).end - now <= 86400000 }">{{ taskDeadline(task.record.item) }}</time>
              <ChevronRight v-else :size="16" aria-hidden="true" />
            </router-link>
          </li>
        </ul>
        <button v-if="tasks.length > previewTasks.length" type="button" class="todo-more" :aria-expanded="showAll" :aria-controls="visibleTasks.length ? 'today-todo-list' : undefined" @click="showAll = !showAll">{{ showAll ? '收起清单' : pendingTasks ? '展开完整清单' : '查看已勾选清单' }}</button>
        <p v-if="!showAll && pendingTasks > previewTasks.length" class="todo-hint">还有 {{ pendingTasks - previewTasks.length }} 项未完成，可查看全部。</p>
        <p v-if="message" role="status" aria-live="polite">{{ message }}</p>
        <template v-for="(action, eventId) in actions" :key="eventId">
          <div v-if="action.error" class="todo-error" role="alert">
            <p>{{ action.error }}</p>
            <button type="button" :disabled="action.busy || loading" @click="readLatest(eventId)">{{ action.busy ? '读取中…' : '读取最新状态' }}</button>
          </div>
        </template>
        <div class="todo-footer">
          <router-link v-if="emptyRecords.length" class="todo-add" :to="eventLink(emptyRecords[0])">去添加待办</router-link>
          <details class="todo-subscription-status">
            <summary>订阅概况 · {{ count }} 项活动</summary>
            <p class="todo-hint">{{ total }} 项活动尚未标记本期完成（含历史或不可用订阅）。</p>
            <p v-if="!reminders.length" class="todo-hint">暂无临期活动。</p>
            <p v-if="unavailableCount" class="todo-hint">{{ unavailableCount }} 项订阅活动不可用，已有清单可在日历查看。</p>
            <router-link :to="{ path: '/calendar', query: { ...mineQuery, task: 'all' } }">查看全部 {{ count }} 项订阅活动</router-link>
          </details>
        </div>
        <Teleport :to="remindersTarget || 'body'" :disabled="!remindersTarget" defer>
          <details v-if="reminders.length" ref="remindersPanel" class="todo-reminders" :class="{ 'is-sidebar': !!remindersTarget }" :open="remindersOpen" @toggle="remindersOpen = $event.target.open">
            <summary><BellRing :size="18" aria-hidden="true" /> 今日重点<span>{{ reminders.length }} 项提醒</span><ChevronDown class="reminder-chevron" :size="14" aria-hidden="true" /></summary>
            <p class="todo-hint reminder-scope">订阅活动未来 72 小时内截止 · 北京时间</p>
            <ul class="reminder-list">
              <li v-for="record in reminders" :key="record.event_id">
                <router-link :to="eventLink(record)">{{ record.item.title }}</router-link>
                <time :datetime="record.item.end_at || record.item.end_date" :title="record.item.end_at ? '已换算为北京时间' : '活动仅提供日期，按北京时间日历日判断'" :class="{ 'is-urgent': calendarTimeBounds(record.item).end - now <= 86400000 }">{{ deadlineLabel(record.item) }}</time>
              </li>
            </ul>
          </details>
        </Teleport>
      </template>
    </template>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BellRing, CheckCheck, ChevronDown, ChevronRight, ListChecks } from '@lucide/vue'
import { subscriptionCompleted } from '@/data/activityCalendarSubscriptions.js'
import { auth } from '@/store/auth.js'
import { calendarSubscriptionSummary, getCalendarSubscription, listCalendarSubscriptions, saveCalendarProgress } from '@/api/activityCalendarSubscriptions.js'
import { addCalendarDays, CALENDAR_ENDING_WINDOW_MS, calendarDateLabel, calendarDeadline, calendarEnded, calendarTimeBounds, millisecondsUntilServerMidnight, nextCalendarBoundary, SERVER_TIME_ZONE, serverToday } from '@/data/activityCalendar.js'
const props = defineProps({ accountId: { type: String, default: '' }, game: { type: String, default: '' }, remindersTarget: { type: String, default: '' }, hideEmpty: Boolean })
const identity = computed(() => auth.isLoggedIn ? auth.userInfo?.id || '' : '')
const key = computed(() => JSON.stringify([identity.value, props.accountId, props.game]))
const mineQuery = computed(() => ({ scope: 'mine', task: 'todo', ...(props.game ? { game: props.game } : {}) }))
const root = ref(null), records = ref([]), order = ref([]), summaryItems = ref([]), actions = ref({})
const remindersPanel = ref(null)
const count = ref(0), total = ref(0), unavailableCount = ref(0), loading = ref(false), ready = ref(false), error = ref(''), message = ref(''), now = ref(Date.now())
const showAll = ref(false), remindersOpen = ref(true)
const today = computed(() => serverToday(new Date(now.value)))
const byId = computed(() => new Map(records.value.map(record => [record.event_id, record])))
const currentRecords = computed(() => records.value.filter(record => record.subscribed && record.item && !subscriptionCompleted(record) && !calendarEnded(record.item, today.value, now.value)))
const tasks = computed(() => {
  const currentIds = new Set(currentRecords.value.map(record => record.event_id))
  return order.value.flatMap(([eventId, entryId]) => {
    const record = byId.value.get(eventId)
    const entry = record?.checklist.find(value => value.id === entryId)
    return entry && currentIds.has(eventId) ? [{ record, entry }] : []
  })
})
const previewTasks = computed(() => tasks.value.filter(task => !task.entry.completed).slice(0, 3))
const visibleTasks = computed(() => showAll.value ? tasks.value : previewTasks.value)
const pendingTasks = computed(() => tasks.value.filter(task => !task.entry.completed).length)
const emptyRecords = computed(() => currentRecords.value.filter(record => !record.checklist.length))
const reminders = computed(() => summaryItems.value.filter(record => record.subscribed && record.item && !subscriptionCompleted(record) && !calendarEnded(record.item, today.value, now.value) && calendarTimeBounds(record.item).end - now.value <= CALENDAR_ENDING_WINDOW_MS).slice(0, 3))
const busy = computed(() => Object.values(actions.value).some(action => action.busy))
let generation = 0, epoch = 0, alive = true, timer = null, minute = null, lastVisible = 0, deferredLoad = false, notifying = false
const ticket = () => [key.value, epoch]
const current = context => alive && context[0] === key.value && context[1] === epoch && !!identity.value && !!props.accountId
const taskKey = task => JSON.stringify([task.record.event_id, task.entry.id])
function eventLink(record) { return { path: '/calendar', query: { ...mineQuery.value, view: 'month', date: record.item.start_date > today.value ? record.item.start_date : today.value, event: record.event_id } } }
function locked(record) { return loading.value || !!error.value || actions.value[record.event_id]?.busy || actions.value[record.event_id]?.blocked || !Number.isInteger(record.version) }
function taskDeadline(item) {
  const date = item.end_at ? serverToday(new Date(item.end_at)) : item.end_date
  const day = date === today.value ? '今天' : calendarDateLabel(date, { month: 'numeric', day: 'numeric' })
  const time = item.end_at ? ' ' + new Intl.DateTimeFormat('zh-CN', { timeZone: SERVER_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(item.end_at)) : ''
  return day + time + '截止'
}
function deadlineLabel(item) {
  const date = item.end_at ? serverToday(new Date(item.end_at)) : item.end_date
  const time = item.end_at ? ' ' + new Intl.DateTimeFormat('zh-CN', { timeZone: SERVER_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(item.end_at)) : ''
  const remaining = calendarTimeBounds(item).start <= now.value ? calendarDeadline(item, today.value, now.value) : ''
  return `${calendarDateLabel(date, { month: 'long', day: 'numeric' })}${time}截止${remaining ? ' · ' + remaining : ''}`
}
function schedule() {
  clearTimeout(timer)
  const time = Date.now()
  const boundary = nextCalendarBoundary(records.value.filter(record => record.item).map(record => record.item), time)
  const wait = Math.min(millisecondsUntilServerMidnight(new Date(time)) + 100, boundary - time + 50)
  if (alive && props.accountId && identity.value) timer = setTimeout(load, wait)
}
function focusTask(key) {
  if (!root.value) return
  const control = Array.from(root.value.querySelectorAll('input[type=checkbox]')).find(input => input.dataset.todoKey === key) || root.value.querySelector('.todo-heading a')
  control?.focus()
}
async function adopt(result) {
  const focused = document.activeElement, focusedKey = focused?.dataset?.todoKey, context = ticket()
  records.value = result.items || []
  order.value = currentRecords.value.flatMap(record => record.checklist.map(entry => ({ record, entry })))
    .sort((a, b) => Number(a.entry.completed) - Number(b.entry.completed)).map(task => [task.record.event_id, task.entry.id])
  if (!focusedKey) return
  await nextTick()
  if (current(context) && (document.activeElement === focused || document.activeElement === document.body)) {
    focusTask(focusedKey)
  }
}
async function load() {
  if (busy.value) { deferredLoad = true; return }
  deferredLoad = false
  const token = ++generation, context = ticket()
  clearTimeout(timer)
  now.value = Date.now(); error.value = ''
  if (!identity.value || !props.accountId) return
  loading.value = true
  try {
    const [list, summary] = await Promise.all([
      listCalendarSubscriptions({ account_id: props.accountId, from: today.value, to: addCalendarDays(today.value, 90) }, identity.value),
      calendarSubscriptionSummary(props.accountId, identity.value)
    ])
    if (!current(context) || token !== generation) return
    if ((list.items || []).some(record => !Number.isInteger(record.version) || !Array.isArray(record.checklist))) throw new Error('待办读取结果不完整，请重新读取。')
    now.value = Date.now()
    summaryItems.value = summary.items || []; count.value = summary.subscribed_count || 0; total.value = summary.total_pending || 0
    unavailableCount.value = list.unavailable_items?.length || 0; ready.value = true
    await adopt(list)
  } catch (err) {
    if (current(context) && token === generation) error.value = err?.message || '个人待办暂时无法读取。'
  } finally {
    if (current(context) && token === generation) { loading.value = false; schedule() }
  }
}
async function toggle(task, event) {
  const desired = event.target.checked
  event.target.checked = task.entry.completed
  if (locked(task.record) || !current(ticket())) return
  const context = ticket(), user = identity.value, owner = props.accountId, id = task.record.event_id, version = task.record.version
  const checklist = task.record.checklist.map(entry => ({ ...entry, completed: entry.id === task.entry.id ? desired : entry.completed }))
  const action = { busy: true, blocked: false, error: '', entryId: task.entry.id, intent: `「${task.entry.title}」${desired ? '完成' : '取消完成'}尚未确认` }
  actions.value[id] = action; message.value = ''; generation++; clearTimeout(timer)
  try {
    const result = await saveCalendarProgress(id, { account_id: owner, expected_version: version, completed: false, progress_mode: 'checklist', checklist }, user)
    if (!current(context)) return
    const snapshot = entries => JSON.stringify(entries?.map(entry => [entry.id, entry.title, entry.completed]))
    if (result?.event_id !== id || !result.subscribed || !Number.isInteger(result.version) || result.version <= version ||
        subscriptionCompleted(result) !== subscriptionCompleted(task.record) || result.completed !== subscriptionCompleted(result) ||
        snapshot(result.checklist) !== snapshot(checklist)) throw new Error('保存结果需要确认')
    records.value = records.value.map(record => record.event_id === id ? result : record)
    summaryItems.value = summaryItems.value.map(record => record.event_id === id ? result : record)
    message.value = `已保存「${task.entry.title}」`
    const focused = document.activeElement
    await nextTick()
    if (!current(context)) return
    if (focused?.dataset?.todoKey === taskKey(task) && document.activeElement === document.body) {
      focusTask(visibleTasks.value[0] ? taskKey(visibleTasks.value[0]) : '')
    }
    notifying = true
    try { window.dispatchEvent(new CustomEvent('calendar-subscriptions-updated', { detail: { userId: user, accountId: owner } })) }
    finally { notifying = false }
  } catch (err) {
    if (current(context)) {
      action.blocked = true
      action.error = `${action.intent}：${err?.message || '保存失败'}。请读取最新状态后重试。`
    }
  } finally {
    if (current(context)) {
      actions.value[id] = { ...action, busy: false }
      if (deferredLoad && !busy.value) void load()
      else schedule()
    }
  }
}
async function readLatest(id) {
  const action = actions.value[id], context = ticket()
  if (!action || action.busy || loading.value) return
  const focused = document.activeElement, restoreFocus = focused?.tagName === 'BUTTON' && root.value.contains(focused)
  actions.value[id] = { ...action, busy: true }; generation++; clearTimeout(timer)
  try {
    const result = await getCalendarSubscription(id, props.accountId, identity.value)
    if (!current(context)) return
    const previous = byId.value.get(id)
    if (result?.event_id !== id || !Number.isInteger(result.version) || result.version < previous.version || !Array.isArray(result.checklist)) throw new Error('读取结果需要确认')
    await adopt({ items: records.value.map(record => record.event_id === id ? result : record) })
    if (!current(context)) return
    summaryItems.value = summaryItems.value.map(record => record.event_id === id ? result : record)
    if (result.subscribed !== previous.subscribed || subscriptionCompleted(result) !== subscriptionCompleted(previous) || !result.item) deferredLoad = true
    actions.value[id] = { ...action, error: '', blocked: false, busy: false }
    message.value = '已读取最新状态，请核对后重新勾选。'
    await nextTick()
    if (current(context) && restoreFocus && (document.activeElement === focused || document.activeElement === document.body)) focusTask(JSON.stringify([id, action.entryId]))
  } catch (err) {
    if (current(context)) actions.value[id] = { ...action, busy: false, error: `${action.intent}；读取失败：${err?.message || '请重试'}。请读取最新状态。` }
  } finally {
    if (current(context)) {
      if (deferredLoad && !busy.value) void load()
      else schedule()
    }
  }
}
function visible() {
  if (document.visibilityState === 'hidden' || Date.now() - lastVisible < 1000) return
  lastVisible = Date.now(); void load()
}
function updated(event) {
  if (!notifying && event.detail?.userId === identity.value && event.detail?.accountId === props.accountId) void load()
}
watch(() => reminders.value.length, async (length, previous) => {
  if (length || !previous || !ready.value || !remindersPanel.value?.contains(document.activeElement)) return
  const context = ticket()
  await nextTick()
  if (current(context) && document.activeElement === document.body) focusTask('')
})
watch(key, () => {
  clearInterval(minute); clearTimeout(timer); generation++; epoch++; deferredLoad = false
  if (identity.value && props.accountId) minute = setInterval(() => { if (document.visibilityState !== 'hidden') now.value = Date.now() }, 60000)
  records.value = []; order.value = []; summaryItems.value = []; actions.value = {}; count.value = 0; total.value = 0; unavailableCount.value = 0
  ready.value = false; loading.value = false; error.value = ''; message.value = ''; showAll.value = false; void load()
}, { immediate: true, flush: 'sync' })
onMounted(() => {
  document.addEventListener('visibilitychange', visible); window.addEventListener('pageshow', visible); window.addEventListener('calendar-subscriptions-updated', updated)
})
onBeforeUnmount(() => { alive = false; generation++; clearTimeout(timer); clearInterval(minute); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', visible); window.removeEventListener('calendar-subscriptions-updated', updated) })
</script>
<style scoped>
/* 刻意共享的字段外观，不持有双端布局。 */

.today-subscriptions { border: 1px solid var(--line); background: var(--surface); }
h2 { color: var(--tea); font: 900 20px/1.5 var(--font-s); }
p, span, time { color: var(--tea); line-height: 1.7; }
ul { list-style: none; }
.todo-check { cursor: pointer; }
.todo-check input { accent-color: var(--tea); cursor: inherit; }
.todo-check.is-disabled { opacity: .6; cursor: wait; }
.todo-title { font-weight: 700; }
.is-complete .todo-title { text-decoration: line-through; font-weight: 400; }
.todo-event { font-weight: 400; }
.todo-reminders { border: 1px solid color-mix(in srgb, var(--rouge) 45%, var(--line)); background: color-mix(in srgb, var(--rouge) 5%, var(--surface)); }
.todo-reminders > summary { color: var(--rouge); }
.todo-subscription-status { border-top: 1px solid var(--line); }
.todo-subscription-status > summary { color: var(--ink-60); font-weight: 400; }
summary { color: var(--tea); font-weight: 700; cursor: pointer; }
time { color: var(--accent-strong); }
time.is-urgent, .todo-error p { color: var(--rouge); }
a, button { color: var(--tea); font-weight: 700; }
.todo-heading a, .todo-event-link, .todo-add { font-size: 12px; font-weight: 500; text-decoration: none; }
.todo-heading a:hover, .todo-event-link:hover, .todo-add:hover { text-decoration: underline; }
button { border: 1px solid var(--line); background: var(--cream); cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
</style>
<style scoped src="./todaySubscriptionDesktop.css"></style>
<style scoped src="./todaySubscriptionMobile.css"></style>
