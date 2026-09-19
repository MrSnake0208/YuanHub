<template>
  <span class="planner-select" :class="{ compact, numeric }">
    <button :id="id || controlId" ref="trigger" type="button" class="planner-select-trigger" role="combobox"
      :aria-label="label" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="menuId"
      :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
      :disabled="disabled || !options.length" :title="selectedLabel || placeholder"
      @click="toggle" @keydown="onKeydown">
      <span class="planner-select-value" :class="{ placeholder: !selectedLabel }">{{ selectedLabel || placeholder }}</span>
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <span :id="menuId" ref="menu" popover="auto" role="listbox" class="planner-select-menu"
      :class="{ numeric }" :aria-label="label" :style="menuStyle"
      @beforetoggle="open = $event.newState === 'open'" @toggle="onToggle">
      <span v-for="(option, index) in options" :id="optionId(index)" :key="option.value" role="option"
        class="planner-select-option" :class="{ active: index === activeIndex }"
        :aria-selected="option.value === modelValue" :aria-disabled="option.disabled || undefined"
        @pointermove="!option.disabled && $event.pointerType === 'mouse' && (activeIndex = index)"
        @pointerdown.prevent @click.prevent.stop="choose(index)">
        <span>{{ option.label }}</span><Check v-if="option.value === modelValue" :size="15" aria-hidden="true" />
      </span>
    </span>
  </span>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true },
  label: { type: String, required: true },
  id: { type: String, default: '' },
  placeholder: { type: String, default: '请选择' },
  disabled: Boolean,
  compact: Boolean,
  numeric: Boolean,
  menuWidth: { type: Number, default: 144 }
})
const emit = defineEmits(['update:modelValue'])
const controlId = 'planner-select-' + useId()
const menuId = controlId + '-menu'
const optionId = index => menuId + '-' + index
const trigger = ref(null), menu = ref(null), open = ref(false), activeIndex = ref(-1)
const menuStyle = ref({})
const selectedLabel = computed(() => props.options.find(option => option.value === props.modelValue)?.label || '')
const enabledIndices = computed(() => props.options.flatMap((option, index) => option.disabled ? [] : [index]))
let observer, search = '', searchTimer

function positionMenu() {
  if (!open.value) return
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect?.width || !rect.height || trigger.value.matches(':disabled')) { close(); return }
  const viewport = window.visualViewport
  const leftEdge = (viewport?.offsetLeft || 0) + 8
  const topEdge = (viewport?.offsetTop || 0) + 8
  const rightEdge = leftEdge + (viewport?.width || document.documentElement.clientWidth) - 16
  const bottomEdge = topEdge + (viewport?.height || window.innerHeight) - 16
  if (rect.bottom <= topEdge || rect.top >= bottomEdge || rect.right <= leftEdge || rect.left >= rightEdge) { close(); return }
  const width = Math.min(Math.max(rect.width, props.menuWidth), rightEdge - leftEdge)
  const below = Math.max(0, bottomEdge - rect.bottom - 5)
  const above = Math.max(0, rect.top - topEdge - 5)
  const desiredHeight = Math.min(288, menu.value.scrollHeight + 2)
  const upwards = below < desiredHeight && above > below
  const maxHeight = Math.min(288, upwards ? above : below)
  menuStyle.value = {
    width: width + 'px', maxHeight: maxHeight + 'px',
    left: Math.min(Math.max(rect.left, leftEdge), rightEdge - width) + 'px',
    top: (upwards ? rect.top - 5 - Math.min(desiredHeight, maxHeight) : rect.bottom + 5) + 'px'
  }
}
function revealActive() {
  const option = document.getElementById(optionId(activeIndex.value))
  if (!option || !menu.value) return
  const optionRect = option.getBoundingClientRect(), menuRect = menu.value.getBoundingClientRect()
  if (optionRect.top < menuRect.top + 5) menu.value.scrollTop -= menuRect.top + 5 - optionRect.top
  else if (optionRect.bottom > menuRect.bottom - 5) menu.value.scrollTop += optionRect.bottom - menuRect.bottom + 5
}
async function show(index) {
  if (props.disabled || trigger.value?.matches(':disabled') || !enabledIndices.value.length) return
  activeIndex.value = index ?? props.options.findIndex(option => option.value === props.modelValue && !option.disabled)
  if (activeIndex.value < 0) activeIndex.value = enabledIndices.value[0]
  open.value = true
  menu.value.showPopover()
  positionMenu()
  await nextTick()
  positionMenu()
  revealActive()
}
function close(restoreFocus = false) {
  if (menu.value?.matches(':popover-open')) menu.value.hidePopover()
  open.value = false
  clearTimeout(searchTimer); search = ''
  if (restoreFocus) trigger.value?.focus({ preventScroll: true })
}
function toggle() { if (open.value) close(); else show() }
function choose(index, restoreFocus = true) {
  const option = props.options[index]
  if (!option || option.disabled || props.disabled || trigger.value?.matches(':disabled')) return
  close(restoreFocus)
  if (option.value !== props.modelValue) emit('update:modelValue', option.value)
}
function move(direction) {
  const indices = enabledIndices.value
  const current = indices.indexOf(activeIndex.value)
  activeIndex.value = indices[Math.max(0, Math.min(indices.length - 1, current + direction))] ?? -1
  nextTick(revealActive)
}
function onKeydown(event) {
  if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    if (event.key === 'Home' || event.key === 'End') {
      const index = event.key === 'Home' ? enabledIndices.value[0] : enabledIndices.value.at(-1)
      if (!open.value) show(index)
      else { activeIndex.value = index ?? -1; nextTick(revealActive) }
    } else if (!open.value) show()
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') move(event.key === 'ArrowDown' ? 1 : -1)
    else choose(activeIndex.value)
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault(); event.stopPropagation(); close(true)
  } else if (event.key === 'Tab' && open.value) {
    choose(activeIndex.value, false)
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    clearTimeout(searchTimer); search += event.key.toLocaleLowerCase()
    const term = [...search].every(letter => letter === search[0]) ? search[0] : search
    const indices = enabledIndices.value
    const start = term.length === 1 ? indices.indexOf(activeIndex.value) + 1 : 0
    const ordered = [...indices.slice(start), ...indices.slice(0, start)]
    const index = ordered.find(index => String(props.options[index].label).toLocaleLowerCase().startsWith(term))
    if (index != null) {
      if (!open.value) show(index)
      else { activeIndex.value = index; nextTick(revealActive) }
    }
    searchTimer = setTimeout(() => { search = '' }, 600)
  }
}
function stopPositioning() {
  observer?.disconnect()
  window.removeEventListener('resize', positionMenu)
  window.removeEventListener('scroll', positionMenu, true)
  window.visualViewport?.removeEventListener('resize', positionMenu)
  window.visualViewport?.removeEventListener('scroll', positionMenu)
}
function onToggle(event) {
  stopPositioning()
  open.value = event.newState === 'open' && Boolean(trigger.value?.isConnected && menu.value?.isConnected)
  if (open.value) {
    observer = new ResizeObserver(positionMenu); observer.observe(trigger.value)
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    window.visualViewport?.addEventListener('resize', positionMenu)
    window.visualViewport?.addEventListener('scroll', positionMenu)
  } else { clearTimeout(searchTimer); search = '' }
}
watch(() => props.disabled, value => { if (value) close() })
watch(() => [props.modelValue, props.options], () => {
  if (!open.value) return
  if (!enabledIndices.value.length) { close(); return }
  activeIndex.value = props.options.findIndex(option => option.value === props.modelValue && !option.disabled)
  if (activeIndex.value < 0) activeIndex.value = enabledIndices.value[0]
  nextTick(() => { positionMenu(); revealActive() })
})
onBeforeUnmount(() => { close(); stopPositioning() })
</script>

<style scoped>
.planner-select { display: inline-block; min-width: 0; max-width: 100%; width: 100%; vertical-align: middle; }
.planner-select-trigger { display: grid; grid-template-columns: minmax(0, 1fr) 14px; align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: 44px; padding: 8px 10px; border: 1px solid var(--planner-line, var(--line)); border-radius: 7px; background: var(--surface); color: var(--tea); font: 600 13px/1.5 var(--font-b); text-align: left; cursor: pointer; touch-action: manipulation; }
.planner-select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.planner-select-value.placeholder { color: var(--ink-60); font-weight: 400; }
.planner-select-trigger > svg { color: var(--ink-60); }
.planner-select-trigger[aria-expanded="true"] { border-color: var(--accent); background: var(--cream); }
.planner-select-trigger[aria-expanded="true"] > svg { transform: rotate(180deg); }
.planner-select-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.planner-select-trigger:disabled { opacity: .5; cursor: default; }
.compact .planner-select-trigger { min-height: 32px; padding: 4px 6px; gap: 4px; font-size: 12px; }
.numeric .planner-select-value, .planner-select-menu.numeric { font-family: var(--font-d); font-variant-numeric: tabular-nums; }
.planner-select-menu { position: fixed; inset: auto; box-sizing: border-box; margin: 0; padding: 5px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--planner-line, var(--line)); border-radius: 9px; background: var(--surface); box-shadow: 0 8px 24px rgba(73, 59, 44, .14); color: var(--tea); font: 400 13px/1.5 var(--font-b); text-align: left; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
.planner-select-option { display: grid; grid-template-columns: minmax(0, 1fr) 15px; align-items: center; gap: 8px; min-height: 40px; padding: 8px; border-radius: 5px; cursor: pointer; }
.planner-select-option > span { overflow-wrap: anywhere; }
.planner-select-option[aria-selected="true"] { color: var(--accent-strong); font-weight: 700; }
.planner-select-option.active { background: var(--cream); }
.planner-select-option[aria-disabled="true"] { opacity: .45; cursor: default; }
@media (hover: hover) { .planner-select-trigger:hover:not(:disabled) { border-color: var(--accent); } }
@media (max-width: 900px) {
  .compact .planner-select-trigger { min-height: 44px; }
  .planner-select-option { min-height: 44px; }
}
</style>
