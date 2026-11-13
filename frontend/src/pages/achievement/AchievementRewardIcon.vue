<template>
  <img v-if="src && failedSrc !== src" class="achievement-reward-icon xinzhi-icon" :src="src" alt="" aria-hidden="true" width="32" height="32" loading="lazy" decoding="async" @load="onXinzhiLoad" @error="fallbackXinzhiIcon($event) || (failedSrc = src)">
  <slot v-else />
</template>

<script setup>
import { computed, ref } from 'vue'
import { rewardImagePath } from './rewardImages.js'
import { xinzhiIconUrl, onXinzhiLoad, fallbackXinzhiIcon } from '../../api/request.js'

const props = defineProps({ reward: { type: Object, required: true } })
const failedSrc = ref(null)
const src = computed(() => {
  const path = rewardImagePath(props.reward)
  const agent = path?.match(/^inventory-icons\/agents\/(char_[A-Za-z0-9_]+)\.png$/)
  if (agent) return xinzhiIconUrl(agent[1])
  return path ? `${import.meta.env.BASE_URL}${path}` : null
})
</script>

<style scoped>
.achievement-reward-icon { width: 32px; height: 32px; flex-shrink: 0; object-fit: contain; }
</style>
