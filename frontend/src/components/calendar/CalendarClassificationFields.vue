<template>
  <label>一级分类 *<select :id="prefix + 'category'" :value="group" v-bind="attributes('category')" @change="setGroup($event.target.value)"><option v-if="!groups[group]" :value="group" disabled>待归类</option><option v-for="(label, key) in groups" :key="key" :value="key">{{ label }}</option></select><small v-if="errors.category" :id="prefix + 'error-category'">{{ errors.category }}</small></label>
  <label>二级分类 *<select :id="prefix + 'subtype'" :value="selectedSubtype" v-bind="attributes('subtype')" @change="setSubtype($event.target.value)"><option v-if="!display.key" value="" disabled>保留原分类：{{ display.label }}</option><option v-for="[key, type] in subtypes" :key="key" :value="key">{{ type.label }}</option></select><small v-if="errors.subtype" :id="prefix + 'error-subtype'">{{ errors.subtype }}</small></label>
  <p v-if="!display.key || display.preserved" class="calendar-wide calendar-hint">原编码：{{ display.original }}。保留原分类；主动选择新的分类后才修改。</p>
</template>

<script setup>
import { computed } from 'vue'
import { CALENDAR_DISPLAY_GROUPS, CALENDAR_SUBTYPES, calendarDisplay } from '@/data/activityCalendarTypes.js'
const props = defineProps({ form: { type: Object, required: true }, errors: { type: Object, default: () => ({}) }, prefix: { type: String, default: 'calendar-' } })
const groups = Object.fromEntries(Object.entries(CALENDAR_DISPLAY_GROUPS).filter(([key]) => key !== 'RECRUITMENT'))
const display = computed(() => calendarDisplay(props.form))
const group = computed(() => display.value.group)
const subtypes = computed(() => Object.entries(CALENDAR_SUBTYPES).filter(([, type]) => !type.legacy && type.group === group.value))
const selectedSubtype = computed(() => display.value.key)
const attributes = key => ({ 'aria-invalid': !!props.errors[key], 'aria-describedby': props.errors[key] ? props.prefix + 'error-' + key : undefined })
function setGroup(group) { setSubtype(Object.entries(CALENDAR_SUBTYPES).find(([, type]) => !type.legacy && type.group === group)?.[0]) }
function setSubtype(subtype) {
  const type = CALENDAR_SUBTYPES[subtype]
  if (!type || type.legacy) return
  Object.assign(props.form, { category: type.categories[0], subtype, subtype_detail: '' })
}
</script>
