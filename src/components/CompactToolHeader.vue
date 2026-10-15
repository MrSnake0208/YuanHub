<template>
  <header class="compact-tool-header">
    <div class="wrap">
      <div class="compact-tool-row">
        <div class="compact-tool-heading">
          <h1>{{ title }}</h1>
          <p v-if="description" class="compact-tool-description">{{ description }}</p>
        </div>
        <div v-if="$slots.account" class="compact-tool-account"><slot name="account" /></div>
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.compact-tool-header { color: var(--ink); }
.compact-tool-heading h1 { color: var(--tea); }
.compact-tool-description { color: var(--ink-60); }
.compact-tool-help { border: 0; border-radius: 8px; background: transparent; color: var(--ink-60); cursor: pointer; }
.compact-tool-help:hover { color: var(--tea); background: color-mix(in srgb, var(--tea) 5%, transparent); }
.compact-tool-help:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.compact-tool-help-content { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
</style>
<style scoped src="./compactToolHeaderDesktop.css"></style>
<style scoped src="./compactToolHeaderMobile.css"></style>

<style>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* Page-owned disclosures and summaries, shared only by compact tool pages. */
.compact-tool-header .tool-more > summary { border: 0; border-radius: 8px; background: transparent; color: var(--ink-60); cursor: pointer; }
.tool-more > summary::before { content: '⋯'; }
.tool-more > summary:hover, .tool-more[open] > summary { color: var(--tea); background: color-mix(in srgb, var(--tea) 5%, transparent); }
.tool-more > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tool-more-content { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 8px 24px rgba(73,59,44,.12); }
/* Shared action appearance; each device file owns the menu geometry. */
.tool-more-content > .act-btn { border: 1.5px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink-60); text-decoration: none; cursor: pointer; transition: border-color .18s,color .18s; }
.tool-more-content > .act-btn:hover:not(:disabled) { border-color: var(--ink); color: var(--ink); }
.tool-more-content > .act-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tool-more-content > .act-btn:disabled { opacity: .45; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .tool-more-content > .act-btn { transition: none; } }
.tool-summary { color: var(--ink-60); }
.tool-summary > span + span::before { content: '·'; color: var(--ink-35); }
.tool-summary b { color: inherit; }
</style>
<style src="./compactToolHeaderOverrides1Desktop.css"></style>
<style src="./compactToolHeaderOverrides1Mobile.css"></style>
