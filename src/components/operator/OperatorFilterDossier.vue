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
    </div>

    <slot name="footer" />
  </div>
</template>

<script setup>
import { RotateCcw, Search } from '@lucide/vue'

const props = defineProps({
  title: { type: String, default: '筛选案卷' },
  description: { type: String, default: '' },
  contextLabel: { type: String, default: '当前养成' },
  resultCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  profOptions: { type: Array, default: function () { return [] } },
  subProfOptions: { type: Array, default: function () { return [] } },
  statusOptions: { type: Array, default: function () { return [] } },
  statusCounts: { type: Object, default: function () { return {} } },
  profFilter: { type: String, default: 'all' },
  subProfFilter: { type: String, default: 'all' },
  statusFilter: { type: String, default: 'all' },
  profIcon: { type: Function, default: function () { return '' } },
  searchable: Boolean,
  searchQuery: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '搜索名称 / 别名 / ID' },
  hasFilters: Boolean,
})

defineEmits([
  'update:profFilter',
  'update:subProfFilter',
  'update:statusFilter',
  'update:searchQuery',
  'reset',
])

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
}
</style>
