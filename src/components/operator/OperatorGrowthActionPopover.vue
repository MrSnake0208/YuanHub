<template>
  <div v-if="props.open" class="ledger-popover ledger-upgrade-popover growth-action-popover" aria-live="polite">
    <p><CircleAlert :size="13" aria-hidden="true" />{{ props.targetLabel }}</p>
    <label v-if="props.showBreakthrough" class="ledger-breakthrough-toggle">
      <input type="checkbox" :checked="props.breakthrough" :disabled="props.breakthroughDisabled" @change="emit('breakthrough-change', $event)" />
      <span>已突破？<small>不计突破材料</small></span>
    </label>
    <div v-if="props.previewBusy" class="ledger-popover-state">正在核对库存与养成版本…</div>
    <div v-else-if="props.previewError" class="ledger-popover-state is-error">
      {{ props.previewError }}
      <button type="button" @click="emit('retry')">重试</button>
    </div>
    <template v-else-if="props.preview">
      <div class="ledger-material-list">
        <span v-for="item in props.displayRequirements" :key="(item.entity_type || item.entityType) + ':' + item.id" :class="{ 'is-lack': props.requirementValue(item, 'balance_after') < 0 }">
          {{ props.requirementName(item) }} ×{{ props.requirementValue(item, 'required') }}<small>{{ props.requirementBalanceLabel(item) }}</small>
        </span>
        <em v-if="!props.displayRequirements.length">无需扣除库存道具</em>
      </div>
      <em v-for="reason in props.blockingReasons" :key="reason.code + ':' + reason.message" class="ledger-popover-blocked">{{ props.reasonMessage(reason) }}</em>
      <div v-if="props.available" class="ledger-popover-actions">
        <button type="button" :disabled="props.executeBusy" @click="emit('execute')">{{ props.executeBusy ? '正在提升…' : '确认提升并扣除库存' }}</button>
      </div>
      <em v-else-if="!props.blockingReasons.length && !props.hasMaterialGap" class="ledger-popover-blocked">当前状态无法提升</em>
    </template>
  </div>
</template>

<script setup>
import { CircleAlert } from '@lucide/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  targetLabel: { type: String, default: '' },
  showBreakthrough: { type: Boolean, default: false },
  breakthrough: { type: Boolean, default: false },
  breakthroughDisabled: { type: Boolean, default: false },
  previewBusy: { type: Boolean, default: false },
  previewError: { type: String, default: '' },
  preview: { type: Object, default: null },
  displayRequirements: { type: Array, default: () => [] },
  blockingReasons: { type: Array, default: () => [] },
  available: { type: Boolean, default: false },
  hasMaterialGap: { type: Boolean, default: false },
  executeBusy: { type: Boolean, default: false },
  requirementName: { type: Function, required: true },
  requirementValue: { type: Function, required: true },
  requirementBalanceLabel: { type: Function, required: true },
  reasonMessage: { type: Function, required: true },
})

const emit = defineEmits(['retry', 'execute', 'breakthrough-change'])
</script>

<style scoped>
.growth-action-popover { position: absolute; z-index: 20; top: calc(100% + 7px); right: 0; left: 0; display: flex; flex-direction: column; gap: 7px; padding: 9px; border: 1px solid var(--accent); border-radius: 8px; background: var(--surface); box-shadow: 0 10px 25px rgba(73, 59, 44, .22); }
.growth-action-popover::before { position: absolute; top: -6px; right: 24px; width: 10px; height: 10px; border-top: 1px solid var(--accent); border-left: 1px solid var(--accent); background: var(--surface); content: ''; transform: rotate(45deg); }
.growth-action-popover p { display: flex; align-items: flex-start; gap: 4px; color: var(--brand-blue); font-size: 9.5px; line-height: 1.35; font-weight: 700; }
.growth-action-popover p svg { flex: none; }
.growth-action-popover > div { display: flex; gap: 5px; }
.ledger-breakthrough-toggle { display: inline-flex; min-height: 32px; align-items: center; align-self: stretch; gap: 7px; padding: 5px 7px; border: 1px solid var(--line); border-radius: 6px; background: var(--cream); color: var(--ink-60); font-size: 9px; font-weight: 800; cursor: pointer; }
.ledger-breakthrough-toggle span { display: flex; min-width: 0; align-items: baseline; gap: 5px; }
.ledger-breakthrough-toggle small { color: var(--ink-35); font-size: 8px; font-weight: 700; }
.ledger-breakthrough-toggle input { width: 14px; height: 14px; flex: none; margin: 0; padding: 0; accent-color: var(--accent); }
.ledger-breakthrough-toggle:has(input:checked) { border-color: rgba(215, 137, 53, .45); background: rgba(239, 210, 142, .3); color: var(--tea); }
.ledger-breakthrough-toggle:has(input:disabled) { cursor: wait; opacity: .68; }
.growth-action-popover button { flex: none; border: 0; border-radius: 4px; padding: 0 8px; background: var(--accent); color: #fff; font-size: 10px; font-weight: 800; cursor: pointer; }
.growth-action-popover button:disabled { cursor: wait; opacity: .6; }
.ledger-material-list { display: flex !important; flex-direction: column; gap: 4px !important; max-height: 150px; overflow: auto; padding: 1px 0; }
.ledger-material-list span { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 4px 5px; border: 1px solid rgba(73, 59, 44, .12); border-radius: 4px; background: var(--cream); color: var(--ink); font: 700 9px/1.3 var(--font-b); }
.ledger-material-list span.is-lack { border-color: rgba(166, 81, 74, .35); background: rgba(240, 207, 200, .35); color: var(--rouge); }
.ledger-material-list small { flex: none; color: var(--ink-60); font: 700 8px var(--font-b); }
.ledger-material-list .is-lack small { color: var(--rouge); }
.ledger-material-list em { color: var(--ink-35); font-size: 9px; font-style: normal; }
.ledger-popover-state { display: flex; min-height: 54px; align-items: center; justify-content: center; gap: 8px; padding: 9px; border: 1px dashed var(--line); border-radius: 7px; color: var(--ink-60); font-size: 10px; text-align: center; }
.ledger-popover-state.is-error { border-color: rgba(166, 81, 74, .35); background: rgba(240, 207, 200, .24); color: var(--rouge); }
.ledger-popover-state button { flex: none; padding: 5px 8px; }
.ledger-popover-blocked { align-self: flex-end; color: var(--rouge); font-size: 9px; font-style: normal; font-weight: 800; }
.ledger-popover-actions { justify-content: flex-end; }
.ledger-popover-actions button { min-height: 32px; }
@media (max-width: 640px) {
  .growth-action-popover { max-height: min(52vh, 320px); overflow: auto; overscroll-behavior: contain; }
  .growth-action-popover button { min-height: 36px; }
}
</style>
