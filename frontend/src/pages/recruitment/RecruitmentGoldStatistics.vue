<template>
  <section class="gold-statistics" :class="{ 'account-statistics': account }" :aria-label="account ? '当前账号六项核心统计' : '本池 UP 与保底统计'">
    <dl class="gold-metrics">
      <slot />
      <div v-for="metric in metrics" :key="metric.key" :class="metric.key + '-metric'">
        <dt><component :is="metric.key === 'total-up' ? BadgePercent : Trophy" v-if="account" class="metric-icon" :size="18" aria-hidden="true" /><span class="metric-label-full">{{ metric.label }}</span><span v-if="account" class="metric-label-short" aria-hidden="true">{{ metric.key === 'guaranteed-gold' ? '大保底' : metric.label }}</span></dt>
        <dd>
          <strong>{{ metric.value }}</strong>
          <small v-if="metric.unit" class="number-unit" :class="{ 'percentage-unit': metric.unit === '%' }">{{ metric.unit }}</small>
          <p v-if="account && metric.key === 'total-up' && accountSamples" class="sample-note"><span v-for="sample in accountSamples" :key="sample">{{ sample }}</span></p>
          <p v-else-if="metric.note">{{ metric.note }}</p>
        </dd>
      </div>
    </dl>
    <p v-if="account && !accountSamples" class="mobile-sample-note">{{ metrics[0].note }}</p>
    <p v-if="account && metrics[1].note" class="mobile-pity-note">大保底：{{ metrics[1].note }}</p>
    <p v-if="!account" class="pity-assumption">按现有历史、首金小保底推断</p>
    <details v-if="!account" :key="contextVersion" class="gold-statistics-help">
      <summary>UP 与保底统计说明</summary>
      <p>总 UP 率 = UP 五星 ÷ UP 归属已知五星。归属未知单列，不计入分母；四星不计。</p>
      <p>大保底次数只统计紧跟在歪之后实际获得的 UP，不是当前处于大保底的次数。未知或不合规则的记录只跳过本身，不影响其他记录。</p>
      <p>小保底不歪率仅统计能确定处于小保底的五星（首金或 UP 之后的下一金），保证 UP 不计入；未知记录之后的下一金无法判断，不计入。</p>
      <p>仅适用于有 UP 定义的非永久池；已退役的 UP 槽保留历史机制。没有五星样本时，次数为 0、命中率未知。</p>
    </details>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { BadgePercent, Trophy } from '@lucide/vue'
import { recruitmentGoldMetrics } from './recruitmentGoldStatistics.js'

const props = defineProps({ summary: Object, account: Boolean, contextVersion: [Number, String] })
const metrics = computed(() => recruitmentGoldMetrics(props.summary, props.account))
const accountSamples = computed(() => {
  const s = props.summary
  return s?.pity_status !== 'not_applicable' && [s?.up_gold_count, s?.known_up_gold_count, s?.unknown_up_gold_count].every(value => value != null)
    ? [`UP ${s.up_gold_count}`, `归属已知 ${s.known_up_gold_count}`, `未知 ${s.unknown_up_gold_count}`]
    : null
})
</script>

<style scoped>
.metric-label-short, .mobile-sample-note, .mobile-pity-note { display: none; }
.gold-statistics { margin: 12px 0; padding: 12px 0; color: var(--ink); border-block: 1px solid var(--line); }
.gold-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 12px 20px; margin: 0; }
.gold-metrics > div { min-width: 0; }
dt { font-size: 13px; line-height: 1.6; }
dd { margin: 4px 0 0; }
strong { display: inline-block; white-space: nowrap; font: 700 20px/1.4 var(--font-d); }
.number-unit { margin-left: 5px; color: var(--ink); font-size: 12px; line-height: 1.5; white-space: nowrap; }
.percentage-unit { margin-left: 2px; }
p { margin: 4px 0 0; font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.pity-assumption { margin-top: 10px; }
.gold-statistics-help { margin-top: 6px; font-size: 13px; line-height: 1.7; }
summary { width: fit-content; max-width: 100%; padding: 4px 0; cursor: pointer; }
summary:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
.account-statistics { margin: 0; padding: 0; border: 0; }
.account-statistics .gold-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.account-statistics .gold-metrics > div, .account-statistics .gold-metrics > :slotted(.summary-item) { position: relative; padding: 12px 10px 10px 32px; border-radius: 8px; background: color-mix(in srgb, var(--cream) 65%, var(--surface)); }
.account-statistics .metric-icon { position: absolute; left: 9px; top: 15px; color: var(--theme-accent-text, var(--accent-strong)); }
.account-statistics dt { color: var(--ink-60); font-size: 12px; }
.account-statistics dd { margin-top: 4px; }
.account-statistics strong { color: var(--theme-strong-text, var(--tea)); font-size: 24px; line-height: 1.25; }
.account-statistics p { color: var(--ink-60); font-size: 11px; line-height: 1.5; }
.account-statistics .sample-note { display: flex; flex-wrap: wrap; gap: 0 4px; }
.sample-note span { white-space: nowrap; }
.sample-note span + span::before { content: '/'; margin-right: 4px; }
@container (min-width: 900px) {
  .account-statistics .gold-metrics { grid-template-columns: repeat(6, minmax(0, 1fr)); }
}
@container (max-width: 520px) {
  .account-statistics .gold-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
  .account-statistics .gold-metrics > div, .account-statistics .gold-metrics > :slotted(.summary-item) { padding: 10px 0; border-radius: 0; background: transparent; border-bottom: 1px solid var(--line); }
  .account-statistics .gold-metrics > div:nth-last-child(-n + 2), .account-statistics .gold-metrics > :slotted(.summary-item:nth-last-child(-n + 2)) { border-bottom: 0; }
  .account-statistics .metric-icon { position: static; display: inline-block; vertical-align: middle; margin-right: 5px; }
  .account-statistics strong { font-size: 22px; }
  .account-statistics dt { font-size: 12px; }
}
@media (max-width: 767px) {
  .account-statistics .gold-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .account-statistics .gold-metrics > div, .account-statistics .gold-metrics > :slotted(.summary-item) { display: flex; flex-direction: column; padding: 4px 0; border: 0; border-radius: 0; background: transparent; }
  .account-statistics dd { order: -1; margin: 0 0 4px; }
  .account-statistics strong { font-size: 22px; }
  .account-statistics .metric-icon, .account-statistics .total-up-metric dd p, .account-statistics .guaranteed-gold-metric dd p { display: none; }
  .account-statistics .metric-label-short { display: inline; }
  .account-statistics .metric-label-full { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .account-statistics .mobile-sample-note { display: block; margin-top: 8px; }
  .account-statistics .mobile-pity-note { display: block; margin-top: 8px; }
}
</style>
