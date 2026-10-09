<template>
  <label>展示分组 *<select :id="prefix + 'category'" :value="group" v-bind="attributes('category')" @change="setGroup($event.target.value)"><option v-for="(label, key) in groups" :key="key" :value="key">{{ label }}</option></select><small v-if="errors.category" :id="prefix + 'error-category'">{{ errors.category }}</small></label>
  <label>细分类别<select :id="prefix + 'subtype'" :value="selectedSubtype" v-bind="attributes('subtype')" @change="setSubtype($event.target.value)"><option value="">未细分</option><option v-for="[key, type] in subtypes" :key="key" :value="key">{{ type.label }}</option></select><small v-if="errors.subtype" :id="prefix + 'error-subtype'">{{ errors.subtype }}</small></label>
  <label v-if="form.subtype === 'FURNITURE'">家具关联细目<select :id="prefix + 'subtype_detail'" v-model="form.subtype_detail" v-bind="attributes('subtype_detail')"><option value="">家具</option><option value="MYSTERIOUS_CAVE">神秘洞窟</option></select><small v-if="errors.subtype_detail" :id="prefix + 'error-subtype_detail'">{{ errors.subtype_detail }}</small></label>
  <p v-if="association" class="calendar-wide calendar-hint">{{ association }}；独立记录不会自动合并。</p>
</template>

<script setup>
import { computed } from 'vue'
import { CALENDAR_DISPLAY_GROUPS, CALENDAR_SUBTYPES, calendarDisplay } from '@/data/activityCalendarTypes.js'
const props = defineProps({ form: { type: Object, required: true }, errors: { type: Object, default: () => ({}) }, prefix: { type: String, default: 'calendar-' } })
const groups = Object.fromEntries(Object.entries(CALENDAR_DISPLAY_GROUPS).filter(([key]) => key !== 'RECRUITMENT'))
const group = computed(() => calendarDisplay(props.form).group)
const subtypes = computed(() => Object.entries(CALENDAR_SUBTYPES).filter(([, type]) => type.group === group.value))
const selectedSubtype = computed(() => props.form.subtype || ({ LOGIN: 'SIGN_IN', MAINTENANCE: 'MAINTENANCE' })[props.form.category] || '')
const association = computed(() => calendarDisplay(props.form).association)
const attributes = key => ({ 'aria-invalid': !!props.errors[key], 'aria-describedby': props.errors[key] ? props.prefix + 'error-' + key : undefined })
function setGroup(category) { Object.assign(props.form, { category, subtype: '', subtype_detail: '' }) }
function setSubtype(subtype) {
  const type = CALENDAR_SUBTYPES[subtype]
  if (type && !type.categories.includes(props.form.category)) props.form.category = type.categories[0]
  if (!subtype) props.form.category = group.value
  Object.assign(props.form, { subtype, subtype_detail: '' })
}
</script>
