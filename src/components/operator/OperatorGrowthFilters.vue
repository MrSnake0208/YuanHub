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
          <legend>{{ range.label }}<small v-if="range.key === 'star'">（6 = 觉醒）</small></legend>
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
  { key: 'star', label: '星数', min: 1, max: 6 },
]
const presets = [
  { key: 'level', label: '等级 100', min: '100', max: '100' },
  { key: 'elite', label: '修为 17', min: '17', max: '17' },
  { key: 'star', label: '二星以上', min: '2', max: '' },
  { key: 'star', label: '四星以上', min: '4', max: '' },
  { key: 'star', label: '只看觉醒', min: '6', max: '6' },
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
  return Boolean(props.modelValue[preset.key + 'Enabled']) &&
    props.modelValue[preset.key + 'Min'] === preset.min &&
    props.modelValue[preset.key + 'Max'] === preset.max
}

function apply(preset) {
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
.growth-filter-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-top: 1px dashed var(--line); padding-top: 10px; }
.growth-filter-presets > span { margin-right: 2px; color: var(--tea); font: 800 11px var(--font-b); }
.growth-filter-presets button { min-height: 38px; border: 1px solid var(--line); border-radius: 999px; padding: 6px 13px; background: var(--surface); color: var(--tea); font: 800 11.5px var(--font-b); white-space: nowrap; cursor: pointer; }
.growth-filter-presets button:hover:not(.on) { border-color: var(--accent); background: var(--cream); color: var(--accent-strong); }
.growth-filter-presets button.on { border-color: var(--tea); background: var(--tea); color: var(--cream); }
.growth-filter-presets button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.current-growth-filter { padding-top: 4px; }
.current-growth-filter summary { display: flex; width: fit-content; min-height: 36px; align-items: center; gap: 4px; color: var(--tea); font: 800 11px var(--font-b); cursor: pointer; }
.current-growth-filter summary span { margin-left: 5px; color: var(--accent-strong); }
.current-growth-filter summary:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 3px; }
.growth-filter-fields { display: flex; flex-wrap: wrap; align-items: stretch; gap: 10px; padding-top: 10px; }
.growth-filter-range { display: flex; flex: 1 1 200px; min-width: 0; flex-direction: column; margin: 0; border: 1px solid var(--line); border-radius: 10px; padding: 4px 10px 10px; background: var(--surface); }
.growth-filter-range.is-enabled { border-color: var(--accent); background: var(--cream); }
.growth-filter-range legend { padding: 0 4px; color: var(--tea); font: 800 11px var(--font-b); }
.growth-filter-range legend small { color: var(--ink-60); font-size: 10px; }
.growth-filter-enable { display: inline-flex; width: fit-content; min-height: 30px; align-items: center; gap: 5px; color: var(--tea); font: 800 11px var(--font-b); cursor: pointer; }
.growth-filter-enable input { width: 16px; height: 16px; accent-color: var(--accent); }
.growth-filter-bounds { display: flex; align-items: center; gap: 5px; }
.growth-filter-bounds label { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-60); font: 700 11px var(--font-b); }
.growth-filter-bounds input { width: 63px; min-height: 34px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 7px; padding: 4px 6px; background: var(--surface); color: var(--ink); font: 700 12px var(--font-d); }
.growth-filter-range input:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px; }
.growth-filter-error { margin: 6px 0 0; color: var(--rouge); font: 700 11px var(--font-b); }
@media (max-width: 640px) {
  .growth-filter-presets > span { flex-basis: 100%; }
  .growth-filter-presets button { min-height: 44px; }
  .growth-filter-fields { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .current-growth-filter summary { min-height: 44px; }
  .growth-filter-enable { min-height: 44px; }
  .growth-filter-bounds input { width: 58px; min-height: 44px; }
}
</style>
