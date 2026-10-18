<template>
  <Teleport to="body">
    <div v-if="entry" class="disc-target-mask" @click.self="$emit('close')">
      <section ref="panel" class="disc-target-modal" role="dialog" aria-modal="true" aria-labelledby="disc-target-title" tabindex="-1">
        <header>
          <h3 id="disc-target-title">{{ entry.name }} · 命盘目标</h3>
          <button ref="closeButton" type="button" aria-label="关闭命盘目标" @click="$emit('close')"><X :size="20" aria-hidden="true" /></button>
        </header>
        <section v-for="(loadout, index) in loadouts" :key="index" class="disc-target-detail">
          <div class="disc-target-detail-heading">
            <h4>命盘{{ index === 0 ? '一' : '二' }} <small>{{ DISC_STATUSES[loadout.status] }}</small></h4>
            <button type="button" @click="$emit('edit', index)">编辑这套命盘</button>
          </div>
          <OperatorDiscComparison :current="loadout.discNames" :target="loadout.targetDiscNames" :catalog="catalog" />
        </section>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { createDiscLoadoutState, DISC_STATUSES } from '../../utils/operatorDiscLoadouts.js'
import OperatorDiscComparison from './OperatorDiscComparison.vue'
const props = defineProps({ entry: { type: Object, default: null }, catalog: { type: Array, default: () => [] } })
const emit = defineEmits(['close', 'edit'])
const panel = ref(null)
const closeButton = ref(null)
const visible = computed(() => !!props.entry)
const loadouts = computed(() => createDiscLoadoutState(props.entry?.discLoadouts, props.entry?.discs).loadouts)
useModalFocus(visible, panel, { initialFocus: () => closeButton.value, onEscape: () => emit('close') })
watch(visible, (open, _, onCleanup) => {
  if (!open) return
  const previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  onCleanup(() => { document.body.style.overflow = previousOverflow })
}, { immediate: true })
</script>

<style scoped>
.disc-target-mask { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: end center; padding: 12px; background: rgba(73, 59, 44, .38); }
.disc-target-modal { width: min(760px, 100%); min-width: 0; max-height: min(85dvh, 760px); overflow-y: auto; padding: 16px; padding-bottom: max(16px, env(safe-area-inset-bottom)); border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); }
.disc-target-modal header, .disc-target-detail-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.disc-target-modal header h3 { margin: 0; font-size: 20px; }
.disc-target-modal button { flex: none; padding: 6px 8px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); color: var(--tea); font: inherit; font-size: 12px; cursor: pointer; }
.disc-target-modal button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.disc-target-detail { margin-top: 16px; }
.disc-target-detail-heading { margin-bottom: 8px; flex-wrap: wrap; }
.disc-target-detail h4 { margin: 0; font-size: 15px; }
.disc-target-detail h4 small { margin-left: 8px; color: var(--ink-60); font: 12px var(--font-s); }
@media (min-width: 769px) { .disc-target-mask { place-items: center; } .disc-target-modal { padding: 20px; } }
</style>
