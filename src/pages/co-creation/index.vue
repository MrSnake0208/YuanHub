<template>
  <div class="feedback-page co-creation-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero feedback-hero"><div class="wrap">
        <div class="feedback-hero-kicker">CO-CREATION / DEVELOPMENT GOALS</div>
        <div class="feedback-hero-layout">
          <div><h1>共创中心</h1><p class="hero-sub">我们准备实现什么、推进到哪一步，以及如何确认目标已经完成。</p></div>
          <router-link v-if="canManage" class="feedback-primary-action feedback-hero-action" to="/co-creation/admin">管理开发目标</router-link>
        </div>
      </div></header>
      <section class="feedback-content"><div class="wrap">
        <p class="creation-context">开发目标由管理员规划，关联反馈用于说明需求来源。遇到问题或有建议？前往 <router-link to="/feedback/plaza">反馈中心</router-link>。</p>
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
const canManage = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.DEVELOPMENT_GOAL_MANAGE))
</script>

<style scoped>
.co-creation-page .feedback-hero { --wm: '共创'; }
.creation-context { margin-top: 18px; color: var(--feedback-text-muted); font-size: 13px; line-height: 1.7; }
.creation-context a { color: var(--accent-strong); font-weight: 800; }
</style>
