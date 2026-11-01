<template>
  <section class="records-timeline" aria-labelledby="inventory-timeline-title">
    <h2 id="inventory-timeline-title"><Leaf :size="20" aria-hidden="true" />库存变更记录</h2>
    <ul class="record-list records-mobile" aria-label="库存操作历史">
      <li v-for="r in recordsList" :key="r.record_id" class="record" :class="'record-' + r.record_type" :data-record-id="r.record_id" tabindex="-1">
        <span class="record-marker" aria-hidden="true"><Gift v-if="r.record_type === 'reward_delta'" :size="23" /><Minus v-else-if="r.record_type === 'consumption_delta'" :size="23" /><RefreshCw v-else :size="23" /></span>
        <div class="record-copy">
          <div class="record-top"><strong>{{ recordTypeLabel(r.record_type) }}</strong><span class="record-entity">{{ entityTypeLabel(r.entity_type) }}</span></div>
          <div class="record-entries">
            <template v-if="r.entries?.length">
              <span v-for="(entry, index) in r.entries" :key="index" class="record-entry">
                <img v-if="entry.id && ['item', 'agent'].includes(r.entity_type)" :src="iconSrc({ ...entry, entity_type: r.entity_type })" alt="" width="26" height="26" loading="lazy" @load="$event.currentTarget.hidden = false" @error="$event.currentTarget.hidden = true" />
                <span>{{ entrySummary([entry], r.record_type) }}</span>
              </span>
            </template>
            <template v-else>暂无项目明细</template>
          </div>
          <div class="record-source">来源：{{ r.acquisition_channel || '未标注来源' }}</div>
          <time class="record-time" :datetime="r.effective_at || undefined"><Clock3 :size="12" aria-hidden="true" />{{ fmtTime(r.effective_at) || '时间未提供' }}</time>
        </div>
        <div class="record-summary">
          <span class="record-change" :class="r.record_type === 'reward_delta' ? 'is-gain' : r.record_type === 'consumption_delta' ? 'is-cost' : ''">
            <template v-if="r.record_type === 'stock_snapshot'">{{ r.entries?.length || 0 }} 项盘点</template>
            <template v-else-if="r.entries?.length > 1 && ['reward_delta', 'consumption_delta'].includes(r.record_type)">{{ r.entries.length }} 项{{ r.record_type === 'reward_delta' ? '奖励' : '消耗' }}</template>
            <template v-else>{{ entrySummary(r.entries, r.record_type) || '暂无项目明细' }}</template>
          </span>
          <span class="rtag effect" :class="'eff-' + r.stock_effect">{{ stockEffectLabel(r.stock_effect) }}</span>
          <div class="record-actions">
            <button type="button" class="record-detail-toggle" data-record-action="details" aria-label="显示详情" title="显示详情" :aria-expanded="expandedIds.includes(r.record_id)" :aria-controls="'inventory-record-details-' + encodeURIComponent(r.record_id)" @click="$emit('toggle-details', r.record_id, !expandedIds.includes(r.record_id))"><Eye :size="16" aria-hidden="true" /></button>
            <button v-if="r.record_type !== 'consumption_delta' && !r.transaction_id?.startsWith('reset_')" type="button" class="record-del" data-record-action="delete" aria-label="删除记录" title="删除记录" :disabled="disabled || !r.record_id" @click="$emit('delete-record', r)"><Trash2 :size="16" aria-hidden="true" /></button>
          </div>
        </div>
        <div v-show="expandedIds.includes(r.record_id)" :id="'inventory-record-details-' + encodeURIComponent(r.record_id)" class="record-details">
          <div class="record-detail-body">
            <div v-if="staminaCostOf(r) !== undefined" class="record-stamina">消耗体力 {{ staminaCostOf(r) }}</div>
            <div class="record-id">记录 ID：{{ r.record_id || '未提供' }}</div>
            <p v-if="r.record_type === 'consumption_delta'" class="record-delete-note">升级消耗不可单独删除。</p>
            <p v-if="r.transaction_id?.startsWith('reset_')" class="record-delete-note">密探重置记录，请在该密探的「鞭子重置 / 记录」中整笔撤销。</p>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { Clock3, Eye, Gift, Leaf, Minus, RefreshCw, Trash2 } from '@lucide/vue'
import { recordsViewProps, recordTypeLabel, entityTypeLabel } from './inventoryRecordsView.js'

defineProps({ ...recordsViewProps, expandedIds: { type: Array, required: true } })
defineEmits(['delete-record', 'toggle-details'])
</script>

<style scoped src="./inventoryRecordsView.css"></style>
<style scoped src="./inventoryRecordsMobileView.css"></style>
