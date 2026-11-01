<template>
  <section class="records-desktop-panel" aria-labelledby="inventory-desktop-records-title">
    <h2 id="inventory-desktop-records-title"><History :size="21" aria-hidden="true" />库存变更记录</h2>
    <ul class="record-list records-desktop" aria-label="库存操作历史">
      <li v-for="r in recordsList" :key="r.record_id" class="record" :class="'record-' + r.record_type" :data-record-id="r.record_id" tabindex="-1">
        <span class="record-marker" aria-hidden="true"><Gift v-if="r.record_type === 'reward_delta'" :size="22" /><Minus v-else-if="r.record_type === 'consumption_delta'" :size="22" /><RefreshCw v-else :size="22" /></span>
        <div class="record-main">
          <div class="record-top">
            <strong>{{ recordTypeLabel(r.record_type) }}</strong>
            <span class="rtag rtag-type" :class="r.entity_type === 'agent' ? 'rtag-agent' : 'rtag-item'">{{ entityTypeLabel(r.entity_type) }}</span>
            <span class="rtag effect" :class="'eff-' + r.stock_effect">{{ stockEffectLabel(r.stock_effect) }}</span>
            <span v-if="staminaCostOf(r) !== undefined" class="rtag rtag-stamina">消耗体力 {{ staminaCostOf(r) }}</span>
          </div>
          <div class="record-entries">
            <template v-if="r.entries?.length">
              <span v-for="(entry, index) in r.entries" :key="index" class="record-entry">
                <img v-if="entry.id && ['item', 'agent'].includes(r.entity_type)" :src="iconSrc({ ...entry, entity_type: r.entity_type })" alt="" width="30" height="30" loading="lazy" @load="$event.currentTarget.hidden = false" @error="$event.currentTarget.hidden = true" />
                <span>{{ entrySummary([entry], r.record_type) }}</span>
              </span>
            </template>
            <template v-else>暂无项目明细</template>
          </div>
          <div class="record-source">来源：{{ r.acquisition_channel || '未标注来源' }}</div>
          <p v-if="r.record_type === 'consumption_delta'" class="record-delete-note">升级消耗不可单独删除。</p>
          <p v-if="r.transaction_id?.startsWith('reset_')" class="record-delete-note">密探重置记录，请在该密探的「鞭子重置 / 记录」中整笔撤销。</p>
        </div>
        <div class="record-meta">
          <time class="record-time" :datetime="r.effective_at || undefined"><Clock3 :size="13" aria-hidden="true" />{{ fmtTime(r.effective_at) || '时间未提供' }}</time>
          <div class="record-actions">
            <button type="button" class="record-detail-toggle" data-record-action="details" :aria-expanded="expandedIds.includes(r.record_id)" :aria-controls="'inventory-record-details-' + encodeURIComponent(r.record_id)" @click="$emit('toggle-details', r.record_id, !expandedIds.includes(r.record_id))"><Eye :size="15" aria-hidden="true" />详情</button>
            <button v-if="r.record_type !== 'consumption_delta' && !r.transaction_id?.startsWith('reset_')" type="button" class="record-del" data-record-action="delete" :disabled="disabled || !r.record_id" @click="$emit('delete-record', r)"><Trash2 :size="15" aria-hidden="true" />删除</button>
          </div>
        </div>
        <div v-show="expandedIds.includes(r.record_id)" :id="'inventory-record-details-' + encodeURIComponent(r.record_id)" class="record-details">
          <div class="record-id">记录 ID：{{ r.record_id || '未提供' }}</div>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { Clock3, Eye, Gift, History, Minus, RefreshCw, Trash2 } from '@lucide/vue'
import { recordsViewProps, recordTypeLabel, entityTypeLabel } from './inventoryRecordsView.js'
defineProps({ ...recordsViewProps, expandedIds: { type: Array, required: true } })
defineEmits(['delete-record', 'toggle-details'])
</script>

<style scoped src="./inventoryRecordsView.css"></style>
<style scoped>
/* 仅由平板/桌面视图挂载，状态与操作由 RecordsView 共享。 */
.records-desktop-panel { padding: 18px 20px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
h2 { display: flex; align-items: center; gap: 8px; margin: 0; padding-bottom: 14px; color: var(--theme-strong-text, var(--tea)); font: 900 22px/1.4 var(--font-s); }
h2 svg { color: var(--theme-accent-text, var(--accent)); }
.record-list { display: grid; list-style: none; margin: 0; padding: 0; }
.record { display: grid; grid-template-columns: 44px minmax(0, 1fr) minmax(150px, auto); align-items: start; gap: 8px 14px; padding: 18px 0; border: 0; border-top: 1px solid var(--line); border-radius: 0; background: transparent; }
.record:hover { transform: none; box-shadow: none; }
.record-marker { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--cream); color: var(--theme-strong-text, var(--tea)); }
.record-reward_delta .record-marker { color: var(--theme-accent-text, var(--accent-strong)); background: color-mix(in srgb, var(--yellow) 25%, var(--surface)); }
.record-consumption_delta .record-marker { color: var(--theme-danger-text, var(--rouge)); background: color-mix(in srgb, var(--rouge) 9%, var(--surface)); }
.record-main { min-width: 0; }
.record-top { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }
.record-top strong { color: var(--theme-strong-text, var(--tea)); font: 800 15px/1.5 var(--font-b); }
.rtag { padding: 2px 7px; font-size: 10px; }
.record-entries { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 9px; font-size: 13px; }
.record-entry { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.record-entry img { flex: none; object-fit: contain; }
.record-entry > span { min-width: 0; }
.record-source, .record-delete-note { margin: 6px 0 0; color: var(--ink-60); font: 12px/1.5 var(--font-b); overflow-wrap: anywhere; }
.record-meta { display: grid; justify-items: end; gap: 12px; min-width: 0; }
.record-time { display: flex; align-items: center; gap: 5px; color: var(--ink-60); font-size: 11px; }
.record-time svg { flex: none; }
.record-actions { display: flex; gap: 8px; }
.record-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 32px; padding: 5px 10px; border-radius: 8px; font: 700 12px/1.4 var(--font-b); cursor: pointer; }
.record-detail-toggle { border: 1px solid var(--line); background: var(--cream); color: var(--theme-strong-text, var(--tea)); }
.record-detail-toggle[aria-expanded="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--yellow) 35%, var(--surface)); }
.record-detail-toggle:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.record-details { grid-column: 2 / -1; min-width: 0; padding: 8px 10px; border-radius: 8px; background: var(--cream); }
.record-id { font-size: 11px; }
@media (max-width: 900px) {
  .records-desktop-panel { padding: 14px; }
  .record { grid-template-columns: 36px minmax(0, 1fr); gap: 8px 10px; padding-block: 14px; }
  .record-marker { width: 36px; height: 36px; }
  .record-meta { grid-column: 2; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .record-details { grid-column: 2; }
}
</style>
