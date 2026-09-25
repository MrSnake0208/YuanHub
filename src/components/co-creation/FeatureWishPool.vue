<template>
  <div class="co-placeholder">
    <Lightbulb :size="26" aria-hidden="true" />
    <strong>许愿池将在下一轮开放</strong>
    <span>想提功能建议？可以先到反馈中心提交，管理员公开后就会在这里展示。</span>
    <router-link class="feedback-primary-action" to="/feedback">去提交功能建议</router-link>
  </div>
</template>

<script setup>
import { Lightbulb } from '@lucide/vue'
</script>

<style scoped>
.co-placeholder { min-height: 240px; display: grid; place-content: center; justify-items: center; gap: 10px; margin-top: 18px; padding: 28px; border: 1px dashed var(--feedback-line-strong); border-radius: 8px; background: var(--feedback-panel); color: var(--feedback-text-muted); text-align: center; }
.co-placeholder strong { color: var(--feedback-text); font-size: 15px; }
.co-placeholder .feedback-primary-action { margin-top: 6px; text-decoration: none; }
</style>
