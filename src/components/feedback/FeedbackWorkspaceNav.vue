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
    </nav>
  </div>
</template>

<script setup>
import { MessageSquareText } from '@lucide/vue'

defineProps({
  active: { type: String, required: true }
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

.feedback-workspace-nav a:last-child { border-right: 0; }

.feedback-workspace-header a:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
</style>
<style scoped src="./feedbackWorkspaceNavDesktop.css"></style>
<style scoped src="./feedbackWorkspaceNavMobile.css"></style>
