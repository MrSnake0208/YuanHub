<template>
  <section class="resource-report" aria-labelledby="resource-report-title">
    <header class="report-heading">
      <div class="report-heading-row">
        <div class="report-heading-copy"><span>周期获得账簿</span><h2 id="resource-report-title">抽卡资源收支</h2></div>
        <slot name="actions" />
      </div>
    </header>
    <div v-if="error" class="report-state" role="alert"><p>{{ error }}</p><p>暂时无法读取库存记录，请重试；读取失败不代表没有盘点。</p><slot name="error-actions" /></div>
    <p v-else-if="truncated" class="report-state" role="status">流水超过 5,000 条，以下仅展示已加载记录；库存与净变化可能不完整。</p>
    <div class="coin-basis" role="group" aria-label="白金币统计口径"><button type="button" :aria-pressed="!includeZhuyu" @click="includeZhuyu = false">实际白金币</button><button type="button" :aria-pressed="includeZhuyu" @click="includeZhuyu = true">含茱萸等价值</button></div>
    <p v-if="includeZhuyu" class="explanation">按最近已知白金币库存 + 茱萸库存 × 50 折算，不代表已兑换；月历、净变化和趋势使用同一口径。</p>
    <p v-if="includeZhuyu && resources[0].missingDays" class="report-state" role="status">部分日期缺少白金币或茱萸库存基准，暂不计算这些日期的等价值；缺测不按零处理。</p>
    <div v-if="!error" class="resource-summary">
      <article v-for="resource in resources" :key="resource.id">
        <div class="resource-name"><img :src="icon(resource.id)" alt="" width="24" height="24" /><h3>{{ resource.name }}</h3></div>
        <div class="summary-values">
          <strong>{{ number(resource.latest?.stock) }}</strong>
          <div class="summary-foot"><span>本期净变化</span><b :class="changeClass(resource.net)">{{ signed(resource.net) }}</b></div>
        </div>
        <small class="summary-meta"><template v-if="resource.latest">{{ resource.latest.state }} · 最近记录 <time :datetime="resource.latest.day">{{ resource.latest.day }}</time></template><template v-else>{{ truncated ? '已加载记录中暂无基准' : '本期无库存基准' }}</template></small>
      </article>
    </div>
    <p class="explanation">获得量统计奖励记录；净变化比较本期首末库存，两者不同。</p>
    <details class="explanation"><summary>统计口径</summary><p>获得量不计入库存盘点；净变化为本期首末有效库存记录之差，不能单独据此推算支出或转化量。</p></details>
    <div class="view-heading">
      <h3 class="range-title">{{ from }} 至 {{ to }}</h3>
      <div class="view-switch" role="group" aria-label="资源展示方式"><button v-for="option in views" :key="option.id" type="button" :aria-pressed="view === option.id" @click="view = option.id">{{ option.label }}</button></div>
    </div>
    <div v-if="noBaseline" class="report-state report-empty" role="status">
      <strong>本期暂无可计算的库存基准</strong>
      <p>这不代表从未盘点。可以调整日期范围查找已有盘点，或核对当前背包后录入库存，也可以导入 MaaYuan 库存报告。只有奖励流水时仍不能确定实际库存。</p>
      <div class="report-empty-actions"><slot name="empty-actions" /></div>
    </div>
    <template v-else-if="view === 'calendar' && !error">
      <div class="calendar-scroll"><div class="calendar-content">
        <div class="weekdays"><span v-for="day in ['日', '一', '二', '三', '四', '五', '六']" :key="day">{{ day }}</span></div>
        <div class="calendar">
          <div v-for="n in offset" :key="'blank' + n" class="day blank" aria-hidden="true"></div>
          <button v-for="day in dates" :key="day" type="button" class="day" :class="{ 'is-month-start': isMonthStart(day), 'is-range-start': day === from }" :data-month-label="monthMarkerLabel(day)" :aria-pressed="selected === day" :aria-label="calendarDayLabel(day)" @click="selected = day">
            <div class="day-date-line"><span v-if="monthMarkerLabel(day)" class="month-marker" aria-hidden="true">{{ monthMarkerLabel(day) }}</span><time :datetime="day">{{ calendarDateLabel(day) }}</time></div>
            <span v-if="calendarDayHint(day)" class="calendar-day-state">{{ calendarDayHint(day) }}</span>
            <template v-for="r in resources" :key="r.id">
              <span v-if="showCalendarResource(r, day)" class="resource-row" :style="{ gridRow: resourceSlot(r.id), '--resource-color': r.color }" :aria-label="calendarResourceLabel(r, day)">
                <img :src="icon(r.id)" alt="" width="18" height="18" />
                <b :class="changeClass(calendarValue(r, day).delta)" :title="calendarValueTitle(r, day)">{{ calendarText(r, day) }}</b>
                <small>{{ number(calendarValue(r, day).stock) }}</small>
              </span>
            </template>
          </button>
          <div v-for="n in trailingDays" :key="'trailing' + n" class="day blank" aria-hidden="true"></div>
        </div>
      </div></div>
      <div v-if="selected" class="day-detail" aria-live="polite"><h3>{{ selected }} · 记录详情</h3><p v-for="r in resources" :key="r.id"><b>{{ r.name }}</b><span v-if="pointFor(r, selected)">库存 {{ number(pointFor(r, selected).stock) }} · {{ pointFor(r, selected).state }} · {{ changeFor(r, selected) }}<template v-if="pointFor(r, selected).previousDay">（较 {{ pointFor(r, selected).previousDay }}）</template></span><span v-else-if="calendarValue(r, selected).stock !== null">最近已知库存 {{ number(calendarValue(r, selected).stock) }}（{{ calendarPointFor(r, selected).state }}，记录于 {{ calendarValue(r, selected).recordedDay }}，当日未更新）</span><span v-else>本期截至当日无库存基准，无法计算</span></p></div>
      <div class="calendar-state-legend" aria-label="库存记录状态说明"><span>基准：首次已知库存，变化暂不可比较</span><span>0：与上次记录相比零变化</span><span>未更新：沿用旧记录，不代表零变化</span><span>无基准 / —：无法计算</span></div>
      <p class="explanation">月历展示记录日相对上次记录的库存变化，可能跨越多日；行内库存是该记录日的已知值。空白不代表零变化，点击日期查看基准、来源和精确数值。<template v-if="compactChart">白金币、符传、天机符传依次使用蓝、紫棕、金色标签；大额变化以万或亿取近似值。</template></p>
    </template>
    <section v-else-if="!error" class="trend" aria-labelledby="resource-trend-title">
      <h3 id="resource-trend-title">库存趋势</h3><p class="explanation">各资源以周期内的起始库存为基准，比较相对涨跌；纵向位置不代表相同数量。起始库存为零时以 1 为基准。选择数据点可查看实际库存。</p>
    <div class="legend"><span v-for="r in resources" :key="r.id"><i :style="{ background: r.color }"></i>{{ r.name }}</span><span><i class="dashed"></i>跨未记录日期连线</span></div>
      <p v-if="!chart.series.some(r => r.points.length)" class="report-state">已加载记录中暂无可展示的库存基准</p>
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
        <p v-if="activePoint.components" class="point-note">白金币 {{ number(activePoint.components.baijinbi) }} + 茱萸 {{ number(activePoint.components.zhuyu) }} × 50</p>
        <p class="point-note">{{ activePoint.state }}</p>
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
const includeZhuyu = ref(false)
const resources = computed(() => buildResourceBalance(props.error ? [] : props.records, props.from, props.to, includeZhuyu.value))
const noBaseline = computed(() => !props.error && !props.truncated && resources.value.every(resource => !resource.latest))
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
watch(() => [props.from, props.to, props.records, props.error, props.truncated], () => { selected.value = ''; hoverPoint.value = null; pinnedPoint.value = null })
watch([view, includeZhuyu], () => { hoverPoint.value = null; pinnedPoint.value = null })
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
function showCalendarResource(r, day) { return calendarValue(r, day).recordedDay === day }
function calendarDayHint(day) {
  if (resources.value.some(r => showCalendarResource(r, day))) return ''
  return resources.value.some(r => calendarValue(r, day).stock !== null) ? '未更新' : '无基准'
}
function resourceSlot(id) { return resources.value.findIndex(resource => resource.id === id) + 2 }
function calendarText(r, day) {
  const { delta } = calendarValue(r, day)
  if (delta === null) return '基准'
  if (!compactChart.value || Math.abs(delta) < 10000) return signed(delta)
  const unit = Math.abs(delta) >= 1e8 ? 1e8 : 10000
  return (delta > 0 ? '+' : '−') + Number((Math.abs(delta) / unit).toFixed(1)) + (unit === 1e8 ? '亿' : '万')
}
function changeClass(delta) { return delta > 0 ? 'is-increase' : delta < 0 ? 'is-decrease' : 'is-stock' }
function calendarValueTitle(r, day) {
  const value = calendarValue(r, day)
  return value.stock === null ? '暂无库存基准' : `${r.name} · 库存 ${number(value.stock)} · ${calendarPointFor(r, day).state} · 记录于 ${value.recordedDay}${value.recordedDay !== day ? '（当日未更新）' : ''}`
}
function calendarResourceLabel(r, day) {
  const point = pointFor(r, day)
  return calendarValueTitle(r, day) + (point?.previousDay ? ` · 较 ${point.previousDay} 变化 ${signed(point.delta)}` : ' · 起始基准，变化不可比较')
}
function calendarDayLabel(day) {
  const recorded = resources.value.filter(r => showCalendarResource(r, day))
  return day + ' · ' + (recorded.length ? recorded.map(r => calendarResourceLabel(r, day)).join('；') : calendarDayHint(day))
}
function icon(id) { return import.meta.env.BASE_URL + 'inventory-icons/items/' + id + '.png' }
function number(value) { return value == null ? '—' : value.toLocaleString('zh-CN') }
function signed(value) { return value == null ? '—' : (value > 0 ? '+' : '') + number(value) }
function pointFor(r, day) { return r.points.find(p => p.day === day) }
function calendarPointFor(r, day) { return pointFor(r, calendarValue(r, day).recordedDay) }
function changeFor(r, day) { const p = pointFor(r, day); return !p ? '—' : p.delta === null ? '起始基准，变化不可比较' : signed(p.delta) }
function pointLabel(r, p) {
  return `${r.name}，${p.day}，库存 ${number(p.stock)}，${p.delta === null ? '周期起始库存' : '较 ' + p.previousDay + ' 变化 ' + signed(p.delta)}`
}
function pointInfo(r, p) {
  const baseline = r.points[0]?.stock
  return { ...p, id: r.id, name: r.name, color: r.color, percent: baseline > 0 ? Number(((p.stock / baseline - 1) * 100).toFixed(1)) : null }
}
</script>

<style scoped>
/* 刻意共享的字段外观与装饰动画；布局和密度由双端文件持有。 */

.resource-report { border: 1px solid var(--line); background: var(--surface); color: var(--ink) }
.report-heading { border-bottom: 1px solid var(--line) }
.report-heading-copy > span { color: var(--theme-accent-text, var(--accent-strong)); font-weight: 900 }
h2, h3 { font-family: var(--font-s); font-weight: 900 }
.report-heading-copy h2 { color: var(--ink); letter-spacing: 0 }
.coin-basis button { border: 1px solid var(--line); background: var(--surface); }
.coin-basis button[aria-pressed="true"] { background: var(--tea); color: var(--on-strong); }
.report-heading p, .explanation, .resource-summary small { color: var(--ink-60); line-height: 1.7 }
.resource-summary { border-bottom: 1px solid var(--line); background: var(--cream) }
.resource-summary article { background: var(--surface) }
.resource-summary article + article { border-left: 1px solid var(--line) }
.resource-name h3 { color: var(--ink); text-overflow: ellipsis; white-space: nowrap }
.summary-values > strong { color: var(--ink); font: 900 24px var(--font-d); text-overflow: ellipsis; white-space: nowrap }
.summary-foot { line-height: 1.2; white-space: nowrap }
.summary-foot span { color: var(--ink-60) }
.summary-foot b { color: var(--theme-accent-text, var(--accent-strong)); font: 900 12px var(--font-d) }
.summary-foot b.is-increase { color: var(--theme-success-text, #527658) }
.summary-foot b.is-decrease { color: var(--theme-danger-text, var(--rouge)) }
.summary-meta { white-space: normal }
button { color: var(--ink); font: inherit; cursor: pointer }
button:disabled { opacity: .4; cursor: default }
.view-switch { border: 1px solid var(--line); background: var(--paper) }
.view-switch button { border: 0; background: transparent; font-weight: 800 }
.view-switch button[aria-pressed=true] { background: var(--tea); color: var(--on-strong) }
button:focus-visible, circle:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 2px }
button:not(:disabled):hover { box-shadow: inset 0 0 0 1px var(--accent) }
.legend i.dashed { border-top: 2px dashed var(--ink-60) }
.weekdays span { color: var(--ink-60) }
.calendar { border-top: 1px solid var(--line); border-left: 1px solid var(--line) }
.calendar-day-state { color: var(--ink-60); line-height: 1.5 }
.calendar-state-legend { color: var(--ink-60); line-height: 1.6 }
.day { border: 0; border-top: 2px solid transparent; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface) }
.day.blank { background: var(--cream) }
.day.is-month-start { border-top: 2px solid var(--accent); background: linear-gradient(180deg, var(--theme-wash-strong, rgba(239,210,142,.18)), var(--surface) 28%) }
.day.is-range-start:not(.is-month-start) { border-top: 2px solid var(--brand-blue) }
.day[aria-pressed=true] { background: var(--paper); box-shadow: inset 0 0 0 2px var(--accent) }
.month-marker { color: var(--theme-accent-text, var(--accent-strong)); font: 900 10px/1.3 var(--font-s) }
.day time { font: 800 13px/1.3 var(--font-d); text-overflow: ellipsis; white-space: nowrap }
.day.is-month-start time, .day.is-range-start time { color: var(--theme-accent-text, var(--accent-strong)); font-weight: 900 }
.resource-row { font: 600 11px var(--font-d) }
.resource-row .is-increase { color: var(--resource-increase, var(--theme-success-text, #527658)) }
.resource-row .is-decrease { color: var(--theme-danger-text, var(--rouge)) }
.resource-row .is-stock { color: var(--ink-60); font-weight: 600 }
.range-title { line-height: 1.6 }
.resource-row small { color: var(--ink-60) }
.day-detail { border: 1px solid var(--line); background: var(--cream) }
.day-detail p { line-height: 1.7 }
.trend svg { background: var(--cream); border: 1px solid var(--line) }
.grid-line { stroke: var(--line) }
.trend text { fill: var(--ink-60); font: 12px var(--font-d) }
.trend circle { cursor: pointer; stroke: var(--on-surface); stroke-width: 2px }
.trend circle:focus { outline: none }
.trend circle:focus-visible { stroke: currentColor; stroke-width: 2px; paint-order: stroke }
.trend circle.point-halo { stroke: none; pointer-events: none }
.point-tooltip { pointer-events: none; border: 1px solid var(--line); border-top: 3px solid var(--point-color); background: var(--surface); box-shadow: 0 5px 18px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.12) }
.point-tooltip-heading time { color: var(--ink-60); font: 11px var(--font-d) }
.point-stock span, .point-tooltip dt { color: var(--ink-60) }
.point-stock strong { color: var(--ink); font: 900 25px/1.1 var(--font-d) }
.point-tooltip dd { font: 700 12px var(--font-d) }
.point-tooltip .is-increase { color: var(--theme-success-text, #527658) }
.point-tooltip .is-decrease { color: var(--theme-danger-text, var(--rouge)) }
.point-note { color: var(--ink-60); line-height: 1.6 }
.report-state, .point-detail { background: var(--cream); line-height: 1.7 }
</style>
<style scoped src="./resourceBalanceReportDesktop.css"></style>
<style scoped src="./resourceBalanceReportMobile.css"></style>
