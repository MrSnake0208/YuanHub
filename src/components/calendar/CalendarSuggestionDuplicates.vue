<template>
  <section class="calendar-panel calendar-section calendar-suggestion-duplicates" aria-label="检查已有活动">
    <h3>检查已有活动</h3><p class="calendar-hint">按游戏和日期重叠查找，可能包含同名活动。提示不阻止提交，请核对是否重复。</p>
    <button type="button" :disabled="disabled || loading" @click="check">{{ loading ? '检查中…' : '检查已有活动' }}</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-else-if="checked" role="status">{{ entries.length ? `找到 ${entries.length} 条日期重叠的活动，请核对。` : '没有找到日期重叠的活动。' }}</p>
    <ul v-if="entries.length" class="calendar-overlap-list"><li v-for="entry in entries" :key="entry.id"><router-link class="calendar-source-link" :to="suggestionEventLink(entry)">{{ entry.title }}{{ entry.title === form.title.trim() ? '（同名）' : '' }}</router-link><p class="calendar-range">{{ calendarRangeLabel(entry) }}</p></li></ul>
  </section>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { listActivityCalendar } from '@/api/activityCalendar.js'
import { CALENDAR_GAMES, calendarRangeLabel, isCalendarDate, normalizeCalendarItems } from '@/data/activityCalendar.js'
import { suggestionEventLink } from '@/data/activityCalendarSuggestions.js'
const props = defineProps({ form: { type: Object, required: true }, disabled: Boolean })
const entries = ref([]), loading = ref(false), error = ref(''), checked = ref(false)
let generation = 0, alive = true
function reset() { generation++; entries.value = []; loading.value = false; error.value = ''; checked.value = false }
watch(() => [props.form.game, props.form.start_date, props.form.end_date], reset)
async function check() {
  if (props.disabled || loading.value) return
  reset()
  if (!CALENDAR_GAMES.includes(props.form.game) || !isCalendarDate(props.form.start_date) || !isCalendarDate(props.form.end_date) || props.form.end_date < props.form.start_date) { error.value = '请先填写游戏和有效的日期范围。'; return }
  const token = generation
  loading.value = true
  try {
    const result = await listActivityCalendar({ game: props.form.game, from: props.form.start_date, to: props.form.end_date })
    if (!alive || token !== generation) return
    entries.value = normalizeCalendarItems(result?.items); checked.value = true
  } catch (err) { if (alive && token === generation) error.value = err.message || '检查失败，可以重试。' }
  finally { if (alive && token === generation) loading.value = false }
}
onBeforeUnmount(() => { alive = false; generation++ })
</script>
