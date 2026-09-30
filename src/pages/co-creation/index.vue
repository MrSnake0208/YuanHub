<template>
  <div class="feedback-page co-creation-page">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero feedback-hero"><div class="wrap">
        <div class="feedback-hero-kicker">DEVELOPMENT GOALS</div>
        <div class="feedback-hero-layout">
          <div><h1>大饼中心 <small>功能计划</small></h1><p class="hero-sub">看看接下来会有什么新功能、现在进展如何，以及完成后能做什么。</p></div>
          <router-link v-if="canManage" class="feedback-primary-action feedback-hero-action" to="/co-creation/admin">管理开发目标</router-link>
        </div>
      </div></header>
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
const canManage = computed(() => hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.DEVELOPMENT_GOAL_MANAGE))
</script>

<style scoped>
.co-creation-page .feedback-hero { --wm: '大饼'; }
.co-creation-page h1 small { display: inline-block; color: var(--tea); font: 700 18px var(--font-b); letter-spacing: 0; }
.creation-context { margin-top: 18px; color: var(--feedback-text-muted); font-size: 13px; line-height: 1.7; }
.creation-context a { color: var(--accent-strong); font-weight: 800; }
</style>
