<template>
  <router-link class="backup-profile-link" :to="to"><slot>去「备份与恢复」</slot></router-link>
</template>

<script setup>
import { BACKUP_PROFILE_LINK } from '../utils/backupFile.js'

defineProps({ to: { type: [String, Object], default: BACKUP_PROFILE_LINK } })
</script>

<style scoped>
.backup-profile-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  min-width: 44px;
  max-width: 100%;
  color: var(--theme-strong-text, var(--tea));
  font-weight: 600;
  text-decoration: none;
  text-underline-offset: 3px;
}
.backup-profile-link:is(:hover, :focus-visible) {
  text-decoration: underline;
}
.backup-profile-link:focus-visible {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: 3px;
}
</style>
