<template>
  <Teleport to="body">
    <div v-if="open && pool" class="modal-mask" @click.self="close">
      <section ref="panel" class="pool-editor" role="dialog" aria-modal="true" aria-labelledby="pool-editor-title" tabindex="-1">
        <header><div><span class="editor-eyebrow">招募档案</span><h2 id="pool-editor-title">{{ poolName }}</h2></div><button type="button" class="close-button" aria-label="关闭卡池编辑" :disabled="busy" @click="close"><X :size="20" aria-hidden="true" /></button></header>
        <form @submit.prevent="submit">
          <div class="editor-body">
            <p v-if="readOnly" class="hint">当前档案只可查看，暂不能修改。</p>
            <p v-else-if="!canRecord" class="hint">此卡池已停用或目录暂不可用。可以修改已有记录与保底，暂不能新增出货。</p>
            <p class="hint">每条记录填写一次出货。同一密探可重复；出货抽数指上次绝密后又抽了多少次，不是卡池累计抽数。不知道可留空。</p>
            <p v-if="error" ref="errorSummary" class="form-error" role="alert" tabindex="-1">{{ error }}</p>
            <p v-if="recordsLoading" class="hint" role="status">正在读取本池出货记录…</p>
            <div v-if="recordsError" class="form-error" role="alert">{{ recordsError }} <button type="button" :disabled="busy || recordsLoading" @click="$emit('retry')">重新读取</button></div>
            <div class="records-heading"><h3>本池抽卡记录</h3><span>{{ rows.length }} 条{{ hasMore ? ' · 可加载更多' : '' }}</span></div>
            <div class="pity-record"><span class="unknown-avatar" aria-hidden="true">?</span><button type="button" class="record-detail" :disabled="busy || readOnly || recordsLoading" @click="remainingInput?.focus()"><span class="record-track"><span class="record-bar bar-low" :style="{ width: tailProgress == null ? '100%' : Math.min(tailProgress / 40, 1) * 100 + '%' }"><b>{{ tailProgress == null ? '垫抽未知' : '已垫 ' + tailProgress + ' 抽' }}</b></span></span><span class="record-caption">{{ tailProgress == null ? '填写距下次保底抽数' : '距下次保底 ' + remaining + ' 抽' }}</span></button></div>
            <ol class="record-feed">
              <li v-for="row in displayRows" :key="row.event_id" class="gacha-record">
                <OperatorAvatar :avatar="selectedAgent(row)?.avatar || ''" :name="selectedAgent(row)?.name || row.agent_id" :rarity="5" aria-hidden="true" />
                <button type="button" class="record-detail" :disabled="busy || readOnly || recordsLoading || !!activeRow" :aria-label="'编辑' + (selectedAgent(row)?.name || row.agent_id) + '，' + (row.pull_span === '' ? '抽数未知' : row.pull_span + '抽出货')" @click="edit(row)">
                  <span class="record-track"><span class="record-bar" :class="barClass(row)" :style="{ width: spanWidth(row) }"><span class="pull-result"><b>{{ row.pull_span === '' ? '未知' : row.pull_span }}</b><small>{{ row.pull_span === '' ? '抽数' : '抽' }}</small></span></span><span v-if="row.up_status === 'non_up'" class="non-up-stamp" aria-label="非UP">歪</span></span>
                  <span class="record-caption"><strong>{{ selectedAgent(row)?.name || row.agent_id }}</strong><small>{{ row.batch_id ? ' · 批次记录' : selectedAgent(row)?.poolSlot ? ' · UP' : '' }}{{ row.acquired_date ? ' · ' + row.acquired_date : '' }}</small><small v-if="isChanged(row)" class="pending-mark">待保存</small><Pencil :size="12" aria-hidden="true" /></span>
                </button>
                <button type="button" class="delete-record" :aria-label="'移除' + (selectedAgent(row)?.name || row.agent_id) + '这条出货'" :disabled="busy || readOnly || recordsLoading" @click="remove(row)"><Trash2 :size="16" aria-hidden="true" /></button>
              </li>
            </ol>
            <p v-if="rows.length" class="bar-legend">色条按 40 抽刻度显示；绿色 ≤20，金色 21–30，红色 ≥31。超过刻度仍保留实际抽数。</p>
            <p v-if="initialized && !rows.length" class="hint">还没有抽卡记录。选择一位密探，填写多少抽出货，即可登记。</p>
            <div v-if="!activeRow" class="record-actions"><button v-if="hasMore" type="button" :disabled="busy || recordsLoading" @click="$emit('load-more')">加载更多记录</button><button type="button" :disabled="busy || readOnly || recordsLoading || !initialized || !canRecord || newCount >= 120" @click="add">＋ 登记出货</button></div>
            <fieldset v-if="activeRow" class="entry-composer" :disabled="busy || readOnly || recordsLoading">
              <legend>{{ originals.has(activeRow.event_id) ? '修改这次出货' : '登记一次出货' }}</legend>
              <div class="record-fields">
                <label>抽中的密探<select ref="agentSelect" v-model="activeRow.agent_id" required :disabled="!canRecord && originals.has(activeRow.event_id)"><option value="" disabled>选择密探</option><option v-for="agent in options" :key="agent.id" :value="agent.id">{{ agent.name }}{{ agent.poolSlot ? ' · 本池 UP' : '' }}{{ agent.placeholder ? '（占位）' : '' }}</option></select></label>
                <label>多少抽出货<input v-model="activeRow.pull_span" type="number" inputmode="numeric" min="1" :max="MAX_PULLS" placeholder="不知道可留空"></label>
              </div>
              <p v-if="activeRow.batch_id" class="hint">此记录属于已知总量批次；编辑或移除本条不会改变批次总抽数。</p>
              <div class="composer-actions"><button type="button" @click="cancelEntry">取消录入</button><button type="button" class="primary" @click="confirmRecord">{{ originals.has(activeRow.event_id) ? '更新记录' : '加入抽卡记录' }}</button></div>
            </fieldset>
            <label class="remaining-field">距离下次保底还需多少抽<input ref="remainingInput" v-model="remaining" type="number" inputmode="numeric" min="1" max="40" required placeholder="填写 1–40" :disabled="busy || readOnly || recordsLoading"><small>按 40 抽口径换算当前进度，和出货记录一起保存。</small></label>
            <p v-if="deletedIds.length" class="hint">保存后将移除 {{ deletedIds.length }} 条已有出货；独立记录会减去其已知抽数，相邻记录与批次总量不变。</p>
            <p v-if="serverError" class="form-error" role="alert">{{ serverError }}</p>
          </div>
          <footer><button type="button" :disabled="busy" @click="close">取消</button><button class="primary" type="submit" :disabled="busy || readOnly || recordsLoading || !!recordsError || !initialized">{{ busy ? '保存中…' : '保存档案' }}</button></footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Pencil, Trash2, X } from '@lucide/vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { entryInput, MAX_PULLS, poolAgentOptions, progressFromRemaining, recruitmentPoolCatalog, resolveRecruitmentAgent } from './rules.js'

const props = defineProps({ open: Boolean, pool: Object, records: { type: Array, default: () => [] }, recordsLoading: Boolean, recordsError: String, recordsRevision: Number, hasMore: Boolean, agents: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, busy: Boolean, readOnly: Boolean, canRecord: Boolean, serverError: String, requestVersion: Number })
const emit = defineEmits(['close', 'save', 'load-more', 'retry'])
const panel = ref(null), errorSummary = ref(null), error = ref(''), rows = ref([]), remaining = ref(''), activeRow = ref(null), agentSelect = ref(null), remainingInput = ref(null), initialized = ref(false), deletedIds = ref([])
const originals = reactive(new Map())
let requestId = ''
const poolName = computed(() => recruitmentPoolCatalog(props.pool, props.catalog)?.name || props.pool?.mapped_snapshot?.name || props.pool?.snapshot.name)
const options = computed(() => {
  const values = poolAgentOptions(props.pool, props.catalog, props.agents)
  for (const event of props.records) if (!values.some(agent => agent.id === event.agent_snapshot.agent_id)) values.push(resolveRecruitmentAgent(event, props.pool, props.catalog, props.agents))
  return values
})
const selectedAgent = row => options.value.find(agent => agent.id === row.agent_id)
const newCount = computed(() => rows.value.filter(row => !originals.has(row.event_id)).length)
function close() { if (!props.busy) emit('close') }
const displayRows = computed(() => rows.value.filter(row => originals.has(row.event_id)).concat(rows.value.filter(row => !originals.has(row.event_id))).reverse())
const tailProgress = computed(() => Number.isInteger(Number(remaining.value)) && Number(remaining.value) >= 1 && Number(remaining.value) <= 40 ? 40 - Number(remaining.value) : null)
const barClass = row => row.pull_span === '' ? 'bar-unknown' : Number(row.pull_span) <= 20 ? 'bar-low' : Number(row.pull_span) <= 30 ? 'bar-mid' : 'bar-high'
const spanWidth = row => row.pull_span === '' ? '100%' : Math.min(Number(row.pull_span) / 40, 1) * 100 + '%'
const isChanged = row => JSON.stringify(entryInput(row)) !== originals.get(row.event_id)
function focusEntry() { nextTick(() => agentSelect.value?.focus()) }
function add() { error.value = ''; activeRow.value = { event_id: crypto.randomUUID(), agent_id: '', pull_span: '', up_status: 'unknown', acquired_date: null, note: null }; focusEntry() }
function edit(row) { error.value = ''; activeRow.value = { ...row }; focusEntry() }
function cancelEntry() { activeRow.value = null; nextTick(() => panel.value?.querySelector('.record-actions button:last-child')?.focus()) }
function confirmRecord() {
  if (!activeRow.value || props.busy || props.readOnly || props.recordsLoading) return false
  error.value = ''
  try {
    const entry = entryInput(activeRow.value)
    if (!options.value.some(agent => agent.id === entry.agent_id)) throw new Error('请选择本池 UP 或本游戏绝密密探')
    const index = rows.value.findIndex(row => row.event_id === entry.event_id)
    if (index < 0) rows.value.push({ ...activeRow.value })
    else rows.value.splice(index, 1, { ...activeRow.value })
    activeRow.value = null
    nextTick(() => panel.value?.querySelector('.gacha-record .record-detail')?.focus())
    return true
  } catch (err) { error.value = err.message; nextTick(() => errorSummary.value?.focus()); return false }
}
function remove(row) { if (activeRow.value?.event_id === row.event_id) activeRow.value = null; if (originals.has(row.event_id)) deletedIds.value.push(row.event_id); rows.value = rows.value.filter(item => item !== row); nextTick(() => (panel.value?.querySelector('.gacha-record .record-detail') || panel.value?.querySelector('.record-actions button:last-child'))?.focus()) }
watch(() => props.open, open => {
  if (!open) return
  rows.value = []; activeRow.value = null; deletedIds.value = []; originals.clear(); initialized.value = false; error.value = ''; requestId = ''
  const progress = props.pool?.progress
  remaining.value = Number.isInteger(progress) && progress >= 0 && progress < 40 ? String(40 - progress) : ''
}, { immediate: true })
watch([() => props.records, () => props.recordsRevision, () => props.open, () => props.recordsLoading], () => {
  if (!props.open || props.recordsLoading || props.recordsRevision == null) return
  for (const event of props.records) {
    if (originals.has(event.event_id)) continue
    const row = { event_id: event.event_id, agent_id: event.agent_snapshot.agent_id, pull_span: event.pull_span ?? '', up_status: event.up_status, acquired_date: event.acquired_date, note: event.note, batch_id: event.batch_id }
    originals.set(event.event_id, JSON.stringify(entryInput(row)))
    if (!rows.value.some(item => item.event_id === row.event_id)) rows.value.push(row)
  }
  initialized.value = true
}, { immediate: true })
watch([rows, activeRow, deletedIds, remaining, () => props.requestVersion], () => { requestId = '' }, { deep: true, flush: 'sync' })
useModalFocus(computed(() => props.open), panel, { initialFocus: () => panel.value?.querySelector('select:not(:disabled), input:not(:disabled)'), onEscape: close })
async function submit() {
  if (props.busy || props.readOnly || props.recordsLoading || props.recordsError || !initialized.value || !props.pool) return
  error.value = ''
  try {
    progressFromRemaining(remaining.value)
    if (activeRow.value && !confirmRecord()) return
    const entries = rows.value.map(row => {
      const input = entryInput(row)
      if (!options.value.some(agent => agent.id === input.agent_id)) throw new Error('请选择本池 UP 或本游戏绝密密探')
      if (!originals.has(row.event_id)) {
        if (!props.canRecord) throw new Error('此卡池暂不能新增出货')
        const definition = recruitmentPoolCatalog(props.pool, props.catalog) || props.pool.snapshot
        input.up_status = selectedAgent(row)?.poolSlot ? 'up' : definition.up_status === 'verified' && definition.up_agent_ids?.length && !definition.unmapped_up_agent_names?.length ? 'non_up' : 'unknown'
      }
      return input
    }).filter(entry => JSON.stringify(entry) !== originals.get(entry.event_id))
    if (entries.length > 120 || deletedIds.value.length > 120) throw new Error('每次最多维护120条出货，请分次保存')
    if (!requestId) requestId = crypto.randomUUID()
    emit('save', { requestId, revision: props.recordsRevision, operation: 'pool_records_save', data: { pool_id: props.pool.pool_id, entries, deleted_event_ids: deletedIds.value.slice(), remaining_pulls: Number(remaining.value) } })
  } catch (err) { error.value = err.message; await nextTick(); errorSummary.value?.focus() }
}
</script>

<style scoped>
.modal-mask{z-index:var(--z-overlay-panel);padding:12px}.pool-editor{display:flex;flex-direction:column;width:min(700px,100%);max-height:calc(100dvh - 24px);min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:20px;color:var(--ink);overflow:hidden}.pool-editor header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:22px 20px;border-bottom:1px solid var(--line);background:var(--cream)}.pool-editor header>div{min-width:0;overflow-wrap:anywhere}.editor-eyebrow{font-size:11px;letter-spacing:.15em;color:var(--accent-strong)}h2{font:900 25px/1.5 var(--font-s);margin-top:6px}.pool-editor form{display:flex;flex:1;flex-direction:column;min-height:0}.editor-body{overflow-y:auto;overscroll-behavior:contain;padding:20px;min-height:0;flex:1}.entry-composer{min-width:0;border:1px solid var(--line);border-radius:12px;padding:14px;margin:0 0 16px;background:var(--cream)}legend{font-size:14px;font-weight:800}.hint{font-size:12px;line-height:1.8;color:var(--ink-60);margin:8px 0 16px}label{display:block;min-width:0;font-size:13px;font-weight:700;margin-bottom:6px}input,select{min-width:0;width:100%;min-height:46px;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--surface);color:var(--ink);font:inherit;margin-top:8px}.record-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.record-bottom{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:12px}.agent-preview{display:flex;align-items:center;gap:10px;min-width:0;font-size:13px;overflow-wrap:anywhere}button{min-height:44px;min-width:44px;border:1px solid var(--line);border-radius:10px;padding:9px 14px;background:var(--surface);color:var(--ink);font:inherit;cursor:pointer}.close-button{display:grid;place-items:center;padding:9px;border-radius:50%}.remove-button{color:var(--rouge);font-size:12px}.record-actions{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px}.remaining-field{font-size:15px}.remaining-field input{font-family:var(--font-d);font-size:20px}.remaining-field small{display:block;font-size:12px;font-weight:400;line-height:1.8;margin-top:10px;color:var(--ink-60)}footer{display:flex;justify-content:flex-end;gap:10px;flex:none;border-top:1px solid var(--line);padding:16px 20px;padding-bottom:max(16px,env(safe-area-inset-bottom));background:var(--cream)}.primary{background:var(--tea);color:var(--cream)}button:disabled,input:disabled,select:disabled{opacity:.55;cursor:not-allowed}.form-error{font-size:13px;line-height:1.8;color:var(--rouge);margin:10px 0}button:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(min-width:520px){.record-fields{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}}@media(max-width:430px){.modal-mask{padding:0}.pool-editor{width:100%;height:100dvh;max-height:100dvh;border-radius:0;padding-top:env(safe-area-inset-top);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}.pool-editor header{padding:18px 16px}.editor-body{padding:18px 16px}h2{font-size:22px}footer{padding-left:16px;padding-right:16px}}
</style>

<style scoped>
.records-heading{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:24px 0 12px}.records-heading h3{font:800 18px var(--font-s)}.records-heading>span{font-size:11px;color:var(--ink-60)}.record-feed{display:grid;gap:4px;list-style:none;margin:0 0 12px;padding:0}.gacha-record,.pity-record{display:flex;align-items:center;gap:10px;min-width:0;padding:10px 0;border-bottom:1px solid var(--line)}.pity-record{padding-top:0;margin-bottom:8px}.unknown-avatar{display:grid;place-items:center;flex:none;width:46px;height:46px;border-radius:10px;background:linear-gradient(140deg,var(--yellow),var(--tea));color:var(--surface);font:700 28px var(--font-d)}.record-detail{display:flex;flex-direction:column;align-items:stretch;gap:7px;flex:1;min-width:0;overflow:hidden;text-align:left;background:transparent;border:0;padding:3px 0;border-radius:4px}.record-track{display:flex;align-items:center;gap:8px;min-width:0;min-height:40px}.record-bar{--bar-color:var(--accent-strong);display:flex;align-items:center;flex:none;max-width:calc(100% - 40px);min-width:70px;min-height:40px;border-radius:5px;padding:6px 10px;color:var(--surface);background-color:var(--bar-color);background-image:repeating-linear-gradient(115deg,transparent 0 14px,rgba(255,255,255,.12) 14px 27px)}.record-bar.bar-low{--bar-color:#367447}.record-bar.bar-mid{--bar-color:var(--accent-strong)}.record-bar.bar-high{--bar-color:var(--rouge)}.record-bar.bar-unknown{--bar-color:var(--slate-deep)}.record-bar> b{font-size:14px;white-space:nowrap}.pity-record .record-bar{min-width:108px;max-width:100%}.record-caption{display:flex;align-items:center;flex-wrap:wrap;gap:3px;font-size:11px;color:var(--ink-60);line-height:1.7;min-width:0;overflow-wrap:anywhere}.record-caption strong{font-weight:600;color:var(--ink)}.record-caption small{font-size:10px}.record-caption svg{margin-left:auto;flex:none}.pending-mark{padding:1px 5px;border-radius:4px;background:var(--yellow);color:var(--tea);margin-left:4px}.pull-result{display:flex;align-items:baseline;flex-wrap:wrap;gap:5px;min-width:0}.pull-result b{font:700 22px var(--font-d);min-width:0;overflow-wrap:anywhere}.pull-result small{font-size:12px}.non-up-stamp{display:grid;place-items:center;flex:none;width:30px;height:30px;border:2px solid var(--rouge);border-radius:50%;color:var(--rouge);font:800 18px var(--font-s);transform:rotate(-14deg)}.delete-record{display:grid;place-items:center;padding:10px;color:var(--rouge);border-color:transparent;background:transparent;flex:none}.composer-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.entry-composer{scroll-margin:20px}.bar-legend{font-size:10px;line-height:1.8;color:var(--ink-60);margin-bottom:16px}@media(max-width:380px){.gacha-record,.pity-record{gap:8px}.unknown-avatar{width:44px;height:44px}.pull-result b{font-size:20px}.delete-record{min-width:36px;padding:8px}.non-up-stamp{width:26px;height:26px;font-size:16px}.record-bar{padding:6px 8px;min-width:64px}}
</style>
