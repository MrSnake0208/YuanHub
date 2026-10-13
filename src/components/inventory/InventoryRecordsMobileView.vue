<template>
  <ul class="record-list records-mobile" aria-label="库存操作历史">
    <li v-for="r in recordsList" :key="r.record_id" class="record" :data-record-id="r.record_id" tabindex="-1">
      <time class="record-time" :datetime="r.effective_at || undefined">{{ fmtTime(r.effective_at) || '时间未提供' }}</time>
      <div class="record-top">
        <span class="rtag" :class="r.record_type === 'reward_delta' ? 'rtag-reward' : 'rtag-snapshot'">{{ recordTypeLabel(r.record_type) }}</span>
        <span class="rtag rtag-type" :class="r.entity_type === 'agent' ? 'rtag-agent' : 'rtag-item'">{{ entityTypeLabel(r.entity_type) }}</span>
      </div>
      <div class="record-entries">{{ entrySummary(r.entries, r.record_type) || '暂无项目明细' }}</div>
      <span class="rtag effect" :class="'eff-' + r.stock_effect">{{ stockEffectLabel(r.stock_effect) }}</span>
      <details class="record-details" :open="expandedIds.includes(r.record_id)" @toggle="$emit('toggle-details', r.record_id, $event.target.open)">
        <summary data-record-action="details">记录详情与操作</summary>
        <div class="record-detail-body">
          <div v-if="r.acquisition_channel" class="record-source">来源：{{ r.acquisition_channel }}</div>
          <div v-if="staminaCostOf(r) !== undefined" class="record-stamina">消耗体力 {{ staminaCostOf(r) }}</div>
          <div class="record-id">记录 ID：{{ r.record_id || '未提供' }}</div>
          <p v-if="r.record_type === 'consumption_delta'" class="record-delete-note">升级消耗不可单独删除。</p>
          <button v-else type="button" class="record-del" data-record-action="delete" :disabled="disabled || !r.record_id" @click="$emit('delete-record', r)">删除</button>
        </div>
      </details>
    </li>
  </ul>
</template>

<script setup>
import { recordsViewProps, recordTypeLabel, entityTypeLabel } from './inventoryRecordsView.js'

defineProps({ ...recordsViewProps, expandedIds: { type: Array, required: true } })
defineEmits(['delete-record', 'toggle-details'])
</script>

<style scoped src="./inventoryRecordsView.css"></style>
<style scoped>
/* 手机布局与阅读顺序独立维护，不继承桌面布局。 */
.record-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.record { display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; gap: 10px; border-radius: 16px; padding: 14px; }
.record-time { margin: 0; font-size: 11.5px; color: var(--ink-60); }
.record-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.record-entries { font-size: 13px; }
.record-id { font-size: 11px; }
.effect { justify-self: start; }
.record-details { min-width: 0; border-top: 1px solid var(--line); }
summary { padding: 12px 0; color: var(--ink-60); font-size: 12px; font-weight: 700; cursor: pointer; }
.record-detail-body { display: grid; min-width: 0; gap: 10px; overflow-wrap: anywhere; font-size: 12px; color: var(--ink-60); }
.record-del { width: 100%; min-height: 44px; margin-top: 4px; border-radius: 10px; padding: 7px 16px; font-size: 12px; }
.record-delete-note { margin: 0; }
</style>
