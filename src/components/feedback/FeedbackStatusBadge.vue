<template>
  <span v-if="label" class="feedback-status-badge" :class="'is-' + normalized">{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { publicStatusLabel } from '@/utils/feedbackPublic.js'

const props = defineProps({
  status: { type: String, default: '' }
})

const normalized = computed(() => String(props.status || '').trim().toUpperCase())
const label = computed(() => publicStatusLabel(props.status))
</script>

<style scoped>
.feedback-status-badge {
  min-height: 25px;
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border: 1px solid var(--feedback-line-strong);
  border-radius: 5px;
  color: var(--feedback-text-muted);
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
}
.feedback-status-badge.is-CONFIRMED { border-color: var(--brand-blue); color: var(--brand-blue); }
.feedback-status-badge.is-PLANNED { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }
.feedback-status-badge.is-IN_PROGRESS { border-color: var(--accent); color: var(--accent-strong); }
.feedback-status-badge.is-COMPLETED { border-color: var(--feedback-success); color: var(--feedback-success); }
.feedback-status-badge.is-NOT_PLANNED { color: var(--feedback-text-dim); }
</style>
