<template>
  <section class="cultivation-progress" :aria-label="dateLabel + '培养推进'">
    <div v-if="staminaBalance !== null" class="stamina-balance" :class="{ negative: staminaBalance < 0 }" role="status" aria-live="polite">
      <span>实时体力结余</span>
      <strong>{{ signed(staminaBalance) }}</strong>
    </div>
    <div class="resource-list" aria-live="polite">
      <article v-for="item in visibleRows" :key="item.id" class="resource" :class="{ complete: item.required > 0 && item.remaining <= 0 }">
        <span class="resource-icon" aria-hidden="true"><img v-if="item.icon && !failedIcons.has(item.icon)" :src="item.icon" alt="" width="42" height="42" loading="lazy" draggable="false" @error="failedIcons.add(item.icon)" /><span v-else>{{ (item.name || item.id).slice(0, 1) }}</span></span>
        <div class="resource-body">
        <div class="resource-head"><div class="resource-title"><b>{{ item.name }}</b><div class="resource-summary">产出 <strong>+{{ number(item.produced) }}</strong><span> · 还差 <b>{{ number(item.remaining) }}</b></span></div></div><span class="resource-percent">{{ item.percent == null ? '伴随产出' : item.percent + '%' }}</span></div>
        <div v-if="item.required" class="track" role="progressbar" :aria-label="item.name + '目标满足度'" :aria-valuenow="item.percent" aria-valuemin="0" aria-valuemax="100">
          <i class="before" :style="{ width: item.beforePercent + '%' }"></i>
          <i class="today" :style="{ left: item.beforePercent + '%', width: item.todayPercent + '%' }"></i>
        </div>
        </div>
      </article>
      <p v-if="!visibleRows.length" class="resource-empty">当日开始时已无待补材料</p>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive } from 'vue'
const props = defineProps({ rows: { type: Array, required: true }, dateLabel: { type: String, default: '' }, staminaBalance: { type: Number, default: null } })
const failedIcons = reactive(new Set())
// Keep materials completed today visible; hide only those already covered at day start.
const visibleRows = computed(() => {
  const rows = props.rows.filter(item => item.required > 0
    ? (item.startRemaining ?? (item.remaining + item.used)) > 0 : item.produced > 0)
  const experience = rows.find(item => item.id === '__xp__')
  return experience ? [experience, ...rows.filter(item => item !== experience)] : rows
})
function number(value) { return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }
function signed(value) { const amount = Math.round(Number(value) || 0); return amount > 0 ? '+' + number(amount) : number(amount) }
</script>

<style scoped>
.cultivation-progress { min-width: 0; padding: 20px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); }
.stamina-balance { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 14px; color: var(--ink-60); font-size: 12px; }
.stamina-balance strong { color: var(--planner-gain, #517654); font: 850 18px var(--font-d); font-variant-numeric: tabular-nums; }
.stamina-balance.negative strong { color: var(--rouge); }
.resource-list { display: grid; gap: 0; }
.resource { display: grid; grid-template-columns: 42px minmax(0, 1fr); align-items: center; gap: 10px; padding: 10px 2px; }
.resource + .resource { border-top: 1px dashed var(--line); }
.resource-icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 8px; color: var(--tea); font: 800 20px var(--font-s); }
.resource-icon img { object-fit: contain; }.resource-body { display: grid; min-width: 0; gap: 6px; }
.resource-head { display: flex; min-width: 0; align-items: baseline; justify-content: space-between; gap: 6px 14px; font-size: 12px; line-height: 1.6; }
.resource-title { display: flex; min-width: 0; flex: 1 1 auto; align-items: baseline; gap: 10px; }
.resource-title > b { min-width: 0; overflow: hidden; flex: 0 1 auto; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.resource-percent { flex: none; color: var(--ink-60); font-family: var(--font-d); }
.resource-summary { min-width: 0; overflow: hidden; flex: 0 1 auto; color: var(--ink-60); font-size: 11px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.resource-summary strong { color: #517654; }.resource-summary b { color: var(--ink); }.resource-summary strong, .resource-summary b { font-family: var(--font-d); }
.complete .resource-percent { color: #517654; }.resource-empty { color: var(--ink-60); font-size: 12px; line-height: 1.6; padding: 12px; }
.track { position: relative; height: 7px; overflow: hidden; border-radius: 999px; background: var(--paper); }
.track i { position: absolute; top: 0; bottom: 0; }.before { left: 0; background: #c48b4d; }.today { background: #e8bc6c; }
@media (max-width: 760px) { .cultivation-progress { padding: 14px; } }
</style>
