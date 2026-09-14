<template>
  <section class="resource-report" aria-labelledby="resource-report-title">
    <header class="report-heading">
      <div class="report-heading-row">
        <div class="report-heading-copy"><span>周期获得账簿</span><h2 id="resource-report-title">抽卡资源收支</h2></div>
        <slot name="actions" />
      </div>
    </header>
    <p v-if="error" class="report-state" role="alert">{{ error }}</p>
    <p v-else-if="truncated" class="report-state" role="status">流水超过 5,000 条，以下仅展示已加载记录；库存与净变化可能不完整。</p>
    <div class="resource-summary">
      <article v-for="resource in resources" :key="resource.id">
        <div class="resource-name"><img :src="icon(resource.id)" alt="" width="24" height="24" /><h3>{{ resource.name }}</h3></div>
        <div class="summary-values">
          <strong>{{ number(resource.latest?.stock) }}</strong>
          <div class="summary-foot"><span>本期净变化</span><b :class="changeClass(resource.net)">{{ signed(resource.net) }}</b></div>
        </div>
        <small class="summary-meta">{{ resource.latest ? '最近记录 ' + resource.latest.day : '本期需要至少一次库存盘点' }}</small>
      </article>
    </div>
    <div class="view-heading">
      <h3 class="range-title">{{ from }} 至 {{ to }}</h3>
      <div class="view-switch" role="group" aria-label="资源展示方式"><button v-for="option in views" :key="option.id" type="button" :aria-pressed="view === option.id" @click="view = option.id">{{ option.label }}</button></div>
    </div>
    <template v-if="view === 'calendar'">
      <div class="calendar-scroll"><div class="calendar-content">
        <div class="weekdays"><span v-for="day in ['日', '一', '二', '三', '四', '五', '六']" :key="day">{{ day }}</span></div>
        <div class="calendar"><div v-for="n in offset" :key="'blank' + n" class="day blank"></div><button v-for="day in dates" :key="day" type="button" class="day" :class="{ 'is-month-start': isMonthStart(day), 'is-range-start': day === from }" :data-month-label="monthMarkerLabel(day)" :aria-pressed="selected === day" :aria-label="day + ' 库存变化'" @click="selected = day"><div class="day-date-line"><span v-if="monthMarkerLabel(day)" class="month-marker" aria-hidden="true">{{ monthMarkerLabel(day) }}</span><time :datetime="day">{{ calendarDateLabel(day) }}</time></div><template v-for="r in resources" :key="r.id"><span v-if="showCalendarResource(r, day)" class="resource-row" :style="{ gridRow: resourceSlot(r.id), '--resource-color': r.color }" :aria-label="r.name + ' ' + signed(calendarValue(r, day).delta)"><img :src="icon(r.id)" :alt="r.name" width="18" height="18" /><b :class="changeClass(calendarValue(r, day).delta)" :title="calendarValueTitle(r, day)">{{ calendarText(r, day) }}</b><small v-if="calendarValue(r, day).stock !== null">{{ number(calendarValue(r, day).stock) }}</small></span></template></button><div v-for="n in trailingDays" :key="'trailing' + n" class="day blank" aria-hidden="true"></div></div>
      </div></div>
      <div v-if="selected" class="day-detail" aria-live="polite"><h3>{{ selected }} · 记录详情</h3><p v-for="r in resources" :key="r.id"><b>{{ r.name }}</b><span v-if="pointFor(r, selected)">库存 {{ number(pointFor(r, selected).stock) }} · {{ pointFor(r, selected).state }} · {{ changeFor(r, selected) }}<template v-if="pointFor(r, selected).previousDay">（较 {{ pointFor(r, selected).previousDay }}）</template></span><span v-else-if="calendarValue(r, selected).stock !== null">最近已知库存 {{ number(calendarValue(r, selected).stock) }}（记录于 {{ calendarValue(r, selected).recordedDay }}，当日未更新）</span><span v-else>无记录</span></p></div>
      <p class="explanation"><template v-if="compactChart">蓝色标签-白金币、紫棕色标签-符传、金色标签-天机符传；大额变化以万取近似值，点击日期查看精确数值。</template><template v-else>月历只列出本日有变化的资源；变化行右侧为当前库存。空格子表示当日库存无变化。</template></p>
    </template>
    <section v-else class="trend" aria-labelledby="resource-trend-title">
      <h3 id="resource-trend-title">库存趋势</h3><p class="explanation">各资源以周期内的起始库存为基准，比较相对涨跌；纵向位置不代表相同数量。起始库存为零时以 1 为基准。选择数据点可查看实际库存。</p>
    <div class="legend"><span v-for="r in resources" :key="r.id"><i :style="{ background: r.color }"></i>{{ r.name }}</span><span><i class="dashed"></i>预测值</span></div>
      <p v-if="!chart.series.some(r => r.points.length)" class="report-state">本期暂无可展示的库存记录</p>
      <div v-else ref="plotElement" class="trend-plot" @keydown.esc="hoverPoint = null; pinnedPoint = null">
      <svg :viewBox="`0 0 ${chartWidth} 320`" role="group" aria-label="三种抽卡资源的相对库存趋势，虚线表示跨缺测日期">
        <line v-for="y in [30, 90, 150, 210, 270]" :key="y" x1="35" :x2="chartWidth - 35" :y1="y" :y2="y" class="grid-line" />
        <text v-for="day in axisDays" :key="day" :x="x(day)" y="306" text-anchor="middle">{{ axisDateLabel(day) }}</text>
        <g v-for="r in chart.series" :key="r.id" :style="{ color: r.color }">
          <line v-for="(p, i) in r.points.slice(1)" :key="p.day" :x1="x(r.points[i].day)" :y1="y(r.points[i].relative)" :x2="x(p.day)" :y2="y(p.relative)" stroke="currentColor" stroke-width="2" :stroke-dasharray="resourceDayNumber(p.day) - resourceDayNumber(r.points[i].day) > 1 ? '6 5' : undefined" />
          <g v-for="p in r.points" :key="p.day">
            <circle v-if="activePoint?.id === r.id && activePoint?.day === p.day" :cx="x(p.day)" :cy="y(p.relative)" r="10" fill="currentColor" opacity=".22" class="point-halo" />
            <circle :cx="x(p.day)" :cy="y(p.relative)" r="5" fill="currentColor" tabindex="0" role="button" :aria-label="pointLabel(r, p)" :aria-pressed="pinnedPoint?.id === r.id && pinnedPoint?.day === p.day" @mouseenter="hoverPoint = pointInfo(r, p)" @mouseleave="hoverPoint = null" @focus="hoverPoint = pointInfo(r, p)" @blur="hoverPoint = null" @click="pinnedPoint = pointInfo(r, p)" @keydown.enter.prevent="pinnedPoint = pointInfo(r, p)" @keydown.space.prevent="pinnedPoint = pointInfo(r, p)" />
          </g>
        </g>
      </svg>
      <div v-if="activePoint" ref="tooltipElement" class="point-tooltip" role="status" :style="{ ...tooltipPosition, '--point-color': activePoint.color }">
        <div class="point-tooltip-heading"><b>{{ activePoint.name }}</b><time>{{ activePoint.day }}</time></div>
        <div class="point-stock"><span>库存</span><strong>{{ number(activePoint.stock) }}</strong></div>
        <dl>
          <div v-if="activePoint.delta !== null"><dt>较 {{ activePoint.previousDay }}</dt><dd :class="changeClass(activePoint.delta)">{{ signed(activePoint.delta) }}</dd></div>
          <div v-if="activePoint.delta !== null && activePoint.percent !== null"><dt>较周期起始</dt><dd :class="changeClass(activePoint.percent)">{{ signed(activePoint.percent) }}%</dd></div>
        </dl>
        <p v-if="activePoint.delta === null" class="point-note">周期起始库存 · 后续变化的比较基准</p>
        <p v-else-if="activePoint.percent === null" class="point-note">起始库存为 0，不计算涨跌幅</p>
      </div>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { buildResourceBalance, resourceRangeDates, resourceDayNumber, resourceCalendarValue } from '../../data/inventory/resourceBalance.js'
const props = defineProps({ records: { type: Array, default: () => [] }, from: { type: String, required: true }, to: { type: String, required: true }, error: { type: String, default: '' }, truncated: Boolean })
const resources = computed(() => buildResourceBalance(props.error ? [] : props.records, props.from, props.to))
const views = [{ id: 'calendar', label: '月历' }, { id: 'trend', label: '趋势' }]
const view = ref('calendar')
const compactChart = ref(false)
const chartWidth = computed(() => compactChart.value ? 450 : 900)
let chartMedia
function updateChartSize() { compactChart.value = chartMedia.matches }
onMounted(() => { chartMedia = window.matchMedia('(max-width: 760px)'); updateChartSize(); chartMedia.addEventListener('change', updateChartSize) })
onBeforeUnmount(() => chartMedia?.removeEventListener('change', updateChartSize))
const selected = ref('')
const hoverPoint = ref(null)
const pinnedPoint = ref(null)
const activePoint = computed(() => hoverPoint.value || pinnedPoint.value)
const plotElement = ref(null)
const tooltipElement = ref(null)
const tooltipPosition = ref({ visibility: 'hidden' })
let tooltipObserver
function positionTooltip() {
  const plot = plotElement.value
  const tooltip = tooltipElement.value
  const point = activePoint.value
  if (!plot || !tooltip || !point) return
  const svg = plot.querySelector('svg')
  const bounds = plot.getBoundingClientRect()
  const svgBounds = svg.getBoundingClientRect()
  const width = tooltip.offsetWidth
  const height = tooltip.offsetHeight
  const px = svgBounds.left - bounds.left + x(point.day) / chartWidth.value * svgBounds.width
  const py = svgBounds.top - bounds.top + y(point.relative) / 320 * svgBounds.height
  const gap = 16
  const clampX = value => Math.max(4, Math.min(value, bounds.width - width - 4))
  let left = clampX(px - width / 2)
  let top = py - height - gap
  if (top < 4) {
    if (py + gap + height <= bounds.height - 4) top = py + gap
    else if (px + gap + width <= bounds.width - 4) {
      left = px + gap
      top = Math.max(4, Math.min(py - height / 2, bounds.height - height - 4))
    } else if (px - gap - width >= 4) {
      left = px - gap - width
      top = Math.max(4, Math.min(py - height / 2, bounds.height - height - 4))
    } else top = py < bounds.height / 2 ? py + gap : py - height - gap
  }
  tooltipPosition.value = { left: left + 'px', top: top + 'px' }
}
watch([plotElement, tooltipElement], () => {
  tooltipObserver?.disconnect()
  tooltipObserver = new ResizeObserver(positionTooltip)
  if (plotElement.value) tooltipObserver.observe(plotElement.value)
  if (tooltipElement.value) tooltipObserver.observe(tooltipElement.value)
  positionTooltip()
}, { flush: 'post' })
watch([activePoint, chartWidth], positionTooltip, { flush: 'post' })
onBeforeUnmount(() => tooltipObserver?.disconnect())
watch(() => [props.from, props.to, props.records], () => { selected.value = ''; hoverPoint.value = null; pinnedPoint.value = null })
watch(view, () => { hoverPoint.value = null; pinnedPoint.value = null })
const dates = computed(() => resourceRangeDates(props.from, props.to))
const offset = computed(() => dates.value.length ? new Date(props.from + 'T00:00:00Z').getUTCDay() : 0)
const trailingDays = computed(() => (7 - (offset.value + dates.value.length) % 7) % 7)
const axisDays = computed(() => {
  const count = Math.min(dates.value.length, compactChart.value ? 4 : 7)
  return Array.from({ length: count }, (_, i) => dates.value[Math.round(i * (dates.value.length - 1) / Math.max(1, count - 1))])
})
const calendarValues = computed(() => Object.fromEntries(resources.value.map(r => [r.id,
  Object.fromEntries(dates.value.map(day => [day, resourceCalendarValue(r.points, day)]))
])))
const chart = computed(() => {
  const series = resources.value.map(r => ({ ...r, points: r.points.map(p => ({ ...p, relative: p.stock / (r.points[0]?.stock || 1) })) }))
  const values = series.flatMap(r => r.points.map(p => p.relative))
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const pad = Math.max(.04, (max - min) * .15)
  return { series, min: min - pad, max: max + pad }
})
function x(day) {
  if (dates.value.length <= 1) return chartWidth.value / 2
  return 35 + (resourceDayNumber(day) - resourceDayNumber(props.from)) / (dates.value.length - 1) * (chartWidth.value - 70)
}
function y(value) { return 30 + (chart.value.max - value) / (chart.value.max - chart.value.min) * 240 }
function calendarDateLabel(day) { return Number(day.slice(-2)) }
function isMonthStart(day) { return day.endsWith('-01') }
function monthMarkerLabel(day) { return isMonthStart(day) || day === props.from ? Number(day.slice(5, 7)) + '月' : '' }
function axisDateLabel(day) { return props.from.slice(0, 4) !== props.to.slice(0, 4) ? day : Number(day.slice(5, 7)) + '/' + Number(day.slice(-2)) }
function calendarValue(r, day) { return calendarValues.value[r.id][day] }
function showCalendarResource(r, day) { return calendarValue(r, day).delta !== null }
function resourceSlot(id) { return resources.value.findIndex(resource => resource.id === id) + 2 }
function calendarText(r, day) {
  const { delta } = calendarValue(r, day)
  if (!compactChart.value || delta === null || Math.abs(delta) < 10000) return signed(delta)
  const unit = Math.abs(delta) >= 1e8 ? 1e8 : 10000
  return (delta > 0 ? '+' : '−') + Number((Math.abs(delta) / unit).toFixed(1)) + (unit === 1e8 ? '亿' : '万')
}
function changeClass(delta) { return delta > 0 ? 'is-increase' : delta < 0 ? 'is-decrease' : 'is-stock' }
function calendarValueTitle(r, day) {
  const value = calendarValue(r, day)
  return value.stock === null ? '暂无库存基准' : `${r.name} · 库存 ${number(value.stock)} · 记录于 ${value.recordedDay}${value.recordedDay !== day ? '（当日未更新）' : ''}`
}
function icon(id) { return import.meta.env.BASE_URL + 'inventory-icons/items/' + id + '.png' }
function number(value) { return value == null ? '—' : value.toLocaleString('zh-CN') }
function signed(value) { return value == null ? '—' : (value > 0 ? '+' : '') + number(value) }
function pointFor(r, day) { return r.points.find(p => p.day === day) }
function changeFor(r, day) { const p = pointFor(r, day); return !p ? '—' : p.delta === null ? '起始' : signed(p.delta) }
function pointLabel(r, p) {
  return `${r.name}，${p.day}，库存 ${number(p.stock)}，${p.delta === null ? '周期起始库存' : '较 ' + p.previousDay + ' 变化 ' + signed(p.delta)}`
}
function pointInfo(r, p) {
  const baseline = r.points[0]?.stock
  return { ...p, id: r.id, name: r.name, color: r.color, percent: baseline > 0 ? Number(((p.stock / baseline - 1) * 100).toFixed(1)) : null }
}
</script>

<style scoped>
.resource-report { margin-top: 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); overflow: hidden; color: var(--ink) }
.report-heading { padding: 16px 20px 13px; border-bottom: 1px solid var(--line) }
.report-heading-row { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px }
.report-heading-copy > span { display: block; color: var(--accent-strong); font-size: 10px; font-weight: 900 }
h2, h3 { font-family: var(--font-s); font-weight: 900; margin: 0 }
.report-heading-copy h2 { margin-top: 2px; color: var(--ink); font-size: 20px; letter-spacing: 0 }
h3 { font-size: 15px }
.report-heading p, .explanation, .resource-summary small { color: var(--ink-60); font-size: 12px; line-height: 1.7 }
.resource-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin: 0; overflow: hidden; border-bottom: 1px solid var(--line); background: var(--cream) }
.resource-summary article { min-width: 0; padding: 11px 13px 10px; background: var(--surface) }
.resource-summary article:first-child { padding-left: 20px }
.resource-summary article:last-child { padding-right: 20px }
.resource-summary article + article { border-left: 1px solid var(--line) }
.resource-name { display: flex; min-width: 0; align-items: center; gap: 6px }
.resource-name h3 { min-width: 0; overflow: hidden; color: var(--ink); font-size: 13px; text-overflow: ellipsis; white-space: nowrap }
.resource-name img, .resource-row img { object-fit: contain }
.summary-values { display: flex; min-width: 0; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 8px }
.summary-values > strong { min-width: 0; overflow: hidden; color: var(--ink); font: 900 24px var(--font-d); text-overflow: ellipsis; white-space: nowrap }
.summary-foot { display: flex; min-width: 0; align-items: baseline; gap: 4px; font-size: 9px; line-height: 1.2; white-space: nowrap }
.summary-foot span { color: var(--ink-60) }
.summary-foot b { color: var(--accent-strong); font: 900 12px var(--font-d) }
.summary-foot b.is-increase { color: #527658 }
.summary-foot b.is-decrease { color: var(--rouge) }
.summary-meta { display: block; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.view-heading, .view-switch { display: flex; align-items: center; gap: 8px }
.view-heading { justify-content: space-between; flex-wrap: wrap; padding: 17px 20px 0 }
button { color: var(--ink); font: inherit; cursor: pointer }
button:disabled { opacity: .4; cursor: default }
.view-switch { border: 1px solid var(--line); border-radius: 8px; padding: 3px; background: var(--paper) }
.view-switch button { min-height: 44px; padding: 8px 18px; border: 0; border-radius: 5px; background: transparent; font-size: 12px; font-weight: 800 }
.view-switch button[aria-pressed=true] { background: var(--tea); color: var(--cream) }
button:focus-visible, circle:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 2px }
button:not(:disabled):hover { box-shadow: inset 0 0 0 1px var(--accent) }
.legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 16px 20px; font-size: 12px }
.legend span { display: flex; align-items: center; gap: 6px }
.legend i { width: 8px; height: 8px; border-radius: 50% }
.legend i.dashed { width: 20px; height: 0; border-top: 2px dashed var(--ink-60); border-radius: 0 }
.weekdays, .calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)) }
.weekdays span { text-align: center; padding: 10px; font-size: 12px; color: var(--ink-60) }
.calendar { border-top: 1px solid var(--line); border-left: 1px solid var(--line) }
.calendar-scroll { margin-inline: 20px }
.day { display: grid; min-width: 0; min-height: 118px; grid-template-rows: 16px repeat(3, 18px); align-content: start; gap: 5px; padding: 9px; text-align: left; border: 0; border-top: 2px solid transparent; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface) }
.day.blank { background: var(--cream) }
.day.is-month-start { border-top: 2px solid var(--accent); background: linear-gradient(180deg, rgba(239,210,142,.18), var(--surface) 28%) }
.day.is-range-start:not(.is-month-start) { border-top: 2px solid var(--brand-blue) }
.day[aria-pressed=true] { background: var(--paper); box-shadow: inset 0 0 0 2px var(--accent) }
.day-date-line { display: flex; min-width: 0; min-height: 16px; align-items: flex-start; justify-self: stretch; gap: 4px; margin: 0 }
.month-marker { display: inline; flex: 0 0 auto; color: var(--accent-strong); font: 900 10px/1.3 var(--font-s) }
.day time { display: block; min-width: 0; overflow: hidden; font: 800 13px/1.3 var(--font-d); text-overflow: ellipsis; white-space: nowrap }
.day.is-month-start time, .day.is-range-start time { color: var(--accent-strong); font-weight: 900 }
.resource-row { display: grid; min-width: 0; min-height: 18px; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 4px; align-items: center; margin: 0; font: 600 11px var(--font-d) }
.resource-row b { overflow-wrap: anywhere }
.resource-row .is-increase { color: var(--resource-increase, #527658) }
.resource-row .is-decrease { color: var(--rouge) }
.resource-row .is-stock { color: var(--ink-60); font-weight: 600 }
.range-title { overflow-wrap: anywhere; line-height: 1.6 }
.resource-row small { color: var(--ink-60); font-size: 10px }
.day-detail { margin: 14px 20px 0; padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream) }
.day-detail p { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; font-size: 12px; line-height: 1.7 }
.explanation { margin: 12px 20px 0 }
.trend { margin: 0 20px }
.trend > .explanation, .trend > .report-state, .trend > .point-detail { margin-left: 0; margin-right: 0 }
.trend svg { display: block; width: 100%; margin-top: 16px; background: var(--cream); border: 1px solid var(--line); border-radius: 8px }
.grid-line { stroke: var(--line) }
.trend text { fill: var(--ink-60); font: 12px var(--font-d) }
.trend circle { cursor: pointer; stroke: var(--surface); stroke-width: 2px }
.trend-plot { position: relative; margin-top: 16px }
.trend > .legend { margin: 14px 0 0 }
.trend-plot svg { margin-top: 0 }
.trend circle:focus { outline: none }
.trend circle:focus-visible { stroke: currentColor; stroke-width: 2px; paint-order: stroke }
.trend circle.point-halo { stroke: none; pointer-events: none }
.point-tooltip { position: absolute; z-index: 2; width: 220px; max-width: 100%; padding: 12px; pointer-events: none; border: 1px solid var(--line); border-top: 3px solid var(--point-color); border-radius: 12px; background: var(--surface); box-shadow: 0 5px 18px rgba(73, 59, 44, .12); text-align: left }
.point-tooltip-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px }
.point-tooltip-heading b { font-size: 12px }
.point-tooltip-heading time { color: var(--ink-60); font: 11px var(--font-d) }
.point-stock { display: flex; align-items: baseline; gap: 8px; margin: 10px 0 }
.point-stock span, .point-tooltip dt { color: var(--ink-60); font-size: 11px }
.point-stock strong { color: var(--ink); font: 900 25px/1.1 var(--font-d) }
.point-tooltip dl { display: grid; gap: 6px }
.point-tooltip dl > div { display: flex; justify-content: space-between; align-items: baseline; gap: 8px }
.point-tooltip dd { margin: 0; font: 700 12px var(--font-d) }
.point-tooltip .is-increase { color: #527658 }
.point-tooltip .is-decrease { color: var(--rouge) }
.point-note { margin: 8px 0 0; color: var(--ink-60); font-size: 11px; line-height: 1.6 }
.report-state, .point-detail { padding: 14px; margin: 12px 20px 0; background: var(--cream); font-size: 12px; line-height: 1.7 }
@media (min-width: 761px) {
  .calendar-content { margin-top: 14px; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); box-shadow: 0 3px 10px rgba(73, 59, 44, .05) }
  .calendar-content::after { content: ''; display: block; height: 16px; background: var(--cream) }
  .weekdays { background: var(--cream) }
  .weekdays span { padding: 11px 8px; font-family: var(--font-s); font-weight: 900 }
  .weekdays span:first-child, .weekdays span:last-child { color: var(--accent-strong) }
  .calendar { overflow: hidden; border: 0; border-block: 1px solid var(--line); border-radius: 0; background: var(--surface) }
  .day { position: relative; height: 108px; min-height: 108px; grid-template-rows: 18px repeat(3, 18px); gap: 3px; padding: 12px 14px }
  .day:nth-child(7n) { border-right: 0 }
  .day:nth-last-child(-n + 7) { border-bottom: 0 }
  .day.blank { background: color-mix(in srgb, var(--cream) 50%, var(--surface)) }
  .day[aria-pressed=true] { background: color-mix(in srgb, var(--yellow) 16%, var(--surface)); box-shadow: none }
  .day:not(:disabled):hover { box-shadow: none }
  .day:focus-visible { outline-offset: -3px }
}
@media (min-width: 761px) and (hover: hover) {
  .day:not(:disabled):hover { background: color-mix(in srgb, var(--yellow) 10%, var(--surface)) }
  .day[aria-pressed=true]:hover { background: color-mix(in srgb, var(--yellow) 22%, var(--surface)) }
}
@media (max-width: 1000px) { .resource-row { grid-template-columns: 18px minmax(0, 1fr) auto } }
@media (max-width: 760px) {
  .report-heading { padding: 14px 14px 11px }
  .report-heading-row { align-items: center; flex-wrap: nowrap; gap: 8px }
  .report-heading-copy { min-width: 0 }
  .report-heading-copy h2 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .resource-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 }
  .resource-summary article { padding: 8px 5px 7px }
  .resource-summary article:first-child { padding-left: 14px }
  .resource-summary article:last-child { padding-right: 14px }
  .resource-summary article + article { border-left: 1px solid var(--line) }
  .resource-name { justify-content: flex-start; gap: 3px; flex-wrap: nowrap }
  .resource-name img { width: 20px; height: 20px }
  .resource-name h3 { font-size: 10px; text-align: center }
  .summary-meta { display: none }
  .summary-values { gap: 3px; margin-top: 5px }
  .summary-values > strong { max-width: 100%; font-size: 15px; line-height: 1.1 }
  .summary-foot { gap: 2px; font-size: 8px }
  .summary-foot span { display: none }
  .summary-foot b { font-size: 10px }
  .view-heading { align-items: center; flex-wrap: nowrap; gap: 6px; padding: 14px 14px 0 }
  .range-title { min-width: 0; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap }
  .view-switch { flex: 0 0 auto }
  .view-switch button { min-height: 40px; padding: 6px 10px; font-size: 11px }
  .legend { margin: 14px }
  .day { height: 78px; min-height: 78px; grid-template-rows: 17px repeat(3, 14px); gap: 2px; padding: 4px 1px }
  .day-date-line { min-height: 14px; padding-left: 4px }
  .day[aria-pressed=true] { box-shadow: none }
  .day:not(:disabled):hover { box-shadow: none }
  .resource-row { width: 86%; min-width: min(100%, 4.5em); justify-self: center; min-height: 14px; display: flex; align-items: center; justify-content: center; border: 1px solid color-mix(in srgb, var(--resource-color) 65%, var(--surface)); border-radius: 999px; background: color-mix(in srgb, var(--resource-color) 24%, var(--surface)); font-size: 9px }
  .resource-row img { display: none }
  .resource-row b { white-space: nowrap; letter-spacing: -.2px; font-variant-numeric: tabular-nums }
  .resource-row small { display: none }
  .calendar-scroll { margin-inline: 0 }
  .calendar-content { min-width: 0 }
  .day-detail, .explanation, .trend, .report-state, .point-detail { margin-left: 14px; margin-right: 14px }
  .trend > .explanation, .trend > .report-state, .trend > .point-detail { margin-left: 0; margin-right: 0 }
}
</style>
