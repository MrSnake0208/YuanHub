<template>
  <span class="feedback-type-badge">{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { publicTypeLabel } from '@/utils/feedbackPublic.js'

const props = defineProps({
  type: { type: String, default: '' }
})

const label = computed(() => publicTypeLabel(props.type))
</script>

<style scoped>
.feedback-type-badge {
  min-height: 25px;
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border: 1px solid var(--feedback-line-strong);
  border-radius: 5px;
  background: var(--feedback-panel);
  color: var(--feedback-text-muted);
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
}
</style>
