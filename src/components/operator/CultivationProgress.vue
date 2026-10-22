<template>
  <section class="cultivation-progress" :aria-label="dateLabel + '培养推进'">
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
const props = defineProps({ rows: { type: Array, required: true }, dateLabel: { type: String, default: '' } })
const failedIcons = reactive(new Set())
// Keep materials completed today visible; hide only those already covered at day start.
const visibleRows = computed(() => {
  const rows = props.rows.filter(item => item.required > 0
    ? (item.startRemaining ?? (item.remaining + item.used)) > 0 : item.produced > 0)
  const experience = rows.find(item => item.id === '__xp__')
  return experience ? [experience, ...rows.filter(item => item !== experience)] : rows
})
function number(value) { return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.cultivation-progress { border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); }
.resource + .resource { border-top: 1px dashed var(--line); }
.resource-icon { border-radius: 8px; color: var(--theme-strong-text, var(--tea)); }
.resource-percent { color: var(--ink-60); }
.resource-summary { color: var(--ink-60); }
.resource-summary strong { color: var(--theme-success-text, #517654); }.resource-summary b { color: var(--ink); }
.complete .resource-percent { color: var(--theme-success-text, #517654); }.resource-empty { color: var(--ink-60); }
.track { border-radius: 999px; background: var(--paper); }.before { background: var(--theme-accent-bg, #c48b4d); }.today { background: var(--theme-highlight, #e8bc6c); }
</style>
<style scoped src="./cultivationProgressDesktop.css"></style>
<style scoped src="./cultivationProgressMobile.css"></style>
