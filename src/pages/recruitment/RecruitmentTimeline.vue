<template>
  <section class="pool-timeline" :aria-labelledby="timelineId">
    <div class="timeline-heading">
      <div><h2 :id="timelineId">卡池时间线</h2><p>找到实际抽取的卡池，记一笔；以前的记录也在这里。</p></div>
      <button type="button" class="sort-button" @click="descending = !descending"><ArrowDownWideNarrow :size="17" aria-hidden="true" />{{ descending ? '按时间从新到旧' : '按时间从早到晚' }}</button>
    </div>
    <div v-if="years.length" class="year-filters" aria-label="卡池年份">
      <button type="button" :aria-pressed="year === ''" @click="year = ''">全部</button>
      <button v-for="item in years" :key="item" type="button" :aria-pressed="year === item" @click="year = item">{{ item }}</button>
      <button v-if="hasUndated" type="button" :aria-pressed="year === 'unknown'" @click="year = 'unknown'">日期未知</button>
    </div>
    <RecruitmentGuideHint v-if="TUTORIALS_ENABLED && guideActive" :target="visiblePools.length ? 'pool-cards' : 'pool-unavailable'" :message="pools.length ? (visiblePools.length ? '先找你抽过的池子，看池名、UP 密探和日期，再亲自点卡片。' : '这一年没有卡池，换个年份或点「全部」。') : '当前暂无可用卡池，可以退出或先练习。'" ><button v-if="!visiblePools.length" type="button" @click="$emit('practice')">先练习一下</button></RecruitmentGuideHint>
    <p v-if="!pools.length" data-guide-target="pool-unavailable" class="timeline-empty">当前游戏暂无公共卡池，请联系管理员配置。可导入已有备份，或等待公共目录配置。</p>
    <p v-else-if="!visiblePools.length" data-guide-target="pool-unavailable" class="timeline-empty">此年份暂无卡池。</p>
    <ol class="timeline-list" data-guide-target="pool-cards">
      <li v-for="pool in visiblePools" :key="pool.pool_id" class="timeline-row">
        <div class="date-rail" aria-hidden="true"><span>{{ isPermanentRecruitmentPool(details(pool)) ? '常驻' : startDate(pool) ? startDate(pool).slice(0, 4) + '年' : '日期' }}</span><strong>{{ isPermanentRecruitmentPool(details(pool)) ? '∞' : startDate(pool) ? Number(startDate(pool).slice(5, 7)) + '月' : '未知' }}</strong></div>
        <button :ref="element => rememberCard(pool.pool_id, element)" type="button" class="pool-card" :disabled="busy" :aria-label="cardLabel(pool)" @click="$emit('select', pool.pool_id)">
          <span class="pool-cover" :class="'cover-tone-' + recruitmentPoolType(details(pool).pool_type).coverTone" :style="recruitmentCoverStyle(details(pool).pool_type)" aria-hidden="true">
            <span v-if="coverPortraits(pool).length" class="cover-portraits" :class="'portrait-count-' + coverPortraits(pool).length">
              <img v-for="portrait in coverPortraits(pool)" :key="portrait.id" class="cover-portrait" :src="portrait.src" alt="" loading="lazy" decoding="async" @error="markPortraitFailed(portrait.src)" />
            </span>
            <span v-if="hiddenPortraitCount(pool)" class="cover-more">+{{ hiddenPortraitCount(pool) }}</span>
            <span class="cover-caption">{{ details(pool).pool_type || '招募档案' }}</span>
            <span class="cover-name">{{ details(pool).name }}</span>
            <span v-if="coverAgents(pool).length" class="cover-agents">
              <span v-for="agent in coverAgents(pool)" :key="agent.id" class="up-result">
                <OperatorAvatar class="up-avatar" :avatar="agent.avatar" :name="agent.name" :rarity="agent.rarity" />
                <span class="up-count" :class="{ 'is-muted': agent.count === 0 || agent.count == null }">{{ agent.count == null ? '—' : '×' + agent.count }}</span>
              </span>
            </span>
          </span>
          <span class="pool-content">
            <span class="pool-badges"><span class="pool-type">{{ details(pool).pool_type || '招募卡池' }}</span></span>
            <span class="pool-name">{{ details(pool).name }}</span>
            <span class="pool-dates">{{ recruitmentPoolDateLabel(details(pool)) }}</span>
            <span class="pool-metrics">
              <span><BookOpen :size="15" aria-hidden="true" />已知抽数 <b>{{ poolSummaries[pool.pool_id]?.known_total_pulls?.toLocaleString() ?? '未知' }}</b><small>抽</small></span>
              <span><Gem :size="15" aria-hidden="true" />密探记录 <b>{{ poolSummaries[pool.pool_id]?.event_count ?? '未知' }}</b><small>条</small></span>
              <span><CircleGauge :size="15" aria-hidden="true" />距保底 <b>{{ remainingPulls(pool) }}</b><small>抽</small></span>
            </span>
            <span v-if="poolSummaries[pool.pool_id]?.has_unknown" class="pool-dates">部分出货间隔或进度未知</span>
          </span>
          <span class="pool-entry"><span class="pool-status" :class="{ 'status-open': status(pool) === '进行中' }"><span aria-hidden="true" class="status-dot" />{{ status(pool) }}</span><span class="entry-label">{{ details(pool).enabled ? '记一笔' : '查看记录' }} <ChevronRight :size="16" aria-hidden="true" /></span></span>
        </button>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { TUTORIALS_ENABLED } from "../../config/features.js";
import { computed, ref, useId, watch } from 'vue'
import { ArrowDownWideNarrow, BookOpen, ChevronRight, CircleGauge, Gem, Sprout } from '@lucide/vue'
import RecruitmentGuideHint from './RecruitmentGuideHint.vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { dateInZone } from '../../utils/businessDay.js'
import { recruitmentPoolCatalog } from './rules.js'
import { isPermanentRecruitmentPool, recruitmentCoverStyle, recruitmentPoolDateLabel, recruitmentPoolType } from '../../data/recruitmentPoolTypes.js'
import operatorPortraits from '../../data/operatorPortraits.json'
import { avatarUrl } from '../../api/request.js'

const timelineId = 'recruitment-timeline-' + useId()
const props = defineProps({ pools: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, agents: { type: Array, default: () => [] }, poolSummaries: { type: Object, default: () => ({}) }, busy: Boolean, contextVersion: Number, guideActive: Boolean })
defineEmits(['select', 'practice'])
const year = ref(''), descending = ref(true)
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
watch(() => props.contextVersion, () => { year.value = ''; descending.value = true })
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.timeline-heading p{color:var(--ink-60)}button{color:var(--ink);cursor:pointer}button:focus-visible{outline:2px solid var(--accent);outline-offset:4px}button:disabled{opacity:.6;cursor:not-allowed}.sort-button{border:1px solid var(--line);background:var(--surface);border-radius:999px}.year-filters{border:1px solid var(--line);border-radius:20px;background:var(--cream)}.year-filters button{border:0;background:transparent;border-radius:999px}.year-filters button[aria-pressed=true]{background:var(--tea);color:var(--cream)}.timeline-row::before{content:'';border-left:1px solid var(--line)}.date-rail::before{content:'';border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--paper)}.pool-card{border:1px solid var(--line);border-radius:16px;background:var(--surface);transition:border-color .2s var(--ease),box-shadow .2s var(--ease)}.pool-card:hover{border-color:var(--accent);box-shadow:0 4px 18px color-mix(in srgb,var(--tea) 8%,transparent)}.pool-cover{border-radius:10px;background:linear-gradient(115deg,var(--cover-tone),var(--cream))}.pool-cover::before{content:'';background:url(/maayuan/maayuan-pattern.webp) center/900px;opacity:.15}.cover-portrait{opacity:.68}.cover-more{border:1px solid color-mix(in srgb,var(--cream) 72%,transparent);border-radius:999px;background:color-mix(in srgb,var(--ink) 72%,transparent);color:var(--cream);box-shadow:0 2px 8px rgba(0,0,0,.12)}.cover-sprout{color:var(--accent);opacity:.2}.cover-caption{color:var(--ink)}
.cover-caption,.cover-name{border-radius:3px;background:color-mix(in srgb,var(--cover-tone) 85%,transparent);box-shadow:0 0 6px 4px color-mix(in srgb,var(--cover-tone) 85%,transparent)}
.up-result .up-avatar{border:1px solid var(--line);border-radius:9px;background:var(--paper)}
.up-result :deep(.up-avatar img){border-radius:8px}
.up-count{border:1px solid var(--surface);border-radius:999px;background:var(--tea);color:var(--cream)}
.up-count.is-muted{border-color:var(--line);background:var(--surface);color:var(--ink-60)}.pool-type{color:var(--ink-60)}.pool-dates{color:var(--ink-60)}.pool-metrics{border-top:1px solid var(--line)}.pool-metrics>span{color:var(--ink-60)}.pool-metrics b{color:var(--ink)}.pool-metrics svg{color:var(--accent-strong)}.pool-status{background:var(--cream);border:1px solid var(--line);border-radius:999px}.status-dot{border-radius:50%;background:currentColor;opacity:.65}.status-open{color:var(--accent-strong);background:color-mix(in srgb,var(--yellow) 28%,var(--surface))}.entry-label{background:var(--tea);color:var(--cream);border-radius:9px}.timeline-empty{color:var(--ink-60)}
@media(prefers-reduced-motion:reduce){.pool-card{transition:none}}
</style>
<style scoped src="./recruitmentTimelineDesktop.css"></style>
<style scoped src="./recruitmentTimelineMobile.css"></style>
