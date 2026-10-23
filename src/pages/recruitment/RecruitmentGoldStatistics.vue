<template>
  <section class="gold-statistics" :aria-label="account ? '当前账号 UP 与保底统计' : '本池 UP 与保底统计'">
    <dl class="gold-metrics">
      <div v-for="metric in metrics" :key="metric.key" :class="metric.key + '-metric'">
        <dt>{{ metric.label }}</dt>
        <dd><strong>{{ metric.value }}</strong><p>{{ metric.note }}</p></dd>
      </div>
    </dl>
    <p class="pity-assumption">按现有历史、首金小保底推断</p>
    <details :key="contextVersion" class="gold-statistics-help">
      <summary>UP 与保底统计说明</summary>
      <p>总 UP 率 = UP 五星 ÷ UP 归属已知五星。归属未知单列，不计入分母；四星不计。</p>
      <p>大保底次数只统计非 UP 后下一条实际获得的保证 UP，不是当前处于大保底的次数。未知记录或保证顺序矛盾时，历史不足以推断。</p>
      <p v-if="account">账号合计适用池的原始分子、分母，不平均各池百分比；各池独立推断大保底，任一适用池历史不足时合计次数未知。小保底不歪率请查看单池。</p>
      <p v-else>小保底不歪率仅统计小保底结果，保证 UP 不计入。未知记录会使保底推断失效，但后续已知 UP 仍计入总 UP 率。</p>
      <p>仅适用于有 UP 定义的非永久池；已退役的 UP 槽保留历史机制。没有五星样本时，次数为 0、命中率未知。</p>
    </details>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { recruitmentGoldMetrics } from './recruitmentGoldStatistics.js'

const props = defineProps({ summary: Object, account: Boolean, contextVersion: [Number, String] })
const metrics = computed(() => recruitmentGoldMetrics(props.summary, props.account))
</script>

<style scoped>
.gold-statistics { margin: 12px 0; padding: 12px 0; color: var(--ink); border-block: 1px solid var(--line); }
.gold-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 12px 20px; margin: 0; }
.gold-metrics > div { min-width: 0; }
dt { font-size: 13px; line-height: 1.6; }
dd { margin: 4px 0 0; }
strong { display: inline-block; white-space: nowrap; font: 700 20px/1.4 var(--font-d); }
p { margin: 4px 0 0; font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.pity-assumption { margin-top: 10px; }
.gold-statistics-help { margin-top: 6px; font-size: 13px; line-height: 1.7; }
summary { width: fit-content; max-width: 100%; padding: 4px 0; cursor: pointer; }
summary:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
</style>
