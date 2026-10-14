<template>
  <section class="pool-timeline" :aria-labelledby="timelineId">
    <div class="timeline-heading">
      <div><h2 :id="timelineId">卡池时间线</h2><p>找到实际抽取的卡池，记一笔；直接查看统计与出货明细。</p></div>
      <button type="button" class="sort-button" @click="descending = !descending"><ArrowDownWideNarrow :size="17" aria-hidden="true" />{{ descending ? '按时间从新到旧' : '按时间从早到晚' }}</button>
    </div>
    <div class="overview-tools" aria-label="卡池明细显示">
      <div class="overview-views" role="group" aria-label="主页面明细视图">
        <button type="button" :aria-pressed="recordView === 'progress'" @click="recordView = 'progress'">进度条视图</button>
        <button type="button" :aria-pressed="recordView === 'agents'" @click="recordView = 'agents'">密探视图</button>
      </div>
      <button type="button" :disabled="!visiblePools.some(hasRecords)" @click="setAllExpanded(true)">全部展开</button>
      <button type="button" :disabled="!visiblePools.some(hasRecords)" @click="setAllExpanded(false)">全部折叠</button>
    </div>
    <div v-if="years.length" class="year-filters" aria-label="卡池年份">
      <button type="button" :aria-pressed="year === ''" @click="year = ''">全部</button>
      <button v-for="item in years" :key="item" type="button" :aria-pressed="year === item" @click="year = item">{{ item }}</button>
      <button v-if="hasUndated" type="button" :aria-pressed="year === 'unknown'" @click="year = 'unknown'">日期未知</button>
    </div>
    <RecruitmentGuideHint v-if="TUTORIALS_ENABLED && guideActive" :target="visiblePools.length ? 'pool-cards' : 'pool-unavailable'" :message="pools.length ? (visiblePools.length ? '先找你抽过的池子，看池名、UP 密探和日期，再点「记一笔／查看记录」。' : '这一年没有卡池，换个年份或点「全部」。') : '当前暂无可用卡池，可以退出或先练习。'" ><button v-if="!visiblePools.length" type="button" @click="$emit('practice')">先练习一下</button></RecruitmentGuideHint>
    <p v-if="!pools.length" data-guide-target="pool-unavailable" class="timeline-empty">当前游戏暂无公共卡池，请联系管理员配置。可导入已有备份，或等待公共目录配置。</p>
    <p v-else-if="!visiblePools.length" data-guide-target="pool-unavailable" class="timeline-empty">此年份暂无卡池。</p>
    <ol class="timeline-list" data-guide-target="pool-cards">
      <li v-for="pool in visiblePools" :key="pool.pool_id" class="timeline-row">
        <div class="date-rail" aria-hidden="true"><span>{{ isPermanentRecruitmentPool(details(pool)) ? '常驻' : startDate(pool) ? startDate(pool).slice(0, 4) + '年' : '日期' }}</span><strong>{{ isPermanentRecruitmentPool(details(pool)) ? '∞' : startDate(pool) ? Number(startDate(pool).slice(5, 7)) + '月' : '未知' }}</strong></div>
        <div class="pool-group">
          <div class="pool-card" role="group" :aria-label="cardLabel(pool)" @click="onSummaryClick($event, pool)">
            <span class="pool-cover" :class="'cover-tone-' + recruitmentPoolType(details(pool).pool_type).coverTone" :style="recruitmentCoverStyle(details(pool).pool_type)">
              <span v-if="coverPortraits(pool).length" class="cover-portraits" :class="'portrait-count-' + coverPortraits(pool).length">
                <img v-for="portrait in coverPortraits(pool)" :key="portrait.id" class="cover-portrait" :src="portrait.src" alt="" loading="lazy" decoding="async" @error="markPortraitFailed(portrait.src)" />
              </span>
              <span v-if="hiddenPortraitCount(pool)" class="cover-more">+{{ hiddenPortraitCount(pool) }}</span>
              <span class="cover-caption">{{ details(pool).pool_type || '招募档案' }}</span>
              <span class="cover-name">{{ details(pool).name }}</span>
              <span v-if="coverAgents(pool).length" class="cover-agents" aria-hidden="true">
                <span v-for="agent in coverAgents(pool)" :key="agent.id" class="up-result">
                  <OperatorAvatar class="up-avatar" :avatar="agent.avatar" :name="agent.name" :rarity="agent.rarity" />
                  <span class="up-count" :class="{ 'is-muted': agent.count === 0 || agent.count == null }">{{ agent.count == null ? '—' : '×' + agent.count }}</span>
                </span>
              </span>
            </span>
            <span class="pool-content">
              <span class="pool-name">{{ details(pool).name }}</span>
              <span class="pool-status" :class="{ 'status-open': status(pool) === '进行中' }"><span aria-hidden="true" class="status-dot" />{{ status(pool) }}</span>
              <span class="pool-dates">{{ recruitmentPoolDateLabel(details(pool)) }}</span>
              <span class="pool-metrics">
                <span><BookOpen :size="15" aria-hidden="true" />已知抽数 <b>{{ poolSummaries[pool.pool_id]?.known_total_pulls?.toLocaleString() ?? '未知' }}</b><small>抽</small></span>
                <span><Gem :size="15" aria-hidden="true" />绝密次数 <b>{{ goldCount(pool) ?? '未知' }}</b><small>次</small></span>
                <span><CircleGauge :size="15" aria-hidden="true" />距保底 <b>{{ remainingPulls(pool) }}</b><small>抽</small></span>
                <span class="average-metric">平均出金 <b>{{ poolSummaries[pool.pool_id]?.average_gold_pulls ?? '—' }}</b><small>抽</small></span>
                <span class="small-pity-metric">小保底不歪率 <b>{{ permanent(pool) || poolSummaries[pool.pool_id]?.small_pity_win_rate == null ? '—' : poolSummaries[pool.pool_id].small_pity_win_rate + '%' }}</b></span>
              </span>
              <span v-if="poolSummaries[pool.pool_id]?.four_star_count" class="metric-note">另有 {{ poolSummaries[pool.pool_id].four_star_count }} 条4星计次</span>
            </span>
            <span class="pool-entry">
              <span class="pool-actions">
                <button v-if="hasRecords(pool)" type="button" class="preview-toggle" :aria-expanded="isExpanded(pool)" :aria-controls="previewId(pool)" @click.stop="togglePool(pool)">{{ isExpanded(pool) ? '收起明细' : '展开明细' }}<ChevronDown :size="14" :class="{ 'is-expanded': isExpanded(pool) }" aria-hidden="true" /></button>
                <button :ref="element => rememberCard(pool.pool_id, element)" type="button" class="entry-label" :disabled="busy" :aria-label="cardLabel(pool)" @click.stop="$emit('select', pool.pool_id)">{{ details(pool).enabled ? '记一笔' : '查看记录' }} <ChevronRight :size="16" aria-hidden="true" /></button>
              </span>
            </span>
          </div>
          <RecruitmentRecordsPreview v-if="hasRecords(pool) && isExpanded(pool)" :id="previewId(pool)" :pool="pool" :catalog="catalog" :agents="agents" :entry="previews[pool.pool_id]" :view="recordView" :busy="busy" @load="more => $emit('load-preview', pool.pool_id, more)" />
        </div>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { TUTORIALS_ENABLED } from "../../config/features.js";
import { computed, ref, useId, watch } from 'vue'
import { ArrowDownWideNarrow, BookOpen, ChevronRight, ChevronDown, CircleGauge, Gem, Sprout } from '@lucide/vue'
import RecruitmentRecordsPreview from './RecruitmentRecordsPreview.vue'
import RecruitmentGuideHint from './RecruitmentGuideHint.vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { dateInZone } from '../../utils/businessDay.js'
import { recruitmentPoolCatalog } from './rules.js'
import { isPermanentRecruitmentPool, recruitmentCoverStyle, recruitmentPoolDateLabel, recruitmentPoolType } from '../../data/recruitmentPoolTypes.js'
import operatorPortraits from '../../data/operatorPortraits.json'
import { avatarUrl } from '../../api/request.js'

const timelineId = 'recruitment-timeline-' + useId()
const props = defineProps({ pools: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, agents: { type: Array, default: () => [] }, poolSummaries: { type: Object, default: () => ({}) }, previews: { type: Object, default: () => ({}) }, busy: Boolean, contextVersion: Number, guideActive: Boolean })
defineEmits(['select', 'practice', 'load-preview'])
const year = ref(''), descending = ref(true)
const recordView = ref('agents'), expandedPools = ref(new Set())
const hasRecords = pool => (props.poolSummaries[pool.pool_id]?.event_count || 0) > 0
const isExpanded = pool => expandedPools.value.has(pool.pool_id)
const previewId = pool => `${timelineId}-preview-${pool.pool_id}`
function togglePool(pool) { if (hasRecords(pool)) { if (isExpanded(pool)) expandedPools.value.delete(pool.pool_id); else expandedPools.value.add(pool.pool_id) } }
function onSummaryClick(event, pool) { if (!event.target.closest('button, a, input, select')) togglePool(pool) }
function setAllExpanded(expanded) { for (const pool of visiblePools.value) if (hasRecords(pool)) { if (expanded) expandedPools.value.add(pool.pool_id); else expandedPools.value.delete(pool.pool_id) } }
const goldCount = pool => {
  const summary = props.poolSummaries[pool.pool_id]
  return Number.isInteger(summary?.event_count) ? summary.event_count - (summary.four_star_count || 0) : null
}
const failedPortraits = ref(new Set())
const details = pool => recruitmentPoolCatalog(pool, props.catalog) || pool.mapped_snapshot || pool.snapshot || {}
const startDate = pool => details(pool).start_date || ''
const permanent = pool => isPermanentRecruitmentPool(details(pool))
const years = computed(() => [...new Set(props.pools.filter(pool => !permanent(pool)).map(pool => startDate(pool).slice(0, 4)).filter(Boolean))].sort().reverse())
const hasUndated = computed(() => props.pools.some(pool => !permanent(pool) && !startDate(pool)))
watch([years, hasUndated], ([availableYears, undated]) => {
  if (year.value && (year.value === 'unknown' ? !undated : !availableYears.includes(year.value))) year.value = ''
})
const visiblePools = computed(() => props.pools.filter(pool => permanent(pool) || !year.value || (year.value === 'unknown' ? !startDate(pool) : startDate(pool).startsWith(year.value))).slice().sort((a, b) => {
  const pinned = Number(permanent(b)) - Number(permanent(a))
  if (pinned) return pinned
  const first = startDate(a), second = startDate(b)
  if (!first || !second) return Number(!first) - Number(!second)
  return descending.value ? second.localeCompare(first) : first.localeCompare(second)
}))
const remainingPulls = pool => Number.isInteger(pool.progress) && pool.progress >= 0 && pool.progress < 40 ? 40 - pool.progress : '未知'
function status(pool) {
  const data = details(pool), today = dateInZone('Asia/Shanghai')
  if (data.hidden) return '已隐藏 · 历史保留'
  if (data.enabled === false) return '已停用'
  if (data.enabled == null) return pool.snapshot?.catalog_pool_id ? '目录未确认' : '历史卡池'
  if (data.start_date && data.start_date > today) return '未开始'
  if (data.end_date && data.end_date < today) return '已结束'
  if (isPermanentRecruitmentPool(data)) return '常驻开放'
  return data.start_date && data.end_date ? '进行中' : '已启用'
}
const avatarResults = computed(() => new Map(props.pools.map(pool => [pool.pool_id,
  activeUpSlots(pool).map(slot => {
    const agent = props.agents.find(item => item.id === slot.operator_id)
    const count = props.poolSummaries[pool.pool_id]?.up_agent_counts?.[slot.id]
    return { id: slot.id, name: agent?.name || slot.name || '未知密探', rarity: Number(agent?.rarity) || 5,
      portrait: operatorPortraits[slot.operator_id] || (agent?.avatar ? avatarUrl(agent.avatar) : ''),
      avatar: agent?.avatar || agent?.avatar_url || operatorPortraits[slot.operator_id] || '',
      count: Number.isSafeInteger(count) && count >= 0 ? count : null }
  })
])))
const coverAgents = pool => avatarResults.value.get(pool.pool_id) || []
function cardLabel(pool) {
  const agents = coverAgents(pool)
  return (details(pool).enabled ? '记一笔 ' : '查看记录 ') + (details(pool).name || '未知卡池') + (agents.length
    ? '；本池 UP 获得次数：' + agents.map(agent => agent.name + (agent.count == null ? '，统计未知' : '，获得 ' + agent.count + ' 次')).join('；') : '')
}
const activeUpSlots = pool => (details(pool).up_agents || []).filter(slot => slot.active !== false)
const coverPortraits = pool => coverAgents(pool)
  .map(agent => ({ id: agent.id, src: agent.portrait }))
  .filter(portrait => portrait.src && !failedPortraits.value.has(portrait.src))
  .slice(0, 3)
const hiddenPortraitCount = pool => Math.max(activeUpSlots(pool).length - coverPortraits(pool).length, 0)
function markPortraitFailed(src) { if (src) failedPortraits.value.add(src) }
const cards = new Map()
function rememberCard(id, element) { if (element) cards.set(id, element); else cards.delete(id) }
defineExpose({ focusPool: id => cards.get(id)?.focus({ preventScroll: true }) })
watch(() => props.contextVersion, () => { year.value = ''; descending.value = true; expandedPools.value = new Set() })
</script>

<style scoped>
.overview-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:16px}.overview-tools button,.preview-toggle{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:6px 10px;font:inherit;font-size:12px}.overview-views{display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--cream)}.overview-views button{border-color:transparent}.overview-views button[aria-pressed=true]{background:var(--tea);color:var(--cream)}.preview-toggle{display:inline-flex;align-items:center;justify-content:center;gap:4px;background:transparent;border:0}.preview-toggle svg.is-expanded{transform:rotate(180deg)}.metric-note{font-size:11px;line-height:1.6;color:var(--ink-60)}

/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.timeline-heading p{color:var(--ink-60)}button{color:var(--ink);cursor:pointer}button:focus-visible{outline:2px solid var(--accent);outline-offset:4px}button:disabled{opacity:.6;cursor:not-allowed}.sort-button{border:1px solid var(--line);background:var(--surface);border-radius:999px}.year-filters{border:1px solid var(--line);border-radius:20px;background:var(--cream)}.year-filters button{border:0;background:transparent;border-radius:999px}.year-filters button[aria-pressed=true]{background:var(--tea);color:var(--cream)}.timeline-row::before{content:'';border-left:1px solid var(--line)}.date-rail::before{content:'';border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--paper)}.pool-group{min-width:0;border:1px solid var(--line);border-radius:16px;background:var(--surface)}.pool-card{border:0;border-radius:16px;background:var(--surface);transition:border-color .2s var(--ease),box-shadow .2s var(--ease)}.pool-card:hover{border-color:var(--accent);box-shadow:0 4px 18px color-mix(in srgb,var(--tea) 8%,transparent)}.pool-cover{border-radius:10px;background:linear-gradient(115deg,var(--cover-tone),var(--cream))}.pool-cover::before{content:'';background:url(/maayuan/maayuan-pattern.webp) center/900px;opacity:.15}.cover-portrait{opacity:.68}.cover-more{border:1px solid color-mix(in srgb,var(--cream) 72%,transparent);border-radius:999px;background:color-mix(in srgb,var(--ink) 72%,transparent);color:var(--cream);box-shadow:0 2px 8px rgba(0,0,0,.12)}.cover-sprout{color:var(--accent);opacity:.2}.cover-caption{color:var(--ink)}
.cover-caption,.cover-name{border-radius:3px;background:color-mix(in srgb,var(--cover-tone) 85%,transparent);box-shadow:0 0 6px 4px color-mix(in srgb,var(--cover-tone) 85%,transparent)}
.up-result .up-avatar{border:1px solid var(--line);border-radius:9px;background:var(--paper)}
.up-result :deep(.up-avatar img){border-radius:8px}
.up-count{border:1px solid var(--surface);border-radius:999px;background:var(--tea);color:var(--cream)}
.up-count.is-muted{border-color:var(--line);background:var(--surface);color:var(--ink-60)}.pool-type{color:var(--ink-60)}.pool-dates{color:var(--ink-60)}.pool-metrics{border-top:1px solid var(--line)}.pool-metrics>span{color:var(--ink-60)}.pool-metrics b{color:var(--ink)}.pool-metrics svg{color:var(--accent-strong)}.pool-entry{border-top:1px solid var(--line)}.pool-status{background:var(--cream);border:1px solid var(--line);border-radius:999px}.status-dot{border-radius:50%;background:currentColor;opacity:.65}.status-open{color:var(--accent-strong);background:color-mix(in srgb,var(--yellow) 28%,var(--surface))}.entry-label{background:var(--tea);color:var(--cream);border-radius:9px}.timeline-empty{color:var(--ink-60)}
@media(prefers-reduced-motion:reduce){.pool-card{transition:none}}
</style>
<style scoped src="./recruitmentTimelineDesktop.css"></style>
<style scoped src="./recruitmentTimelineMobile.css"></style>
