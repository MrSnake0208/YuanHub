<template>
  <router-link class="admin-back-link" to="/manage" aria-label="返回管理工作台">
    <ArrowLeft :size="16" aria-hidden="true" />
    <span>管理工作台</span>
  </router-link>
</template>

<script setup>
import { ArrowLeft } from '@lucide/vue'
</script>

<style scoped>
.admin-back-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  margin-bottom: 16px;
  padding: 4px 0;
  border-bottom: 1px solid transparent;
  color: var(--ink-60);
  font: 700 12px var(--font-b);
  text-decoration: none;
  transition: color .18s ease, border-color .18s ease;
}

.admin-back-link:hover {
  border-bottom-color: var(--accent);
  color: var(--accent-strong);
}

.admin-back-link:focus-visible {
  border-radius: 3px;
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

@media (max-width: 767px) {
  .admin-back-link {
    min-height: 40px;
    margin-bottom: 12px;
    font-size: 13px;
  }
}
</style>
