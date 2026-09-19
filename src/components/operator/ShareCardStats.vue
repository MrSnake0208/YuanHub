<template>
  <div class="share-card-stats" :class="{ 'is-enabled': enabled, 'is-instant': instant }">
    <button
      v-if="enabled"
      type="button"
      class="share-stats-toggle"
      :aria-label="`${name}：显示养成数据`"
      :aria-pressed="showGrowth"
      :aria-controls="`${panelId}-combat ${panelId}-growth`"
      @click="toggle"
    >
      <span class="share-stats-next"><span>{{ showGrowth ? '攻血' : '等级' }}</span><ArrowLeftRight :size="11" aria-hidden="true" /></span>
    </button>
    <div
      :id="`${panelId}-combat`"
      class="share-stats-view"
      :class="{ 'is-hidden': enabled && showGrowth }"
      :aria-hidden="enabled && showGrowth ? true : undefined"
      :inert="enabled && showGrowth"
    >
      <slot name="combat" />
    </div>
    <div
      :id="`${panelId}-growth`"
      class="share-stats-view"
      :class="{ 'is-hidden': enabled && !showGrowth }"
      :aria-hidden="enabled && !showGrowth ? true : undefined"
      :inert="enabled && !showGrowth"
    >
      <slot name="growth" />
    </div>
  </div>
</template>

<script setup>
import { ref, useId } from 'vue'
import { ArrowLeftRight } from '@lucide/vue'

defineProps({
  enabled: { type: Boolean, default: false },
  name: { type: String, required: true }
})

const panelId = useId()
const showGrowth = ref(false)
const instant = ref(false)

function toggle(event) {
  instant.value = event.detail === 0
  showGrowth.value = !showGrowth.value
}
</script>

<style scoped>
.share-card-stats,
.share-stats-view { display: contents; }

.share-card-stats.is-enabled {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-column: 1;
  grid-row: 1;
  align-self: start;
  width: 100%;
  min-width: 0;
  max-width: 172px;
  /* Keep the content and touch target stable while sizing the background separately. */
  height: 48px;
  margin: 5px 0 0 -3px;
  padding-right: 22px;
  border-radius: 8px 6px 6px 6px;
}
.share-card-stats.is-enabled::before {
  position: absolute;
  z-index: -1;
  inset: 0 0 4px;
  border-radius: inherit;
  background: color-mix(in srgb, var(--surface) 64%, transparent);
  pointer-events: none;
  content: '';
}

.share-stats-toggle {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--ink-60);
  font: 700 10px/1.4 var(--font-b);
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}
.share-stats-toggle:active { transform: none; }
.share-stats-next {
  position: absolute;
  /* Align the visual control with the top-aligned data; keep the full-panel hit area. */
  inset: 2px 0 7px auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  /* Reserve 2px on each side of the divider without shifting the label. */
  width: 20px;
  padding-left: 1px;
  color: var(--accent-strong);
}
.share-stats-next::before {
  position: absolute;
  inset: 0 auto 3px 0;
  width: 1px;
  background: var(--line);
  content: '';
}
.share-stats-next > span { writing-mode: vertical-rl; text-orientation: upright; }

/* Both views size the same grid cell, so switching never moves the cards below. */
.is-enabled .share-stats-view {
  display: grid;
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
  opacity: 1;
  visibility: visible;
  transition: opacity .14s ease-out, visibility 0s;
}
.is-enabled .share-stats-view.is-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity .14s ease-out, visibility 0s .14s;
}
.is-enabled.is-instant .share-stats-view { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .is-enabled .share-stats-view,
  .is-enabled .share-stats-view.is-hidden { transition: none; }
}
</style>
