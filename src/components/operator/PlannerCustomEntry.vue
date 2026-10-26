<template>
  <article class="custom-entry" :class="kind" :aria-label="entry.label">
    <header v-if="!draft" class="custom-entry-heading">
      <span>{{ isSpend ? '自定义支出' : '自定义来源' }}</span>
      <span class="custom-entry-total"><b>{{ isSpend ? '−' : '+' }}{{ formatAmount(total) }}</b>体力</span>
      <button type="button" class="custom-entry-remove" :aria-label="'移除 ' + entry.label" :disabled="disabled" @click="emit('remove')"><X :size="16" aria-hidden="true" /></button>
    </header>
    <div class="custom-entry-fields">
      <label class="custom-entry-name"><span>名称</span><input type="text" maxlength="32" :value="entry.name || entry.label" :aria-label="(isSpend ? '体力支出' : '体力来源') + '名称，第 ' + (index + 1) + ' 项'" :disabled="disabled" @[inputEvent]="emit('change-name', $event)" /></label>
      <label v-if="isSpend"><span>每次体力</span><input type="number" min="0" step="1" :value="entry.costPer" :aria-label="entry.label + '每次体力'" :disabled="disabled" @[inputEvent]="emit('change-cost', $event)" /></label>
      <label><span>{{ isSpend || entry.kind === 'count' ? '次数' : '获得体力' }}</span><input type="number" min="0" step="1" :value="entry.value" :aria-label="entry.label + (isSpend ? '次数' : '数量')" :disabled="disabled" @[inputEvent]="emit('change-value', $event)" /></label>
    </div>
    <section v-if="isSpend" class="custom-entry-yields" aria-label="每次产出材料">
      <div class="custom-yields-heading"><span>每次产出</span><PlannerSelect class="custom-yield-add" label="添加每次产出的材料" placeholder="添加材料" :menu-width="224" :options="availableResources" :disabled="disabled" @update:model-value="emit('add-yield', $event)" /></div>
      <div v-for="(amount, id) in entry.yield" :key="id" class="custom-yield-row">
        <label :for="controlId + '-' + id">{{ resourceName(id) }}</label>
        <input :id="controlId + '-' + id" type="number" min="0" :value="amount" :aria-label="entry.label + '每次产出' + resourceName(id)" :disabled="disabled" @[inputEvent]="emit('change-yield', id, $event)" />
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
  draft: Boolean,
  resources: { type: Array, default: () => [] },
  resourceName: { type: Function, default: id => id }
})
const emit = defineEmits(['change-name', 'change-value', 'change-cost', 'change-yield', 'add-yield', 'remove-yield', 'remove'])
const controlId = 'custom-yield-' + useId()
const isSpend = computed(() => props.kind === 'spend')
const inputEvent = computed(() => props.draft ? 'input' : 'change')
const availableResources = computed(() => props.resources.filter(item => !Object.hasOwn(props.entry.yield || {}, item.id)).map(item => ({ value: item.id, label: item.name })))
const formatAmount = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.custom-entry { border: 1px solid var(--planner-line, var(--line)); border-radius: 8px; background: var(--cream); color: var(--ink); }
.custom-entry-heading { color: var(--ink-60); }
.custom-entry-total b { color: var(--planner-gain); }
.spend .custom-entry-total b { color: var(--theme-danger-text, var(--rouge)); }
.custom-entry-remove { border: 0; border-radius: 6px; background: transparent; color: var(--ink-60); cursor: pointer; }
.custom-entry-fields label { color: var(--ink-60); }
.custom-entry input { border: 1px solid var(--planner-line, var(--line)); border-radius: 6px; background: var(--surface); color: var(--ink); }
.custom-entry input[type="number"] { appearance: textfield; }
.custom-entry input::-webkit-inner-spin-button, .custom-entry input::-webkit-outer-spin-button { -webkit-appearance: none; }
.custom-entry-yields { border-top: 1px dashed var(--planner-line, var(--line)); }
.custom-yields-heading { color: var(--ink-60); }
.custom-yield-row > label { color: var(--ink); }
.custom-entry :is(button, input):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.custom-entry :is(button, input):disabled { opacity: .5; cursor: default; }
@media (hover: hover) { .custom-entry-remove:hover:not(:disabled) { color: var(--theme-danger-text, var(--rouge)); background: var(--surface); } }
</style>
<style scoped src="./plannerCustomEntryDesktop.css"></style>
<style scoped src="./plannerCustomEntryMobile.css"></style>
