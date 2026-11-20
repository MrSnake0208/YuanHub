<template>
  <details class="backup-import-details">
    <summary>查看明细</summary>
    <slot />
  </details>
</template>

<style scoped>
.backup-import-details { padding-inline: 12px; border: 1px solid var(--line); border-radius: 8px; }
.backup-import-details summary { min-height: 44px; align-content: center; color: var(--theme-strong-text, var(--tea)); font-weight: 600; cursor: pointer; }
.backup-import-details summary:is(:hover, :focus-visible) { text-decoration: underline; text-underline-offset: 3px; }
.backup-import-details[open] { padding-bottom: 12px; }
</style>
