<template>
  <label v-if="spaces.length > 1" class="feedback-space-context">
    <span>当前专区</span>
    <select :value="modelValue" :disabled="disabled" aria-label="当前反馈专区" @change="change">
      <option v-for="space in spaces" :key="space.id" :value="space.id">{{ space.label }}{{ space.active === false ? '（已停用）' : '' }}</option>
    </select>
  </label>
  <p v-else-if="spaces.length === 1" class="feedback-space-context"><span>当前专区</span><strong>{{ spaces[0].label }}{{ spaces[0].active === false ? '（已停用）' : '' }}</strong></p>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: String, required: true },
  spaces: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['change'])
function change(event) {
  const value = event.target.value
  event.target.value = props.modelValue
  emit('change', value)
}
</script>

<style scoped>
.feedback-space-context { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; margin: 0; color: var(--feedback-text-muted, var(--ink)); font-size: 13px; }
.feedback-space-context select { min-width: 0; max-width: 100%; min-height: 34px; padding: 6px 28px 6px 10px; border: 1px solid var(--feedback-line); border-radius: 7px; background: var(--feedback-panel, var(--surface)); color: var(--feedback-text, var(--ink)); font: inherit; }
.feedback-space-context select:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.feedback-space-context strong { overflow-wrap: anywhere; color: var(--feedback-text, var(--ink)); font-weight: 600; }
@media (max-width: 640px) { .feedback-space-context { flex: 1 1 100%; } .feedback-space-context select { flex: 1; } }
</style>
