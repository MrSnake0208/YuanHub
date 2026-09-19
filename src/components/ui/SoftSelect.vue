<template>
  <div ref="root" class="soft-select" :class="{ 'is-open': open, 'is-disabled': disabled, 'drop-up': dropUp, 'is-horizontal': presentation === 'horizontal' }" @keydown.esc.prevent.stop="close(true)">
    <select class="soft-select-native" :value="modelValue" :disabled="disabled" :aria-label="ariaLabel" tabindex="-1" aria-hidden="true" @change="choose($event.target.value)">
      <option v-if="placeholder" value="">{{ placeholder }}</option>
      <option v-for="option in normalizedOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
    <button ref="trigger" type="button" class="soft-select-trigger" :disabled="disabled" aria-haspopup="listbox" :aria-label="ariaLabel" :aria-expanded="open" @click="toggle" @keydown.down.prevent="openAt(1)" @keydown.up.prevent="openAt(-1)">
      <span class="soft-select-option-label">{{ selectedOption?.label || placeholder || '请选择' }}</span><small v-if="selectedOption?.description" class="soft-select-option-description">{{ selectedOption.description }}</small>
    </button>
    <div v-if="open" ref="listbox" class="soft-select-listbox" role="listbox" :aria-label="ariaLabel" @keydown="onListKeydown">
      <button v-if="placeholder" type="button" class="soft-select-option" role="option" :aria-selected="modelValue === ''" :tabindex="activeIndex === 0 ? 0 : -1" @focus="activeIndex = 0" @click="choose('')">{{ placeholder }}</button>
      <button v-for="(option, index) in normalizedOptions" :key="option.value" type="button" class="soft-select-option" role="option" :aria-selected="option.value === String(modelValue ?? '')" :tabindex="activeIndex === index + placeholderOffset ? 0 : -1" @focus="activeIndex = index + placeholderOffset" @click="choose(option.value)"><span class="soft-select-option-label">{{ option.label }}</span><small v-if="option.description" class="soft-select-option-description">{{ option.description }}</small></button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: function () { return [] } },
  disabled: Boolean,
  ariaLabel: { type: String, default: '选择选项' },
  placeholder: { type: String, default: '' },
  presentation: { type: String, default: 'stacked' },
})
const emit = defineEmits(['update:modelValue', 'change'])
const root = ref(null)
const trigger = ref(null)
const listbox = ref(null)
const open = ref(false)
const activeIndex = ref(0)
const dropUp = ref(false)
const normalizedOptions = computed(function () {
  return props.options.map(function (option) {
    return typeof option === 'object'
      ? { value: String(option.value ?? ''), label: String(option.label ?? option.value ?? ''), description: String(option.description ?? '') }
      : { value: String(option), label: String(option) }
  })
})
const placeholderOffset = computed(function () { return props.placeholder ? 1 : 0 })
const allValues = computed(function () {
  return (props.placeholder ? [''] : []).concat(normalizedOptions.value.map(function (option) { return option.value }))
})
const selectedOption = computed(function () { return normalizedOptions.value.find(function (option) { return option.value === String(props.modelValue ?? '') }) || null })

function selectedIndex() {
  const index = allValues.value.indexOf(String(props.modelValue ?? ''))
  return index === -1 ? 0 : index
}
function focusActive() {
  nextTick(function () { listbox.value?.querySelectorAll('.soft-select-option')?.[activeIndex.value]?.focus() })
}
function updateDropDirection() {
  nextTick(function () {
    const rect = trigger.value?.getBoundingClientRect()
    if (!rect) return
    const expectedHeight = Math.min(228, window.innerHeight * 0.4)
    dropUp.value = window.innerHeight - rect.bottom < expectedHeight && rect.top > window.innerHeight - rect.bottom
  })
}
function toggle() { if (props.disabled) return; open.value ? close() : openAt(0) }
function openAt(direction) {
  if (props.disabled) return
  open.value = true
  activeIndex.value = Math.max(0, Math.min(allValues.value.length - 1, selectedIndex() + direction))
  updateDropDirection()
  focusActive()
}
function close(restoreFocus = false) { open.value = false; dropUp.value = false; if (restoreFocus) nextTick(function () { trigger.value?.focus() }) }
function choose(value) { if (props.disabled) return; emit('update:modelValue', value); emit('change', value); close(true) }
function onListKeydown(event) {
  const max = allValues.value.length - 1
  if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex.value = Math.min(max, activeIndex.value + 1); focusActive() }
  else if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex.value = Math.max(0, activeIndex.value - 1); focusActive() }
  else if (event.key === 'Home') { event.preventDefault(); activeIndex.value = 0; focusActive() }
  else if (event.key === 'End') { event.preventDefault(); activeIndex.value = max; focusActive() }
  else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(allValues.value[activeIndex.value]) }
  else if (event.key === 'Tab') close()
}
function onPointerDown(event) { if (open.value && !root.value?.contains(event.target)) close() }
onMounted(function () { document.addEventListener('pointerdown', onPointerDown, true) })
onBeforeUnmount(function () { document.removeEventListener('pointerdown', onPointerDown, true) })
</script>

<style scoped>
.soft-select{position:relative;width:100%;min-width:0;color:var(--ink,#493b2c);font:700 12px var(--font-b,inherit)}.soft-select-native{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);opacity:0;pointer-events:none}.soft-select-trigger{position:relative;display:flex;width:100%;min-width:0;min-height:38px;align-items:center;gap:6px;padding:8px 34px 8px 11px;overflow:hidden;border:1.5px solid var(--line,#decdb8);border-radius:10px;background:var(--surface,#fffdf6);color:inherit;cursor:pointer;font:inherit;text-align:left;transition:border-color .18s,background-color .18s,box-shadow .18s}.soft-select-option-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.soft-select-option-description{min-width:0;overflow:hidden;color:var(--ink-60,#897666);font:700 10.5px var(--font-b,inherit);text-overflow:ellipsis;white-space:nowrap}.soft-select.is-horizontal .soft-select-trigger,.soft-select.is-horizontal .soft-select-option{display:flex;align-items:center;gap:10px}.soft-select.is-horizontal .soft-select-option-label{flex:0 1 auto}.soft-select.is-horizontal .soft-select-option-description{flex:0 1 58%;margin-left:auto;text-align:right;color:var(--ink-60,#897666)}.soft-select-trigger::after{position:absolute;right:13px;width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;content:'';opacity:.68;transform:translateY(-2px) rotate(45deg);transition:transform .18s}.is-open .soft-select-trigger::after{transform:translateY(2px) rotate(225deg)}.soft-select-trigger:hover:not(:disabled),.soft-select-trigger:focus-visible{border-color:var(--accent,#d78935);background:var(--cream,#fff8ec);box-shadow:0 0 0 3px rgba(199,138,70,.12);outline:0}.soft-select-trigger:disabled{cursor:not-allowed;opacity:.55}.soft-select-listbox{position:absolute;z-index:90;top:calc(100% + 5px);right:0;left:0;display:grid;max-height:min(220px,40vh);overflow:auto;padding:4px;border:1px solid var(--line,#decdb8);border-radius:11px;background:var(--surface,#fffdf6);box-shadow:0 12px 24px rgba(73,59,44,.16)}.drop-up .soft-select-listbox{top:auto;bottom:calc(100% + 5px)}.soft-select-option{display:grid;width:100%;gap:2px;padding:8px 10px;overflow:hidden;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer;font:inherit;text-align:left}.soft-select-option:hover,.soft-select-option:focus-visible,.soft-select-option[aria-selected='true']{background:var(--cream,#fff8ec);outline:0}@media(max-width:600px){.soft-select-trigger{min-height:42px;font-size:14px}.soft-select-listbox{max-height:min(260px,45vh)}}
</style>
