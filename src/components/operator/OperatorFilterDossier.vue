<template>
  <div
    class="prof-filter current-prof-filter operator-filter-dossier"
    :class="{ 'is-compact': compact }"
    role="search"
    :aria-label="`筛选${contextLabel}`"
  >
    <div class="current-filter-head">
      <div class="current-filter-title">
        <strong>{{ title }}</strong>
        <span>{{ description }}</span>
      </div>
      <div class="current-filter-tools">
        <label v-if="compact && searchable" class="current-filter-search">
          <Search :size="13" aria-hidden="true" /><span class="sr-only">搜索{{ contextLabel }}</span>
          <input ref="searchInput" :value="searchQuery" type="search" autocomplete="off" :placeholder="searchPlaceholder" @input="$emit('update:searchQuery', $event.target.value)" />
        </label>
        <span class="current-filter-result" aria-live="polite">
          <b>{{ resultCount }}</b> / {{ totalCount }} 位
        </span>
        <slot name="primary-tool">
          <label v-if="searchable && !compact" class="current-filter-search">
            <Search :size="13" aria-hidden="true" />
            <span class="sr-only">搜索{{ contextLabel }}</span>
            <input
              ref="searchInput"
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
        <button v-if="compact" type="button" class="dossier-more" :aria-expanded="filtersOpen" :aria-controls="filtersId" @click="filtersOpen = !filtersOpen">
          更多筛选<template v-if="advancedFilterCount != null"><span v-if="advancedFilterCount"> · {{ advancedFilterCount }}</span></template><template v-else-if="hasFilters"> · 已启用</template>
        </button>
      </div>
    </div>

    <div class="current-filter-rows">
      <div v-show="!compact || filtersOpen" :id="filtersId" class="dossier-extra">
        <slot name="extra-filters" />
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

        <OperatorGrowthFilters v-if="showGrowthFilters && compact" :model-value="growthFilters" @update:model-value="$emit('update:growthFilters', $event)" />
      </div>

      <div class="pf-row pf-status-row">
        <span class="pf-label">{{ statusLabel }}</span>
        <div class="mf-filter current-status-filter" role="group" :aria-label="`按${statusLabel === '状态' ? '养成状态' : statusLabel}筛选${contextLabel}`">
          <template v-for="option in statusOptions" :key="option.value">
            <span v-if="option.separateGroup" class="status-group-break" aria-hidden="true"></span>
            <button
              type="button"
              :aria-pressed="statusFilter === option.value"
              :class="['status-' + option.value, { on: statusFilter === option.value }]"
              @click="$emit('update:statusFilter', option.value)"
            >
              {{ option.label }}<small>{{ statusCount(option.value) }}</small>
            </button>
          </template>
        </div>
      </div>

      <div v-if="tagOptions.length" class="pf-row pf-tag-row">
        <span class="pf-label">标签</span>
        <div class="mf-filter current-tag-filter" role="group" :aria-label="`按自定义标签筛选${contextLabel}`">
          <button type="button" :aria-pressed="!tagFilter" :class="{ on: !tagFilter }" @click="$emit('update:tagFilter', '')">全部<small>{{ totalCount }}</small></button>
          <button v-for="option in tagOptions" :key="option.value" type="button" :aria-pressed="tagFilter === option.value"
            :class="{ on: tagFilter === option.value }" @click="$emit('update:tagFilter', option.value)">{{ option.label }}<small>{{ option.count }}</small></button>
        </div>
      </div>

      <OperatorGrowthFilters v-if="showGrowthFilters && !compact" :model-value="growthFilters" @update:model-value="$emit('update:growthFilters', $event)" />
    </div>

    <slot name="footer" />
  </div>
</template>

<script setup>
import { ref, useId } from 'vue'
import { RotateCcw, Search } from '@lucide/vue'
import OperatorGrowthFilters from './OperatorGrowthFilters.vue'

const filtersOpen = ref(false)
const filtersId = useId()
const searchInput = ref(null)
defineExpose({ focusSearch: () => searchInput.value?.focus() })
const props = defineProps({
  compact: Boolean,
  title: { type: String, default: '筛选案卷' },
  description: { type: String, default: '' },
  contextLabel: { type: String, default: '当前养成' },
  resultCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  rarityOptions: { type: Array, default: function () { return [] } },
  profOptions: { type: Array, default: function () { return [] } },
  subProfOptions: { type: Array, default: function () { return [] } },
  statusOptions: { type: Array, default: function () { return [] } },
  statusLabel: { type: String, default: '状态' },
  statusCounts: { type: Object, default: function () { return {} } },
  tagOptions: { type: Array, default: () => [] },
  tagFilter: { type: String, default: '' },
  rarityFilter: { type: [String, Number], default: 'all' },
  profFilter: { type: String, default: 'all' },
  subProfFilter: { type: String, default: 'all' },
  statusFilter: { type: String, default: 'all' },
  profIcon: { type: Function, default: function () { return '' } },
  searchable: Boolean,
  searchQuery: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '搜索名称 / 别名 / ID' },
  hasFilters: Boolean,
  advancedFilterCount: { type: Number, default: null },
  growthFilters: { type: Object, default: function () { return {} } },
  showGrowthFilters: Boolean,
})

const emit = defineEmits([
  'update:rarityFilter',
  'update:profFilter',
  'update:subProfFilter',
  'update:statusFilter',
  'update:tagFilter',
  'update:searchQuery',
  'update:growthFilters',
  'reset',
])

function statusCount(value) {
  return value === 'all' ? props.totalCount : (Number(props.statusCounts[value]) || 0)
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.operator-filter-dossier {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.current-filter-head {
  border-bottom: 1px dashed var(--line);
  background: var(--cream);
}
.current-filter-title strong {
  color: var(--tea);
}
.current-filter-title span {
  color: var(--ink-35);
}
.current-filter-result {
  color: var(--ink-60);
}
.current-filter-result b {
  color: var(--accent-strong);
}
.current-filter-search {
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
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
}
.current-filter-reset {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink-60);
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
.pf-label {
  border: 0;
  background: transparent;
  color: var(--tea);
}
.mf-filter {
  border-radius: 10px;
  background: rgba(73, 59, 44, 0.06);
}
.mf-filter button {
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ink-60);
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
.status-group-break { border-top: 1px dashed var(--line); }
.current-status-filter button.status-discarded.on { background: var(--cream); color: var(--tea); box-shadow: inset 0 0 0 1px var(--tea); }
.current-status-filter button small {
  color: var(--ink-35);
}
.current-status-filter button.on small { color: currentColor; opacity: 0.72; }
.current-status-filter button.status-growing.on { background: #bfdcc0; color: #315f38; }
.current-status-filter button.status-graduated.on { background: var(--yellow); color: var(--ink); }
.current-status-filter button.status-inactive.on { background: rgba(73, 59, 44, 0.13); color: var(--ink-60); }

@media (max-width: 640px) {
  .mf-filter button {
    border-radius: 6px;
  }
}
.dossier-more { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); cursor: pointer; }
</style>
<style scoped src="./operatorFilterDossierDesktop.css"></style>
<style scoped src="./operatorFilterDossierMobile.css"></style>
