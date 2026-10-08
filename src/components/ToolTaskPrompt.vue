<template>
  <section v-if="guideTask !== 'today-first-data' || !guide?.active" class="tool-task-prompt" :class="{ 'is-error': error, 'is-guide-entry': compactGuideEntry }" :role="error ? 'alert' : 'status'" :aria-label="title">
    <h2 v-if="!compactGuideEntry">{{ title }}</h2>
    <p v-if="description && !compactGuideEntry">{{ description }}</p>
    <div v-if="guideTask && !guide?.active" class="tool-task-actions">
      <button type="button" class="btn" @click="startGuide">{{ guide?.dismissedForNow || guide?.disableAutoGuide ? '重新进入 / 继续实操教程' : '跟着做一次' }}</button>
      <button v-if="!guide?.dismissedForNow && !guide?.disableAutoGuide" type="button" class="btn" @click="guide.dismiss()">直接使用 / 暂时关闭</button>
      <label v-if="!guide?.dismissedForNow" class="guide-preference"><input type="checkbox" :checked="guide?.disableAutoGuide" @change="disableAutoGuide($event.target.checked)" />以后不自动提示</label>
    </div>
    <div v-if="$slots.default" class="tool-task-actions"><slot /></div>
  </section>
</template>

<script setup>
import { computed, shallowRef, watch } from 'vue'
import { useOnboardingStore } from '../stores/onboarding.js'
import { auth } from '../store/auth.js'
const props = defineProps({ title: { type: String, required: true }, description: { type: String, default: '' }, error: Boolean, guideTask: { type: String, default: '' } })
const guide = shallowRef(null)
const compactGuideEntry = computed(() => props.guideTask === 'today-first-data' && !!(guide.value?.dismissedForNow || guide.value?.disableAutoGuide))
watch(() => [props.guideTask, auth.isLoggedIn ? auth.userInfo?.id : 'guest'], ([task, owner]) => {
  if (task) guide.value = useOnboardingStore().initialize(owner || 'guest')
}, { immediate: true })
function startGuide() { guide.value.start(props.guideTask) }
function disableAutoGuide(value) { guide.value.disableAutoGuide = value; guide.value.persist() }
</script>

<style scoped>
.tool-task-prompt { margin-block: 16px 24px; padding: 32px 16px; text-align: center; background: color-mix(in srgb, var(--surface) 88%, transparent); border: 1px solid var(--line); border-radius: 16px; }
.tool-task-prompt h2 { margin: 0; color: var(--tea); font: 900 22px/1.5 var(--font-s); }
.tool-task-prompt p { max-width: 40em; margin: 8px auto 0; color: var(--ink-60); font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }
.tool-task-actions { display: grid; justify-items: center; gap: 4px; margin-top: 20px; }
.tool-task-actions :deep(a), .tool-task-actions :deep(button) { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; font-size: 14px; text-decoration: none; }
.tool-task-actions :deep(.btn) { flex: none; padding: 10px 18px; border-radius: 8px; white-space: nowrap; }
.tool-task-actions :deep(.link) { padding: 8px; background: transparent; border: 0; color: var(--tea); text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }
.tool-task-actions :deep(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
.tool-task-prompt.is-error { border-color: var(--rouge); }
.guide-preference { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: var(--ink-60); }
.guide-preference input { width: 20px; height: 20px; }
.tool-task-prompt.is-guide-entry { padding: 0; border: 0; background: transparent; }
.is-guide-entry .tool-task-actions { margin-top: 0; }
@media (min-width: 768px) { .tool-task-prompt { padding-block: 40px; border-radius: 20px; } .tool-task-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 16px; } }
</style>
