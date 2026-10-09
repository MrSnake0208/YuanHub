<template>
  <div class="calendar-filters">
    <fieldset v-if="!lockGame">
      <legend>游戏</legend>
      <div class="calendar-chips">
        <button v-for="game in ['', ...games]" :key="game" type="button" :aria-pressed="filters.game === game" @click="emit('change', { game })">{{ game || '全部游戏' }}</button>
      </div>
    </fieldset>
    <fieldset>
      <legend>类型</legend>
      <div class="calendar-chips">
        <button type="button" :aria-pressed="!filters.category" @click="emit('change', { category: '' })">全部类型</button>
        <button v-for="(label, category) in categories" :key="category" type="button" :aria-pressed="filters.category === category" @click="emit('change', { category })">{{ label }}</button>
        <label class="calendar-check-row calendar-filter-exclude"><input type="checkbox" :checked="filters.exclude_recruitment" @change="emit('change', { exclude_recruitment: $event.target.checked })">不含招募</label>
      </div>
    </fieldset>
    <fieldset>
      <legend>时间状态</legend>
      <div class="calendar-chips">
        <button v-for="(label, status) in CALENDAR_TIME_FILTERS" :key="status" type="button" :aria-pressed="(filters.status || '') === status" @click="emit('change', { status })">{{ label }}</button>
      </div>
      <p class="calendar-hint">近 3 天结束：正在进行且距结束不超过 72 小时（北京时间）。</p>
    </fieldset>
  </div>
</template>

<script setup>
import { CALENDAR_TIME_FILTERS } from '@/data/activityCalendar.js'
defineProps({
  filters: { type: Object, required: true },
  lockGame: Boolean,
  games: { type: Array, required: true },
  categories: { type: Object, required: true },
})
const emit = defineEmits(['change'])
</script>
