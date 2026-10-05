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
import '@/styles/feedback-workspace.css'
import '@/styles/page-header.css'
const canManage = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.DEVELOPMENT_GOAL_MANAGE))
</script>

<style scoped>
.creation-admin-link { margin: 0; justify-self: start; }
.creation-context { margin-top: 0; color: var(--feedback-text-muted); font-size: 13px; line-height: 1.7; }
.creation-context a { color: var(--accent-strong); font-weight: 800; }
</style>
