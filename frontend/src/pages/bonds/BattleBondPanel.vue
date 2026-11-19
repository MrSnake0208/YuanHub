<template>
  <section class="bond-battle" role="tabpanel" id="bond-panel-battle" aria-labelledby="bond-tab-battle">
    <div class="bond-battle-progress" role="status">
      <span>已收集 <strong>{{ progress?.triggered_count ?? '—' }} / {{ progress?.available_total ?? entries?.length ?? '—' }}</strong></span>
      <progress v-if="progress?.available_total" :value="progress.triggered_count" :max="progress.available_total" aria-label="战斗羁绊收集进度" />
    </div>

    <form class="bond-filters touch-targets" @submit.prevent>
      <div class="bond-search-row">
        <label class="bond-search"><Search :size="18" aria-hidden="true" /><input v-model="filters.query" type="search" :disabled="state.busy" aria-label="搜索战斗羁绊密探或配对" aria-describedby="battle-bond-search-help" placeholder="搜索密探或配对"></label>
        <button v-if="isPhone" type="button" :aria-expanded="filtersOpen" aria-controls="battle-bond-operator-filters" @click="filtersOpen = !filtersOpen">
          {{ filtersOpen ? '收起筛选' : '更多筛选' }}<template v-if="!filtersOpen && operatorFilterCount">（{{ operatorFilterCount }}）</template>
          <ChevronDown :size="15" :class="{ 'is-flipped': filtersOpen }" aria-hidden="true" />
        </button>
      </div>
      <p id="battle-bond-search-help" class="bond-search-help">多个名称用空格或顿号分隔，可查找指定配对。</p>

      <div class="bond-common-filters battle-bond-filters">
        <label>类型<select v-model="filters.type" :disabled="state.busy">
          <option value="">全部类型</option>
          <option v-for="(label, value) in BATTLE_TYPES" :key="value" :value="value">{{ label }}</option>
        </select></label>
        <div class="bond-record-options" role="group" aria-label="战斗羁绊收集状态">
          <span>收集状态</span>
          <button v-for="(label, value) in recordOptions" :key="value" type="button" :disabled="state.busy || !hasRecords" :aria-pressed="filters.recorded === value" @click="filters.recorded = value">{{ label }}</button>
        </div>
        <button v-if="hasFilters" type="button" :disabled="state.busy" @click="clearFilters">清空筛选</button>
      </div>
      <BondOperatorFilters v-show="!isPhone || filtersOpen" id="battle-bond-operator-filters"
        v-model:sort-order="sortOrder" v-model:quality="operatorFilters.quality" v-model:prof="operatorFilters.prof" v-model:sub-prof="operatorFilters.subProf"
        :operators="state.operators" :disabled="state.busy" />
    </form>

    <p v-if="state.ownedError" class="bond-hint" role="status">{{ state.ownedError }}</p>
    <p v-else-if="available && !state.owned && !state.loading" class="bond-hint">尚未填写密探拥有资料，默认显示全部组合。<router-link class="touch-target battle-bond-link" to="/operator">前往我的密探</router-link></p>
    <p v-if="state.operatorError" class="bond-error" role="alert">{{ state.operatorError }} 暂以密探 ID 展示，请刷新重试。</p>
    <p v-if="state.archive && !hasRecords && !state.loading" class="bond-hint" role="status">战斗收集进度尚未读取，请刷新资料后重试。</p>
    <p v-if="state.battleError && (state.loading || !rows.some(row => row.bond_id === state.battleError.id))" class="bond-error" role="alert">{{ state.battleError.message }}</p>

    <p v-if="state.loading" class="bond-empty" role="status">正在读取目录与账号记录…</p>
    <p v-else-if="state.catalogError" class="bond-error" role="alert">{{ state.catalogError }} <button class="touch-target" type="button" @click="emit('refresh')">重试目录读取</button></p>
    <p v-else-if="!entries?.length" class="bond-empty">当前目录暂无战斗羁绊资料。</p>
    <template v-else>
      <p class="bond-find-count battle-bond-count" role="status">找到 {{ rows.length }} 组战斗羁绊</p>
      <p v-if="!rows.length" class="bond-empty">没有匹配的战斗羁绊。</p>
      <ul v-else class="bond-find-list battle-bond-list">
        <li v-for="row in rows" :key="row.bond_id" class="battle-bond-row" :class="{ 'is-unowned': row.missing.length }">
          <div class="battle-bond-avatars" aria-hidden="true">
            <OperatorAvatar v-for="id in row.members" :key="id" :avatar="operatorFor(id).avatar || ''" :name="operatorName(id)" :rarity="operatorFor(id).rarity" />
          </div>
          <div class="battle-bond-details">
            <strong>{{ row.name }}</strong>
            <span>{{ row.typeLabel }}<template v-if="row.missing.length"> · 未拥有 {{ row.missing.map(operatorName).join('、') }}</template></span>
          </div>
          <button type="button" class="battle-bond-action touch-target" :disabled="!writable || !hasRecords || row.missing.length > 0"
            :aria-pressed="hasRecords ? row.collected : undefined" :aria-busy="state.battleSavingId === row.bond_id"
            :aria-label="`${row.name}，${row.typeLabel}，${collectionLabel(row)}`" @click="emit('toggle', row.bond_id)">
            <component :is="state.battleSavingId === row.bond_id ? LoaderCircle : row.collected ? Check : Plus" :size="15" aria-hidden="true" />
            {{ collectionLabel(row) }}
          </button>
          <p v-if="state.battleError?.id === row.bond_id" class="bond-error battle-bond-error" role="alert">{{ state.battleError.message }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Check, ChevronDown, LoaderCircle, Plus, Search } from '@lucide/vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { useViewportTier } from '../../composables/useViewportTier.js'
import { operatorRosterPosition } from '../../data/operatorRosterOrder.js'
import { BATTLE_TYPES, filterBonds, missingBattleMembers } from './rules.js'
import { sortByRoster, useBondOperatorFilters } from './useBonds.js'

const props = defineProps({
  state: { type: Object, required: true }, available: Boolean, writable: Boolean,
  operatorFor: { type: Function, required: true }
})
const emit = defineEmits(['toggle', 'refresh'])
const { isPhone } = useViewportTier()
const { operatorFilters, operatorFilterCount, operatorIds, sortOrder } = useBondOperatorFilters(() => props.state.operators, 'yuanhub:bonds:battle-sort')
const filters = reactive({ query: '', type: '', recorded: '' })
const filtersOpen = ref(false)
const recordOptions = { '': '全部', missing: '未收集', collected: '已收集' }
const hasFilters = computed(() => filters.query.trim() || filters.type || filters.recorded || operatorFilterCount.value)
function clearFilters() {
  Object.assign(filters, { query: '', type: '', recorded: '' })
  Object.assign(operatorFilters, { quality: 'all', prof: '', subProf: '' })
}
watch(() => props.state.generation, () => { filters.recorded = '' })

const entries = computed(() => props.state.catalog?.battle)
const progress = computed(() => props.available ? props.state.archive?.battle_summary : null)
const hasRecords = computed(() => props.available && Array.isArray(props.state.archive?.battle_records))
const records = computed(() => hasRecords.value ? props.state.archive.battle_records : [])
const collectedIds = computed(() => new Set(records.value.filter(record => record.triggered).map(record => record.bond_id)))
const operatorName = id => props.operatorFor(id).name || id
const rows = computed(() => {
  const activeFilters = hasRecords.value ? filters : { ...filters, recorded: '' }
  const result = filterBonds(entries.value || [], records.value, props.state.operators, activeFilters, props.state.owned, operatorIds.value)
  if (sortOrder.value === 'roster') sortByRoster(result, row => Math.min(...row.members.map(operatorRosterPosition)))
  return result.map(row => ({
    ...row,
    name: row.display_name || row.members.map(operatorName).join(' × '),
    typeLabel: BATTLE_TYPES[row.type] || row.type,
    missing: missingBattleMembers(row, props.state.owned),
    collected: collectedIds.value.has(row.bond_id)
  }))
})
function collectionLabel(row) {
  if (props.state.battleSavingId === row.bond_id) return '保存中…'
  return !hasRecords.value ? '收集' : row.collected ? '已收集' : '未收集'
}
</script>

<style scoped>
.bond-battle-progress { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 12px 16px; margin-bottom: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.bond-battle-progress strong { margin-inline-start: 4px; font: 700 20px var(--font-s); }
.bond-battle-progress progress { flex: 1 1 120px; max-width: 20rem; }
.bond-battle input[type=search], .bond-battle :deep(select) { min-height: 44px; }
.battle-bond-filters .bond-record-options { gap: 8px; }
.battle-bond-link { display: inline-flex; align-items: center; margin-inline-start: 4px; }
.battle-bond-count { margin-block: 0 10px; }
.battle-bond-list { margin: 0; padding: 0; list-style: none; }
.battle-bond-row { display: grid; grid-template-columns: minmax(78px, auto) minmax(0, 1fr) auto; align-items: center; gap: 6px 12px; padding: 10px 14px; }
.battle-bond-row + .battle-bond-row { border-top: 1px solid var(--line); }
.battle-bond-avatars { display: flex; gap: 6px; }
.battle-bond-avatars :deep(.operator-avatar) { box-sizing: border-box; width: 36px; height: 36px; }
.battle-bond-details { display: grid; gap: 4px; overflow-wrap: anywhere; }
.battle-bond-details strong { font-size: 15px; }
.battle-bond-details > span { color: var(--bond-muted); font-size: 13px; }
.battle-bond-row.is-unowned { color: var(--bond-muted); background: color-mix(in srgb, var(--ink) 5%, var(--surface)); }
.is-unowned .battle-bond-avatars { filter: grayscale(1); }
.bonds-codex .battle-bond-action { min-height: 44px; font-size: 13px; white-space: nowrap; }
.bonds-codex .battle-bond-action[aria-pressed=true] { color: var(--theme-success-text, #365b30); border-color: var(--theme-success-line, #abc39b); background: var(--theme-success-bg, #f1f6e9); }
.bonds-codex .is-unowned .battle-bond-action[aria-pressed=true] { color: var(--ink); border-color: var(--line); background: var(--surface); }
.battle-bond-error { grid-column: 1 / -1; margin: 0; font-size: 13px; }
@media (prefers-reduced-motion: no-preference) {
  .battle-bond-action[aria-busy=true] svg { animation: bond-saving-spin 1s linear infinite; }
}
@media (max-width: 767px) {
  .bond-battle-progress { padding: 8px 12px; }
  .battle-bond-row { grid-template-columns: minmax(60px, auto) minmax(0, 1fr) auto; gap: 6px 8px; padding: 8px; }
  .battle-bond-avatars { gap: 4px; }
  .battle-bond-avatars :deep(.operator-avatar) { width: 28px; height: 28px; }
  .bonds-codex .battle-bond-action { padding-inline: 6px; }
}
</style>
