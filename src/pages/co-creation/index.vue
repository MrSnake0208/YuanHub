<template>
  <div class="feedback-page co-creation-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap"><div class="page-header-row">
        <div class="page-header-identity"><h1 class="page-header-title">大饼中心</h1><p class="page-header-description">查看功能计划、当前进展与完成标准。</p></div>
        <router-link v-if="canManage" class="page-header-back creation-admin-link" to="/co-creation/admin">管理开发目标</router-link>
      </div></div></header>
      <section class="feedback-content"><div class="wrap">
        <p class="creation-context">这里展示团队的功能计划。目标完成表示完成标准已通过，实际发布请看 <router-link to="/changelog">更新日志</router-link>。有新想法？<router-link :to="{ path: '/feedback', query: { new: '1', type: 'FEATURE' } }">提交功能建议</router-link>。</p>
        <DevelopmentRoadmap />
      </div></section>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import IslandSidebar from '@/components/IslandSidebar.vue'
import DevelopmentRoadmap from '@/components/co-creation/DevelopmentRoadmap.vue'
import { auth } from '@/store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '@/utils/authPermissions.js'
import '@/styles/page-header.css'
const canManage = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.DEVELOPMENT_GOAL_MANAGE))
</script>

<style src="../../styles/feedback-workspace.css"></style>
<style src="../../styles/feedback-workspaceDesktop.css"></style>
<style src="../../styles/feedback-workspaceMobile.css"></style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.creation-context { color: var(--feedback-text-muted); }
.creation-context a { color: var(--accent-strong); }
</style>
<style scoped src="./coCreationPageDesktop.css"></style>
<style scoped src="./coCreationPageMobile.css"></style>
