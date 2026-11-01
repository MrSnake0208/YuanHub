<template>
  <Teleport to="body">
    <div v-if="visible" class="calendar-reminder-mask" @click.self="close">
      <section ref="panel" class="calendar-reminder" role="dialog" aria-modal="true" aria-labelledby="calendar-reminder-title" aria-describedby="calendar-reminder-hint" tabindex="-1">
        <header>
          <div class="calendar-reminder-heading">
            <h2 id="calendar-reminder-title"><Bell :size="20" aria-hidden="true" /><span aria-live="polite">{{ error ? '私人日历提醒' : `今天有 ${reminders.length} 项提醒` }}</span></h2>
            <p v-if="account" class="calendar-reminder-account" :title="`${account.game} · ${account.name}`">{{ account.game }} · {{ account.name }}</p>
          </div>
          <button class="calendar-reminder-close" type="button" aria-label="关闭私人日历提醒" @click="close"><X :size="20" aria-hidden="true" /></button>
        </header>
        <div class="calendar-reminder-body">
          <div v-if="error" class="calendar-reminder-error">
            <p role="status" aria-live="polite">{{ error }}</p>
            <button type="button" @click="load">重试读取提醒</button>
          </div>
          <template v-else>
            <section v-for="group in groups" :key="group.label" class="calendar-reminder-group" :aria-label="group.label">
              <h3>{{ group.label }}<span>{{ group.reminders.length }} 项</span></h3>
              <ul>
                <li v-for="reminder in group.reminders" :key="reminder.key">
                  <router-link class="calendar-reminder-card" :to="reminderLink(reminder)" :aria-label="`${reminder.item.title}，${reminder.label}，查看日历详情`" @click="close">
                    <span class="calendar-reminder-card-content">
                      <span class="calendar-reminder-card-title" :title="reminder.item.title">{{ reminder.item.title }}</span>
                      <span class="calendar-reminder-card-date">{{ reminder.date }}</span>
                    </span>
                    <ChevronRight :size="18" aria-hidden="true" />
                  </router-link>
                </li>
              </ul>
            </section>
          </template>
        </div>
        <footer>
          <p id="calendar-reminder-hint" class="calendar-reminder-hint">{{ error ? '北京时间 · 仅当前账号' : '北京时间 · 稍后提醒下次浏览再提示；已知悉仅隐藏今天这批提醒，不会完成事项。' }}</p>
          <div class="calendar-reminder-actions">
            <button ref="closeButton" type="button" @click="close">稍后提醒</button>
            <button v-if="!error" type="button" class="calendar-reminder-primary" @click="acknowledge">今天已知悉</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bell, ChevronRight, X } from '@lucide/vue'
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
const account = ref(null), items = ref([]), error = ref(''), day = ref(serverToday()), dismissed = ref([]), snoozed = ref([])
const storageKey = computed(() => reminderStorageKey(identity.value, activeAccount.id))
const reminders = computed(() => items.value.map(item => privateItemReminder(item, day.value)).filter(value => value && !dismissed.value.includes(value.key) && !snoozed.value.includes(value.key)))
const groups = computed(() => ['今天开始', '今天截止', '明天开始', '明天截止'].map(label => ({ label, reminders: reminders.value.filter(value => value.label === label) })).filter(group => group.reminders.length))
const panel = ref(null), closeButton = ref(null), modalOpen = ref(false), pendingOpen = ref(false)
const hasContent = computed(() => !!(reminders.value.length || error.value))
const visible = computed(() => modalOpen.value && hasContent.value)
let generation = 0, alive = true, timer = null, denied = false, lastVisible = 0, closeRevision = 0

function resetPresentation() {
  closeRevision++; modalOpen.value = false; pendingOpen.value = false
}
function tryOpen() {
  if (!pendingOpen.value || modalFocusState.active || !hasContent.value) return
  pendingOpen.value = false; modalOpen.value = true
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
function syncDismissals() {
  dismissed.value = readReminderDismissals(storageKey.value, day.value)
  snoozed.value = readReminderDismissals(storageKey.value, day.value, 'sessionStorage')
}
function close() {
  if (!error.value) snoozed.value = dismissPrivateReminders(storageKey.value, day.value, reminders.value, 'sessionStorage')
  resetPresentation()
  error.value = ''
}
function acknowledge() {
  if (!error.value) dismissed.value = dismissPrivateReminders(storageKey.value, day.value, reminders.value)
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
  account.value = null; items.value = []; error.value = ''; dismissed.value = []; snoozed.value = []
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
.calendar-reminder-mask { background: var(--theme-overlay, color-mix(in srgb, var(--ink) 45%, transparent)); }
.calendar-reminder { min-width: 0; color: var(--ink); background: var(--surface); border: 1px solid var(--line); box-shadow: 0 16px 48px color-mix(in srgb, var(--tea) 16%, transparent); }
.calendar-reminder-heading { min-width: 0; }
.calendar-reminder h2 { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--theme-strong-text, var(--tea)); font: 800 20px/1.4 var(--font-s); }
.calendar-reminder h2 svg { flex: none; }
.calendar-reminder .calendar-reminder-account { margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-60); font-size: 13px; }
.calendar-reminder p { margin: 0; line-height: 1.6; }
.calendar-reminder button { font: inherit; color: var(--theme-strong-text, var(--tea)); background: transparent; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
.calendar-reminder :is(button, a):focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
.calendar-reminder-group + .calendar-reminder-group { margin-top: 14px; }
.calendar-reminder-group h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; color: var(--theme-strong-text, var(--tea)); font-size: 13px; line-height: 1.5; }
.calendar-reminder-group h3 span { color: var(--ink-60); font-size: 12px; font-weight: 400; }
.calendar-reminder ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.calendar-reminder li { min-width: 0; }
.calendar-reminder-card { display: flex; align-items: center; gap: 12px; padding: 10px 12px; color: var(--theme-strong-text, var(--tea)); background: var(--cream); border: 1px solid var(--line); border-radius: 12px; text-decoration: none; }
.calendar-reminder-card-content { flex: 1; min-width: 0; display: grid; gap: 3px; }
.calendar-reminder-card-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 600; line-height: 1.5; }
.calendar-reminder-card-date { color: var(--ink-60); font-size: 12px; line-height: 1.5; }
.calendar-reminder-card svg { flex: none; }
.calendar-reminder-error { display: grid; justify-items: start; gap: 12px; }
.calendar-reminder-hint { color: var(--ink-60); font-size: 12px; }
.calendar-reminder-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.calendar-reminder-actions > button:only-child { grid-column: 1 / -1; }
.calendar-reminder button:active, .calendar-reminder-card:active { filter: brightness(.96); }
.calendar-reminder button.calendar-reminder-primary { color: var(--on-strong); background: var(--tea); }
@media (hover: hover) {
  .calendar-reminder-card:hover { border-color: var(--tea); background: color-mix(in srgb, var(--tea) 5%, var(--cream)); }
  .calendar-reminder button:hover { border-color: var(--tea); }
}
</style>
<style scoped src="./calendarReminderDialogDesktop.css"></style>
<style scoped src="./calendarReminderDialogMobile.css"></style>
