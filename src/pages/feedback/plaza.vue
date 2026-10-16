<template>
  <div class="feedback-page feedback-center feedback-plaza-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap"><div class="page-header-row">
        <div class="page-header-identity"><h1 class="page-header-title">反馈广场</h1><p class="page-header-description">浏览公开的问题与建议，查看处理进展。</p></div>
        <router-link class="page-header-action plaza-submit" to="/feedback?new=1"><Plus :size="18" aria-hidden="true" />提交反馈</router-link>
      </div></div></header>
      <section class="feedback-content"><div class="wrap">
        <FeedbackWorkspaceNav active="plaza" />
        <p class="plaza-context">这里只展示管理员整理后的公开内容。开发目标与验收进度可在 <router-link to="/co-creation">大饼中心</router-link> 查看。</p>
        <FeedbackPlaza :focus-id="focusId" />
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
import '@/styles/page-header.css'

const route = useRoute()
const focusId = computed(() => String(route.query.feedback || ''))
</script>

<style src="../../styles/feedback-workspace.css"></style>
<style src="../../styles/feedback-workspaceDesktop.css"></style>
<style src="../../styles/feedback-workspaceMobile.css"></style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.plaza-context { color: var(--feedback-text-muted); }
.plaza-context a { color: var(--accent-strong); }
</style>
<style scoped src="./feedbackPlazaPageDesktop.css"></style>
<style scoped src="./feedbackPlazaPageMobile.css"></style>
