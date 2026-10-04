<template>
  <header class="compact-tool-header">
    <div class="wrap">
      <div class="compact-tool-row">
        <div class="compact-tool-heading">
          <div class="compact-tool-title">
            <h1>{{ title }}</h1>
            <button v-if="$slots.help" type="button" class="compact-tool-help" :aria-expanded="helpOpen" :aria-controls="helpId" @click="helpOpen = !helpOpen">
              使用帮助
            </button>
          </div>
          <p v-if="description" class="compact-tool-description">{{ description }}</p>
        </div>
        <div v-if="$slots.account" class="compact-tool-account"><slot name="account" /></div>
        <div v-if="$slots.actions" class="compact-tool-actions"><slot name="actions" /></div>
      </div>
      <div v-if="helpOpen" :id="helpId" class="compact-tool-help-content"><slot name="help" /></div>
    </div>
  </header>
</template>

<script setup>
import { ref, useId } from 'vue'

defineProps({ title: { type: String, required: true }, description: { type: String, default: '' } })
const helpOpen = ref(false)
const helpId = useId()
</script>

<style scoped>
.compact-tool-header { padding-block: 12px; border-bottom: 1px solid var(--line); background: var(--cream); color: var(--ink); }
.compact-tool-header:has(.tool-more[open]) { position: relative; z-index: var(--z-popover); }
.compact-tool-header > .wrap { container-type: inline-size; }
.compact-tool-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.compact-tool-heading { flex: 1 1 110px; min-width: 0; }
.compact-tool-title { display: flex; flex-wrap: wrap; align-items: center; gap: 0 10px; }
.compact-tool-title h1 { margin: 0; font-family: var(--font-s); font-size: 22px; font-weight: 900; line-height: 1.4; letter-spacing: .02em; }
.compact-tool-help { min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--ink-60); font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
.compact-tool-help:hover { color: var(--ink); text-decoration: underline; }
.compact-tool-description { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-60); }
.compact-tool-account { order: 3; flex: 1 1 100%; min-width: 0; }
.compact-tool-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; gap: 8px; max-width: 100%; }
.compact-tool-actions :deep(button), .compact-tool-actions :deep(a) { min-height: 44px; white-space: nowrap; flex-shrink: 0; }
.compact-tool-help-content { margin-top: 12px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.compact-tool-help-content :deep(p) { margin: 0; }
@container (min-width: 740px) {
  .compact-tool-row { flex-wrap: nowrap; }
  .compact-tool-title h1 { font-size: 24px; }
  .compact-tool-account { order: initial; flex: 1 1 280px; }
  .compact-tool-heading { flex: 0 0 auto; }
}
</style>

<style>
/* Page-owned disclosures and summaries, shared only by compact tool pages. */
.tool-more { position: relative; }
.tool-more > summary { display: flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; list-style: none; }
.tool-more > summary::-webkit-details-marker { display: none; }
.tool-more > summary::after { content: '⌄'; margin-left: 6px; }
.tool-more[open] > summary::after { content: '⌃'; }
.tool-more-content { position: absolute; inset: calc(100% + 6px) 0 auto auto; z-index: var(--z-popover); display: grid; gap: 8px; width: max-content; max-width: calc(100vw - 32px); padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 8px 24px rgba(73,59,44,.12); }
.tool-summary { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 12px 0; color: var(--ink-60); font-size: 13px; line-height: 1.6; }
.tool-summary > span { display: inline-flex; flex-wrap: nowrap; gap: 4px; align-items: baseline; }
.tool-summary time { white-space: nowrap; font: inherit; font-variant-numeric: tabular-nums; }
.tool-summary b { font-family: var(--font-d); color: var(--ink); }
</style>
