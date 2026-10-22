<template>
  <div class="operator-growth-filters">
    <div class="growth-filter-presets" role="group" aria-label="养成快捷预设">
      <span>快捷预设</span>
      <button
        v-for="preset in presets"
        :key="preset.label"
        type="button"
        :class="{ on: isActive(preset) }"
        :aria-pressed="isActive(preset)"
        @click="apply(preset)"
      >{{ preset.label }}</button>
    </div>
    <details class="current-growth-filter">
      <summary>自定义范围 <span v-if="growthFilterError">范围有误</span><span v-else-if="growthFilterActive">已启用</span><span v-else-if="growthFilterConfigured">已保存</span></summary>
      <div class="growth-filter-fields">
        <fieldset v-for="range in ranges" :key="range.key" class="growth-filter-range" :class="{ 'is-enabled': modelValue[range.key + 'Enabled'] }">
          <legend>{{ range.label }}</legend>
          <label class="growth-filter-enable">
            <input type="checkbox" :checked="modelValue[range.key + 'Enabled']" :aria-label="`启用${range.label}筛选`" @change="toggleRange(range.key, $event)" />
            启用
          </label>
          <div class="growth-filter-bounds">
            <label>
              <span>至少</span>
              <input :value="modelValue[range.key + 'Min']" type="number" inputmode="numeric" :min="range.min" :max="range.max" step="1" :aria-label="`${range.label}至少`" placeholder="不限" @input="updateBound(range.key + 'Min', range, $event)" />
            </label>
            <span aria-hidden="true">—</span>
            <label>
              <span>至多</span>
              <input :value="modelValue[range.key + 'Max']" type="number" inputmode="numeric" :min="range.min" :max="range.max" step="1" :aria-label="`${range.label}至多`" placeholder="不限" @input="updateBound(range.key + 'Max', range, $event)" />
            </label>
          </div>
        </fieldset>
      </div>
      <label>觉醒确认 <select :value="modelValue.awakened || ''" aria-label="觉醒确认筛选" @change="$emit('update:modelValue', { ...modelValue, awakened: $event.target.value })"><option value="">不限</option><option value="true">已觉醒</option><option value="false">未觉醒</option><option value="unknown">待确认</option></select></label>
      <p v-if="growthFilterError" class="growth-filter-error" role="alert">{{ growthFilterError }}</p>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { OPERATOR_LEVEL_MAX, OPERATOR_ELITE_MAX } from '../../utils/operatorGrowthRules.js'
import { hasActiveOperatorGrowthFilters } from '../../utils/operatorFilters.js'

const props = defineProps({ modelValue: { type: Object, required: true } })
const emit = defineEmits(['update:modelValue'])

const ranges = [
  { key: 'level', label: '等级', min: 0, max: OPERATOR_LEVEL_MAX },
  { key: 'elite', label: '修为', min: 0, max: OPERATOR_ELITE_MAX },
  { key: 'star', label: '星数', min: 1, max: 5 },
]
const presets = [
  { key: 'level', label: '等级 100', min: '100', max: '100' },
  { key: 'elite', label: '修为 17', min: '17', max: '17' },
  { key: 'star', label: '二星以上', min: '2', max: '' },
  { key: 'star', label: '四星以上', min: '4', max: '' },
  { key: 'awakened', label: '只看觉醒', value: 'true' },
]

const growthFilterActive = computed(() => hasActiveOperatorGrowthFilters(props.modelValue))
const growthFilterConfigured = computed(() => Object.values(props.modelValue).some(Boolean))
const growthFilterError = computed(function () {
  for (const range of ranges) {
    if (!props.modelValue[range.key + 'Enabled']) continue
    const min = props.modelValue[range.key + 'Min']
    const max = props.modelValue[range.key + 'Max']
    if (min !== '' && min != null && max !== '' && max != null && Number(min) > Number(max)) {
      return `${range.label}下限不能大于上限`
    }
  }
  return ''
})

function isActive(preset) {
  if (preset.key === 'awakened') return props.modelValue.awakened === preset.value
  return Boolean(props.modelValue[preset.key + 'Enabled']) &&
    props.modelValue[preset.key + 'Min'] === preset.min &&
    props.modelValue[preset.key + 'Max'] === preset.max
}

function apply(preset) {
  if (preset.key === 'awakened') return emit('update:modelValue', { ...props.modelValue, awakened: isActive(preset) ? '' : preset.value })
  emit('update:modelValue', {
    ...props.modelValue,
    [preset.key + 'Min']: preset.min,
    [preset.key + 'Max']: preset.max,
    [preset.key + 'Enabled']: !isActive(preset),
  })
}

function updateBound(field, range, event) {
  const raw = event.target.value
  const number = Number(raw)
  const value = raw === '' || !Number.isFinite(number)
    ? ''
    : String(Math.min(range.max, Math.max(range.min, Math.trunc(number))))
  event.target.value = value
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

function toggleRange(key, event) {
  emit('update:modelValue', { ...props.modelValue, [key + 'Enabled']: event.target.checked })
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.growth-filter-presets { border-top: 1px dashed var(--line); }
.growth-filter-presets > span { color: var(--theme-strong-text, var(--tea)); }
.growth-filter-presets button { border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
.growth-filter-presets button:hover:not(.on) { border-color: var(--accent); background: var(--cream); color: var(--theme-accent-text, var(--accent-strong)); }
.growth-filter-presets button.on { border-color: var(--tea); background: var(--tea); color: var(--on-strong); }
.growth-filter-presets button:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.current-growth-filter summary { color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
.current-growth-filter summary span { color: var(--theme-accent-text, var(--accent-strong)); }
.current-growth-filter summary:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 3px; }
.growth-filter-range { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.growth-filter-range.is-enabled { border-color: var(--accent); background: var(--cream); }
.growth-filter-range legend { color: var(--theme-strong-text, var(--tea)); }
.growth-filter-range legend small { color: var(--ink-60); }
.growth-filter-enable { color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
.growth-filter-enable input { accent-color: var(--accent); }
.growth-filter-bounds label { color: var(--ink-60); }
.growth-filter-bounds input { border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); }
.growth-filter-range input:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 1px; }
.growth-filter-error { color: var(--theme-danger-text, var(--rouge)); }
</style>
<style scoped src="./operatorGrowthFiltersDesktop.css"></style>
<style scoped src="./operatorGrowthFiltersMobile.css"></style>
