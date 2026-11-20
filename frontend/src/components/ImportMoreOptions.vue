<template>
  <details class="import-more-options" :open="open" @toggle="$emit('toggle', $event)">
    <summary>
      {{ summary }}
      <ChevronDown class="import-more-chevron" :size="16" aria-hidden="true" />
    </summary>
    <div class="import-more-content"><slot /></div>
  </details>
</template>

<script setup>
import { ChevronDown } from '@lucide/vue'

defineProps({ open: { type: Boolean, default: undefined }, summary: { type: String, default: '其他方式与帮助' } })
defineEmits(['toggle'])
</script>

<style scoped>
.import-more-options summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  list-style: none;
  font-size: 14px;
  color: var(--theme-strong-text, var(--tea));
  cursor: pointer;
}
.import-more-options summary::-webkit-details-marker { display: none; }
.import-more-options summary:focus-visible {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: 3px;
}
.import-more-chevron { flex: none; transition: transform 0.2s ease; }
.import-more-options[open] .import-more-chevron { transform: rotate(180deg); }
.import-more-content { margin-top: 8px; font-size: 14px; color: var(--ink); overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) {
  .import-more-chevron { transition: none; }
}
</style>
