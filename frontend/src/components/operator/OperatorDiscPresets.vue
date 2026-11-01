<template>
  <section v-if="presets.length" class="disc-presets" aria-label="常用命盘">
    <h5>常用命盘</h5>
    <p>填入{{ destination }}，保存后生效</p>
    <div class="disc-preset-list">
      <button v-for="names in presets" :key="discSelectionSignature(names)" type="button"
        class="disc-preset" :class="{ 'is-matched': matches(names) }"
        :aria-pressed="matches(names)" :disabled="disabled"
        :aria-label="(matches(names) ? '已匹配：' : '填入' + destination + '：') + names.join('、')"
        @click="apply(names)">
        <span class="disc-preset-terms">
          <span v-for="name in names" :key="name" :class="termClass(name)">{{ name }}</span>
        </span>
        <span class="disc-preset-action">{{ matches(names) ? '已匹配' : '填入' }}</span>
      </button>
    </div>
    <div class="disc-preset-feedback" role="status" aria-live="polite">
      <template v-if="undoNames !== null">
        <span>已填入{{ destination }}</span>
        <button type="button" :disabled="disabled" @click="undo">撤销</button>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import presetData from '../../data/operatorDiscPresets.json'
import { discNameOf, discSelectionSignature } from '../../utils/operatorDiscLoadouts.js'

const props = defineProps({
  operatorId: { type: String, required: true },
  catalog: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  destination: { type: String, required: true },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])
const undoNames = ref(null)
const appliedSignature = ref('')
const presets = computed(() => {
  const known = new Set(props.catalog.map(discNameOf))
  return (presetData[props.operatorId] || []).filter(names =>
    names.length === 3 && new Set(names).size === 3 && names.every(name => known.has(name)),
  ).slice(0, 3)
})
function matches(names) { return discSelectionSignature(names) === discSelectionSignature(props.modelValue) }
function termClass(name) {
  const color = props.catalog.find(disc => discNameOf(disc) === name)?.color
  return { 'is-gold': color === '金', 'is-purple': color === '紫', 'is-blue': color === '蓝' }
}
function apply(names) {
  if (props.disabled || matches(names)) return
  undoNames.value = props.modelValue.slice()
  appliedSignature.value = discSelectionSignature(names)
  emit('update:modelValue', names.slice())
}
function undo() {
  if (props.disabled || undoNames.value === null) return
  const previous = undoNames.value
  undoNames.value = null
  emit('update:modelValue', previous.slice())
}
// Manual edits invalidate undo so it cannot overwrite later work.
watch(() => discSelectionSignature(props.modelValue), signature => {
  if (signature !== appliedSignature.value) undoNames.value = null
})
watch(() => [props.operatorId, props.destination], () => { undoNames.value = null })
</script>

<style scoped>
.disc-presets { min-width: 0; margin-top: 14px; }
.disc-presets h5 { margin: 0; color: var(--ink); font-size: 15px; }
.disc-presets p { margin: 5px 0 10px; color: var(--theme-strong-text, var(--tea)); font-size: 12px; line-height: 1.5; }
.disc-preset-list { display: grid; gap: 8px; }
.disc-preset { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.disc-preset.is-matched { border-color: var(--accent); background: var(--cream); }
.disc-preset-terms { display: flex; flex-wrap: wrap; gap: 5px 10px; min-width: 0; font-size: 13px; line-height: 1.6; }
.disc-preset-terms > span { max-width: 100%; padding: 2px 6px; box-sizing: border-box; border: 1px solid color-mix(in srgb, currentColor 35%, transparent); border-radius: 5px; overflow-wrap: anywhere; }
.disc-preset-terms .is-gold { color: var(--theme-accent-text, #8a5a1f); background: var(--theme-wash, rgba(215, 137, 53, .1)); }
.disc-preset-terms .is-purple { color: var(--theme-purple-text, #6d56a0); background: var(--theme-purple-wash, rgba(151, 130, 199, .1)); }
.disc-preset-terms .is-blue { color: var(--theme-info-text, #4f6387); background: var(--theme-info-wash, rgba(110, 135, 184, .1)); }
.disc-preset-action { color: var(--theme-strong-text, var(--tea)); font-size: 12px; white-space: nowrap; }
.disc-preset-feedback { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--theme-strong-text, var(--tea)); font-size: 12px; }
.disc-preset-feedback button { min-height: 44px; padding: 0 8px; border: 0; background: transparent; color: var(--theme-strong-text, var(--tea)); font: inherit; text-decoration: underline; cursor: pointer; }
.disc-presets button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.disc-presets button:disabled { opacity: .6; cursor: not-allowed; }
@media (hover: hover) { .disc-preset:not(:disabled):hover { border-color: var(--accent); } }
</style>
