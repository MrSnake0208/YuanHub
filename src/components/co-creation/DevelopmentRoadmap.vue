<template>
  <div class="co-placeholder">
    <Map :size="26" aria-hidden="true" />
    <strong>开发进度将在下一轮开放</strong>
    <span>届时会按「计划中 / 开发中 / 最近完成」展示已公开的反馈进度。</span>
    <router-link class="feedback-button" to="/co-creation">先看看反馈广场</router-link>
  </div>
</template>

<script setup>
import { Map } from '@lucide/vue'
</script>

<style scoped>
.co-placeholder { min-height: 240px; display: grid; place-content: center; justify-items: center; gap: 10px; margin-top: 18px; padding: 28px; border: 1px dashed var(--feedback-line-strong); border-radius: 8px; background: var(--feedback-panel); color: var(--feedback-text-muted); text-align: center; }
.co-placeholder strong { color: var(--feedback-text); font-size: 15px; }
.co-placeholder .feedback-button { margin-top: 6px; text-decoration: none; }
</style>
