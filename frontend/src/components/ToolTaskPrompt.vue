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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.tool-task-prompt { background: color-mix(in srgb, var(--surface) 88%, transparent); border: 1px solid var(--line); border-radius: 16px; }
.tool-task-prompt h2 { color: var(--theme-strong-text, var(--tea)); }
.tool-task-prompt p { color: var(--ink-60); }
.tool-task-actions :deep(a), .tool-task-actions :deep(button) { text-decoration: none; }
.tool-task-actions :deep(.btn) { border-radius: 8px; }
.tool-task-actions :deep(.link) { background: transparent; border: 0; color: var(--theme-strong-text, var(--tea)); text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }
.tool-task-actions :deep(:focus-visible) { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
.tool-task-prompt.is-error { border-color: var(--rouge); }
@media (min-width: 768px) { .tool-task-prompt { border-radius: 20px; } }
</style>
<style scoped src="./toolTaskPromptDesktop.css"></style>
<style scoped src="./toolTaskPromptMobile.css"></style>
