<template>
  <label class="level-breakthrough-field">等级突破
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
import { inferredLevelBreakthroughStage, isLevelBreakthroughBoundary } from '../../utils/operatorGrowthRules.js'
defineProps({ level: { type: Number, default: 0 }, modelValue: { type: Number, default: null }, disabled: Boolean })
defineEmits(['update:modelValue'])
</script>
<style scoped>
.level-breakthrough-field { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
select { max-width: 100%; font: inherit; padding: 6px 8px; color: inherit; background: var(--bg-card, #fff); border: 1px solid var(--border, #ddd); border-radius: 6px; }
small { flex-basis: 100%; opacity: .7; }
</style>
