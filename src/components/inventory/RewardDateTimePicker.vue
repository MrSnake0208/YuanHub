<template>
  <div ref="root" class="reward-datetime" @keydown.esc="closePopovers">
    <span class="field-label">发生时间 <small>{{ timezone }}</small></span>
    <div class="datetime-inputs">
      <div class="date-input">
        <input :value="date" type="text" inputmode="numeric" aria-label="发生日期" placeholder="YYYY-MM-DD" maxlength="10" :disabled="disabled" @input="$emit('update:date', $event.target.value)" />
        <button ref="dateTrigger" type="button" :disabled="disabled" aria-label="选择发生日期" :aria-expanded="calendarOpen" aria-controls="reward-calendar" @click="toggleCalendar"><CalendarDays :size="17" aria-hidden="true" /></button>
      </div>
      <div class="clock-input">
        <div class="clock-segments" role="group" aria-label="发生时刻">
          <template v-for="(column, index) in timeColumns" :key="column.label">
            <span v-if="index" aria-hidden="true">:</span>
            <input :value="timePart(index)" :data-clock-part="index" type="text" inputmode="numeric" maxlength="2" placeholder="00" :aria-label="column.label" :aria-invalid="!validTimePart(index)" :disabled="disabled" @focus="$event.target.select()" @click="$event.target.select()" @keydown="selectTimePartForTyping" @beforeinput="selectTimePartForTyping" @input="setTimePart(index, $event.target.value)" @blur="normalizeTimePart(index)" @paste="pasteClock" @keydown.up.prevent="stepTimePart(index, 1)" @keydown.down.prevent="stepTimePart(index, -1)" @keydown.enter="normalizeTimePart(index)" />
          </template>
        </div>
        <button ref="timeTrigger" type="button" :disabled="disabled" aria-label="选择发生时刻" :aria-expanded="timeOpen" aria-controls="reward-timepicker" @click="toggleTime"><Clock3 :size="15" aria-hidden="true" /></button>
      </div>
    </div>
    <div v-if="calendarOpen" id="reward-calendar" class="calendar" role="group" aria-label="选择发生日期">
      <div class="calendar-heading"><button type="button" aria-label="上个月" @click="changeMonth(-1)"><ChevronLeft :size="18" aria-hidden="true" /></button><strong aria-live="polite">{{ year }} 年 {{ month + 1 }} 月</strong><button type="button" aria-label="下个月" @click="changeMonth(1)"><ChevronRight :size="18" aria-hidden="true" /></button></div>
      <div class="calendar-week" aria-hidden="true"><span v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{ day }}</span></div>
      <div class="calendar-days"><span v-for="blank in offset" :key="`blank-${blank}`" /><button v-for="day in days" :key="day" type="button" :data-day="day" :tabindex="day === focusedDay ? 0 : -1" :class="{ selected: keyFor(day) === date, today: keyFor(day) === today }" :aria-label="`${year} 年 ${month + 1} 月 ${day} 日`" :aria-pressed="keyFor(day) === date" :aria-current="keyFor(day) === today ? 'date' : undefined" @keydown="moveDay($event, day)" @click="selectDay(day)">{{ day }}</button></div>
      <button type="button" class="today-button" @click="selectToday">回到今天</button>
    </div>
    <div v-if="timeOpen" id="reward-timepicker" class="time-popover" role="group" aria-label="选择发生时刻">
      <div class="time-heading">
        <div class="time-title"><span>选择时刻</span><small>24 小时制</small></div>
        <button type="button" aria-label="关闭选时" @click="closeTime"><X :size="16" aria-hidden="true" /></button>
      </div>
      <p class="time-description">直接输入数值，精确到秒。</p>
      <div class="time-columns">
        <label v-for="(column, index) in timeColumns" :key="column.label" class="time-column">
          <span class="time-column-label">{{ column.label }}</span>
          <input :value="timePart(index)" :data-time-part="index" type="text" inputmode="numeric" maxlength="2" placeholder="00" :disabled="disabled" :aria-invalid="!validTimePart(index)" aria-describedby="reward-time-hint" @focus="$event.target.select()" @click="$event.target.select()" @keydown="selectTimePartForTyping" @beforeinput="selectTimePartForTyping" @input="setTimePart(index, $event.target.value)" @blur="normalizeTimePart(index)" @paste="pasteClock" @keydown.up.prevent="stepTimePart(index, 1)" @keydown.down.prevent="stepTimePart(index, -1)" @keydown.enter.stop.prevent="finishTime" />
          <small>00–{{ column.max }}</small>
        </label>
      </div>
      <p id="reward-time-hint" class="time-hint" :class="{ 'is-invalid': !timeValid }" :role="timeValid ? undefined : 'status'">{{ timeValid ? '输入后按 Enter 确认，也可用 ↑ ↓ 微调。' : '小时需为 00–23，分钟和秒需为 00–59。' }}</p>
      <div class="time-foot"><button type="button" class="now-button" :disabled="disabled" @click="setNow"><Clock3 :size="14" aria-hidden="true" />使用当前时间</button><button type="button" class="done-button" :disabled="disabled || !timeValid" @click="finishTime">完成<Check :size="14" aria-hidden="true" /></button></div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarDays, Clock3, ChevronLeft, ChevronRight, Check, X } from '@lucide/vue'

const props = defineProps({ date: String, clock: String, disabled: Boolean })
const emit = defineEmits(['update:date', 'update:clock'])
const root = ref(null)
const dateTrigger = ref(null)
const timeTrigger = ref(null)
const calendarOpen = ref(false)
const timeOpen = ref(false)
const year = ref(new Date().getFullYear())
const month = ref(new Date().getMonth())
const focusedDay = ref(1)
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '本机时区'
const dayKey = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const today = dayKey(new Date())
const keyFor = day => `${year.value}-${String(month.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
const days = computed(() => new Date(year.value, month.value + 1, 0).getDate())
const offset = computed(() => (new Date(year.value, month.value, 1).getDay() + 6) % 7)
const timeColumns = [{ label: '小时', max: 23 }, { label: '分钟', max: 59 }, { label: '秒', max: 59 }]
function timePart(index) { return String(props.clock || '').split(':')[index] ?? (index === 2 ? '00' : '') }
function validTimePart(index) { return /^\d{1,2}$/.test(timePart(index)) && Number(timePart(index)) <= timeColumns[index].max }
const timeValid = computed(() => timeColumns.every((_, index) => validTimePart(index)))
function setTimePart(index, value) { if (props.disabled) return; const parts = timeColumns.map((_, part) => timePart(part)); parts[index] = value; emit('update:clock', parts.join(':')) }
function selectTimePartForTyping(event) { if (/^\d$/.test(event.key ?? event.data ?? '') && event.currentTarget.value.length === 2) event.currentTarget.select() }
function pasteClock(event) { const value = event.clipboardData?.getData('text')?.trim(); if (props.disabled || !/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) return; event.preventDefault(); emit('update:clock', value.length === 5 ? `${value}:00` : value) }
function normalizeTimePart(index) { if (validTimePart(index) && timePart(index).length === 1) setTimePart(index, timePart(index).padStart(2, '0')) }
function stepTimePart(index, delta) { const size = timeColumns[index].max + 1; const current = validTimePart(index) ? Number(timePart(index)) : 0; setTimePart(index, String((current + delta + size) % size).padStart(2, '0')) }
function finishTime() { if (props.disabled || !timeValid.value) return; emit('update:clock', timeColumns.map((_, index) => timePart(index).padStart(2, '0')).join(':')); closeTime() }
function setNow() { const now = new Date(); emit('update:clock', `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`); emit('update:date', dayKey(now)); closeTime() }
async function focusDay() { await nextTick(); root.value?.querySelector(`[data-day="${focusedDay.value}"]`)?.focus() }
function toggleCalendar() { timeOpen.value = false; if (calendarOpen.value) { closeCalendar(); return }; let current = new Date(`${props.date}T12:00:00`); if (!Number.isFinite(current.getTime())) current = new Date(); year.value = current.getFullYear(); month.value = current.getMonth(); focusedDay.value = current.getDate(); calendarOpen.value = true; focusDay() }
function closeCalendar() { calendarOpen.value = false; dateTrigger.value?.focus() }
async function toggleTime() { calendarOpen.value = false; if (timeOpen.value) { closeTime(); return }; timeOpen.value = true; await nextTick(); root.value?.querySelector('[data-time-part="0"]')?.focus() }
function closeTime() { timeOpen.value = false; timeTrigger.value?.focus() }
function closePopovers(event) { if (!calendarOpen.value && !timeOpen.value) return; event.stopPropagation(); event.preventDefault(); if (calendarOpen.value) closeCalendar(); else closeTime() }
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.reward-datetime { color: var(--ink); }
.field-label small { color: var(--ink-60); }
.date-input, .clock-input { border: 1px solid var(--line); background: var(--surface); border-radius: 10px; transition: border-color .16s, box-shadow .16s; }
input { appearance: none; background: transparent; color: var(--ink); border: 0; outline: none; }
.date-input:focus-within, .clock-input:focus-within { border-color: var(--tea); outline: 2px solid var(--tea); outline-offset: 2px; }
button { appearance: none; border: 0; border-radius: 8px; color: var(--ink); background: transparent; cursor: pointer; }
button:hover:not(:disabled) { background: var(--paper); }
button:focus-visible { outline: 2px solid var(--tea); outline-offset: 1px; }
button:disabled, input:disabled { opacity: .5; cursor: not-allowed; }
.calendar, .time-popover { border: 1px solid var(--line); border-radius: 16px; background: var(--surface); box-shadow: 0 18px 48px -16px rgba(73,59,44,.25), 0 3px 10px -5px rgba(73,59,44,.1); }
.calendar-week { color: var(--ink-60); }
.calendar-days .today { box-shadow: inset 0 0 0 1px var(--line); }
.calendar-days .selected { background: var(--tea); color: var(--cream); }
.today-button { border-top: 1px solid var(--line); border-radius: 0; }
.clock-input button[aria-expanded="true"] { background: var(--tea); color: var(--cream); }
.clock-input:has(input[aria-invalid="true"]) { border-color: var(--rouge); }
.time-popover { animation: time-reveal .16s ease-out; }
.time-title small { border: 1px solid var(--line); border-radius: 99px; color: var(--ink-60); }
.time-description, .time-hint, .time-column small { color: var(--ink-60); }
.time-column { border: 1px solid var(--line); border-radius: 12px; background: var(--cream); transition: border-color .16s, box-shadow .16s; }
.time-column:focus-within { border-color: var(--tea); box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--tea); }
.time-column input { text-align: center; font-variant-numeric: tabular-nums; caret-color: var(--tea); }
.time-column input::selection, .clock-segments input::selection { color: var(--cream); background: var(--tea); }
.time-column:has(input[aria-invalid="true"]) { border-color: var(--rouge); }
.time-column-label { color: var(--ink); }
.time-hint.is-invalid { color: var(--rouge); }
.time-foot { border-top: 1px solid var(--line); }
.now-button { color: var(--ink); }
.done-button { background: var(--tea); color: var(--cream); }
.done-button:hover:not(:disabled) { background: var(--ink); }
@keyframes time-reveal { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { button, .date-input, .clock-input, .time-column { transition: none; } .time-popover { animation: none; } }
</style>
<style scoped src="./rewardDateTimePickerDesktop.css"></style>
<style scoped src="./rewardDateTimePickerMobile.css"></style>
