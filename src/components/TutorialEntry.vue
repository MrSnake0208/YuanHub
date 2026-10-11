<template>
  <button v-if="TUTORIALS_ENABLED" type="button" class="tutorial-entry" @click="start"><CircleHelp :size="15" aria-hidden="true" />{{ label }}</button>
</template>

<script setup>
import { CircleHelp } from '@lucide/vue'
import { useOnboardingStore } from '../stores/onboarding.js'
import { auth } from '../store/auth.js'
import { TUTORIALS_ENABLED } from '../config/features.js'

const props = defineProps({ task: { type: String, required: true }, label: { type: String, default: '使用教程' } })
function start() {
  if (!TUTORIALS_ENABLED) return
  useOnboardingStore().initialize(auth.isLoggedIn ? String(auth.userInfo?.id || 'guest') : 'guest').start(props.task)
}
</script>

<style scoped>
.tutorial-entry { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 44px; padding: 0 4px; border: 0; border-radius: 8px; background: transparent; color: var(--ink-60); font: 12px/1.5 var(--font-b); white-space: nowrap; cursor: pointer; }
.tutorial-entry:hover { color: var(--tea); background: color-mix(in srgb, var(--tea) 5%, transparent); }
.tutorial-entry:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
