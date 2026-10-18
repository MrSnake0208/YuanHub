<template>
  <label v-if="inline && isLevelBreakthroughBoundary(level)" class="level-breakthrough-check">
    <input type="checkbox" :checked="stage === Number(level) / 10" :indeterminate="stage == null" :aria-checked="stage == null ? 'mixed' : undefined" :aria-label="level + '级已突破'" :disabled="disabled" @change="$emit('update:modelValue', Number(level) / 10 - ($event.target.checked ? 0 : 1))" />
    <span>已突破</span><small v-if="stage == null">待核对</small>
  </label>
  <label v-else-if="!inline" class="level-breakthrough-field">等级突破
    <select v-if="isLevelBreakthroughBoundary(level)" :value="modelValue == null ? '' : modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.value === '' ? null : Number($event.target.value))">
      <option value="">未知，请核对</option>
      <option :value="Number(level) / 10 - 1">未突破 · 上限 {{ level }} 级</option>
      <option :value="Number(level) / 10">已突破 · 上限 {{ Number(level) + 10 }} 级</option>
    </select>
    <span v-else>{{ inferredLevelBreakthroughStage(level) == null ? '未知' : '上限 ' + (inferredLevelBreakthroughStage(level) + 1) * 10 + ' 级' }}</span>
    <small>记录游戏现状；保存不扣除库存。本体与 SP 共享。</small>
  </label>
</template>
<script setup>
import { computed } from 'vue'
import { inferredLevelBreakthroughStage, isLevelBreakthroughBoundary, operatorLevelBreakthroughStage } from '../../utils/operatorGrowthRules.js'
const props = defineProps({ level: { type: Number, default: 0 }, modelValue: { type: Number, default: null }, disabled: Boolean, inline: Boolean })
defineEmits(['update:modelValue'])
const stage = computed(() => operatorLevelBreakthroughStage({ level: props.level, levelBreakthroughStage: props.modelValue }))
</script>
<style scoped>
.level-breakthrough-field { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
select { max-width: 100%; font: inherit; padding: 6px 8px; color: inherit; background: var(--bg-card, #fff); border: 1px solid var(--border, #ddd); border-radius: 6px; }
small { flex-basis: 100%; opacity: .7; }
.level-breakthrough-check { display: inline-flex; flex: none; align-items: center; gap: 6px; color: var(--tea); font: 700 13px var(--font-b); cursor: pointer; white-space: nowrap; }
.level-breakthrough-check input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent-strong); }
.level-breakthrough-check input:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 3px; }
.level-breakthrough-check small { flex-basis: auto; padding: 2px 5px; border-radius: 4px; background: var(--cream); color: var(--accent-strong); font-size: 11px; opacity: 1; }
</style>
