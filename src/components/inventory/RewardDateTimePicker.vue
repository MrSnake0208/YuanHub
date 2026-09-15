<template>
  <div ref="root" class="reward-datetime" @keydown.esc.stop.prevent="closePopovers">
    <span class="field-label">发生时间 <small>{{ timezone }}</small></span>
    <div class="datetime-inputs">
      <div class="date-input">
        <input :value="date" type="text" inputmode="numeric" aria-label="发生日期" placeholder="YYYY-MM-DD" maxlength="10" :disabled="disabled" @input="$emit('update:date', $event.target.value)" />
        <button ref="dateTrigger" type="button" :disabled="disabled" aria-label="选择发生日期" :aria-expanded="calendarOpen" aria-controls="reward-calendar" @click="toggleCalendar"><CalendarDays :size="17" aria-hidden="true" /></button>
      </div>
      <button ref="timeTrigger" type="button" class="clock-input" :disabled="disabled" :aria-expanded="timeOpen" aria-controls="reward-timepicker" @click="toggleTime"><Clock3 :size="15" aria-hidden="true" /><span>{{ clock || '00:00:00' }}</span></button>
    </div>
    <div v-if="calendarOpen" id="reward-calendar" class="calendar" role="group" aria-label="选择发生日期">
      <div class="calendar-heading"><button type="button" aria-label="上个月" @click="changeMonth(-1)"><ChevronLeft :size="18" aria-hidden="true" /></button><strong aria-live="polite">{{ year }} 年 {{ month + 1 }} 月</strong><button type="button" aria-label="下个月" @click="changeMonth(1)"><ChevronRight :size="18" aria-hidden="true" /></button></div>
      <div class="calendar-week" aria-hidden="true"><span v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{ day }}</span></div>
      <div class="calendar-days"><span v-for="blank in offset" :key="`blank-${blank}`" /><button v-for="day in days" :key="day" type="button" :data-day="day" :tabindex="day === focusedDay ? 0 : -1" :class="{ selected: keyFor(day) === date, today: keyFor(day) === today }" :aria-label="`${year} 年 ${month + 1} 月 ${day} 日`" :aria-pressed="keyFor(day) === date" :aria-current="keyFor(day) === today ? 'date' : undefined" @keydown="moveDay($event, day)" @click="selectDay(day)">{{ day }}</button></div>
      <button type="button" class="today-button" @click="selectToday">回到今天</button>
    </div>
    <div v-if="timeOpen" id="reward-timepicker" class="time-popover" role="group" aria-label="选择发生时刻">
      <div class="time-heading"><span>选择时刻</span><small>小时 · 分钟 · 秒</small></div>
      <div class="time-columns">
        <div v-for="column in timeColumns" :key="column.key" class="time-column"><span class="time-column-label">{{ column.label }}</span><div :ref="element => registerTimeList(column.key, element)" class="time-options" @wheel="cycleTime($event, column)"><button v-for="option in column.options" :key="option" type="button" :class="{ selected: timePart(column.key) === option }" :aria-pressed="timePart(column.key) === option" @click="setTimePart(column.key, option)">{{ option }}</button></div></div>
      </div>
      <div class="time-foot"><button type="button" class="now-button" @click="setNow">使用当前时刻</button><button type="button" class="done-button" @click="closeTime">完成</button></div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarDays, Clock3, ChevronLeft, ChevronRight } from '@lucide/vue'

const props = defineProps({ date: String, clock: String, disabled: Boolean })
const emit = defineEmits(['update:date', 'update:clock'])
const root = ref(null)
const dateTrigger = ref(null)
const timeTrigger = ref(null)
const calendarOpen = ref(false)
const timeOpen = ref(false)
const timeLists = ref({})
const year = ref(new Date().getFullYear())
const month = ref(new Date().getMonth())
const focusedDay = ref(1)
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '本机时区'
const dayKey = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const today = dayKey(new Date())
const keyFor = day => `${year.value}-${String(month.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
const days = computed(() => new Date(year.value, month.value + 1, 0).getDate())
const offset = computed(() => (new Date(year.value, month.value, 1).getDay() + 6) % 7)
const options = count => Array.from({ length: count }, (_, index) => String(index).padStart(2, '0'))
const timeColumns = [{ key: 'hour', label: '时', options: options(24) }, { key: 'minute', label: '分', options: options(60) }, { key: 'second', label: '秒', options: options(60) }]
function timePart(key) { const parts = String(props.clock || '00:00:00').split(':'); return parts[{ hour: 0, minute: 1, second: 2 }[key]]?.padStart(2, '0') || '00' }
function registerTimeList(key, element) { if (element) timeLists.value[key] = element; else delete timeLists.value[key] }
function revealTimePart(key) { nextTick(() => timeLists.value[key]?.querySelector('.selected')?.scrollIntoView({ block: 'center' })) }
function setTimePart(key, option) { const parts = { hour: timePart('hour'), minute: timePart('minute'), second: timePart('second') }; parts[key] = option; emit('update:clock', `${parts.hour}:${parts.minute}:${parts.second}`); revealTimePart(key) }
function cycleTime(event, column) {
  const list = event.currentTarget
  const atTop = list.scrollTop <= 1
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1
  if (!((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom))) return
  event.preventDefault()
  const size = column.key === 'hour' ? 24 : 60
  const current = Number(timePart(column.key)) || 0
  const next = (current + (event.deltaY > 0 ? 1 : -1) + size) % size
  setTimePart(column.key, String(next).padStart(2, '0'))
}
function setNow() { const now = new Date(); emit('update:clock', `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`); emit('update:date', dayKey(now)); closeTime() }
async function focusDay() { await nextTick(); root.value?.querySelector(`[data-day="${focusedDay.value}"]`)?.focus() }
function toggleCalendar() { timeOpen.value = false; if (calendarOpen.value) { closeCalendar(); return }; let current = new Date(`${props.date}T12:00:00`); if (!Number.isFinite(current.getTime())) current = new Date(); year.value = current.getFullYear(); month.value = current.getMonth(); focusedDay.value = current.getDate(); calendarOpen.value = true; focusDay() }
function closeCalendar() { calendarOpen.value = false; dateTrigger.value?.focus() }
function toggleTime() { calendarOpen.value = false; timeOpen.value = !timeOpen.value; if (timeOpen.value) timeColumns.forEach(column => revealTimePart(column.key)) }
function closeTime() { timeOpen.value = false; timeTrigger.value?.focus() }
function closePopovers() { if (calendarOpen.value) closeCalendar(); else if (timeOpen.value) closeTime() }
function changeMonth(delta) { const next = new Date(year.value, month.value + delta, 1); year.value = next.getFullYear(); month.value = next.getMonth(); focusedDay.value = Math.min(focusedDay.value, days.value); focusDay() }
function selectDay(day) { emit('update:date', keyFor(day)); closeCalendar() }
function selectToday() { emit('update:date', today); closeCalendar() }
function moveDay(event, day) { const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]; if (delta === undefined) return; event.preventDefault(); const target = new Date(year.value, month.value, day + delta); year.value = target.getFullYear(); month.value = target.getMonth(); focusedDay.value = target.getDate(); focusDay() }
function outside(event) { if (!root.value?.contains(event.target)) { calendarOpen.value = false; timeOpen.value = false } }
watch(() => props.disabled, value => { if (value) { calendarOpen.value = false; timeOpen.value = false } })
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('focusin', outside) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside) })
</script>

<style scoped>
.reward-datetime { position: relative; min-width: 0; color: var(--ink); }
.field-label { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 8px; font-size: 12px; font-weight: 800; }
.field-label small { color: var(--ink-60); font-size: 11px; font-weight: 400; }
.datetime-inputs { display: flex; gap: 8px; }
.date-input, .clock-input { display: flex; align-items: center; border: 1px solid var(--line); background: var(--surface); border-radius: 9px; min-width: 0; }
.date-input { flex: 1; }
.clock-input { justify-content: flex-start; gap: 7px; width: 122px; padding: 0 10px; box-sizing: border-box; font: 13px 'Archivo', var(--font-b); }
input { appearance: none; background: transparent; color: var(--ink); border: 0; outline: none; font: 13px 'Archivo', var(--font-b); width: 100%; min-width: 0; height: 42px; padding: 0 10px; box-sizing: border-box; }
.date-input:focus-within, .clock-input:focus-visible { outline: 2px solid var(--tea); outline-offset: 2px; }
button { appearance: none; display: inline-flex; justify-content: center; align-items: center; border: 0; border-radius: 8px; color: var(--ink); background: transparent; min-width: 36px; min-height: 36px; padding: 0; font: inherit; cursor: pointer; }
button:hover:not(:disabled) { background: var(--paper); }
button:focus-visible { outline: 2px solid var(--tea); outline-offset: 1px; }
button:disabled, input:disabled { opacity: .5; cursor: not-allowed; }
.date-input button { min-width: 40px; height: 42px; }
.calendar, .time-popover { position: absolute; left: 0; top: calc(100% + 8px); z-index: 65; width: min(296px, calc(100vw - 80px)); padding: 14px; border: 1px solid var(--line); border-radius: 14px; box-sizing: border-box; background: var(--surface); box-shadow: 0 16px 40px -12px rgba(73,59,44,.24), inset 0 0 0 4px var(--cream); }
.calendar-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.calendar-heading strong { font-family: var(--font-s); font-size: 14px; }
.calendar-week, .calendar-days { display: grid; grid-template-columns: repeat(7, minmax(0,1fr)); gap: 2px; text-align: center; }
.calendar-week { color: var(--ink-60); font-size: 11px; padding: 5px 0; }
.calendar-days button { min-width: 0; min-height: 34px; font-family: 'Archivo', var(--font-b); font-size: 12px; }
.calendar-days .today { box-shadow: inset 0 0 0 1px var(--line); }
.calendar-days .selected { background: var(--tea); color: var(--cream); }
.today-button { width: 100%; margin-top: 8px; border-top: 1px solid var(--line); border-radius: 0; font-size: 12px; }
.time-popover { left: auto; right: 0; width: min(284px, calc(100vw - 80px)); }
.time-heading { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 11px; border-bottom: 1px solid var(--line); }
.time-heading span { font: 900 15px var(--font-s); }
.time-heading small { color: var(--ink-60); font-size: 10px; }
.time-columns { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 7px; margin: 12px 0; }
.time-column { min-width: 0; }
.time-column-label { display: block; margin-bottom: 5px; color: var(--ink-60); text-align: center; font-size: 10px; }
.time-options { display: grid; grid-template-columns: minmax(0,1fr); gap: 3px; max-height: 168px; overflow-y: auto; overscroll-behavior: contain; scroll-snap-type: y proximity; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
.time-options button { min-width: 0; min-height: 31px; border-radius: 5px; scroll-snap-align: center; font: 11px 'Archivo', var(--font-b); }
.time-options button.selected { background: var(--tea); color: var(--cream); }
.time-foot { display: flex; justify-content: space-between; gap: 8px; padding-top: 10px; border-top: 1px solid var(--line); }
.now-button { color: var(--ink-60); font-size: 11px; }
.done-button { padding: 0 13px; background: var(--tea); color: var(--cream); font-size: 11px; }
@media (max-width: 480px) { .clock-input { width: 104px; font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
