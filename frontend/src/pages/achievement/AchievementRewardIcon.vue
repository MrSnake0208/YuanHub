<template>
  <img v-if="src && failedSrc !== src" class="achievement-reward-icon" :src="src" alt="" aria-hidden="true" width="32" height="32" loading="lazy" decoding="async" @error="failedSrc = src">
  <slot v-else />
</template>

<script setup>
import { computed, ref } from 'vue'
import { rewardImagePath } from './rewardImages.js'

const props = defineProps({ reward: { type: Object, required: true } })
const failedSrc = ref(null)
const src = computed(() => {
  const path = rewardImagePath(props.reward)
  return path ? `${import.meta.env.BASE_URL}${path}` : null
})
</script>

<style scoped>
.achievement-reward-icon { width: 32px; height: 32px; flex-shrink: 0; object-fit: contain; }
</style>
