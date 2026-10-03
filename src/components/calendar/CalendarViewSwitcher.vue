<template>
  <div class="calendar-view-switcher" role="group" aria-label="日历视图">
    <button v-for="(label, view) in CALENDAR_VIEWS" :key="view" type="button" :aria-pressed="modelValue === view" @click="$emit('update:modelValue', view)">
      <component :is="icons[view]" :size="17" aria-hidden="true" /><span>{{ label }}</span>
    </button>
  </div>
</template>

<script setup>
import { CalendarDays, List, ChartNoAxesGantt } from '@lucide/vue'
import { CALENDAR_VIEWS } from '@/data/activityCalendar.js'
defineProps({ modelValue: { type: String, required: true } })
defineEmits(['update:modelValue'])
const icons = { agenda: List, timeline: ChartNoAxesGantt, month: CalendarDays }
</script>
