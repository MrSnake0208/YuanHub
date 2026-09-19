<template>
  <article class="custom-entry" :class="kind" :aria-label="entry.label">
    <header class="custom-entry-heading">
      <span>{{ isSpend ? '自定义支出' : '自定义来源' }}</span>
      <span class="custom-entry-total"><b>{{ isSpend ? '−' : '+' }}{{ formatAmount(total) }}</b>体力</span>
      <button type="button" class="custom-entry-remove" :aria-label="'移除 ' + entry.label" :disabled="disabled" @click="emit('remove')"><X :size="16" aria-hidden="true" /></button>
    </header>
    <div class="custom-entry-fields">
      <label class="custom-entry-name"><span>名称</span><input type="text" maxlength="32" :value="entry.name || entry.label" :aria-label="(isSpend ? '体力支出' : '体力来源') + '名称，第 ' + (index + 1) + ' 项'" :disabled="disabled" @change="emit('change-name', $event)" /></label>
      <label v-if="isSpend"><span>每次体力</span><input type="number" min="0" step="1" :value="entry.costPer" :aria-label="entry.label + '每次体力'" :disabled="disabled" @change="emit('change-cost', $event)" /></label>
      <label><span>{{ isSpend || entry.kind === 'count' ? '次数' : '获得体力' }}</span><input type="number" min="0" step="1" :value="entry.value" :aria-label="entry.label + (isSpend ? '次数' : '数量')" :disabled="disabled" @change="emit('change-value', $event)" /></label>
    </div>
    <section v-if="isSpend" class="custom-entry-yields" aria-label="每次产出材料">
      <div class="custom-yields-heading"><span>每次产出</span><PlannerSelect class="custom-yield-add" label="添加每次产出的材料" placeholder="添加材料" :menu-width="224" :options="availableResources" :disabled="disabled" @update:model-value="emit('add-yield', $event)" /></div>
      <div v-for="(amount, id) in entry.yield" :key="id" class="custom-yield-row">
        <label :for="controlId + '-' + id">{{ resourceName(id) }}</label>
        <input :id="controlId + '-' + id" type="number" min="0" :value="amount" :aria-label="entry.label + '每次产出' + resourceName(id)" :disabled="disabled" @change="emit('change-yield', id, $event)" />
        <button type="button" class="custom-entry-remove" :aria-label="'移除产出' + resourceName(id)" :disabled="disabled" @click="emit('remove-yield', id)"><X :size="15" aria-hidden="true" /></button>
      </div>
    </section>
  </article>
</template>

<script setup>
import { computed, useId } from 'vue'
import { X } from '@lucide/vue'
import PlannerSelect from './PlannerSelect.vue'

const props = defineProps({
  entry: { type: Object, required: true },
  kind: { type: String, required: true },
  index: { type: Number, required: true },
  total: { type: Number, required: true },
  disabled: Boolean,
  resources: { type: Array, default: () => [] },
  resourceName: { type: Function, default: id => id }
})
const emit = defineEmits(['change-name', 'change-value', 'change-cost', 'change-yield', 'add-yield', 'remove-yield', 'remove'])
const controlId = 'custom-yield-' + useId()
const isSpend = computed(() => props.kind === 'spend')
const availableResources = computed(() => props.resources.filter(item => !Object.hasOwn(props.entry.yield || {}, item.id)).map(item => ({ value: item.id, label: item.name })))
const formatAmount = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
</script>

<style scoped>
.custom-entry { min-width: 0; margin-top: 10px; padding: 0 10px 10px; border: 1px solid var(--planner-line, var(--line)); border-radius: 8px; background: var(--cream); color: var(--ink); }
.custom-entry-heading { display: flex; align-items: center; gap: 8px; min-height: 40px; color: var(--ink-60); font: 12px/1.5 var(--font-b); }
.custom-entry-total { display: inline-flex; align-items: baseline; gap: 4px; margin-left: auto; white-space: nowrap; }
.custom-entry-total b { color: var(--planner-gain); font: 700 15px/1.3 var(--font-d); font-variant-numeric: tabular-nums; }
.spend .custom-entry-total b { color: var(--rouge); }
.custom-entry-remove { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 32px; min-height: 36px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink-60); cursor: pointer; }
.custom-entry-heading > .custom-entry-remove { margin-right: -6px; }
.custom-entry-fields { display: grid; grid-template-columns: minmax(0, 1fr) 92px; gap: 8px; }
.spend .custom-entry-fields { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr); }
.custom-entry-fields label { display: grid; min-width: 0; gap: 4px; color: var(--ink-60); font: 12px/1.5 var(--font-b); }
.custom-entry-fields label > span { white-space: nowrap; }
.custom-entry input { width: 100%; min-width: 0; min-height: 40px; margin: 0; padding: 7px 8px; border: 1px solid var(--planner-line, var(--line)); border-radius: 6px; background: var(--surface); color: var(--ink); font: 600 14px/1.5 var(--font-b); }
.custom-entry input[type="number"] { padding-right: 4px; padding-left: 4px; text-align: center; font-family: var(--font-d); font-variant-numeric: tabular-nums; appearance: textfield; }
.custom-entry input::-webkit-inner-spin-button, .custom-entry input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.custom-entry-yields { display: grid; gap: 6px; margin-top: 10px; padding-top: 6px; border-top: 1px dashed var(--planner-line, var(--line)); }
.custom-yields-heading { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; color: var(--ink-60); font: 12px/1.5 var(--font-b); }
.custom-yield-add { width: 116px; flex: none; }
.custom-yield-row { display: grid; grid-template-columns: minmax(0, 1fr) 72px 32px; align-items: center; gap: 6px; }
.custom-yield-row > label { min-width: 0; color: var(--ink); font: 13px/1.5 var(--font-b); overflow-wrap: anywhere; }
.custom-entry :is(button, input):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.custom-entry :is(button, input):disabled { opacity: .5; cursor: default; }
@media (hover: hover) { .custom-entry-remove:hover:not(:disabled) { color: var(--rouge); background: var(--surface); } }
@media (max-width: 640px) {
  .custom-entry { padding-right: 8px; padding-left: 8px; }
  .custom-entry-heading { min-height: 44px; }
  .custom-entry input { min-height: 44px; padding: 6px; font-size: 16px; }
  .custom-entry-remove { width: 44px; min-height: 44px; }
  .custom-yield-row { grid-template-columns: minmax(0, 1fr) 64px 44px; gap: 4px; }
}
</style>
