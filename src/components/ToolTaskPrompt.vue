<template>
  <section class="tool-task-prompt" :class="{ 'is-error': error }" :role="error ? 'alert' : 'status'" :aria-label="title">
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.default" class="tool-task-actions"><slot /></div>
  </section>
</template>

<script setup>
defineProps({ title: { type: String, required: true }, description: { type: String, default: '' }, error: Boolean })
</script>

<style scoped>
.tool-task-prompt { margin-block: 16px 24px; padding: 32px 16px; text-align: center; background: color-mix(in srgb, var(--surface) 88%, transparent); border-block: 1px solid var(--line); }
.tool-task-prompt h2 { margin: 0; color: var(--tea); font: 900 22px/1.5 var(--font-s); }
.tool-task-prompt p { max-width: 40em; margin: 8px auto 0; color: var(--ink-60); font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }
.tool-task-actions { display: grid; justify-items: center; gap: 4px; margin-top: 20px; }
.tool-task-actions :deep(a), .tool-task-actions :deep(button) { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; font-size: 14px; text-decoration: none; }
.tool-task-actions :deep(.btn) { flex: none; padding: 10px 18px; border-radius: 8px; white-space: nowrap; }
.tool-task-actions :deep(.link) { padding: 8px; background: transparent; border: 0; color: var(--tea); text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }
.tool-task-actions :deep(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
.tool-task-prompt.is-error { border-color: var(--rouge); }
@media (min-width: 768px) { .tool-task-prompt { padding-block: 40px; } .tool-task-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 16px; } }
</style>
