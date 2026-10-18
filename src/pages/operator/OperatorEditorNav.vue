<template>
  <nav class="editor-section-nav" role="tablist" aria-label="密探编辑分区" @keydown="onWorkspaceTabKeydown" @focusin="onWorkspaceTabFocus" @focusout="onWorkspaceTabFocus">
    <button v-for="section in sections" :key="section.id" type="button"
      :id="'operator-editor-tab-' + section.id" role="tab"
      :aria-controls="'operator-editor-' + section.id"
      :aria-selected="modelValue === section.id"
      :tabindex="modelValue === section.id ? 0 : -1"
      @click="$emit('update:modelValue', section.id)">
      <component :is="section.icon" :size="17" aria-hidden="true" />{{ section.label }}
    </button>
  </nav>
</template>

<script setup>
import { Sparkles, Target, Star } from '@lucide/vue'
import { onWorkspaceTabKeydown, onWorkspaceTabFocus } from '../../utils/workspaceTabs.js'

defineProps({ modelValue: { type: String, default: 'growth' } })
defineEmits(['update:modelValue'])
const sections = [
  { id: 'growth', label: '基础养成', icon: Sparkles },
  { id: 'discs', label: '命盘', icon: Target },
  { id: 'stars', label: '星石', icon: Star },
]
</script>

<style scoped>
.editor-section-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: none; min-width: 0; margin: 0; padding: 0 20px; background: var(--surface); border-bottom: 1px solid var(--line); }
button { display: inline-flex; min-width: 0; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 8px 12px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ink-60); font: 800 16px var(--font-b); cursor: pointer; white-space: nowrap; }
button:hover { color: var(--tea); background: var(--cream); }
button[aria-selected="true"] { color: var(--tea); border-bottom-color: var(--accent); background: var(--cream); }
button[aria-selected="true"] svg { color: var(--accent-strong); }
button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: -3px; }
@media (max-width: 640px) {
  .editor-section-nav { padding-inline: 12px; }
  button { gap: 6px; min-height: 42px; padding-inline: 4px; font-size: 14px; }
}
</style>
