<template>
  <router-link class="admin-back-link" to="/manage" aria-label="返回管理工作台">
    <ArrowLeft :size="20" aria-hidden="true" />
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
  gap: 8px;
  min-height: 48px;
  margin-bottom: 20px;
  padding: 10px 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: 800 16px var(--font-b);
  text-decoration: none;
  transition: color .18s ease, background-color .18s ease, border-color .18s ease;
}

.admin-back-link:hover {
  border-color: var(--yellow-deep);
  background: var(--yellow);
  color: var(--ink);
}

.admin-back-link:focus-visible {
  border-radius: 3px;
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

@media (max-width: 767px) {
  .admin-back-link {
    margin-bottom: 16px;
    padding-inline: 14px;
    font-size: 16px;
  }
}
</style>
