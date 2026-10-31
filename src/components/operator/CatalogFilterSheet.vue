<template>
  <div class="catalog-mobile-filter">
    <button class="catalog-filter-trigger" type="button" aria-haspopup="dialog" :aria-expanded="open" @click="begin">
      <SlidersHorizontal :size="14" aria-hidden="true" />筛选<span v-if="chips.length"> · {{ chips.length }}</span>
    </button>
    <div v-if="chips.length" class="catalog-filter-chips" aria-label="已选筛选条件">
      <button v-for="chip in chips" :key="chip.key" type="button" :aria-label="`取消${chip.label}筛选`" @click="remove(chip)">
        {{ chip.label }}<X :size="12" aria-hidden="true" />
      </button>
    </div>
    <Teleport to="body">
      <div v-if="open" class="catalog-filter-mask" :style="viewportStyle" @click.self="open = false">
        <section ref="panel" class="catalog-filter-sheet" :class="{ 'is-short': shortViewport }" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @focusin="revealFocusedControl">
          <header>
            <h2 :id="titleId">筛选密探</h2>
            <button type="button" aria-label="关闭筛选，不应用修改" @click="open = false"><X :size="20" aria-hidden="true" /></button>
          </header>
          <div ref="scrollBody" class="catalog-filter-body">
            <OperatorFilterDossier compact force-expanded show-growth-filters :context-label="contextLabel"
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
import { computed, ref, useId, watch } from 'vue'
import { SlidersHorizontal, X } from '@lucide/vue'
import OperatorFilterDossier from './OperatorFilterDossier.vue'
import { DISC_FILTER_OPTIONS } from '../../utils/operatorDiscLoadouts.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useModalViewport } from '@/composables/useModalViewport.js'

const props = defineProps({
  modelValue: { type: Object, required: true },
  profOptions: { type: Array, required: true },
  subProfOptions: { type: Array, required: true },
  rarityOptions: { type: Array, required: true },
  countResults: { type: Function, required: true },
  contextKey: { type: String, default: '' },
  contextLabel: { type: String, default: '密探图鉴' },
  showDiscFilter: Boolean,
  tagOptions: { type: Array, default: () => [] },
  totalCount: { type: Number, default: 0 },
  resetFilters: { type: Function, default: null },
})
const emit = defineEmits(['update:modelValue'])
const open = ref(false), draft = ref(null), panel = ref(null), scrollBody = ref(null)
const titleId = useId()
const copy = value => ({ ...value, growthFilters: { ...value.growthFilters } })
const ranges = [['level', '等级'], ['elite', '修为'], ['star', '星数']]
const chips = computed(() => {
  const value = props.modelValue, result = []
  for (const [key, label] of [['profFilter', '属性'], ['subProfFilter', '职业'], ['rarityFilter', '品质']]) {
    if (value[key] === 'all') continue
    const text = key === 'rarityFilter' ? props.rarityOptions.find(o => o.value === value[key])?.label || value[key] : value[key]
    result.push({ key, label: `${label} ${text}` })
  }
  for (const [key, label] of ranges) {
    const f = value.growthFilters, min = f[key + 'Min'], max = f[key + 'Max']
    if (!f[key + 'Enabled'] || ((min === '' || min == null) && (max === '' || max == null))) continue
    result.push({ key, growth: true, label: `${label} ${min === max ? min : `${min === '' || min == null ? '不限' : min}–${max === '' || max == null ? '不限' : max}`}` })
  }
  if (props.showDiscFilter && value.discStatusFilter !== 'all') result.push({ key: 'discStatusFilter', label: DISC_FILTER_OPTIONS.find(o => o.value === value.discStatusFilter)?.label || '命盘' })
  if (value.tagFilter) result.push({ key: 'tagFilter', label: props.tagOptions.find(o => o.value === value.tagFilter)?.label || '标签' })
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
  draft.value = { search: '', manifestFilter: 'all', profFilter: 'all', subProfFilter: 'all', rarityFilter: 'all', growthFilters: {} }
}
function remove(chip) {
  const value = copy(props.modelValue)
  if (chip.growth) value.growthFilters[chip.key === 'awakened' ? chip.key : chip.key + 'Enabled'] = chip.key === 'awakened' ? '' : false
  else value[chip.key] = chip.key === 'tagFilter' ? '' : 'all'
  emit('update:modelValue', value)
}
watch(() => props.contextKey, () => { open.value = false })
useModalFocus(open, panel, { initialFocus: () => panel.value, onEscape: () => { open.value = false }, blocking: true, preventRestoreScroll: true })
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(open, scrollBody, panel)
watch(open, (visible, _, onCleanup) => {
  if (!visible) return
  const body = document.body, root = document.documentElement
  const bodyOverflow = body.style.overflow, rootOverflow = root.style.overflow
  body.style.overflow = root.style.overflow = 'hidden'
  const media = window.matchMedia('(min-width: 768px)')
  const closeOnDesktop = event => { if (event.matches) open.value = false }
  media.addEventListener('change', closeOnDesktop)
  onCleanup(() => {
    body.style.overflow = bodyOverflow; root.style.overflow = rootOverflow
    media.removeEventListener('change', closeOnDesktop)
  })
}, { flush: 'sync' })
</script>

<style scoped src="./catalogFilterSheetMobile.css"></style>
