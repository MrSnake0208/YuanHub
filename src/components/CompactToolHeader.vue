<template>
  <header class="compact-tool-header">
    <div class="wrap">
      <div class="compact-tool-row">
        <div class="compact-tool-heading">
          <h1>{{ title }}</h1>
          <p v-if="description" class="compact-tool-description">{{ description }}</p>
        </div>
        <div v-if="$slots.account" class="compact-tool-account"><slot name="account" /></div>
        <div v-if="$slots.primary" class="compact-tool-primary"><slot name="primary" /></div>
        <div v-if="$slots.help || $slots.actions" class="compact-tool-actions">
          <button v-if="$slots.help" type="button" class="compact-tool-help" :aria-expanded="helpOpen" :aria-controls="helpId" @click="helpOpen = !helpOpen">
            <CircleHelp :size="15" aria-hidden="true" />帮助
          </button>
          <slot name="actions" />
        </div>
      </div>
      <div v-if="helpOpen" :id="helpId" class="compact-tool-help-content"><slot name="help" /></div>
    </div>
  </header>
</template>

<script setup>
import { ref, useId } from 'vue'
import { CircleHelp } from '@lucide/vue'

defineProps({ title: { type: String, required: true }, description: { type: String, default: '' } })
const helpOpen = ref(false)
const helpId = useId()
</script>

<style scoped>
.compact-tool-header { padding-block: 14px 8px; color: var(--ink); }
.compact-tool-header:has(.tool-more[open]) { position: relative; z-index: var(--z-popover); }
.compact-tool-header > .wrap { container-type: inline-size; }
.compact-tool-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'heading primary' 'account actions'; align-items: center; gap: 4px 12px; }
.compact-tool-heading { grid-area: heading; min-width: 0; }
.compact-tool-heading h1 { margin: 0; color: var(--tea); font-family: var(--font-s); font-size: 26px; font-weight: 900; line-height: 1.4; letter-spacing: .025em; white-space: nowrap; }
.compact-tool-description { margin: 2px 0 0; font-size: 12px; line-height: 1.5; color: var(--ink-60); }
.compact-tool-account { grid-area: account; min-width: 0; }
.compact-tool-primary { grid-area: primary; justify-self: end; }
.compact-tool-primary :deep(.btn) { min-height: 44px; padding-inline: 16px; border-radius: 10px; text-decoration: none; white-space: nowrap; }
.compact-tool-actions { grid-area: actions; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.compact-tool-help { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 44px; min-height: 44px; padding: 0 4px; border: 0; border-radius: 8px; background: transparent; color: var(--ink-60); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.compact-tool-help:hover { color: var(--tea); background: color-mix(in srgb, var(--tea) 5%, transparent); }
.compact-tool-help:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.compact-tool-help-content { margin-top: 12px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.compact-tool-help-content :deep(p) { margin: 0; }
@container (min-width: 700px) {
  .compact-tool-row { grid-template-columns: auto minmax(0, 1fr) auto auto; grid-template-areas: 'heading account primary actions'; gap: 16px; }
  .compact-tool-heading h1 { font-size: 30px; }
  .compact-tool-account { padding-left: 4px; }
}
@container (max-width: 340px) {
  .compact-tool-heading h1 { font-size: 24px; }
  .compact-tool-primary :deep(.btn) { padding-inline: 12px; }
  .compact-tool-row { column-gap: 8px; }
}
</style>

<style>
/* Page-owned disclosures and summaries, shared only by compact tool pages. */
.tool-more { position: relative; }
.compact-tool-header .tool-more > summary { display: flex; align-items: center; justify-content: center; gap: 5px; min-width: 44px; min-height: 44px; padding: 0 4px; border: 0; border-radius: 8px; background: transparent; color: var(--ink-60); font-size: 12px; font-weight: 500; white-space: nowrap; cursor: pointer; list-style: none; }
.tool-more > summary::-webkit-details-marker { display: none; }
.tool-more > summary::before { content: '⋯'; font-size: 20px; line-height: 1; }
.tool-more > summary:hover, .tool-more[open] > summary { color: var(--tea); background: color-mix(in srgb, var(--tea) 5%, transparent); }
.tool-more > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tool-more-content { position: absolute; inset: calc(100% + 6px) 0 auto auto; z-index: var(--z-popover); display: grid; gap: 8px; width: max-content; max-width: calc(100vw - 32px); padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 8px 24px rgba(73,59,44,.12); }
.tool-summary { display: flex; flex-wrap: wrap; gap: 2px 0; margin: 2px 0 10px; color: var(--ink-60); font-size: 13px; line-height: 1.6; }
.tool-summary > span { display: inline-flex; flex-wrap: nowrap; gap: 4px; align-items: baseline; }
.tool-summary > span + span::before { content: '·'; margin-inline: 8px; color: var(--ink-35); }
.tool-summary time { white-space: nowrap; font: inherit; font-variant-numeric: tabular-nums; }
.tool-summary b { font-family: var(--font-d); color: inherit; font-weight: 500; }
</style>
