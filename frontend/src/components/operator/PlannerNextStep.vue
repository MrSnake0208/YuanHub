<template>
  <section class="planner-next-step" aria-label="下一步">
    <div class="next-step-action">
      <div class="next-step-copy">
        <p :id="action.descriptionId" class="next-step-message" role="status">{{ action.message }}</p>
        <p v-if="action.detail" class="next-step-help">{{ action.detail }}</p>
      </div>
      <button v-if="action.label" type="button" :disabled="action.disabled" :aria-describedby="action.descriptionId" @click="$emit('action')">{{ action.label }}</button>
    </div>
    <p v-if="action.onboarding" class="next-step-help">选密探和目标 → 生成日程 → 每天照着刷</p>
    <slot />
  </section>
</template>

<script setup>
defineProps({ action: { type: Object, required: true } })
defineEmits(['action'])
</script>

<style scoped>
.planner-next-step { min-width: 0; margin: 12px 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.next-step-action { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.next-step-copy { flex: 1 1 220px; min-width: 0; }
.next-step-message { margin: 0; font: 600 15px/1.6 var(--font-b); color: var(--ink); overflow-wrap: anywhere; }
.next-step-action button { min-height: 44px; max-width: 100%; padding: 8px 14px; border: 1px solid var(--tea); border-radius: 8px; background: var(--tea); color: var(--on-strong); font: 600 13px/1.5 var(--font-b); cursor: pointer; }
.next-step-action button:disabled { opacity: .55; cursor: not-allowed; }
.next-step-help { margin: 8px 0 0; color: var(--ink-60); font: 12px/1.6 var(--font-b); }
@media (max-width: 760px) {
  .planner-next-step { padding: 12px; }
  .next-step-copy { flex-basis: 100%; }
}
</style>
