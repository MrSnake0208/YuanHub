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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.growth-action-popover { border: 1px solid var(--accent); border-radius: 8px; background: var(--surface); box-shadow: 0 10px 25px rgba(73, 59, 44, .22); }
.growth-action-popover::before { border-top: 1px solid var(--accent); border-left: 1px solid var(--accent); background: var(--surface); content: ''; }
.growth-action-popover p { color: var(--brand-blue); }
.ledger-breakthrough-toggle { border: 1px solid var(--line); border-radius: 6px; background: var(--cream); color: var(--ink-60); cursor: pointer; }
.ledger-breakthrough-toggle small { color: var(--ink-35); }
.ledger-breakthrough-toggle input { accent-color: var(--accent); }
.ledger-breakthrough-toggle:has(input:checked) { border-color: rgba(215, 137, 53, .45); background: rgba(239, 210, 142, .3); color: var(--tea); }
.ledger-breakthrough-toggle:has(input:disabled) { cursor: wait; opacity: .68; }
.growth-action-popover button { border: 0; border-radius: 4px; background: var(--accent); color: #fff; cursor: pointer; }
.growth-action-popover button:disabled { cursor: wait; opacity: .6; }
.ledger-material-list span { border: 1px solid rgba(73, 59, 44, .12); border-radius: 4px; background: var(--cream); color: var(--ink); }
.ledger-material-list span.is-lack { border-color: rgba(166, 81, 74, .35); background: rgba(240, 207, 200, .35); color: var(--rouge); }
.ledger-material-list small { color: var(--ink-60); }
.ledger-material-list .is-lack small { color: var(--rouge); }
.ledger-material-list em { color: var(--ink-35); }
.ledger-popover-state { border: 1px dashed var(--line); border-radius: 7px; color: var(--ink-60); }
.ledger-popover-state.is-error { border-color: rgba(166, 81, 74, .35); background: rgba(240, 207, 200, .24); color: var(--rouge); }
.ledger-popover-blocked { color: var(--rouge); }
</style>
<style scoped src="./operatorGrowthActionPopoverDesktop.css"></style>
<style scoped src="./operatorGrowthActionPopoverMobile.css"></style>
