<template>
  <Teleport to="body">
    <div v-if="!selected" class="modal-mask is-raised" @click.self="$emit('close')">
      <section ref="panel" class="practice-panel" role="dialog" aria-modal="true" aria-labelledby="practice-title" tabindex="-1">
        <header><div><h2 id="practice-title">练习 · 不会保存到你的账号</h2><p>这是临时示例。先自己点下面的示例卡池，再按提示操作。</p></div><button type="button" @click="$emit('close')">关闭练习</button></header>
        <RecruitmentTimeline :pools="[pool]" :catalog="catalog" :agents="agents" :pool-summaries="summaries" guide-active @select="selected = true" />
      </section>
    </div>
  </Teleport>
  <PoolEditor :open="selected" :pool="pool" :catalog="catalog" :agents="agents" :pool-summary="summaries[pool.pool_id]" :records="records" :records-revision="revision" can-record guided practice :practice-result="result" :read-only="result" @save="showResult" @close="$emit('close')" />
</template>
<script setup>
import { computed, ref } from 'vue'
import RecruitmentTimeline from './RecruitmentTimeline.vue'
import PoolEditor from './PoolEditor.vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
const emit = defineEmits(['close'])
const panel = ref(null), selected = ref(false), result = ref(false), records = ref([]), revision = ref(0)
// 练习只持有这次挂载的内存数据；不连接账号、业务 store 或写 API。
const agents = [{ id: 'char_001_yangxiu', name: '杨修', rarity: 5, prof: '阳' }, { id: 'char_004_guojia', name: '郭嘉', rarity: 5, prof: '阴' }]
const catalog = [{ pool_id: 'practice-catalog', name: '练习示例卡池', pool_type: '示例', start_date: '2026-10-01', end_date: '2026-10-31', enabled: true, up_status: 'verified', up_agent_ids: ['practice-up'], up_agents: [{ id: 'practice-up', operator_id: 'char_001_yangxiu', name: '杨修', active: true }] }]
const pool = ref({ pool_id: 'practice-pool', snapshot: { ...catalog[0], catalog_pool_id: 'practice-catalog' }, progress: null })
const summaries = computed(() => ({ [pool.value.pool_id]: { event_count: records.value.length, known_total_pulls: records.value.reduce((sum, row) => sum + (row.pull_span ?? 0), pool.value.progress ?? 0), has_unknown: pool.value.progress == null || records.value.some(row => row.pull_span == null) } }))
function showResult(payload) {
  records.value = payload.data.entries.map(entry => ({ ...entry, pool_id: pool.value.pool_id, agent_snapshot: { agent_id: entry.agent_id, name: entry.agent_id === 'practice-up' ? '杨修' : '郭嘉' } }))
  pool.value = { ...pool.value, progress: 40 - payload.data.remaining_pulls }
  revision.value++
  result.value = true
}
useModalFocus(computed(() => !selected.value), panel, { initialFocus: () => panel.value?.querySelector('.pool-card'), onEscape: () => emit('close') })
</script>
<style scoped>
.practice-panel{width:min(900px,100%);max-height:calc(100dvh - 24px);overflow:auto;padding:16px;border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--ink)}header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}h2{font:700 20px/1.5 var(--font-s)}p{font-size:13px;line-height:1.7;color:var(--ink-60)}button{flex:none;min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--cream);color:var(--ink);cursor:pointer}:deep([data-guide-active]){outline:2px solid var(--accent);outline-offset:3px}button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
</style>
