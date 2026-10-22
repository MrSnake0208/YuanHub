<template>
  <Teleport to="body">
    <div v-if="entry" class="disc-target-mask" @click.self="$emit('close')">
      <section ref="panel" class="disc-target-modal" role="dialog" aria-modal="true" aria-labelledby="disc-target-title" tabindex="-1">
        <header>
          <h3 id="disc-target-title">{{ entry.name }} · 命盘目标</h3>
          <button ref="closeButton" type="button" aria-label="关闭命盘目标" @click="$emit('close')"><X :size="20" aria-hidden="true" /></button>
        </header>
        <div class="disc-target-grid">
          <section v-for="(loadout, index) in loadouts" :key="index" class="disc-target-detail">
            <div class="disc-target-detail-heading">
              <h4>命盘{{ index === 0 ? '一' : '二' }}</h4>
              <span class="disc-target-status" :class="'is-' + loadout.status">
                <CircleCheck v-if="loadout.status === 'perfect'" :size="14" aria-hidden="true" />
                <RefreshCw v-else-if="loadout.status === 'reroll'" :size="14" aria-hidden="true" />
                {{ DISC_STATUSES[loadout.status] }}<template v-if="loadout.status === 'reroll' && loadout.difference.count > 0"> · {{ loadout.difference.count }}处</template>
              </span>
              <button type="button" :aria-label="'编辑命盘' + (index === 0 ? '一' : '二')" @click="$emit('edit', index)">编辑<ChevronRight :size="14" aria-hidden="true" /></button>
            </div>
            <OperatorDiscComparison :current="loadout.discNames" :target="loadout.targetDiscNames" :catalog="catalog" compact
              :current-only="loadout.status === 'perfect' || (loadout.status === 'unmarked' && !loadout.targetDiscNames.length)" />
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ChevronRight, CircleCheck, RefreshCw, X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { createDiscLoadoutState, discTargetDifference, DISC_STATUSES } from '../../utils/operatorDiscLoadouts.js'
import OperatorDiscComparison from './OperatorDiscComparison.vue'
const props = defineProps({ entry: { type: Object, default: null }, catalog: { type: Array, default: () => [] } })
const emit = defineEmits(['close', 'edit'])
const panel = ref(null)
const closeButton = ref(null)
const visible = computed(() => !!props.entry)
const loadouts = computed(() => createDiscLoadoutState(props.entry?.discLoadouts, props.entry?.discs).loadouts.map(loadout => ({
  ...loadout, difference: discTargetDifference(loadout.discNames, loadout.targetDiscNames),
})))
useModalFocus(visible, panel, { initialFocus: () => closeButton.value, onEscape: () => emit('close') })
watch(visible, (open, _, onCleanup) => {
  if (!open) return
  const previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  onCleanup(() => { document.body.style.overflow = previousOverflow })
}, { immediate: true })
</script>

<style scoped>
.disc-target-mask { position: fixed; inset: 0; z-index: var(--z-overlay-panel); display: grid; place-items: end center; padding: 12px; background: rgba(73, 59, 44, .38); }
.disc-target-modal { box-sizing: border-box; width: min(880px, 100%); min-width: 0; max-height: min(85dvh, 760px); overflow-y: auto; padding: 16px; padding-bottom: max(16px, env(safe-area-inset-bottom)); border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); }
.disc-target-modal header, .disc-target-detail-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.disc-target-modal header h3 { min-width: 0; margin: 0; font-size: 20px; overflow-wrap: anywhere; }
.disc-target-modal button { display: inline-flex; align-items: center; justify-content: center; gap: 2px; flex: none; padding: 7px 6px; border: 0; border-radius: 5px; background: transparent; color: var(--tea); font: inherit; font-size: 12px; cursor: pointer; }
.disc-target-modal button:hover { background: var(--paper); }
.disc-target-modal button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.disc-target-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); align-items: start; gap: 12px; margin-top: 14px; }
.disc-target-detail { min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; }
.disc-target-detail-heading { justify-content: flex-start; margin-bottom: 8px; gap: 8px; flex-wrap: wrap; }
.disc-target-detail-heading button { margin-left: auto; }
.disc-target-detail h4 { margin: 0; font-size: 15px; }
.disc-target-status { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; border-radius: 5px; color: var(--ink-60); font: 12px var(--font-s); white-space: nowrap; }
.disc-target-status.is-perfect { color: #52694e; background: #edf3e7; }
.disc-target-status.is-reroll { color: #8a5a1f; background: #fcf0d9; }
@media (min-width: 769px) { .disc-target-mask { place-items: center; } .disc-target-modal { padding: 20px; } }
</style>
