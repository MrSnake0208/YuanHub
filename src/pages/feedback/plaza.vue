<template>
  <div class="feedback-page feedback-center feedback-plaza-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap"><div class="page-header-row">
        <div class="page-header-identity"><h1 class="page-header-title">反馈广场</h1><p class="page-header-description">浏览公开的问题与建议，查看处理进展。</p></div>
        <router-link class="page-header-action plaza-submit" to="/feedback?new=1"><Plus :size="18" aria-hidden="true" />提交反馈</router-link>
      </div></div></header>
      <section class="feedback-content"><div class="wrap">
        <FeedbackWorkspaceNav active="plaza" :can-manage="canManageFeedback" :can-configure="canConfigureFeedback" />
        <p class="plaza-context">这里只展示管理员整理后的公开内容。开发目标与验收进度可在 <router-link to="/co-creation">大饼中心</router-link> 查看。</p>
        <FeedbackPlaza :focus-id="focusId" :initial-type="initialType" />
      </div></section>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Plus } from '@lucide/vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import FeedbackWorkspaceNav from '@/components/feedback/FeedbackWorkspaceNav.vue'
import FeedbackPlaza from '@/components/co-creation/FeedbackPlaza.vue'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, canManageAnyFeedback, hasPermission } from '@/utils/authPermissions.js'
import { PUBLIC_TYPE_OPTIONS } from '@/utils/feedbackPublic.js'
import '@/styles/feedback-workspace.css'
import '@/styles/page-header.css'

const route = useRoute()
const focusId = computed(() => String(route.query.feedback || ''))
const initialType = computed(() => PUBLIC_TYPE_OPTIONS.some(option => option.key === route.query.type) ? route.query.type : '')
const canManageFeedback = computed(() => canManageAnyFeedback(auth.adminAccess))
const canConfigureFeedback = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE))
</script>

<style scoped>
.plaza-submit { gap: 8px; justify-self: start; }
.feedback-plaza-page:has(.plaza-state.empty) .plaza-submit { display: none; }

.plaza-context { margin-top: 16px; color: var(--feedback-text-muted); font-size: 13px; line-height: 1.7; }
.plaza-context a { color: var(--accent-strong); font-weight: 800; }
</style>
