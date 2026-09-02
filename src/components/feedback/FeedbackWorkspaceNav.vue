<template>
  <nav class="feedback-workspace-nav" aria-label="反馈工作区">
    <router-link to="/feedback" :class="{ active: active === 'mine' }">
      <MessageSquareText :size="17" aria-hidden="true" />
      <span>我的反馈</span>
    </router-link>
    <router-link v-if="canManage" to="/feedback/manage" :class="{ active: active === 'manage' }">
      <Inbox :size="17" aria-hidden="true" />
      <span>反馈工作台</span>
      <span v-if="hasUnreadFeedback" class="feedback-workspace-nav-unread" role="img" aria-label="有未读反馈"></span>
    </router-link>
    <router-link v-if="canConfigure" to="/feedback/admin" :class="{ active: active === 'admin' }">
      <ShieldCheck :size="17" aria-hidden="true" />
      <span>权限配置</span>
    </router-link>
    <router-link v-if="showManagement && canAccessManagement" to="/manage" :class="{ active: active === 'workbench' }">
      <LayoutDashboard :size="17" aria-hidden="true" />
      <span>管理工作台</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { Inbox, LayoutDashboard, MessageSquareText, ShieldCheck } from '@lucide/vue'
import { auth } from '@/store/auth.js'
import { hasManagementCapability } from '@/utils/adminTools.js'

defineProps({
  active: { type: String, required: true },
  canManage: { type: Boolean, default: false },
  hasUnreadFeedback: { type: Boolean, default: false },
  canConfigure: { type: Boolean, default: false },
  showManagement: { type: Boolean, default: true }
})

const canAccessManagement = computed(function () {
  return hasManagementCapability(auth.adminAccess)
})
</script>

<style scoped>
.feedback-workspace-nav {
  display: inline-flex;
  align-items: center;
  gap: 0;
  margin-top: 18px;
  border: 1px solid var(--feedback-line);
  border-radius: 8px;
  background: var(--feedback-panel-deep);
  overflow: hidden;
}

.feedback-workspace-nav a {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 16px;
  border-right: 1px solid var(--feedback-line);
  color: var(--feedback-text-muted);
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

.feedback-workspace-nav a:hover,
.feedback-workspace-nav a.active {
  background: var(--yellow);
  color: var(--ink);
}

.feedback-workspace-nav-unread {
  flex: 0 0 7px;
  width: 7px;
  height: 7px;
  margin-left: 1px;
  border-radius: 50%;
  background: var(--rouge);
}

.feedback-workspace-nav a:last-child { border-right: 0; }

@media (max-width: 767px) {
  .feedback-workspace-nav {
    width: 100%;
    margin-top: 12px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .feedback-workspace-nav::-webkit-scrollbar { display: none; }
  .feedback-workspace-nav a { flex: 1 0 auto; justify-content: center; min-height: 44px; }
}
</style>
