<template>
  <div class="feedback-notification-toasts" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="feedback-toast">
      <article v-for="item in notificationRealtimeState.toasts" :key="item.id" class="feedback-notification-toast" role="status"
        @mouseenter="pauseFeedbackNotification(item.id)" @mouseleave="resumeFeedbackNotification(item.id)"
        @focusin="pauseFeedbackNotification(item.id)" @focusout="resumeFeedbackNotification(item.id)">
        <MessageSquare class="feedback-toast-icon" :size="20" aria-hidden="true" />
        <div class="feedback-toast-copy">
          <strong>{{ item.title }}</strong>
          <p>{{ item.body }}</p>
          <RouterLink :to="target(item)" @click="dismissFeedbackNotification(item.id)">查看回复 <ArrowRight :size="14" aria-hidden="true" /></RouterLink>
        </div>
        <button type="button" aria-label="关闭反馈提醒" title="关闭" @click="dismissFeedbackNotification(item.id)"><X :size="16" aria-hidden="true" /></button>
      </article>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { ArrowRight, MessageSquare, X } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { notificationRealtimeState, dismissFeedbackNotification, pauseFeedbackNotification, resumeFeedbackNotification } from '../store/notificationRealtime.js'

function target(item) {
  return (item.kind === 'FEEDBACK_MESSAGE_FROM_REPORTER' ? '/feedback/manage' : '/feedback') + '?id=' + encodeURIComponent(item.refId)
}
</script>

<style scoped>
.feedback-notification-toast { border: 1.5px solid var(--yellow-deep); border-radius: 18px 18px 6px 18px; background: var(--surface); color: var(--ink); box-shadow: 0 12px 28px rgba(73, 59, 44, .18); pointer-events: auto; }
.feedback-toast-icon { color: var(--accent-strong); }
.feedback-toast-copy p { color: var(--ink-60); }
.feedback-toast-copy a { color: var(--brand-blue); text-decoration: underline; text-underline-offset: 3px; }
.feedback-notification-toast button { border: 0; border-radius: 50%; background: transparent; color: var(--ink-60); cursor: pointer; }
.feedback-notification-toast button:hover, .feedback-notification-toast button:active { background: var(--cream); color: var(--ink); }
.feedback-notification-toast a:focus-visible, .feedback-notification-toast button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.feedback-toast-enter-active, .feedback-toast-leave-active { transition: opacity .2s ease, transform .2s var(--ease); }
.feedback-toast-enter-from, .feedback-toast-leave-to { opacity: 0; transform: translateY(-8px); }
@media (prefers-reduced-motion: reduce) { .feedback-toast-enter-active, .feedback-toast-leave-active { transition: none; } }
</style>
<style scoped src="./feedbackNotificationToastsDesktop.css"></style>
<style scoped src="./feedbackNotificationToastsMobile.css"></style>
