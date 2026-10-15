<template>
  <Teleport to="body">
    <div v-if="visible" class="calendar-reminder-mask" @click.self="close">
      <section ref="panel" class="calendar-reminder" role="dialog" aria-modal="true" aria-labelledby="calendar-reminder-title" aria-describedby="calendar-reminder-hint" tabindex="-1">
        <header>
          <h2 id="calendar-reminder-title"><Bell :size="20" aria-hidden="true" />私人日历提醒</h2>
          <button class="calendar-reminder-close" type="button" aria-label="关闭私人日历提醒" @click="close"><X :size="20" aria-hidden="true" /></button>
        </header>
        <div class="calendar-reminder-body">
          <p role="status" aria-live="polite">{{ error || `${account.game} · ${account.name}：${reminders.length} 件事即将开始或截止` }}</p>
          <button v-if="error" type="button" @click="load">重试读取提醒</button>
          <template v-else>
            <ul>
              <li v-for="reminder in visibleReminders" :key="reminder.key">
                <span>{{ reminder.label }} · </span>
                <router-link :to="reminderLink(reminder)" @click="close">{{ reminder.item.title }}</router-link>
              </li>
            </ul>
            <button v-if="reminders.length > 3" type="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起' : `展开其余 ${reminders.length - 3} 项` }}</button>
          </template>
          <p id="calendar-reminder-hint" class="calendar-reminder-hint">北京时间 · 仅当前账号。未勾选时只关闭本次，重新进入仍会提醒。</p>
        </div>
        <footer>
          <label v-if="!error" class="calendar-reminder-check"><input v-model="suppressToday" type="checkbox" />今天不再显示</label>
          <button ref="closeButton" type="button" class="calendar-reminder-primary" @click="close">知道了</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bell, X } from '@lucide/vue'
import { auth } from '../../store/auth.js'
import { beta } from '../../store/beta.js'
import { activeAccount } from '../../store/activeAccount.js'
import { useAccountListUpdates } from '../../store/accountList.js'
import { modalFocusState, useModalFocus } from '../../composables/useModalFocus.js'
import { listAccounts } from '../../api/accounts.js'
import { listCalendarPrivateItems } from '../../api/calendarPrivateItems.js'
import { CALENDAR_PRIVATE_ITEMS_UPDATED, privateCalendarItem } from '../../data/calendarPrivateItems.js'
import { addCalendarDays, millisecondsUntilServerMidnight, serverToday } from '../../data/activityCalendar.js'
import { dismissPrivateReminders, privateItemReminder, readReminderDismissals, reminderStorageKey } from '../../data/calendarPrivateReminders.js'

const identity = computed(() => auth.isLoggedIn && beta.canUseBetaFeatures && beta.userId === auth.userInfo?.id ? auth.userInfo.id : '')
const context = computed(() => JSON.stringify([identity.value, activeAccount.id]))
const account = ref(null), items = ref([]), error = ref(''), day = ref(serverToday()), dismissed = ref([]), expanded = ref(false)
const storageKey = computed(() => reminderStorageKey(identity.value, activeAccount.id))
const reminders = computed(() => items.value.map(item => privateItemReminder(item, day.value)).filter(value => value && !dismissed.value.includes(value.key)))
const visibleReminders = computed(() => expanded.value ? reminders.value : reminders.value.slice(0, 3))
const panel = ref(null), closeButton = ref(null), modalOpen = ref(false), pendingOpen = ref(false), suppressToday = ref(false)
const hasContent = computed(() => !!(reminders.value.length || error.value))
const visible = computed(() => modalOpen.value && hasContent.value)
let generation = 0, alive = true, timer = null, denied = false, lastVisible = 0, closeRevision = 0

function resetPresentation() {
  closeRevision++; modalOpen.value = false; pendingOpen.value = false; suppressToday.value = false; expanded.value = false
}
function tryOpen() {
  if (!pendingOpen.value || modalFocusState.active || !hasContent.value) return
  suppressToday.value = false; pendingOpen.value = false; modalOpen.value = true
}
function requestOpen() {
  if (modalOpen.value || !hasContent.value) return
  pendingOpen.value = true; tryOpen()
}
watch(() => modalFocusState.active, tryOpen, { flush: 'post' })
watch(hasContent, value => { if (!value) resetPresentation() }, { flush: 'sync' })
useModalFocus(visible, panel, { initialFocus: () => closeButton.value, onEscape: close, preventRestoreScroll: true })
let restoreScroll = null
watch(visible, value => {
  restoreScroll?.(); restoreScroll = null
  if (!value) return
  const body = document.body, previous = body.style.overflow
  body.style.overflow = 'hidden'
  restoreScroll = () => { body.style.overflow = previous }
}, { flush: 'sync' })

function reminderLink(reminder) {
  return { path: '/calendar', query: { scope: 'mine', task: 'todo', view: 'month', game: account.value.game, date: reminder.date, event: reminder.item.id } }
}
function syncDismissals() { dismissed.value = readReminderDismissals(storageKey.value, day.value) }
function close() {
  if (suppressToday.value && !error.value) dismissed.value = dismissPrivateReminders(storageKey.value, day.value, reminders.value)
  resetPresentation()
  error.value = ''
}
async function load() {
  if (!alive || !identity.value || !activeAccount.id || denied) return
  const token = ++generation, userId = identity.value, accountId = activeAccount.id
  clearTimeout(timer)
  const today = serverToday()
  if (day.value !== today) { resetPresentation(); items.value = []; day.value = today }
  error.value = ''; syncDismissals()
  const presentation = closeRevision
  try {
    const accounts = await listAccounts(userId)
    if (!alive || token !== generation) return
    const owner = accounts.find(value => value.id === accountId)
    if (!owner) { account.value = null; items.value = []; return }
    account.value = owner
    const result = await listCalendarPrivateItems({ account_id: accountId, from: day.value, to: addCalendarDays(day.value, 1) }, userId)
    if (!alive || token !== generation) return
    if (day.value !== serverToday()) { void load(); return }
    const values = Array.isArray(result?.items) ? result.items.map(value => privateCalendarItem(value, owner)) : null
    if (!values || values.some(value => !value)) throw new Error('私人事项提醒读取结果不完整，请重试。')
    items.value = values
    if (presentation === closeRevision) requestOpen()
  } catch (err) {
    if (!alive || token !== generation) return
    denied = [401, 403].includes(err?.status) || err?.status === 404 && err?.code === 'account_not_found'
    if (denied) { account.value = null; items.value = [] }
    else {
      error.value = '私人日历提醒暂时无法读取，请重试。'; items.value = []
      if (presentation === closeRevision) requestOpen()
    }
  } finally {
    if (alive && token === generation && !denied) timer = setTimeout(load, day.value === serverToday() ? millisecondsUntilServerMidnight() + 100 : 0)
  }
}
watch(context, () => {
  generation++; clearTimeout(timer); denied = false
  resetPresentation()
  account.value = null; items.value = []; error.value = ''; dismissed.value = []; expanded.value = false
  void load()
}, { immediate: true, flush: 'sync' })
useAccountListUpdates(() => { denied = false; void load() })
function onVisible() {
  if (document.visibilityState === 'hidden' || Date.now() - lastVisible < 1000) return
  lastVisible = Date.now(); void load()
}
function updated(event) {
  if (event.detail?.userId === identity.value && event.detail?.accountId === activeAccount.id) void load()
}
function storage(event) { if (event.key === storageKey.value) syncDismissals() }
onMounted(() => {
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onVisible)
  window.addEventListener(CALENDAR_PRIVATE_ITEMS_UPDATED, updated)
  window.addEventListener('storage', storage)
})
onBeforeUnmount(() => {
  alive = false; generation++; clearTimeout(timer)
  restoreScroll?.()
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('pageshow', onVisible)
  window.removeEventListener(CALENDAR_PRIVATE_ITEMS_UPDATED, updated)
  window.removeEventListener('storage', storage)
})
</script>

<style scoped>
.calendar-reminder-mask { background: color-mix(in srgb, var(--ink) 45%, transparent); }
.calendar-reminder { color: var(--ink); background: var(--surface); border: 1px solid var(--line); }
.calendar-reminder h2 { color: var(--tea); font: 900 20px/1.4 var(--font-s); }
.calendar-reminder a { color: var(--tea); text-decoration: underline; text-underline-offset: 3px; }
.calendar-reminder p { margin: 0; line-height: 1.6; }
.calendar-reminder button { font: inherit; color: var(--tea); background: transparent; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
.calendar-reminder :is(button, a):focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.calendar-reminder-hint { color: var(--ink-60); font-size: 12px; }
.calendar-reminder button.calendar-reminder-primary { color: var(--cream); background: var(--tea); }
.calendar-reminder-check input { accent-color: var(--tea); }
</style>
<style scoped src="./calendarReminderDialogDesktop.css"></style>
<style scoped src="./calendarReminderDialogMobile.css"></style>
