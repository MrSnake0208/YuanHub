<template>
  <nav class="feedback-workspace-nav" aria-label="反馈工作区">
    <router-link to="/feedback" :class="{ active: active === 'mine' }">
      <MessageSquareText :size="17" aria-hidden="true" />
      <span>我的反馈</span>
    </router-link>
    <router-link v-if="canManage" to="/feedback/manage" :class="{ active: active === 'manage' }">
      <Inbox :size="17" aria-hidden="true" />
      <span>反馈工作台</span>
    </router-link>
    <router-link v-if="canConfigure" to="/feedback/admin" :class="{ active: active === 'admin' }">
      <ShieldCheck :size="17" aria-hidden="true" />
      <span>权限配置</span>
    </router-link>
  </nav>
</template>

<script setup>
import { Inbox, MessageSquareText, ShieldCheck } from '@lucide/vue'

defineProps({
  active: { type: String, required: true },
  canManage: { type: Boolean, default: false },
  canConfigure: { type: Boolean, default: false }
})
</script>

<style scoped>
.feedback-workspace-nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 20px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.feedback-workspace-nav a {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  border-radius: 6px;
  color: var(--ink-60);
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.feedback-workspace-nav a:hover,
.feedback-workspace-nav a.active {
  background: var(--yellow);
  color: var(--ink);
}

@media (max-width: 767px) {
  .feedback-workspace-nav {
    width: 100%;
    margin-top: 14px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .feedback-workspace-nav::-webkit-scrollbar { display: none; }
  .feedback-workspace-nav a { flex: 1 0 auto; justify-content: center; min-height: 44px; }
}
</style>
