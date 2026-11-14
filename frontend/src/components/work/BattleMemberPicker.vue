<template>
  <div class="battle-member-picker">
    <div class="battle-picker-toolbar">
      <label class="battle-search"><Search :size="16" aria-hidden="true" /><span class="sr-only">搜索密探</span><input v-model="search" aria-label="搜索密探" placeholder="搜索名字或别名"></label>
      <div class="battle-picker-source">
        <div class="battle-subnav" role="group" aria-label="密探来源"><button type="button" :aria-pressed="!ownedOnly" @click="ownedOnly = false">全部密探</button><button type="button" :aria-pressed="ownedOnly" @click="ownedOnly = true">我的密探</button></div>
        <button type="button" :aria-expanded="filtersOpen" :aria-controls="filterPanelId" @click="filtersOpen = !filtersOpen"><SlidersHorizontal :size="16" aria-hidden="true" />筛选<span v-if="activeFilters.length">{{ activeFilters.length }}</span></button>
      </div>
    </div>
    <section v-if="filtersOpen" :id="filterPanelId" class="battle-picker-filters" aria-label="品质、属性与职业筛选">
      <div v-for="row in filterRows" :key="row.key" class="battle-picker-filter-row">
        <span class="battle-picker-filter-label">{{ row.label }}</span>
        <div class="battle-picker-filter-options" role="group" :aria-label="`按${row.label}筛选`">
          <button v-for="option in row.options" :key="option.value" type="button" :aria-pressed="filters[row.key] === option.value" @click="updateFilter(row.key, option.value)">{{ option.label }}</button>
        </div>
      </div>
      <button v-if="activeFilters.length" type="button" @click="clearFilters">清除</button>
    </section>
    <div v-else-if="activeFilters.length" class="battle-picker-filter-tags">
      <button v-for="filter in activeFilters" :key="filter.key" type="button" :aria-label="`取消${filter.label} ${filter.selectedLabel}筛选`" @click="updateFilter(filter.key, 'all')">{{ filter.label }} {{ filter.selectedLabel }}<X :size="14" aria-hidden="true" /></button>
      <button type="button" @click="clearFilters">清除</button>
    </div>
    <!-- 自定义名称是低频补充，放在列表上方的折叠入口，避免沉到长列表底部找不到。 -->
    <details class="battle-custom-toggle">
      <summary><ChevronRight :size="14" aria-hidden="true" />图鉴中没有？使用自定义名称</summary>
      <form class="battle-custom-name" @submit.prevent="emit('choose', customName.trim())">
        <label>自定义名称<input v-model="customName" :aria-label="`${slot + 1}号位密探`" maxlength="40" placeholder="图鉴中没有的密探" @input="emit('pending-name', Boolean(customName.trim()))"></label>
        <button type="submit" :disabled="busy || !customName.trim()">使用此名称</button>
      </form>
    </details>
    <p v-if="ownedOnly && !accountEntries.length" class="battle-hint">尚无账号候选：登录并选择账号后会自动读取我的密探，读取失败时可在页面上方重试；也可选择全部密探手动填写。</p>
    <div v-if="filtered.length" class="battle-picker-grid" aria-label="密探候选">
      <button v-for="agent in filtered" :key="agent.id" type="button" :class="{ current: placement(agent) === slot }" :disabled="busy" :aria-current="placement(agent) === slot ? 'true' : undefined" :aria-label="`选择${agent.name}，${status(agent)}`" @click="emit('choose', agent.name)">
        <img v-if="resolveOperatorPortrait(agent.id, agent)" :src="resolveOperatorPortrait(agent.id, agent)" alt="" loading="lazy"><UserRound v-else :size="32" aria-hidden="true" />
        <strong>{{ agent.name }}</strong><small class="battle-picker-status-full" :class="{ muted: !ownedIds.has(agent.id) }">{{ status(agent) }}</small>
        <small v-if="shortStatus(agent)" class="battle-picker-status-short" :class="{ muted: placement(agent) < 0 }">{{ shortStatus(agent) }}</small>
      </button>
    </div>
    <div v-else-if="search.trim() || activeFilters.length" role="status" class="battle-picker-empty">
      <p v-if="search.trim()" class="battle-hint">没有匹配“{{ search.trim() }}”的密探。</p>
      <p v-else class="battle-hint">没有符合条件的密探。</p>
      <button v-if="search.trim()" type="button" :disabled="busy" @click="emit('choose', search.trim())">使用“{{ search.trim() }}”作为自定义名称</button>
      <button v-if="activeFilters.length" type="button" @click="clearFilters">清除筛选</button>
    </div>
    <p class="battle-hint">已有配置会带入本攻略；更换已有密探前会确认替换范围。</p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { ChevronRight, Search, SlidersHorizontal, UserRound, X } from '@lucide/vue'
import { resolveOperatorPortrait } from '../../utils/operatorPortrait.js'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { sameBattleOperator } from '../../utils/battleImages.js'
import { OPERATOR_RARITY_OPTIONS, subProfOptions, matchesProfSubFilter, matchesOperatorSearch, tokens } from '../../utils/operatorFilters.js'
import { matchesOperatorQuality } from '../../utils/operatorForms.js'
const props = defineProps({ agents: { type: Array, required: true }, filters: { type: Object, required: true }, accountEntries: { type: Array, default: () => [] }, team: { type: Array, default: () => [] }, slot: { type: Number, required: true }, busy: Boolean })
const emit = defineEmits(['choose', 'pending-name', 'update:filters'])
const search = ref(''), customName = ref(''), filtersOpen = ref(false)
const filterPanelId = useId()
const ownedOnly = computed({ get: () => props.filters.ownedOnly, set: value => updateFilter('ownedOnly', value) })
function updateFilter(key, value) { emit('update:filters', { ...props.filters, [key]: value }) }
function clearFilters() { emit('update:filters', { ...props.filters, rarity: 'all', prof: 'all', subProf: 'all' }) }
const filterRows = computed(() => {
  const present = new Set(props.agents.flatMap(agent => tokens(agent.prof)))
  const profs = [...AGENT_PROFS.filter(prof => present.has(prof)), ...[...present].filter(prof => !AGENT_PROFS.includes(prof))]
  const options = values => ['all', ...values].map(value => ({ value, label: value === 'all' ? '全部' : value }))
  return [
    { key: 'rarity', label: '品质', options: OPERATOR_RARITY_OPTIONS.filter(option => option.value === 'all' || props.agents.some(agent => matchesOperatorQuality(agent, option.value))) },
    { key: 'prof', label: '属性', options: options(profs) },
    { key: 'subProf', label: '职业', options: options(subProfOptions(props.agents)) }
  ]
})
const activeFilters = computed(() => filterRows.value.filter(row => props.filters[row.key] !== 'all').map(row => ({
  ...row, selectedLabel: (row.key === 'rarity' ? OPERATOR_RARITY_OPTIONS : row.options).find(option => option.value === props.filters[row.key])?.label || props.filters[row.key]
})))
const ownedIds = computed(() => new Set(props.accountEntries.map(entry => entry.id)))
const filtered = computed(() => props.agents.filter(agent =>
  (!ownedOnly.value || ownedIds.value.has(agent.id)) &&
  matchesOperatorQuality(agent, props.filters.rarity) &&
  matchesProfSubFilter(agent, props.filters.prof, props.filters.subProf) &&
  (`${agent.name} ${agent.alias || ''}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()) || matchesOperatorSearch(agent, search.value))
))
// 标出当前槽位与其它号位的密探；选中其它号位时，由上层确认并连同配置移来。
const placement = agent => sameBattleOperator(props.team[props.slot], agent) ? props.slot : props.team.findIndex(member => sameBattleOperator(member, agent))
function status(agent) {
  const index = placement(agent)
  if (index === props.slot) return '当前'
  if (index >= 0) return `在${index + 1}号位，选中移来`
  return ownedIds.value.has(agent.id) ? '已有配置' : '需手动填写'
}
function shortStatus(agent) {
  const index = placement(agent)
  if (index === props.slot) return '当前'
  if (index >= 0) return `${index + 1}号位`
  return ownedIds.value.has(agent.id) || !props.accountEntries.length ? '' : '需填写'
}
onBeforeUnmount(() => emit('pending-name', false))
</script>
