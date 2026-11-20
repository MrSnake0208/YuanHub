<template>
  <div class="backup-export-panel">
    <div class="backup-export-summary">
      <span class="backup-export-icon"><FileDown :size="22" aria-hidden="true" /></span>
      <div>
        <h3 class="backup-export-title">{{ title }}</h3>
        <p class="backup-export-description">包含{{ contents }}。换设备或误删时，用它就能恢复。</p>
      </div>
    </div>

    <slot name="feedback" />
    <p v-if="notice" class="action-feedback backup-export-notice" role="status">
      <CircleCheck :size="16" aria-hidden="true" />
      <span>{{ notice }}</span>
    </p>

    <slot />

    <p class="backup-export-profile"><span>需要一次备份所有功能？</span><BackupProfileLink /></p>
  </div>
</template>

<script setup>
import { CircleCheck, FileDown } from '@lucide/vue'
import BackupProfileLink from './BackupProfileLink.vue'

defineProps({ title: String, contents: String, notice: String })
</script>

<style scoped>
.backup-export-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
  margin-top: 16px;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.backup-export-summary {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--cream);
}
.backup-export-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--theme-strong-text, var(--tea));
}
.backup-export-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--ink); }
.backup-export-description { margin: 4px 0 0; font-size: 14px; color: var(--ink-60); }
.backup-export-notice { display: flex; align-items: flex-start; gap: 8px; margin: 0; }
.backup-export-notice svg { flex: none; margin-top: 3px; color: var(--theme-strong-text, var(--tea)); }
.backup-export-notice span { min-width: 0; }
.backup-export-panel :slotted(p) { margin: 0; }
.backup-export-panel :slotted(p[role='alert']) { color: var(--theme-danger-text, var(--rouge)); }
.backup-export-panel :deep(.import-more-content) { display: grid; justify-items: start; gap: 8px; }
.backup-export-panel :deep(.import-more-content button) { min-height: 44px; max-width: 100%; white-space: normal; }
.backup-export-panel :deep(.import-more-content small) { display: block; margin-top: 4px; color: var(--ink-60); }
.backup-export-profile {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 6px;
  margin: 0;
  color: var(--ink-60);
  font-size: 13px;
}
</style>
