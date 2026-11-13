<template>
  <section class="overall-summary" aria-label="总体规划">
    <header class="overall-heading">
      <div><span class="overall-kicker">当前方案 · {{ range === 'all' ? '全周期汇总' : '今天起计划次数' }}</span><h3>历练总览</h3><p class="overall-note">这张清单整个周期，每种历练要刷多少次</p></div>
      <span v-if="displayTimeline.length && !loading && !unavailable" class="overall-period">{{ displayTimeline[0].date }} 至 {{ displayTimeline.at(-1).date }}</span>
    </header>
    <div class="overall-range" role="group" aria-label="总体规划统计范围">
      <button type="button" :aria-pressed="range === 'all'" @click="range = 'all'">全部计划</button>
      <button type="button" :aria-pressed="range === 'remaining'" @click="range = 'remaining'">今天起剩余</button>
    </div>
    <p v-if="loading" class="overall-note" role="status">正在读取规划，请稍候。</p>
    <p v-else-if="unavailable" class="overall-warning" role="status">规划数据尚未准备好，请先处理上方的读取提示。</p>
    <template v-else>
      <p v-if="incomplete" class="overall-warning" role="status">{{ incomplete }}</p>
      <div v-if="groups.length" class="overall-groups">
        <section v-for="group in groups" :key="group.id" class="overall-group" :class="group.id">
          <table>
            <caption><span>{{ group.name }}历练</span><span class="overall-total">共 <b>{{ formatCount(group.total) }}</b> 次</span></caption>
            <thead><tr><th scope="col">{{ group.id === 'experience' ? '关卡' : '层数' }}</th><th scope="col">刷取次数</th></tr></thead>
            <tbody>
              <tr v-for="stage in group.stages" :key="stage.level">
                <th scope="row"><span class="overall-stage">{{ stage.label }}</span></th>
                <td><b>{{ formatCount(stage.count) }}</b> 次</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
      <p v-else class="overall-note">{{ range === 'all' ? '当前方案暂无历练安排。' : '原计划从今天起暂无历练安排。' }}</p>
      <p v-if="range === 'remaining'" class="overall-note">按北京时间 05:00 日界线汇总今天及之后的原计划，包含今天全部次数，未扣除今天实际刷取。不重新计算方案。</p>
      <p v-else class="overall-note">汇总当前周期全部日期（含已过日期），不随所选日期或隐藏过去设置变化。次数为计划安排，不代表已执行。</p>
      <p class="overall-note">仅统计历练；派遣、6-24 与自定义支出请查看每日安排。</p>
    </template>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { TRAINING_GROUPS } from '../../data/operatorTraining.js'

const props = defineProps({ today: { type: String, required: true }, timeline: { type: Array, default: () => [] }, status: { type: String, default: '' }, awaitingRecalculation: Boolean, loading: Boolean, unavailable: Boolean })
const range = ref('all')
const displayTimeline = computed(() => range.value === 'all' ? props.timeline : props.timeline.filter(day => day.date >= props.today))
const groups = computed(() => TRAINING_GROUPS.map(group => {
  const counts = new Map()
  for (const day of displayTimeline.value) for (const spend of day.planned?.spends || []) {
    if (spend.custom || spend.kind !== 'training' || spend.groupId !== group.id || !(spend.value > 0)) continue
    counts.set(spend.stageLevel, (counts.get(spend.stageLevel) || 0) + spend.value)
  }
  const stages = [...counts].sort(([a], [b]) => a - b).map(([level, count]) => ({ level, count,
    label: group.id === 'experience' ? group.stages.find(stage => stage.level === level)?.name || `${level} 层` : `${level} 层` }))
  return { id: group.id, name: group.name, stages, total: stages.reduce((sum, stage) => sum + stage.count, 0) }
}).filter(group => group.stages.length))
const incomplete = computed(() => {
  if (props.status === 'invalid') return '日程有问题，这里只统计已排出的部分，请先处理顶部提示。'
  if (props.timeline.some(day => day.date >= props.today && (day.errors?.length || day.paused))) return '日程存在错误或暂停，以下仅汇总已列出的安排；请先修正每日安排。'
  if (props.awaitingRecalculation) return '日程有待重算的修改，以下为当前已列出安排的合计。'
  if (props.status !== 'complete') return '当前规划尚未覆盖全部培养缺口，以下仅汇总已生成的安排。'
  return ''
})
function formatCount(value) { return value.toLocaleString('zh-CN') }
</script>

<style scoped>
.overall-summary { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); }
.overall-range { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.overall-range button { padding: 7px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink-60); font: inherit; font-size: 13px; cursor: pointer; }
.overall-range button[aria-pressed="true"] { background: var(--paper); color: var(--theme-accent-text, var(--accent-strong)); border-color: var(--accent); font-weight: 600; }
.overall-range button:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.overall-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px; margin-bottom: 16px; }
.overall-kicker { color: var(--theme-accent-text, var(--accent-strong)); font-size: 13px; }
h3 { margin: 4px 0 0; font-family: var(--font-s, 'Noto Serif SC','YuanHub Serif Ext', serif); font-size: 23px; }
.overall-period, .overall-note { color: var(--ink-60); font-size: 13px; line-height: 1.6; }
.overall-note { margin: 12px 0 0; }
.overall-warning { color: var(--theme-danger-text, var(--rouge)); font-size: 14px; line-height: 1.6; }
.overall-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); align-items: start; gap: 14px; }
.overall-group { --group-color: var(--theme-accent-text, #a86c25); min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 12px; }
.overall-group.yy { --group-color: var(--theme-info-text, #86699d); }
.overall-group.ds { --group-color: var(--theme-info-text, #587a94); }
.overall-group.fh { --group-color: var(--theme-danger-text, #ad6252); }
table { width: 100%; border-collapse: collapse; }
caption { text-align: left; padding: 0 0 12px; color: var(--ink); }
caption > span:first-child { border-left: 3px solid var(--group-color); padding-left: 8px; font-weight: 700; }
.overall-total { float: right; font-size: 13px; font-weight: 400; }
th, td { padding: 10px 4px; text-align: left; }
thead { color: var(--ink-60); background: var(--paper); font-size: 12px; }
thead th { font-weight: 400; }
th:last-child, td { text-align: right; white-space: nowrap; }
tbody th { font-weight: 600; font-size: 14px; }
tbody tr + tr { border-top: 1px solid var(--line); }
td { font-size: 13px; }
td b { font-size: 19px; font-variant-numeric: tabular-nums; }
.overall-stage { color: var(--group-color); }
</style>
