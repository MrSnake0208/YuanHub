<template>
  <section class="diagnostic-section diagnostic-star-summary" aria-label="星石识别摘要">
    <h3>星石识别摘要</h3>
    <table>
      <tbody v-for="group in groups" :key="group.label">
        <tr><th colspan="2" scope="rowgroup">{{ group.label }}</th></tr>
        <tr v-for="[label, value] in group.rows" :key="label"><th scope="row">{{ label }}</th><td>{{ value }}</td></tr>
      </tbody>
    </table>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ summary: { type: Object, required: true } })
const number = value => value ?? '未知'
const complete = value => value ? '已完成' : '未完成'
const groups = computed(() => {
  const value = props.summary
  return [
    ...[['主星', value.main], ['辅星', value.sub]].map(([label, scan]) => ({ label, rows: [
      ['数量', number(scan.count)], ['扫描状态', complete(scan.complete)], ['页数', number(scan.pages)]
    ] })),
    { label: '经验星曜', rows: [
      ['橙色', number(value.experience.orange)], ['紫色', number(value.experience.purple)], ['白色', number(value.experience.white)],
      ['读取状态', value.experience.captured ? '已读取' : '未读取']
    ] },
    { label: '背包容量', rows: [['当前数量', number(value.capacity.current)], ['容量上限', number(value.capacity.capacity)]] },
    { label: '警告与中止', rows: [
      ['警告码', value.warnings.length ? value.warnings.join('、') : '无'],
      ['中止阶段', value.error?.stage ?? '无'], ['中止码', value.error?.code ?? '无']
    ] },
    { label: '耗时', rows: value.timing ? [
      ['导航（ms）', value.timing.navigation_ms], ['总计（ms）', value.timing.total_ms]
    ] : [['计时', '未提供']] },
    { label: '页面稳定检测', rows: value.settle ? [
      ['最长等待（ms）', value.settle.max_ms], ['最近稳定耗时（ms）', value.settle.last_settle_ms], ['比较次数', value.settle.comparisons]
    ] : [['检测数据', '未提供']] }
  ]
})
</script>

<style scoped>
.diagnostic-star-summary table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
.diagnostic-star-summary th, .diagnostic-star-summary td { padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
.diagnostic-star-summary th { text-align: left; font-weight: 400; color: var(--ink-60); }
.diagnostic-star-summary th[scope="rowgroup"] { padding-top: 16px; font-weight: 600; color: var(--ink); }
.diagnostic-star-summary td { text-align: right; font-variant-numeric: tabular-nums; }
</style>
