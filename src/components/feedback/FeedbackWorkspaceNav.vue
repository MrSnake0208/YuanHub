<template>
  <div class="feedback-workspace-header">
    <nav class="feedback-workspace-nav" aria-label="反馈工作区">
      <router-link to="/feedback/plaza" :class="{ active: active === 'plaza' }">
        <MessageSquareText :size="17" aria-hidden="true" />
        <span>反馈广场</span>
      </router-link>
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
    </nav>
    <router-link v-if="canAccessManagement" class="feedback-workspace-management" to="/manage">
      <LayoutDashboard :size="17" aria-hidden="true" />
      <span>管理工作台</span>
    </router-link>
  </div>
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
  canConfigure: { type: Boolean, default: false }
})

const canAccessManagement = computed(function () {
  return hasManagementCapability(auth.adminAccess)
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.feedback-workspace-nav {
  border: 1px solid var(--feedback-line);
  border-radius: 8px;
  background: var(--feedback-panel-deep);
}

.feedback-workspace-nav a {
  border-right: 1px solid var(--feedback-line);
  color: var(--feedback-text-muted);
  text-decoration: none;
}

.feedback-workspace-nav a:hover,
.feedback-workspace-nav a.active {
  background: var(--yellow);
  color: var(--ink);
}

.feedback-workspace-nav-unread {
  border-radius: 50%;
  background: var(--rouge);
}

.feedback-workspace-nav a:last-child { border-right: 0; }

.feedback-workspace-management {
  color: var(--feedback-text-muted);
  text-decoration: none;
}

.feedback-workspace-management:hover { color: var(--accent-strong); }
.feedback-workspace-header a:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
</style>
<style scoped src="./feedbackWorkspaceNavDesktop.css"></style>
<style scoped src="./feedbackWorkspaceNavMobile.css"></style>
