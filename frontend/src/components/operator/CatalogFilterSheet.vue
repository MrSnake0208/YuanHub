<template>
  <div ref="triggerGroup" class="catalog-mobile-filter touch-targets">
    <button class="catalog-filter-trigger" type="button" aria-haspopup="dialog" :aria-expanded="open" @click="begin">
      <SlidersHorizontal :size="14" aria-hidden="true" />筛选<span v-if="chips.length"> · {{ chips.length }}</span>
    </button>
    <div v-if="chips.length" class="catalog-filter-chips" aria-label="已选筛选条件">
      <button v-for="chip in chips" :key="chip.key" type="button" :aria-label="`取消${chip.label}筛选`" @click="remove(chip)">
        {{ chip.label }}<X :size="12" aria-hidden="true" />
      </button>
    </div>
    <Teleport to="body">
      <div v-if="open" class="catalog-filter-mask" :style="viewportStyle">
        <section ref="panel" class="catalog-filter-sheet" :class="{ 'is-short': shortViewport }" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @focusin="revealFocusedControl">
          <header>
            <h2 :id="titleId">筛选密探</h2>
            <button type="button" aria-label="关闭筛选，不应用修改" @click="open = false"><X :size="20" aria-hidden="true" /></button>
          </header>
          <div ref="scrollBody" class="catalog-filter-body">
            <OperatorFilterDossier compact force-expanded show-growth-filters :context-label="contextLabel" :show-growth-presets="showGrowthPresets"
              :show-disc-filter="showDiscFilter" :tag-options="tagOptions" :total-count="totalCount"
              v-model:disc-status-filter="draft.discStatusFilter" v-model:tag-filter="draft.tagFilter"
              :prof-options="profOptions" :sub-prof-options="subProfOptions" :rarity-options="rarityOptions"
              v-model:prof-filter="draft.profFilter" v-model:sub-prof-filter="draft.subProfFilter"
              v-model:rarity-filter="draft.rarityFilter" v-model:growth-filters="draft.growthFilters" />
          </div>
          <footer>
            <button type="button" @click="resetDraft">重置筛选</button>
            <button class="apply" type="button" :disabled="invalidRange" @click="apply">查看 {{ countResults(draft) }} 位密探</button>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, useId, watch } from 'vue'
import { SlidersHorizontal, X } from '@lucide/vue'
import OperatorFilterDossier from './OperatorFilterDossier.vue'
import { DISC_FILTER_OPTIONS } from '../../utils/operatorDiscLoadouts.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useModalViewport } from '@/composables/useModalViewport.js'
import { useViewportTier } from '@/composables/useViewportTier.js'

const { isPhone } = useViewportTier()
const triggerGroup = ref(null)

const props = defineProps({
  modelValue: { type: Object, required: true },
  profOptions: { type: Array, required: true },
  subProfOptions: { type: Array, required: true },
  rarityOptions: { type: Array, required: true },
  countResults: { type: Function, required: true },
  contextKey: { type: String, default: '' },
  contextLabel: { type: String, default: '密探图鉴' },
  showDiscFilter: Boolean,
  showGrowthPresets: { type: Boolean, default: true },
  tagOptions: { type: Array, default: () => [] },
  totalCount: { type: Number, default: 0 },
  resetFilters: { type: Function, default: null },
})
const emit = defineEmits(['update:modelValue'])
const open = ref(false), draft = ref(null), panel = ref(null), scrollBody = ref(null)
const titleId = useId()
const copy = value => ({ ...value, growthFilters: { ...value.growthFilters } })
const choiceFilters = [['profFilter', '属性'], ['subProfFilter', '职业'], ['rarityFilter', '品质']]
const ranges = [['level', '等级'], ['elite', '修为'], ['star', '星数']]
const chips = computed(() => {
  const value = props.modelValue, result = []
  for (const [field, label] of choiceFilters) {
    for (const choice of [].concat(value[field] ?? 'all')) {
      if (choice === 'all') continue
      const text = field === 'rarityFilter' ? props.rarityOptions.find(option => option.value === choice)?.label || choice : choice
      result.push({ key: `${field}:${choice}`, field, choice, label: `${label} ${text}` })
    }
  }
  for (const [key, label] of ranges) {
    const f = value.growthFilters, min = f[key + 'Min'], max = f[key + 'Max']
    if (!f[key + 'Enabled'] || ((min === '' || min == null) && (max === '' || max == null))) continue
    const display = bound => bound === '' || bound == null ? '不限' : key === 'star' && bound === '6' ? '觉醒' : bound
    result.push({ key, growth: true, label: `${label} ${min === max ? display(min) : `${display(min)}–${display(max)}`}` })
  }
  if (props.showDiscFilter && value.discStatusFilter !== 'all') result.push({ key: 'discStatusFilter', label: DISC_FILTER_OPTIONS.find(o => o.value === value.discStatusFilter)?.label || '命盘' })
  if (value.tagFilter) result.push({ key: 'tagFilter', label: props.tagOptions.find(o => o.value === value.tagFilter)?.label || '标签' })
  if (value.upgradeReadyFilter) result.push({ key: 'upgradeReadyFilter', label: value.upgradeReadyFilter === 'huaji' ? '可提升化极' : '等级/修为可提升' })
  const awakened = value.growthFilters.awakened
  if (awakened) result.push({ key: 'awakened', growth: true, label: { true: '已觉醒', false: '未觉醒', unknown: '觉醒待确认' }[awakened] })
  return result
})
const invalidRange = computed(() => ranges.some(([key]) => {
  const f = draft.value?.growthFilters || {}, min = f[key + 'Min'], max = f[key + 'Max']
  return f[key + 'Enabled'] && min !== '' && min != null && max !== '' && max != null && Number(min) > Number(max)
}))
function begin() { draft.value = copy(props.modelValue); open.value = true }
function apply() { if (invalidRange.value) return; emit('update:modelValue', copy(draft.value)); open.value = false }
function resetDraft() {
  if (props.resetFilters) { draft.value = copy(props.resetFilters()); return }
  draft.value = { search: '', manifestFilter: 'all', growthFilters: {} }
  for (const [field] of choiceFilters) {
    draft.value[field] = Array.isArray(props.modelValue[field]) ? [] : 'all'
  }
}
function remove(chip) {
  const value = copy(props.modelValue)
  if (chip.growth) {
    value.growthFilters[chip.key === 'awakened' ? chip.key : chip.key + 'Enabled'] = chip.key === 'awakened' ? '' : false
  } else if (chip.field) {
    const selected = value[chip.field]
    value[chip.field] = Array.isArray(selected) ? selected.filter(choice => choice !== chip.choice) : 'all'
  } else {
    value[chip.key] = ['tagFilter', 'upgradeReadyFilter'].includes(chip.key) ? '' : 'all'
  }
  emit('update:modelValue', value)
}
watch(() => props.contextKey, () => { open.value = false })
useModalFocus(open, panel, { preventScroll: true, initialFocus: () => panel.value, onEscape: () => { open.value = false }, blocking: true, preventRestoreScroll: true })
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(open, scrollBody, panel)
watch(open, (visible, _, onCleanup) => {
  if (!visible) {
    if (!isPhone.value) nextTick(() => {
      if (open.value || isPhone.value) return
      const focused = document.activeElement
      if (focused === document.body || focused?.matches('main')) {
        const toolbar = triggerGroup.value?.closest('.operator-mobile-toolbar')
        const target = toolbar?.querySelector('.dossier-more') || toolbar?.querySelector('.current-filter-search input')
        target?.focus({ preventScroll: true })
      }
    })
    return
  }
  const body = document.body, root = document.documentElement
  const bodyOverflow = body.style.overflow, rootOverflow = root.style.overflow
  body.style.overflow = root.style.overflow = 'hidden'
  onCleanup(() => {
    body.style.overflow = bodyOverflow; root.style.overflow = rootOverflow
  })
}, { flush: 'sync' })
</script>

<style scoped src="./catalogFilterSheetMobile.css"></style>
