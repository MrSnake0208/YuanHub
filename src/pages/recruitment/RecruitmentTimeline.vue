<template>
  <section class="pool-timeline" aria-labelledby="timeline-title">
    <div class="timeline-heading">
      <div><h2 id="timeline-title">卡池时间线</h2><p>珍藏每一次相遇，点击卡池查看与编辑。</p></div>
      <button type="button" class="sort-button" @click="descending = !descending"><ArrowDownWideNarrow :size="17" aria-hidden="true" />{{ descending ? '按时间从新到旧' : '按时间从早到晚' }}</button>
    </div>
    <div v-if="years.length" class="year-filters" aria-label="卡池年份">
      <button type="button" :aria-pressed="year === ''" @click="year = ''">全部</button>
      <button v-for="item in years" :key="item" type="button" :aria-pressed="year === item" @click="year = item">{{ item }}</button>
      <button v-if="hasUndated" type="button" :aria-pressed="year === 'unknown'" @click="year = 'unknown'">日期未知</button>
    </div>
    <p v-if="!pools.length" class="timeline-empty">当前游戏暂无公共卡池，请联系管理员配置。可导入已有备份，或等待公共目录配置。</p>
    <p v-else-if="!visiblePools.length" class="timeline-empty">此年份暂无卡池。</p>
    <ol class="timeline-list">
      <li v-for="(pool, index) in visiblePools" :key="pool.pool_id" class="timeline-row">
        <div class="date-rail" aria-hidden="true"><span>{{ startDate(pool) ? startDate(pool).slice(0, 4) + '年' : '日期' }}</span><strong>{{ startDate(pool) ? Number(startDate(pool).slice(5, 7)) + '月' : '未知' }}</strong></div>
        <button :ref="element => rememberCard(pool.pool_id, element)" type="button" class="pool-card" :class="{ 'is-current': pool.pool_id === currentPoolId }" :disabled="busy" :aria-label="cardLabel(pool)" @click="$emit('select', pool.pool_id)">
          <span class="pool-cover" :class="'cover-' + index % 3" aria-hidden="true">
            <span v-if="coverPortraits(pool).length" class="cover-portraits" :class="'portrait-count-' + coverPortraits(pool).length">
              <img v-for="portrait in coverPortraits(pool)" :key="portrait.id" class="cover-portrait" :src="portrait.src" alt="" loading="lazy" decoding="async" @error="markPortraitFailed(portrait.src)" />
            </span>
            <span v-if="hiddenPortraitCount(pool)" class="cover-more">+{{ hiddenPortraitCount(pool) }}</span>
            <Sprout class="cover-sprout" :size="100" :stroke-width=".8" />
            <span class="cover-caption">{{ details(pool).pool_type || '招募档案' }}</span>
            <span class="cover-name">{{ details(pool).name }}</span>
            <span v-if="coverAgents(pool).length" class="cover-agents">
              <span v-for="agent in coverAgents(pool)" :key="agent.id" class="up-result">
                <OperatorAvatar class="up-avatar" :avatar="agent.avatar" :name="agent.name" :rarity="5" />
                <span class="up-count" :class="{ 'is-muted': agent.count === 0 || agent.count == null }">{{ agent.count == null ? '—' : '×' + agent.count }}</span>
              </span>
            </span>
          </span>
          <span class="pool-content">
            <span class="pool-badges"><span v-if="pool.pool_id === currentPoolId" class="current-badge">当前卡池</span><span class="pool-type">{{ details(pool).pool_type || '招募卡池' }}</span></span>
            <span class="pool-name">{{ details(pool).name }}</span>
            <span class="pool-dates">{{ startDate(pool) || '开始日期未知' }} — {{ details(pool).end_date || '结束日期未知' }}</span>
            <span class="pool-metrics">
              <span><BookOpen :size="15" aria-hidden="true" />已知抽数 <b>{{ poolSummaries[pool.pool_id]?.known_total_pulls?.toLocaleString() ?? '未知' }}</b><small>抽</small></span>
              <span><Gem :size="15" aria-hidden="true" />绝密记录 <b>{{ poolSummaries[pool.pool_id]?.event_count ?? '未知' }}</b><small>条</small></span>
              <span><CircleGauge :size="15" aria-hidden="true" />距保底 <b>{{ remainingPulls(pool) }}</b><small>抽</small></span>
            </span>
            <span v-if="poolSummaries[pool.pool_id]?.has_unknown" class="pool-dates">部分出货间隔或进度未知</span>
          </span>
          <span class="pool-entry"><span class="pool-status" :class="{ 'status-open': status(pool) === '进行中' }"><span aria-hidden="true" class="status-dot" />{{ status(pool) }}</span><span class="entry-label">查看并编辑 <ChevronRight :size="16" aria-hidden="true" /></span></span>
        </button>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowDownWideNarrow, BookOpen, ChevronRight, CircleGauge, Gem, Sprout } from '@lucide/vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { dateInZone } from '../../utils/businessDay.js'
import { recruitmentPoolCatalog } from './rules.js'
import operatorPortraits from '../../data/operatorPortraits.json'

const props = defineProps({ pools: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, agents: { type: Array, default: () => [] }, poolSummaries: { type: Object, default: () => ({}) }, currentPoolId: String, busy: Boolean, contextVersion: Number })
defineEmits(['select'])
const year = ref(''), descending = ref(true)
const failedPortraits = ref(new Set())
const details = pool => recruitmentPoolCatalog(pool, props.catalog) || pool.mapped_snapshot || pool.snapshot || {}
const startDate = pool => details(pool).start_date || ''
const years = computed(() => [...new Set(props.pools.map(pool => startDate(pool).slice(0, 4)).filter(Boolean))].sort().reverse())
const hasUndated = computed(() => props.pools.some(pool => !startDate(pool)))
watch([years, hasUndated], ([availableYears, undated]) => {
  if (year.value && (year.value === 'unknown' ? !undated : !availableYears.includes(year.value))) year.value = ''
})
const visiblePools = computed(() => props.pools.filter(pool => !year.value || (year.value === 'unknown' ? !startDate(pool) : startDate(pool).startsWith(year.value))).slice().sort((a, b) => {
  const first = startDate(a), second = startDate(b)
  if (!first || !second) return Number(!first) - Number(!second)
  return descending.value ? second.localeCompare(first) : first.localeCompare(second)
}))
const remainingPulls = pool => Number.isInteger(pool.progress) && pool.progress >= 0 && pool.progress < 40 ? 40 - pool.progress : '未知'
function status(pool) {
  const data = details(pool), today = dateInZone('Asia/Shanghai')
  if (data.enabled === false) return '已停用'
  if (data.enabled == null) return pool.snapshot?.catalog_pool_id ? '目录未确认' : '历史卡池'
  if (data.start_date && data.start_date > today) return '未开始'
  if (data.end_date && data.end_date < today) return '已结束'
  return data.start_date && data.end_date ? '进行中' : '已启用'
}
const avatarResults = computed(() => new Map(props.pools.map(pool => [pool.pool_id,
  activeUpSlots(pool).map(slot => {
    const agent = props.agents.find(item => item.id === slot.operator_id)
    const count = props.poolSummaries[pool.pool_id]?.up_agent_counts?.[slot.id]
    return { id: slot.id, name: agent?.name || slot.name || '未知密探',
      avatar: agent?.avatar || agent?.avatar_url || operatorPortraits[slot.operator_id] || '',
      count: Number.isSafeInteger(count) && count >= 0 ? count : null }
  })
])))
const coverAgents = pool => avatarResults.value.get(pool.pool_id) || []
function cardLabel(pool) {
  const agents = coverAgents(pool)
  return '查看并编辑 ' + (details(pool).name || '未知卡池') + (agents.length
    ? '；本池 UP 获得次数：' + agents.map(agent => agent.name + (agent.count == null ? '，统计未知' : '，获得 ' + agent.count + ' 次')).join('；') : '')
}
const activeUpSlots = pool => (details(pool).up_agents || []).filter(slot => slot.active !== false)
const coverPortraits = pool => activeUpSlots(pool)
  .map(slot => ({ id: slot.id, src: operatorPortraits[slot.operator_id] || '' }))
  .filter(portrait => portrait.src && !failedPortraits.value.has(portrait.src))
  .slice(0, 3)
const hiddenPortraitCount = pool => Math.max(activeUpSlots(pool).length - coverPortraits(pool).length, 0)
function markPortraitFailed(src) { if (src) failedPortraits.value.add(src) }
const cards = new Map()
function rememberCard(id, element) { if (element) cards.set(id, element); else cards.delete(id) }
defineExpose({ focusPool: id => cards.get(id)?.focus() })
watch(() => props.contextVersion, () => { year.value = ''; descending.value = true })
</script>

<style scoped>
.pool-timeline{min-width:0;margin:30px 0}.timeline-heading{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:18px}.timeline-heading h2{font:900 clamp(26px,3vw,34px) var(--font-s);letter-spacing:.04em}.timeline-heading p{font-size:13px;color:var(--ink-60);line-height:1.8;margin-top:8px}button{font:inherit;color:var(--ink);cursor:pointer;min-height:44px}button:focus-visible{outline:2px solid var(--accent);outline-offset:4px}button:disabled{opacity:.6;cursor:not-allowed}.sort-button{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--surface);padding:10px 14px;border-radius:999px;font-size:12px}.year-filters{display:flex;flex-wrap:wrap;gap:4px;width:fit-content;max-width:100%;border:1px solid var(--line);border-radius:20px;padding:4px;background:var(--cream);margin-bottom:20px}.year-filters button{border:0;background:transparent;border-radius:999px;padding:8px 16px;font-size:13px}.year-filters button[aria-pressed=true]{background:var(--tea);color:var(--cream)}.timeline-list{list-style:none;margin:0;padding:0;display:grid;gap:14px}.timeline-row{min-width:0;position:relative;padding-left:18px}.timeline-row::before{content:'';position:absolute;left:3px;top:8px;bottom:-22px;border-left:1px solid var(--line)}.timeline-row:last-child::before{bottom:18px}.date-rail{display:flex;align-items:baseline;gap:8px;padding:0 0 10px;font-family:var(--font-s)}.date-rail::before{content:'';position:absolute;left:0;top:8px;width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--paper)}.date-rail span{font-size:13px}.date-rail strong{font-size:20px}.pool-card{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;width:100%;padding:12px;border:1px solid var(--line);border-radius:16px;background:var(--surface);text-align:left;transition:border-color .2s var(--ease),box-shadow .2s var(--ease);overflow-wrap:anywhere}.pool-card:hover{border-color:var(--accent);box-shadow:0 4px 18px color-mix(in srgb,var(--tea) 8%,transparent)}.pool-card.is-current{border-color:var(--accent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--yellow) 65%,transparent)}.pool-cover{position:relative;isolation:isolate;min-height:126px;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:20px;border-radius:10px;background:linear-gradient(115deg,var(--paper),var(--cream));overflow:hidden}.pool-cover::before{content:'';position:absolute;inset:0;z-index:-1;background:url(/maayuan/maayuan-pattern.webp) center/900px;opacity:.15}.cover-1{background:linear-gradient(115deg,color-mix(in srgb,var(--mist) 60%,var(--cream)),var(--cream))}.cover-2{background:linear-gradient(115deg,color-mix(in srgb,var(--yellow) 40%,var(--cream)),var(--cream))}.cover-portraits{position:absolute;inset:0;z-index:-1;overflow:hidden;mask-image:linear-gradient(90deg,transparent 3%,rgba(0,0,0,.36) 28%,#000 58%)}.cover-portrait{position:absolute;top:0;height:100%;object-fit:cover;object-position:center 28%;opacity:.68}.portrait-count-1 .cover-portrait{right:0;width:100%}.portrait-count-2 .cover-portrait{width:61%}.portrait-count-2 .cover-portrait:nth-child(1){left:14%;clip-path:polygon(0 0,100% 0,82% 100%,0 100%)}.portrait-count-2 .cover-portrait:nth-child(2){right:-5%;clip-path:polygon(18% 0,100% 0,100% 100%,0 100%)}.portrait-count-3 .cover-portrait{width:49%}.portrait-count-3 .cover-portrait:nth-child(1){left:12%;clip-path:polygon(0 0,100% 0,76% 100%,0 100%)}.portrait-count-3 .cover-portrait:nth-child(2){left:38%;clip-path:polygon(18% 0,100% 0,82% 100%,0 100%)}.portrait-count-3 .cover-portrait:nth-child(3){right:-8%;clip-path:polygon(20% 0,100% 0,100% 100%,0 100%)}.cover-more{position:absolute;top:10px;right:10px;z-index:1;display:inline-flex;min-width:30px;height:30px;align-items:center;justify-content:center;padding:0 8px;border:1px solid color-mix(in srgb,var(--cream) 72%,transparent);border-radius:999px;background:color-mix(in srgb,var(--ink) 72%,transparent);color:var(--cream);font:800 11px var(--font-d);box-shadow:0 2px 8px rgba(0,0,0,.12)}.cover-sprout{position:absolute;right:-8px;bottom:-10px;color:var(--accent);opacity:.2;z-index:-1;transform:rotate(-20deg)}.cover-caption{font-size:10px;letter-spacing:.25em;color:var(--ink-60)}.cover-name{font:900 22px var(--font-s);line-height:1.5;max-width:75%}
.cover-agents{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;min-width:0;padding-bottom:3px}
.up-result{display:grid;flex:none;isolation:isolate}
.up-result .up-avatar{grid-area:1/1;width:42px;height:42px;justify-self:start;border:1px solid var(--line);border-radius:9px;background:var(--paper)}
.up-result :deep(.up-avatar img){border-radius:8px}
.up-count{grid-area:1/1;align-self:end;justify-self:end;position:relative;z-index:1;margin:0 -2px -3px 0;min-width:24px;padding:2px 5px;border:1px solid var(--surface);border-radius:999px;background:var(--tea);color:var(--cream);text-align:center;font:700 11px/1.2 var(--font-d);font-variant-numeric:tabular-nums;white-space:nowrap;overflow-wrap:normal}
.up-count.is-muted{border-color:var(--line);background:var(--surface);color:var(--ink-60);font-weight:500}
.pool-content{min-width:0;display:flex;flex-direction:column;gap:8px}.pool-badges{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:11px}.current-badge{background:var(--yellow);padding:4px 10px;border-radius:6px;font-weight:700}.pool-type{color:var(--ink-60)}.pool-name{font:900 21px var(--font-s);line-height:1.5}.pool-dates{font-size:12px;color:var(--ink-60);line-height:1.7}.pool-metrics{display:flex;flex-wrap:wrap;gap:10px 18px;border-top:1px solid var(--line);padding-top:10px}.pool-metrics>span{display:inline-flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:11px;color:var(--ink-60)}.pool-metrics b{font:700 16px var(--font-d);color:var(--ink)}.pool-metrics small{font-size:11px}.pool-metrics svg{color:var(--accent-strong);flex:none}.pool-entry{display:flex;justify-content:space-between;align-items:center;gap:10px}.pool-status{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px;background:var(--cream);border:1px solid var(--line);padding:5px 10px;border-radius:999px}.status-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.65}.status-open{color:var(--accent-strong);background:color-mix(in srgb,var(--yellow) 28%,var(--surface))}.entry-label{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--tea);color:var(--cream);border-radius:9px;padding:12px 14px;font-size:12px;min-height:44px}.timeline-empty{font-size:14px;line-height:1.9;color:var(--ink-60);padding:20px 0}
@media(min-width:768px){.timeline-row{display:grid;grid-template-columns:72px minmax(0,1fr);gap:24px;padding-left:0}.timeline-row::before{left:82px;top:24px;bottom:-38px}.timeline-row:last-child::before{bottom:24px}.date-rail{display:flex;flex-direction:column;gap:4px;padding-top:20px}.date-rail::before{left:79px;top:28px}.date-rail strong{font-size:26px}.pool-card{grid-template-columns:210px minmax(0,1fr);gap:18px;padding:12px}.pool-cover{grid-row:1/3;min-height:160px}.pool-entry{grid-column:2}.pool-name{font-size:23px}.timeline-heading{align-items:center}}
@media(min-width:1200px){.pool-card{grid-template-columns:minmax(200px,.8fr) minmax(0,1.2fr) auto;align-items:center;gap:20px}.pool-cover{grid-row:auto;min-height:154px}.pool-entry{grid-column:auto;flex-direction:column;align-items:flex-end;gap:16px}.cover-name{font-size:26px}}
@media(prefers-reduced-motion:reduce){.pool-card{transition:none}}
</style>
