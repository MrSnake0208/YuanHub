<template>
  <div class="mail-schedule" :class="{ 'is-enabled': modelValue }">
    <div class="schedule-heading">
      <div><strong>自动累计</strong><p>每天增加 1 封</p></div>
      <button type="button" class="schedule-switch" role="switch" :aria-checked="!!modelValue" :aria-label="`${title}自动累计`" @click="toggle"><span /></button>
    </div>
    <template v-if="modelValue">
      <label v-if="coins && (coinOptions.length > 1 || !coinOptions.includes(modelValue.coins_per_mail))" class="schedule-reward">累计到哪组邮件
        <select :value="modelValue.coins_per_mail" :aria-label="`${title}自动累计单封奖励`" @change="update('coins_per_mail', Number($event.target.value))"><option v-if="!coinOptions.includes(modelValue.coins_per_mail)" :value="modelValue.coins_per_mail" disabled>请选择累计分组</option><option v-for="amount in coinOptions" :key="amount" :value="amount">每封 {{ amount }} 白金币</option></select>
      </label>
      <div class="schedule-dates">
        <label>首次累计日期<input type="date" :aria-label="`${title}首次累计日期`" :value="modelValue.start_date" :min="minimumStart || today" :max="maximumEnd" required @input="update('start_date', $event.target.value)" /></label>
        <label>截止日期（含当天）<input type="date" :aria-label="`${title}截止日期`" :value="modelValue.end_date" :min="modelValue.start_date" :max="maximumEnd" required @input="update('end_date', $event.target.value)" /></label>
      </div>
      <p v-if="modelValue.end_date && modelValue.end_date < today" class="schedule-preview">已到期，已有邮件保留。延长后从当前业务日继续，不补到期期间。</p>
      <p v-else-if="modelValue.start_date && modelValue.end_date" class="schedule-preview">{{ startLabel }}每天增加 1 封，{{ modelValue.end_date }} 后停止。</p>
      <p v-else class="schedule-preview">请选择截止日期，包含当天。</p>
      <p v-if="modelValue.start_date === today && !minimumStart" class="schedule-preview">今天会额外增加 1 封，请确认未包含在当前封数中。</p>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { addCalendarDays } from '../../utils/businessDay.js'
const props = defineProps({ modelValue: { type: Object, default: null }, title: String, today: String, minimumStart: String, coinOptions: { type: Array, default: () => [] }, coins: Boolean })
const emit = defineEmits(['update:modelValue'])
const maximumEnd = computed(() => `${Number(props.today.slice(0, 4)) + 10}${props.today.slice(4)}`)
const startLabel = computed(() => props.modelValue.start_date === addCalendarDays(props.today, 1) ? '从明天起' : `从 ${props.modelValue.start_date} 起`)
function update(key, value) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
function toggle() {
  emit('update:modelValue', props.modelValue ? null : { start_date: addCalendarDays(props.today, 1), end_date: '', ...(props.coins ? { coins_per_mail: props.coinOptions[0] || 90 } : {}) })
}
</script>
<style scoped>
.mail-schedule { min-width: 0; }
.mail-schedule.is-enabled { padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--paper) 48%, var(--surface)); }
.schedule-heading { display: flex; justify-content: space-between; align-items: center; gap: 14px; }
.schedule-heading strong { font-size: 16px; }
.schedule-heading p, .schedule-preview { color: var(--ink-60); font-size: 13px; line-height: 1.65; margin: 0; }
.schedule-switch { flex: none; width: 46px; height: 27px; min-height: 0; padding: 3px; border: 0; border-radius: 20px; background: var(--line); cursor: pointer; }
.schedule-switch span { display: block; width: 21px; height: 21px; border-radius: 50%; background: var(--surface); }
.schedule-switch[aria-checked=true] { background: var(--theme-control-bg, var(--tea)); }
.schedule-switch[aria-checked=true] span { transform: translateX(19px); background: var(--on-strong, #fff8ec); }
.schedule-dates { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; margin: 14px 0 10px; }
.schedule-dates label, .schedule-reward { display: grid; gap: 6px; min-width: 0; font-size: 14px; }
.schedule-reward { margin-top: 12px; }
.schedule-dates input, select { box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0; min-height: 42px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: 16px var(--font-b); }
:is(button, input, select):focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
@media (min-width: 768px) { .schedule-dates { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
