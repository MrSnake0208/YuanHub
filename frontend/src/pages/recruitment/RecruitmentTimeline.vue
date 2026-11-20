<template>
  <section class="pool-timeline" :aria-labelledby="timelineId">
    <div class="timeline-heading">
      <div><h2 :id="timelineId">卡池时间线</h2></div>
    </div>
    <div v-if="years.length" class="year-filters" aria-label="卡池年份">
      <button type="button" :aria-pressed="year === ''" @click="year = ''">全部</button>
      <button v-for="item in years" :key="item" type="button" :aria-pressed="year === item" @click="year = item">{{ item }}</button>
      <button v-if="hasUndated" type="button" :aria-pressed="year === 'unknown'" @click="year = 'unknown'">日期未知</button>
    </div>
    <div class="overview-tools touch-targets" aria-label="卡池明细显示">
      <div v-if="pools.some(hasRecords)" class="overview-views" role="group" aria-label="主页面明细视图">
        <button type="button" aria-label="进度条视图" :aria-pressed="recordView === 'progress'" @click="recordView = 'progress'">进度条</button>
        <button type="button" aria-label="密探视图" :aria-pressed="recordView === 'agents'" @click="recordView = 'agents'">密探</button>
      </div>
      <button type="button" class="sort-button" :aria-label="descending ? '按时间排序，当前最新优先，点击切换最早优先' : '按时间排序，当前最早优先，点击切换最新优先'" @click="descending = !descending">按时间<ArrowDownWideNarrow v-if="descending" :size="16" aria-hidden="true" /><ArrowUpWideNarrow v-else :size="16" aria-hidden="true" /></button>
      <button v-if="pools.some(hasRecords)" type="button" class="batch-toggle" :disabled="!visiblePools.some(hasRecords)" :aria-label="allExpanded ? '折叠当前年份全部明细' : '展开当前年份全部明细'" @click="setAllExpanded(!allExpanded)">{{ allExpanded ? '折叠' : '展开' }}<Minimize2 v-if="allExpanded" :size="15" aria-hidden="true" /><Maximize2 v-else :size="15" aria-hidden="true" /></button>
    </div>
    <RecruitmentGuideHint v-if="TUTORIALS_ENABLED && guideActive" :target="visiblePools.length ? 'pool-cards' : 'pool-unavailable'" :message="pools.length ? (visiblePools.length ? '先看池名、UP 密探和日期，再点卡片打开你抽过的池子。' : '这一年没有卡池，换个年份或点「全部」。') : '当前暂无可用卡池，可以退出或先练习。'" ><button v-if="!visiblePools.length" type="button" @click="$emit('practice')">先练习一下</button></RecruitmentGuideHint>
    <p v-if="!pools.length" data-guide-target="pool-unavailable" class="timeline-empty">当前游戏暂无可用卡池。</p>
    <p v-else-if="!visiblePools.length" data-guide-target="pool-unavailable" class="timeline-empty">此年份暂无卡池。</p>
    <ol class="timeline-list" data-guide-target="pool-cards">
      <li v-for="(pool, index) in visiblePools" :key="pool.pool_id" class="timeline-row">
        <div class="date-rail" aria-hidden="true"><span v-if="permanent(pool) || !startDate(pool) || !visiblePools[index - 1] || permanent(visiblePools[index - 1]) || startDate(visiblePools[index - 1]).slice(0, 7) !== startDate(pool).slice(0, 7)">{{ permanent(pool) ? '常驻' : startDate(pool) ? startDate(pool).slice(0, 4) + '年' + Number(startDate(pool).slice(5, 7)) + '月' : '日期' }}</span><strong>{{ permanent(pool) ? '∞' : startDate(pool) ? Number(startDate(pool).slice(8, 10)) + '日' : '未知' }}</strong></div>
        <div class="pool-group">
          <div class="pool-card has-banner" :class="normalizeRecruitmentPoolType(details(pool).pool_type)">
            <span class="bn" aria-hidden="true">
              <span class="bn-sweep" />
              <span v-if="coverPortraits(pool).length" class="bn-art" :class="{ solo: coverPortraits(pool).length === 1 }">
                <img v-for="portrait in coverPortraits(pool)" :key="portrait.id" :src="portrait.src" alt="" loading="lazy" decoding="async" @error="markPortraitFailed(portrait.src)" />
              </span>
              <span v-else class="bn-mark">鸢</span>
              <span class="bn-text">
                <span class="bn-title-row">
                  <span class="bn-name">{{ details(pool).name }}</span>
                  <span class="bn-seal">{{ normalizeRecruitmentPoolType(details(pool).pool_type) === 'unknown' ? '招募' : recruitmentPoolType(details(pool).pool_type).label }}</span>
                </span>
              </span>
              <span v-if="poolDate(pool)" class="pool-dates">{{ poolDate(pool) }}</span>
              <span v-if="status(pool) !== '已结束'" class="bn-status" :class="{ 'is-open': status(pool) === '进行中' || status(pool) === '常驻开放' }">
                <i />{{ statusLabel(pool) }}
              </span>
            </span>
            <span class="banner-content">
              <span class="banner-summary" :class="{ 'has-many-up': summaryAgents(pool).length >= 3 }">
                <span v-if="summaryAgents(pool).length" class="pool-up-row" aria-hidden="true">
                  <span class="pool-up-label">{{ regularsByPool.has(pool.pool_id) ? '常客' : 'UP' }}</span>
                  <span v-for="agent in summaryAgents(pool)" :key="agent.id" class="pool-up-item" :class="{ 'is-muted': agent.count === 0 || agent.count == null }">
                    <OperatorAvatar class="pool-up-avatar" :avatar="agent.avatar" :name="agent.name" :rarity="agent.rarity" />
                    <span class="pool-up-name">{{ agent.name }}</span>
                    <span class="pool-up-count">{{ agent.count == null ? '—' : '×' + agent.count }}</span>
                  </span>
                </span>
                <span v-else-if="normalizeRecruitmentPoolType(details(pool).pool_type) !== 'unknown'" class="pool-type-label" aria-hidden="true">
                  {{ recruitmentPoolType(details(pool).pool_type).label }}招募
                </span>
                <span v-if="isEmptyPool(pool)" class="pool-empty">还没有记录</span>
                <span v-else class="pool-metrics banner-metrics">
                  <span v-for="metric in poolMetrics(pool)" :key="metric.label" :class="metric.class">
                    <span class="metric-label">{{ metric.label }}</span>
                    <span class="metric-value"><b :class="{ 'is-unknown': metric.value === '未知' || metric.value === '—' }">{{ metric.value }}</b><small v-if="metric.unit && metric.value !== '未知' && metric.value !== '—'">{{ metric.unit }}</small></span>
                  </span>
                </span>
              </span>
              <span v-if="cumulativeChoiceNames(pool)" class="pool-cumulative-choice">累抽自选 · {{ cumulativeChoiceNames(pool) }}</span>
              <span v-if="poolSummaries[pool.pool_id]?.four_star_count" class="metric-note">另有 {{ poolSummaries[pool.pool_id].four_star_count }} 条4星计次</span>
            </span>
            <button :ref="element => rememberCard(pool.pool_id, element)" type="button" class="entry-label" :disabled="busy" :aria-label="cardLabel(pool)" :aria-description="poolDate(pool)" @click="$emit('select', pool.pool_id)" />
          </div>
          <RecruitmentRecordsPreview v-if="hasRecords(pool) && isExpanded(pool)" :id="previewId(pool)" :pool="pool" :catalog="catalog" :agents="agents" :entry="previews[pool.pool_id]" :view="recordView" :busy="busy" @load="more => $emit('load-preview', pool.pool_id, more)" />
        </div>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { TUTORIALS_ENABLED } from '../../config/features.js'
import { computed, ref, useId, watch } from 'vue'
import { ArrowUpWideNarrow, Minimize2, Maximize2, ArrowDownWideNarrow } from '@lucide/vue'
import RecruitmentRecordsPreview from './RecruitmentRecordsPreview.vue'
import RecruitmentGuideHint from './RecruitmentGuideHint.vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { dateInZone } from '../../utils/businessDay.js'
import { recruitmentPoolCatalog } from './rules.js'
import { calendarDayDistance } from '../../data/activityCalendar.js'
import { isPermanentRecruitmentPool, normalizeRecruitmentPoolType, recruitmentPoolDateLabel, recruitmentPoolType } from '../../data/recruitmentPoolTypes.js'
import { resolveOperatorPortrait } from '../../utils/operatorPortrait.js'

const timelineId = 'recruitment-timeline-' + useId()
const props = defineProps({ pools: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, agents: { type: Array, default: () => [] }, poolSummaries: { type: Object, default: () => ({}) }, previews: { type: Object, default: () => ({}) }, busy: Boolean, contextVersion: Number, guideActive: Boolean })
defineEmits(['select', 'practice', 'load-preview'])
const year = ref(''), descending = ref(true)
const recordView = ref('agents'), expandedPools = ref(new Set())
const hasRecords = pool => (props.poolSummaries[pool.pool_id]?.event_count || 0) > 0
const isExpanded = pool => expandedPools.value.has(pool.pool_id)
const allExpanded = computed(() => visiblePools.value.some(hasRecords) && visiblePools.value.every(pool => !hasRecords(pool) || isExpanded(pool)))
const previewId = pool => `${timelineId}-preview-${pool.pool_id}`
function setAllExpanded(expanded) { for (const pool of visiblePools.value) if (hasRecords(pool)) { if (expanded) expandedPools.value.add(pool.pool_id); else expandedPools.value.delete(pool.pool_id) } }
const goldCount = pool => {
  const summary = props.poolSummaries[pool.pool_id]
  return Number.isInteger(summary?.event_count) ? summary.event_count - (summary.four_star_count || 0) : null
}
const failedPortraits = ref(new Set())
const details = pool => recruitmentPoolCatalog(pool, props.catalog) || pool.mapped_snapshot || pool.snapshot || {}
const startDate = pool => details(pool).start_date || ''
function poolDate(pool) {
  const data = details(pool)
  if (data.start_date || data.end_date) return recruitmentPoolDateLabel(data)
}
const cumulativeChoiceNames = pool => (pool.cumulative_choice_agent_ids?.length ? pool.cumulative_choice_agent_ids : pool.cumulative_choice_agent_id ? [pool.cumulative_choice_agent_id] : []).map(id => props.agents.find(agent => agent.id === id)?.name || id).join('、')
const permanent = pool => isPermanentRecruitmentPool(details(pool))
const years = computed(() => [...new Set(props.pools.filter(pool => !permanent(pool)).map(pool => startDate(pool).slice(0, 4)).filter(Boolean))].sort().reverse())
const hasUndated = computed(() => props.pools.some(pool => !permanent(pool) && !startDate(pool)))
watch([years, hasUndated], ([availableYears, undated]) => {
  if (year.value && (year.value === 'unknown' ? !undated : !availableYears.includes(year.value))) year.value = ''
})
const poolPriority = pool => permanent(pool) ? 0 : status(pool) === '进行中' ? 1 : 2
const visiblePools = computed(() => props.pools.filter(pool => permanent(pool) || !year.value || (year.value === 'unknown' ? !startDate(pool) : startDate(pool).startsWith(year.value))).slice().sort((a, b) => {
  const pinned = poolPriority(a) - poolPriority(b)
  if (pinned) return pinned
  const first = startDate(a), second = startDate(b)
  if (!first || !second) return Number(!first) - Number(!second)
  return descending.value ? second.localeCompare(first) : first.localeCompare(second)
}))
function poolMetrics(pool) {
  return [
    { label: '绝密次数', value: goldCount(pool) ?? '未知', unit: '次' },
    { label: '总抽数', value: props.poolSummaries[pool.pool_id]?.known_total_pulls?.toLocaleString() ?? '未知', unit: '抽', class: 'total-pulls-metric' },
    { label: '平均抽数', value: props.poolSummaries[pool.pool_id]?.average_gold_pulls ?? '—', unit: '抽', class: 'average-metric' },
    { label: '小保底不歪率', value: permanent(pool) || props.poolSummaries[pool.pool_id]?.small_pity_win_rate == null ? '—' : props.poolSummaries[pool.pool_id].small_pity_win_rate + '%', class: 'small-pity-metric' },
  ]
}
function isEmptyPool(pool) {
  const summary = props.poolSummaries[pool.pool_id]
  return !!summary && summary.event_count === 0 && (summary.known_total_pulls === 0 || summary.known_total_pulls == null) && !Number.isInteger(pool.progress)
}
function status(pool, today = dateInZone('Asia/Shanghai')) {
  const data = details(pool)
  if (data.hidden) return '已隐藏 · 历史保留'
  if (data.enabled === false) return '已停用'
  if (data.enabled == null) return pool.snapshot?.catalog_pool_id ? '目录未确认' : '历史卡池'
  if (data.start_date && data.start_date > today) return '未开始'
  if (data.end_date && data.end_date < today) return '已结束'
  if (isPermanentRecruitmentPool(data)) return '常驻开放'
  return data.start_date && data.end_date ? '进行中' : '已启用'
}
function statusLabel(pool) {
  const today = dateInZone('Asia/Shanghai')
  const state = status(pool, today)
  if (state === '常驻开放') return '常驻'
  if (state !== '进行中') return state
  const endDate = details(pool).end_date
  return endDate === today ? '进行中 · 今天结束' : `进行中 · 剩 ${calendarDayDistance(today, endDate)} 天`
}
const avatarResults = computed(() => new Map(props.pools.map(pool => [pool.pool_id,
  activeUpSlots(pool).map(slot => {
    const agent = props.agents.find(item => item.id === slot.operator_id)
    const count = props.poolSummaries[pool.pool_id]?.up_agent_counts?.[slot.id]
    return { id: slot.id, name: agent?.name || slot.name || '未知密探', rarity: Number(agent?.rarity) || 5,
      portrait: resolveOperatorPortrait(slot.operator_id, agent),
      avatar: agent?.avatar || agent?.avatar_url || resolveOperatorPortrait(slot.operator_id, agent),
      count: Number.isSafeInteger(count) && count >= 0 ? count : null }
  })
])))
const coverAgents = pool => avatarResults.value.get(pool.pool_id) || []
const regularsByPool = computed(() => {
  const regulars = new Map()
  for (const pool of props.pools) {
    const counts = props.poolSummaries[pool.pool_id]?.top_gold_agents
    if (!counts?.length || !permanent(pool)) continue
    regulars.set(pool.pool_id, counts.map(({ agent_id, name, count }) => {
      const agent = props.agents.find(item => item.id === agent_id)
      return { id: agent_id, name, count, rarity: 5,
        avatar: agent ? agent.avatar || agent.avatar_url || resolveOperatorPortrait(agent_id, agent) : '' }
    }))
  }
  return regulars
})
const summaryAgents = pool => regularsByPool.value.get(pool.pool_id) || coverAgents(pool).filter(agent => agent.rarity !== 4)
function cardLabel(pool) {
  const agents = summaryAgents(pool)
  const { enabled, name, pool_type } = details(pool)
  const label = (enabled ? '记一笔 ' : '查看记录 ') + (name || '未知卡池') + '，' + recruitmentPoolType(pool_type).label + '，' + status(pool)
  if (!agents.length) return label
  if (regularsByPool.value.has(pool.pool_id)) {
    return label + '；本池常客：' + agents.map(agent => `${agent.name} ${agent.count} 次`).join('，')
  }
  return label + '；本池 UP 获得次数：' + agents.map(agent => agent.name + (agent.count == null ? '，统计未知' : '，获得 ' + agent.count + ' 次')).join('；')
}
const activeUpSlots = pool => (details(pool).up_agents || []).filter(slot => slot.active !== false)
const coverPortraits = pool => coverAgents(pool)
  .map(agent => ({ id: agent.id, src: agent.portrait }))
  .filter(portrait => portrait.src && !failedPortraits.value.has(portrait.src))
  .slice(0, 3)
function markPortraitFailed(src) { if (src) failedPortraits.value.add(src) }
const cards = new Map()
function rememberCard(id, element) { if (element) cards.set(id, element); else cards.delete(id) }
defineExpose({ focusPool: id => cards.get(id)?.focus({ preventScroll: true }) })
watch(() => props.contextVersion, () => { year.value = ''; descending.value = true; expandedPools.value = new Set() })
</script>

<style scoped>
.pool-card {
  position: relative;
  isolation: isolate;
  border-radius: 16px;
  background: var(--surface);
  transition: background-color .18s;
}
@media (hover: hover) {
  .pool-card:has(.entry-label:enabled:hover) {
    background-color: color-mix(in srgb, var(--surface) 94%, var(--ink) 6%);
  }
}
.pool-card:has(.entry-label:enabled:active) {
  background-color: color-mix(in srgb, var(--surface) 91%, var(--ink) 9%);
}
.entry-label {
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}
.entry-label:disabled { cursor: default; }
.bn {
  --title: #3E2F21;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  container-type: inline-size;
  color-scheme: only light;
  color: #493B2C;
  border-radius: 14px;
  background:
    radial-gradient(60% 120% at 28% 70%, var(--glow), transparent 70%),
    linear-gradient(100deg, var(--a) 0%, var(--b) 100%);
}
.pool-card.limited  { --a: #FFF8EC; --b: #F2DFAD; --glow: rgba(230,190,110,.55); --frame: rgba(152,114,42,.45); --seal: #B5432F; }
.pool-card.rerun    { --a: #F7FAFD; --b: #D9E8F5; --glow: rgba(150,190,225,.5); --frame: rgba(89,125,155,.45); --seal: #3F6A8F; }
.pool-card.zhaoying { --a: #FBF8FD; --b: #E7DCF4; --glow: rgba(190,160,225,.5); --frame: rgba(136,102,159,.45); --seal: #6E4E92; }
.pool-card.choice   { --a: #FFF7F5; --b: #F1D5D1; --glow: rgba(225,150,140,.45); --frame: rgba(166,81,74,.45); --seal: #9C3A35; }
.pool-card.permanent, .pool-card.unknown { --a: #FFFDF6; --b: #F6EDD0; --glow: rgba(220,190,130,.4); --frame: rgba(128,107,85,.4); --seal: #806B55; }
.bn::before {
  content: ''; position: absolute; inset: 0 0 0 45%; z-index: -1; opacity: .06; mix-blend-mode: multiply;
  background: url('/maayuan/maayuan-pattern.webp') center / 240px repeat;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 35%);
  mask-image: linear-gradient(90deg, transparent, #000 35%);
}
.bn::after {
  content: ''; position: absolute; inset: 6px; border-radius: 10px; pointer-events: none;
  border: 1px solid var(--frame);
}
.bn-sweep {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(112deg, transparent 46%, rgba(255,255,255,.14) 47%, rgba(255,255,255,.04) 56%, transparent 57%);
}
.bn-art {
  position: absolute; inset: 0 auto 0 0; width: 64%; z-index: 1;
  -webkit-mask-image: linear-gradient(90deg, #000 62%, transparent 98%);
  mask-image: linear-gradient(90deg, #000 62%, transparent 98%);
}
.bn-art img { position: absolute; bottom: -20%; height: 128%; width: auto; max-width: none; filter: drop-shadow(0 4px 10px rgba(73,59,44,.22)); }
.bn-art img:nth-child(1) { left: -6%; z-index: 1; }
.bn-art img:nth-child(2) { left: 24%; z-index: 2; height: 138%; bottom: -26%; }
.bn-art img:nth-child(3) { left: 50%; z-index: 1; height: 120%; }
.bn-art.solo img { left: 4%; height: 150%; bottom: -36%; }
.bn-mark {
  position: absolute; z-index: 1; left: 6%; top: 50%; transform: translateY(-50%);
  font: 900 26cqw/1 var(--font-s); opacity: .14; letter-spacing: -.05em;
}
.bn-text {
  position: absolute; z-index: 3; right: 5.5%; top: 50%; transform: translateY(-50%);
  display: grid; grid-template-columns: minmax(0,1fr); justify-items: end; max-width: 50%;
}
.bn-title-row { display: flex; align-items: center; gap: 2.2cqw; min-width: 0; max-width: 100%; }
.bn-name {
  min-width: 0;
  font: 900 clamp(20px, 6.6cqw, 52px)/1.1 var(--font-s); letter-spacing: .14em; color: var(--title);
  text-shadow: 0 1px 0 rgba(255,255,255,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bn-seal {
  flex: none; writing-mode: vertical-rl; font: 900 clamp(10px, 2.1cqw, 16px)/1 var(--font-s); letter-spacing: .12em;
  color: #FFF4E6; background: var(--seal); padding: .45em .32em; border-radius: 4px;
  box-shadow: inset 0 0 0 1.5px rgba(255,240,220,.55); transform: rotate(-4deg);
}
.pool-dates {
  position: absolute; z-index: 3; right: 2.5%; bottom: 7%; max-width: 60cqw;
  font: 600 clamp(9px, 1.8cqw, 12px)/1.2 var(--font-s); font-variant-numeric: tabular-nums;
  color: #5A4633; text-shadow: 0 1px 0 rgba(255,255,255,.7);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bn-status {
  position: absolute; z-index: 3; left: 3.4%; top: 9%; display: inline-flex; align-items: center; gap: 6px;
  font: 600 clamp(10px, 1.9cqw, 13px)/1 var(--font-b); color: #5A4633; background: rgba(255,253,246,.8);
  padding: 5px 9px; border-radius: 999px; border: 1px solid #E3D5BC;
}
.bn-status i { width: 6px; height: 6px; border-radius: 50%; background: #b9ad9a; }
.bn-status.is-open i { background: #8fd19e; box-shadow: 0 0 0 3px rgba(143,209,158,.25); }

.pool-up-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;min-width:0}
.pool-up-item{display:inline-flex;align-items:center;gap:4px;max-width:100%}
.pool-up-label{flex:none;font:700 11px/1.4 var(--font-s);color:var(--seal);letter-spacing:.08em}
.pool-up-name,.pool-type-label{font:13px/1.4 var(--font-s)}
.pool-up-name{min-width:0;color:var(--ink)}
.pool-type-label{color:var(--ink-60)}
.pool-up-row .pool-up-avatar{border:1.5px solid var(--accent);border-radius:50%}.pool-up-row :deep(.pool-up-avatar img){border-radius:50%}
.pool-up-row :deep(.pool-up-avatar > span){display:grid;place-items:center;width:100%;height:100%;font-size:13px;line-height:1;font-weight:700;border-radius:50%;overflow:hidden}
.pool-up-item.is-muted .pool-up-count{color:var(--ink-60)}
.banner-content{container-type:inline-size}
.banner-summary{display:contents}
.banner-content .banner-metrics{border:0;border-radius:12px;background:var(--cream)}
.pool-cumulative-choice{font-size:12px;line-height:1.7;color:var(--ink-60);overflow-wrap:anywhere}
.batch-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.overview-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:16px}.overview-tools button{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:6px 10px;font:inherit;font-size:12px}.overview-views{display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--cream)}.overview-views button{border-color:transparent}.overview-views button[aria-pressed=true]{background:var(--tea);color:var(--on-strong)}.metric-note{font-size:11px;line-height:1.6;color:var(--ink-60)}

/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.timeline-heading p{color:var(--ink-60)}button{color:var(--ink);cursor:pointer}button:focus-visible{outline:2px solid var(--theme-focus, var(--accent));outline-offset:4px}button:disabled{opacity:.6;cursor:not-allowed}.sort-button{border:1px solid var(--line);background:var(--surface);border-radius:999px}.year-filters{border:1px solid var(--line);border-radius:20px;background:var(--cream)}.year-filters button{border:0;background:transparent;border-radius:999px}.year-filters button[aria-pressed=true]{background:var(--tea);color:var(--on-strong)}.timeline-row::before{content:'';border-left:1px solid var(--line)}.date-rail::before{content:'';border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--paper)}.pool-group{min-width:0;border:1px solid var(--line);border-radius:16px;background:var(--surface)}
.pool-empty{font-size:13px;color:var(--ink-60)}.pool-metrics>span{color:var(--ink-60)}.pool-metrics b{color:var(--ink)}.timeline-empty{color:var(--ink-60)}
@media(prefers-reduced-motion:reduce){.pool-card{transition:none}}
</style>
<style scoped src="./recruitmentTimelineDesktop.css"></style>
<style scoped src="./recruitmentTimelineMobile.css"></style>
