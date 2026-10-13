<template>
  <ul class="record-list records-desktop" aria-label="库存操作历史">
    <li v-for="r in recordsList" :key="r.record_id" class="record" :data-record-id="r.record_id" tabindex="-1">
      <div class="record-main">
        <div class="record-top">
          <span
            class="rtag"
            :class="
              r.record_type === 'reward_delta'
                ? 'rtag-reward'
                : 'rtag-snapshot'
            "
            >{{ recordTypeLabel(r.record_type) }}</span
          >
          <span
            class="rtag rtag-type"
            :class="
              r.entity_type === 'agent' ? 'rtag-agent' : 'rtag-item'
            "
            >{{ entityTypeLabel(r.entity_type) }}</span
          >
          <span
            v-if="r.acquisition_channel"
            class="rtag rtag-type"
            >{{ r.acquisition_channel }}</span
          >
          <span
            v-if="staminaCostOf(r) !== undefined"
            class="rtag rtag-stamina"
            >消耗体力 {{ staminaCostOf(r) }}</span
          >
          <span
            class="rtag effect"
            :class="'eff-' + r.stock_effect"
            >{{ stockEffectLabel(r.stock_effect) }}</span
          >
          <span class="record-time">{{
            fmtTime(r.effective_at) || '时间未提供'
          }}</span>
        </div>
        <div class="record-entries">
          {{ entrySummary(r.entries, r.record_type) || '暂无项目明细' }}
        </div>
        <div class="record-id" :title="r.record_id">
          {{ r.record_id || '未提供' }}
        </div>
      </div>
      <button v-if="r.record_type !== 'consumption_delta'" type="button" class="record-del" data-record-action="delete" :disabled="disabled || !r.record_id" @click="$emit('delete-record', r)">
        删除
      </button>
    </li>
  </ul>
</template>

<script setup>
import { recordsViewProps, recordTypeLabel, entityTypeLabel } from './inventoryRecordsView.js'
defineProps({ ...recordsViewProps, expandedIds: { type: Array, required: true } })
defineEmits(['delete-record'])
</script>

<style scoped src="./inventoryRecordsView.css"></style>
<style scoped>
/* 桌面布局与密度独立维护，不写入双端共用样式。 */
.record-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.record {
  display: flex;
  align-items: center;
  gap: 14px;
  border-radius: 16px;
  padding: 14px 18px;
}
.record-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.record-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.record-time { margin-left: auto; font-size: 11.5px; color: var(--ink-35); }
.record-entries { font-size: 13px; }
.record-id { font-size: 11px; }
.record-del { flex: none; border-radius: 10px; padding: 7px 16px; font-size: 12px; }
</style>
