<template>
  <div class="backup-import-summary" aria-label="导入预览">
    <dl>
      <div v-for="[label, count] in counts" :key="label"><dt>{{ label }}</dt><dd>{{ count }}</dd></div>
    </dl>
    <p><slot /></p>
  </div>
</template>

<script setup>
defineProps({ counts: { type: Array, required: true } })
</script>

<style scoped>
.backup-import-summary dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); gap: 8px; margin: 0 0 8px; }
.backup-import-summary dl div { display: flex; flex-direction: column-reverse; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; }
.backup-import-summary dt { color: var(--ink-60); font-size: 13px; }
.backup-import-summary dd { margin: 0; font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
.backup-import-summary p { margin: 0; }
</style>
