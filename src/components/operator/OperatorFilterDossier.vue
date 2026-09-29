<template>
  <div
    class="prof-filter current-prof-filter operator-filter-dossier"
    role="search"
    :aria-label="`筛选${contextLabel}`"
  >
    <div class="current-filter-head">
      <div class="current-filter-title">
        <strong>{{ title }}</strong>
        <span>{{ description }}</span>
      </div>
      <div class="current-filter-tools">
        <span class="current-filter-result" aria-live="polite">
          <b>{{ resultCount }}</b> / {{ totalCount }} 位
        </span>
        <slot name="primary-tool">
          <label v-if="searchable" class="current-filter-search">
            <Search :size="13" aria-hidden="true" />
            <span class="sr-only">搜索{{ contextLabel }}</span>
            <input
              :value="searchQuery"
              type="search"
              autocomplete="off"
              :placeholder="searchPlaceholder"
              @input="$emit('update:searchQuery', $event.target.value)"
            />
          </label>
        </slot>
        <button
          v-if="hasFilters"
          class="current-filter-reset"
          type="button"
          @click="$emit('reset')"
        >
          <RotateCcw :size="13" aria-hidden="true" />重置
        </button>
        <slot name="secondary-tool" />
      </div>
    </div>

    <div class="current-filter-rows">
      <div class="pf-row pf-prof-row">
        <span class="pf-label">属性</span>
        <div class="mf-filter" role="group" :aria-label="`按属性筛选${contextLabel}`">
          <button
            type="button"
            :aria-pressed="profFilter === 'all'"
            :class="{ on: profFilter === 'all' }"
            @click="$emit('update:profFilter', 'all')"
          >
            全部
          </button>
          <button
            v-for="prof in profOptions"
            :key="prof"
            type="button"
            :aria-pressed="profFilter === prof"
            :class="{ on: profFilter === prof }"
            @click="$emit('update:profFilter', prof)"
          >
            <img v-if="profIcon(prof)" :src="profIcon(prof)" alt="" aria-hidden="true" />{{ prof }}
          </button>
        </div>
      </div>

      <div class="pf-row pf-subprof-row">
        <span class="pf-label">职业</span>
        <div class="mf-filter" role="group" :aria-label="`按职业筛选${contextLabel}`">
          <button
            type="button"
            :aria-pressed="subProfFilter === 'all'"
            :class="{ on: subProfFilter === 'all' }"
            @click="$emit('update:subProfFilter', 'all')"
          >
            全部
          </button>
          <button
            v-for="subProf in subProfOptions"
            :key="subProf"
            type="button"
            :aria-pressed="subProfFilter === subProf"
            :class="{ on: subProfFilter === subProf }"
            @click="$emit('update:subProfFilter', subProf)"
          >
            {{ subProf }}
          </button>
        </div>
      </div>

      <div v-if="rarityOptions.length" class="pf-row pf-rarity-row">
        <span class="pf-label">品质</span>
        <div class="mf-filter rarity-filter" role="group" :aria-label="`按品质筛选${contextLabel}`">
          <button
            v-for="option in rarityOptions"
            :key="option.value"
            type="button"
            :aria-pressed="rarityFilter === option.value"
            :class="[option.value === 'all' ? '' : 'rarity-r' + option.value, { on: rarityFilter === option.value }]"
            @click="$emit('update:rarityFilter', option.value)"
          >{{ option.label }}</button>
        </div>
      </div>

      <div class="pf-row pf-status-row">
        <span class="pf-label">状态</span>
        <div class="mf-filter current-status-filter" role="group" :aria-label="`按养成状态筛选${contextLabel}`">
          <button
            v-for="option in statusOptions"
            :key="option.value"
            type="button"
            :aria-pressed="statusFilter === option.value"
            :class="['status-' + option.value, { on: statusFilter === option.value }]"
            @click="$emit('update:statusFilter', option.value)"
          >
            {{ option.label }}<small>{{ statusCount(option.value) }}</small>
          </button>
        </div>
      </div>

      <div v-if="showGrowthFilters" class="growth-filter-presets" role="group" aria-label="养成快捷预设">
        <span>快捷预设</span>
        <button
          v-for="preset in growthPresets"
          :key="preset.label"
          type="button"
          :class="{ on: presetActive(preset) }"
          :aria-pressed="presetActive(preset)"
          @click="applyPreset(preset)"
        >{{ preset.label }}</button>
      </div>

      <details v-if="showGrowthFilters" class="current-growth-filter">
        <summary>自定义范围 <span v-if="growthFilterError">范围有误</span><span v-else-if="growthFilterActive">已启用</span><span v-else-if="growthFilterConfigured">已保存</span></summary>
        <div class="growth-filter-fields">
          <fieldset v-for="range in growthRanges" :key="range.key" class="growth-filter-range" :class="{ 'is-enabled': growthFilters[range.key + 'Enabled'], 'is-paused': range.key === 'star' && growthFilters.onlyAwakened }">
            <legend>{{ range.label }}<small v-if="range.key === 'star'">（不含觉醒）</small></legend>
            <label class="growth-filter-enable">
              <input type="checkbox" :checked="growthFilters[range.key + 'Enabled']" :disabled="range.key === 'star' && growthFilters.onlyAwakened" :aria-label="`启用${range.label}筛选`" @change="toggleRange(range.key, $event)" />
              启用
            </label>
            <div class="growth-filter-bounds">
              <label>
                <span>至少</span>
                <input :value="growthFilters[range.key + 'Min']" type="number" inputmode="numeric" :min="range.min" :max="range.max" step="1" :disabled="range.key === 'star' && growthFilters.onlyAwakened" :aria-label="`${range.label}至少`" placeholder="不限" @input="updateBound(range.key + 'Min', range, $event)" />
              </label>
              <span aria-hidden="true">—</span>
              <label>
                <span>至多</span>
                <input :value="growthFilters[range.key + 'Max']" type="number" inputmode="numeric" :min="range.min" :max="range.max" step="1" :disabled="range.key === 'star' && growthFilters.onlyAwakened" :aria-label="`${range.label}至多`" placeholder="不限" @input="updateBound(range.key + 'Max', range, $event)" />
              </label>
            </div>
          </fieldset>
          <label class="growth-awakened">
            <input type="checkbox" :checked="growthFilters.onlyAwakened" @change="updateAwakened" />
            仅看觉醒
          </label>
        </div>
        <p v-if="growthFilters.onlyAwakened" class="growth-filter-note">觉醒筛选期间暂停星数范围，取消后恢复原条件。</p>
        <p v-if="growthFilterError" class="growth-filter-error" role="alert">{{ growthFilterError }}</p>
      </details>
    </div>

    <slot name="footer" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RotateCcw, Search } from '@lucide/vue'
import { OPERATOR_LEVEL_MAX, OPERATOR_ELITE_MAX } from '../../utils/operatorGrowthRules.js'

const props = defineProps({
  title: { type: String, default: '筛选案卷' },
  description: { type: String, default: '' },
  contextLabel: { type: String, default: '当前养成' },
  resultCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  rarityOptions: { type: Array, default: function () { return [] } },
  profOptions: { type: Array, default: function () { return [] } },
  subProfOptions: { type: Array, default: function () { return [] } },
  statusOptions: { type: Array, default: function () { return [] } },
  statusCounts: { type: Object, default: function () { return {} } },
  rarityFilter: { type: [String, Number], default: 'all' },
  profFilter: { type: String, default: 'all' },
  subProfFilter: { type: String, default: 'all' },
  statusFilter: { type: String, default: 'all' },
  profIcon: { type: Function, default: function () { return '' } },
  searchable: Boolean,
  searchQuery: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '搜索名称 / 别名 / ID' },
  hasFilters: Boolean,
  growthFilters: { type: Object, default: function () { return {} } },
  growthFilterActive: Boolean,
  growthFilterConfigured: Boolean,
  showGrowthFilters: Boolean,
})

const emit = defineEmits([
  'update:rarityFilter',
  'update:profFilter',
  'update:subProfFilter',
  'update:statusFilter',
  'update:searchQuery',
  'update:growthFilters',
  'reset',
])

const growthRanges = [
  { key: 'level', label: '等级', min: 0, max: OPERATOR_LEVEL_MAX },
  { key: 'elite', label: '修为', min: 0, max: OPERATOR_ELITE_MAX },
  { key: 'star', label: '星数', min: 1, max: 5 },
]
const growthPresets = [
  { key: 'level', label: '等级 100', min: '100', max: '100' },
  { key: 'elite', label: '修为 17', min: '17', max: '17' },
  { key: 'star', label: '二星以上', min: '2', max: '' },
  { key: 'star', label: '四星以上', min: '4', max: '' },
]

const growthFilterError = computed(function () {
  for (const range of growthRanges) {
    if (!props.growthFilters[range.key + 'Enabled'] || (range.key === 'star' && props.growthFilters.onlyAwakened)) continue
    const min = props.growthFilters[range.key + 'Min']
    const max = props.growthFilters[range.key + 'Max']
    if (min !== '' && min != null && max !== '' && max != null && Number(min) > Number(max)) {
      return `${range.label}下限不能大于上限`
    }
  }
  return ''
})

function updateBound(field, range, event) {
  const raw = event.target.value
  const number = Number(raw)
  const value = raw === '' || !Number.isFinite(number)
    ? ''
    : String(Math.min(range.max, Math.max(range.min, Math.trunc(number))))
  event.target.value = value
  emit('update:growthFilters', { ...props.growthFilters, [field]: value })
}

function toggleRange(key, event) {
  emit('update:growthFilters', { ...props.growthFilters, [key + 'Enabled']: event.target.checked })
}

function presetActive(preset) {
  return Boolean(props.growthFilters[preset.key + 'Enabled']) &&
    !(preset.key === 'star' && props.growthFilters.onlyAwakened) &&
    props.growthFilters[preset.key + 'Min'] === preset.min &&
    props.growthFilters[preset.key + 'Max'] === preset.max
}

function applyPreset(preset) {
  if (presetActive(preset)) {
    emit('update:growthFilters', { ...props.growthFilters, [preset.key + 'Enabled']: false })
    return
  }
  emit('update:growthFilters', {
    ...props.growthFilters,
    [preset.key + 'Min']: preset.min,
    [preset.key + 'Max']: preset.max,
    [preset.key + 'Enabled']: true,
    onlyAwakened: preset.key === 'star' ? false : props.growthFilters.onlyAwakened,
  })
}

function updateAwakened(event) {
  emit('update:growthFilters', { ...props.growthFilters, onlyAwakened: event.target.checked })
}

function statusCount(value) {
  return value === 'all' ? props.totalCount : (Number(props.statusCounts[value]) || 0)
}
</script>

<style scoped>
.operator-filter-dossier {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 10px;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.current-filter-head {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px;
  border-bottom: 1px dashed var(--line);
  background: var(--cream);
}
.current-filter-title {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}
.current-filter-title strong {
  flex: none;
  color: var(--tea);
  font-family: var(--font-s);
  font-size: 13px;
  font-weight: 900;
}
.current-filter-title span {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-35);
  font-size: 10.5px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current-filter-tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}
.current-filter-result {
  color: var(--ink-60);
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
}
.current-filter-result b {
  color: var(--accent-strong);
  font: 900 13px var(--font-d);
}
.current-filter-search {
  display: inline-flex;
  width: clamp(150px, 20vw, 220px);
  min-height: 30px;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink-35);
}
.current-filter-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(215, 137, 53, 0.13);
}
.current-filter-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  padding: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font: 11px var(--font-b);
}
.current-filter-reset {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink-60);
  font: 800 10px var(--font-b);
  cursor: pointer;
}
.current-filter-reset:hover {
  border-color: var(--accent);
  color: var(--accent-strong);
}
.current-filter-reset:focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 2px;
}
.current-filter-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 11px 14px 12px;
}
.pf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pf-label {
  display: inline-flex;
  min-width: 34px;
  min-height: 28px;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--tea);
  font: 800 11px var(--font-b);
}
.mf-filter {
  display: inline-flex;
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(73, 59, 44, 0.06);
}
.mf-filter button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 0;
  border-radius: 7px;
  padding: 6px 12px;
  background: transparent;
  color: var(--ink-60);
  font: 700 12px var(--font-b);
  cursor: pointer;
  transition: background-color 0.2s var(--ease), color 0.2s var(--ease), box-shadow 0.2s var(--ease);
}
.mf-filter button:hover:not(.on) { color: var(--ink); }
.mf-filter button.on {
  background: var(--surface);
  color: var(--accent-strong);
  box-shadow: 0 1px 4px rgba(73, 59, 44, 0.16);
}
.rarity-filter button.rarity-r3.on { background: color-mix(in srgb, #99b5cf 34%, var(--surface)); color: #47647d; }
.rarity-filter button.rarity-r4.on { background: color-mix(in srgb, #8672b2 25%, var(--surface)); color: #62508b; }
.rarity-filter button.rarity-r5.on { background: color-mix(in srgb, var(--yellow) 62%, var(--surface)); color: var(--accent-strong); }
.mf-filter button:focus-visible {
  outline: 2px solid var(--brand-blue);
  outline-offset: 1px;
}
.mf-filter button img {
  width: 14px;
  height: 14px;
  flex: none;
  object-fit: contain;
}
.current-status-filter button small {
  margin-left: 2px;
  color: var(--ink-35);
  font: 800 9px var(--font-d);
}
.current-status-filter button.on small { color: currentColor; opacity: 0.72; }
.current-status-filter button.status-growing.on { background: #bfdcc0; color: #315f38; }
.current-status-filter button.status-graduated.on { background: var(--yellow); color: var(--ink); }
.current-status-filter button.status-inactive.on { background: rgba(73, 59, 44, 0.13); color: var(--ink-60); }
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
.growth-filter-range.is-paused { border-color: var(--line); background: var(--surface); }
.growth-filter-range legend { padding: 0 4px; color: var(--tea); font: 800 11px var(--font-b); }
.growth-filter-range legend small { color: var(--ink-60); font-size: 10px; }
.growth-filter-enable { display: inline-flex; width: fit-content; min-height: 30px; align-items: center; gap: 5px; color: var(--tea); font: 800 11px var(--font-b); cursor: pointer; }
.growth-filter-enable input { width: 16px; height: 16px; accent-color: var(--accent); }
.growth-filter-bounds { display: flex; align-items: center; gap: 5px; }
.growth-filter-bounds label { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-60); font: 700 11px var(--font-b); }
.growth-filter-bounds input { width: 63px; min-height: 34px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 7px; padding: 4px 6px; background: var(--surface); color: var(--ink); font: 700 12px var(--font-d); }
.growth-filter-range input:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px; }
.growth-awakened { display: inline-flex; min-height: 34px; align-items: center; gap: 5px; color: var(--tea); font: 800 11px var(--font-b); cursor: pointer; }
.growth-awakened input { width: 16px; height: 16px; accent-color: var(--accent); }
.growth-filter-note { margin: 5px 0 0; color: var(--ink-60); font: 700 10.5px var(--font-b); }
.growth-filter-error { margin: 6px 0 0; color: var(--rouge); font: 700 11px var(--font-b); }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

@media (max-width: 640px) {
  .current-filter-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    padding: 8px 9px;
  }
  .current-filter-title { display: block; }
  .current-filter-title span { display: none; }
  .current-filter-tools {
    width: auto;
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
  }
  .current-filter-result { font-size: 9.5px; }
  .current-filter-result b { font-size: 12px; }
  .current-filter-search {
    width: min(100%, 180px);
    min-height: 32px;
    order: 3;
  }
  .current-filter-reset {
    min-height: 32px;
    gap: 3px;
    padding: 3px 6px;
    font-size: 9.5px;
  }
  .current-filter-rows { gap: 5px; padding: 7px 8px 8px; }
  .pf-row {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: center;
    gap: 5px;
  }
  .pf-label {
    width: 32px;
    min-height: 34px;
    box-sizing: border-box;
    padding: 2px 0;
    font-size: 10.5px;
  }
  .mf-filter {
    display: grid;
    width: 100%;
    box-sizing: border-box;
    gap: 3px;
    padding: 3px;
  }
  .pf-rarity-row .mf-filter { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .pf-prof-row .mf-filter { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .pf-subprof-row .mf-filter { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .pf-status-row .mf-filter { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .mf-filter button {
    width: 100%;
    min-width: 0;
    min-height: 34px;
    gap: 2px;
    padding: 4px 2px;
    border-radius: 6px;
    font-size: 10.5px;
    line-height: 1;
    white-space: nowrap;
    touch-action: manipulation;
  }
  .pf-prof-row .mf-filter button img { display: none; }
  .growth-filter-presets > span { flex-basis: 100%; }
  .growth-filter-presets button { min-height: 44px; }
  .growth-filter-fields { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .current-growth-filter summary { min-height: 44px; }
  .growth-filter-enable { min-height: 44px; }
  .growth-filter-bounds input { width: 58px; min-height: 44px; }
  .growth-awakened { min-height: 44px; }
}
</style>
