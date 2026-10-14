<template>
  <div ref="root" class="pool-preview" tabindex="0" role="region" :aria-label="`${poolName}抽卡明细`" :aria-busy="!!entry?.loading">
    <p v-if="!entry || entry.loading" class="preview-note" role="status">{{ entry?.items.length ? '正在加载更多记录…' : '正在读取明细…' }}</p>
    <p v-if="entry?.error" class="preview-error" role="alert">{{ entry.error }} <button type="button" :disabled="busy || entry.loading" @click="$emit('load', false)">重新读取明细</button></p>
    <p v-if="entry?.cursor" class="preview-note">已载入最早 {{ entry.items.length }} 条，尚未读完；已载入记录按最新到最早展示。</p>
    <ol v-if="rows.length" :class="view === 'agents' ? 'preview-agents' : 'preview-progress'" :aria-label="view === 'agents' ? '密探视图' : '进度条视图'">
      <li v-for="row in rows" :key="row.event.event_id" class="preview-record" :data-event-id="row.event.event_id" :aria-label="row.label">
        <span class="preview-portrait" aria-hidden="true">
          <OperatorAvatar :avatar="row.avatar" :name="row.agent.name" :rarity="Number(row.agent.rarity) || 5" />
          <span v-if="view === 'agents' && row.rank" class="agent-order-badge">{{ row.rank }}</span>
          <span v-if="view === 'agents' && row.event.up_status === 'non_up'" class="non-up-stamp">歪</span>
        </span>
        <span v-if="view === 'agents'" class="preview-agent-details" aria-hidden="true">
          <span class="agent-pull-badge" :class="recordBarClass(row.event.pull_span, row.fourStar)">{{ row.pulls }}</span>
          <span class="preview-name">{{ row.agent.name }}</span>
          <span v-if="row.event.batch_id" class="preview-batch">批次</span>
        </span>
        <span v-else class="preview-track" aria-hidden="true">
          <span class="record-bar" :class="recordBarClass(row.event.pull_span, row.fourStar)" :style="{ width: recordSpanWidth(row.event.pull_span, row.fourStar) }">{{ row.pulls }}</span>
          <span v-if="row.event.up_status === 'non_up'" class="non-up-stamp">歪</span>
          <span v-if="row.event.batch_id" class="preview-batch">批次</span>
        </span>
      </li>
    </ol>
    <p v-if="entry?.loaded && !entry.loading && !entry.error && !rows.length" class="preview-note">暂无已保存记录</p>
    <button v-if="entry?.cursor && !entry.error" type="button" class="preview-more" :disabled="busy || entry.loading" @click="$emit('load', true)">加载更多记录</button>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import operatorPortraits from '../../data/operatorPortraits.json'
import { resolveRecruitmentAgent } from './rules.js'
import { recordBarClass, recordSpanWidth } from './recruitmentRecordPresentation.js'

const props = defineProps({ pool: { type: Object, required: true }, catalog: { type: Array, default: () => [] }, agents: { type: Array, default: () => [] }, entry: Object, view: { type: String, default: 'agents' }, busy: Boolean })
const emit = defineEmits(['load'])
const root = ref(null), visible = ref(false)
let observer
const poolName = computed(() => props.catalog.find(item => item.pool_id === props.pool.snapshot?.catalog_pool_id)?.name || props.pool.mapped_snapshot?.name || props.pool.snapshot?.name || '卡池')
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') { visible.value = true; return }
  observer = new IntersectionObserver(entries => { visible.value = entries.some(entry => entry.isIntersecting) }, { rootMargin: '120px' })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch([visible, () => props.entry, () => props.busy], () => {
  if (visible.value && !props.entry && !props.busy) emit('load', false)
})
const rows = computed(() => {
  let rank = 0
  return (props.entry?.items || []).map(event => {
    const agent = resolveRecruitmentAgent(event, props.pool, props.catalog, props.agents)
    const fourStar = Number(event.agent_snapshot.rarity ?? agent.rarity) === 4
    const goldRank = fourStar ? null : ++rank
    const pulls = fourStar ? '4星计次' : event.pull_span == null ? '未知' : `${event.pull_span}抽`
    const label = `${agent.name}，${fourStar ? '4星计次，不影响保底' : event.pull_span == null ? '抽数未知' : pulls}，${event.up_status === 'non_up' ? '非UP' : event.up_status === 'up' ? 'UP' : 'UP状态未知'}${event.batch_id ? '，批次记录' : ''}${goldRank ? `，本池已记录第${goldRank}个金` : ''}`
    return { event, agent, fourStar, rank: goldRank, pulls, label, avatar: agent.avatar || agent.avatar_url || operatorPortraits[agent.operator_id || agent.id] || '' }
  }).reverse()
})
</script>

<style scoped src="./recruitmentRecordColors.css"></style>
<style scoped>
.pool-preview { height: auto; overflow-y: auto; min-width: 0; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--cream) 45%, var(--surface)); border-radius: 0 0 16px 16px; }
.pool-preview:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.preview-note, .preview-error { margin: 0 0 10px; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; color: var(--ink-60); }
.preview-error { color: var(--rouge); }
button { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); padding: 6px 10px; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.preview-more { margin-top: 12px; font-size: 12px; }
ol { list-style: none; margin: 0; padding: 0; }
.preview-agents { display: grid; gap: 12px 8px; }
.preview-agents .preview-record { display: flex; flex-direction: column; align-items: center; padding-top: 6px; min-width: 0; }
.preview-portrait { position: relative; display: block; width: 64px; height: 64px; flex: none; }
.preview-portrait :deep(.operator-avatar) { width: 100%; height: 100%; }
.agent-order-badge { position: absolute; left: -5px; top: -5px; padding: 2px 5px; font: 700 11px var(--font-d); }
.non-up-stamp { display: inline-grid; place-items: center; flex: none; width: 28px; height: 28px; font: 800 16px var(--font-s); transform: rotate(-12deg); }
.preview-portrait .non-up-stamp { position: absolute; right: -5px; top: -5px; background: var(--surface); }
.preview-agent-details { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: 6px; max-width: 100%; }
.agent-pull-badge { padding: 4px 8px; font: 700 13px var(--font-d); white-space: nowrap; }
.preview-name { font-size: 12px; text-align: center; overflow-wrap: anywhere; line-height: 1.4; }
.preview-batch { border: 1px solid var(--line); border-radius: 999px; padding: 3px 6px; color: var(--ink-60); font-size: 10px; flex: none; }
.preview-progress .preview-record { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
.preview-progress .preview-portrait { width: 40px; height: 40px; }
.preview-track { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.record-bar { box-sizing: border-box; display: flex; flex: none; align-items: center; min-width: min(64px, 100%); max-width: calc(100% - 36px); height: 36px; padding: 0 8px; font: 700 16px var(--font-d); white-space: nowrap; }
</style>
<style scoped src="./recruitmentPreviewMobile.css"></style>
<style scoped src="./recruitmentPreviewDesktop.css"></style>
