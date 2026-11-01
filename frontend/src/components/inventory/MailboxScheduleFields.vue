<template>
  <section class="mail-schedule">
    <h4>{{ title }}</h4>
    <slot />
    <div class="schedule-overview">
      <p class="schedule-state"><span v-if="modelValue" class="schedule-countdown">剩余 {{ daysLeft }} 天</span><span>{{ !modelValue ? '月卡未开启' : editing && needsConfirmation ? '设置中' : daysLeft > 0 ? '自动累计中' : '已停止累计，已有邮件保留' }}</span></p>
      <button v-if="!modelValue" type="button" class="schedule-action" :aria-label="`${title}设置自动累计`" @click="enable">月卡设置 <ChevronRight :size="16" aria-hidden="true" /></button>
      <button v-else type="button" class="schedule-action" :aria-label="`${title}月卡设置`" :aria-expanded="settingsOpen" :aria-controls="`${hintId}-settings`" @click="toggleSettings">{{ settingsOpen ? '收起设置' : '月卡设置' }} <ChevronRight :size="16" :class="{ 'is-expanded': settingsOpen }" aria-hidden="true" /></button>
    </div>
    <div v-if="modelValue" v-show="settingsOpen" :id="`${hintId}-settings`">
      <div v-if="editing" class="schedule-editor">
        <label class="schedule-days">月卡剩余天数
          <span class="schedule-number"><input ref="daysInput" v-model="remainingDays" type="number" min="1" :max="maximumDays" step="1" inputmode="numeric" :required="needsConfirmation" placeholder="例如 285" :aria-label="`${title}月卡剩余天数`" :aria-describedby="touched && daysError ? hintId : undefined" :aria-invalid="touched && !!daysError" @input="updateDays($event.target.value)" /><span>天</span></span>
        </label>
        <p v-if="touched && daysError" :id="hintId" class="schedule-error" role="alert">{{ daysError }}</p>
        <fieldset class="schedule-claim"><legend>今天的月卡邮件领了吗？</legend>
          <div class="schedule-options">
            <label v-for="option in claimOptions" :key="option.value" :class="{ selected: claimedToday === option.value }">
              <input v-model="claimedToday" type="radio" :name="hintId" :value="option.value" :required="needsConfirmation" :aria-label="`${title}${option.label}`" @change="setClaimedToday(option.value)" />{{ option.label }}
            </label>
          </div>
        </fieldset>
        <p class="schedule-note" aria-live="polite">{{ claimedToday === 'no' ? '今天这封会计入待领邮件；已累计过的不会重复增加。' : claimedToday === 'yes' ? '从明天开始累计；已有待领邮件不变。' : needsConfirmation ? '请选择今天的领取状态。' : '修改配置时，请确认今天的领取状态。' }}</p>
        <label v-if="coins && (coinOptions.length > 1 || !coinOptions.includes(modelValue.coins_per_mail))" class="schedule-reward">累计到哪组邮件
          <select :value="modelValue.coins_per_mail" :aria-label="`${title}自动累计单封奖励`" @change="touched = true; update('coins_per_mail', Number($event.target.value))"><option v-if="!coinOptions.includes(modelValue.coins_per_mail)" :value="modelValue.coins_per_mail" disabled>请选择累计分组</option><option v-for="amount in coinOptions" :key="amount" :value="amount">每封 {{ amount }} 白金币</option></select>
        </label>
      </div>
      <div class="schedule-footnote"><button type="button" class="schedule-action schedule-stop" :aria-label="`停止${title}自动累计`" @click="stop">停止累计</button></div>
    </div>
  </section>
</template>
<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { addCalendarDays } from '../../utils/businessDay.js'
const props = defineProps({ modelValue: { type: Object, default: null }, title: String, today: String, coinOptions: { type: Array, default: () => [] }, coins: Boolean })
const emit = defineEmits(['update:modelValue', 'status'])
const editing = ref(!!props.modelValue && !props.modelValue.end_date)
const settingsOpen = ref(editing.value)
const remainingDays = ref(''), claimedToday = ref(''), touched = ref(false), daysInput = ref(null)
const hintId = useId()
const claimOptions = [{ value: 'no', label: '还没领取' }, { value: 'yes', label: '已经领取' }]
const daysLeft = computed(() => Math.max(0, Math.round((Date.parse(props.modelValue?.end_date) - Date.parse(props.today)) / 86400000)) || 0)
const maximumEnd = computed(() => {
  const year = Number(props.today.slice(0, 4)) + 10
  return addCalendarDays(`${year}${props.today.slice(4)}`, 0) || `${year}-02-28`
})
const maximumDays = computed(() => Math.round((Date.parse(maximumEnd.value) - Date.parse(props.today)) / 86400000))
const daysError = computed(() => {
  const days = Number(remainingDays.value)
  return Number.isInteger(days) && days >= 1 && days <= maximumDays.value ? '' : `请输入 1–${maximumDays.value} 的整数天数。`
})
const needsConfirmation = computed(() => editing.value && (touched.value || !props.modelValue?.end_date))
watch([editing, daysError, claimedToday, touched, needsConfirmation], () => emit('status', {
  editing: editing.value,
  valid: !needsConfirmation.value || !daysError.value && !!claimedToday.value,
  dirty: editing.value && touched.value
}), { immediate: true })
function update(key, value) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
function updateDays(value) {
  remainingDays.value = value
  touched.value = true
  update('end_date', daysError.value ? '' : addCalendarDays(props.today, Number(value)))
}
function setClaimedToday(value) {
  touched.value = true
  update('start_date', value === 'yes' ? addCalendarDays(props.today, 1) : props.today)
}
function toggleSettings() {
  if (!editing.value) edit()
  else settingsOpen.value = !settingsOpen.value
}
async function edit() {
  settingsOpen.value = true
  remainingDays.value = daysLeft.value || ''
  claimedToday.value = ''
  touched.value = false
  editing.value = true
  await nextTick()
  daysInput.value?.focus()
}
function enable() {
  emit('update:modelValue', { start_date: addCalendarDays(props.today, 1), end_date: '', ...(props.coins ? { coins_per_mail: props.coinOptions[0] || 90 } : {}) })
  edit()
}
function stop() {
  editing.value = false
  touched.value = false
  emit('update:modelValue', null)
}
</script>
<style scoped>
.mail-schedule { min-width: 0; }
.schedule-overview, .schedule-footnote { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; }
.mail-schedule h4 { margin: 0; font: 750 21px/1.5 var(--font-s); }
.schedule-action { display: inline-flex; align-items: center; justify-content: center; gap: 3px; padding: 6px 0; border: 0; background: transparent; color: var(--theme-strong-text, var(--tea)); font: 14px/1.5 var(--font-b); cursor: pointer; flex-shrink: 0; }
.schedule-action .is-expanded { transform: rotate(-90deg); }
.schedule-overview { margin-top: 14px; padding: 8px 12px; border-radius: 8px; background: var(--cream); }
.schedule-state { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 0; color: var(--ink-60); font-size: 13px; line-height: 1.6; }
.schedule-countdown { font-variant-numeric: tabular-nums; }
.schedule-editor { display: grid; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
.schedule-days, .schedule-reward { display: grid; gap: 6px; font-size: 14px; }
.schedule-number { display: flex; align-items: center; width: min(100%, 250px); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.schedule-number input[type=number] { border: 0; border-radius: 0; width: 100%; min-width: 0; min-height: 42px; padding: 8px 12px; background: var(--surface); color: var(--ink); font: 22px var(--font-d); }
.schedule-number > span { padding: 10px 14px; border-left: 1px solid var(--line); }
.schedule-number:focus-within { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.schedule-claim { margin: 0; padding: 0; border: 0; min-width: 0; }
.schedule-claim legend { margin-bottom: 8px; font-size: 14px; }
.schedule-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.schedule-options label { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 6px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; cursor: pointer; }
.schedule-options label.selected { border-color: var(--theme-strong-text, var(--tea)); background: var(--cream); }
.schedule-options input[type=radio] { width: 18px; height: 18px; min-height: 0; margin: 0; padding: 0; flex: none; accent-color: var(--theme-control-bg, var(--tea)); }
.schedule-footnote { margin-top: 12px; }
.schedule-note { margin: 0; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.schedule-error { margin: 0; color: var(--theme-danger-text, var(--rouge)); font-size: 13px; }
.schedule-stop { font-size: 12px; color: var(--ink-60); }
:is(button, input, select):focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
.schedule-number input:focus-visible { outline: 0; }
@media (max-width: 380px) { .mail-schedule h4 { font-size: 18px; } .schedule-options label { gap: 5px; } }
</style>
