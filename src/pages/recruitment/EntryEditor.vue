<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask">
      <section ref="panel" class="recruitment-editor" role="dialog" aria-modal="true" aria-labelledby="entry-title" tabindex="-1">
        <header><h2 id="entry-title">{{ event ? '修改这条记录' : '记录绝密密探' }}</h2><button type="button" aria-label="关闭记录编辑" :disabled="busy" @click="$emit('close')">×</button></header>
        <form @submit.prevent="submit">
          <div class="editor-body">
            <p v-if="error" ref="errorSummary" class="form-error" role="alert" tabindex="-1">{{ error }}</p>
            <template v-if="!event">
              <label>记录方式<select v-model="mode" :disabled="busy"><option value="current">接着当前进度记录</option><option value="historical">补录历史，不修改当前进度</option></select></label>
              <label>卡池<select v-model="poolId" required :disabled="busy"><option value="" disabled>选择卡池</option><option v-for="pool in pools" :key="pool.pool_id" :value="pool.pool_id">{{ pool.mapped_snapshot?.name || pool.snapshot.name }}</option></select></label>
              <label v-if="mode === 'historical'" class="check"><input v-model="extract" type="checkbox" :disabled="busy">这些抽数已经包含在历史基准中，从基准拆出</label>
              <label>抽数资料<select v-model="countMode" :disabled="busy"><option value="spans">知道每次出货抽数（也可留未知）</option><option value="batch">只知道这一批的总抽数</option><option v-if="mode === 'historical'" value="window">按游戏内最近 120 抽顺序补录</option></select></label>
              <template v-if="countMode === 'window'">
                <p class="hint">位置按从旧到新填写。窗口首个绝密的前一次结果在窗口外时，首条出货抽数保持未知。</p>
                <label>本次窗口抽数<input v-model="windowLength" type="number" inputmode="numeric" min="1" max="120" required></label>
                <label class="check"><input v-model="previousKnown" type="checkbox">知道窗口开始前、距离上次绝密已抽多少次</label>
                <label v-if="previousKnown">窗口前已抽次数<input v-model="precedingPulls" type="number" inputmode="numeric" min="0" required></label>
                <label class="check"><input v-model="countWindow" type="checkbox">这整个窗口尚未计入档案，按窗口总抽数计一次</label>
                <p class="hint">窗口包含最后绝密后的尾抽；此方式不改变当前进度。已计入当前进度的窗口抽数须先核对并校正，避免重复。</p>
              </template>
              <template v-if="countMode === 'batch'"><label>这一批总抽数<input v-model="totalPulls" type="number" inputmode="numeric" min="1" required></label><p class="hint">批次内出货抽数可未知，累计只加这一个总量。接着当前记录时，总量包含旧进度，但不含新的尾抽。</p></template>
            </template>
            <p v-if="event?.batch_id" class="hint">这是已知总量批次中的结果，修改本条不会重复增加批次总抽数。</p>
            <fieldset v-for="(row, index) in rows" :key="row.key">
              <legend>绝密 {{ index + 1 }}</legend>
              <label>密探<select v-model="row.agent_id" required :disabled="busy"><option value="" disabled>选择绝密密探</option><optgroup label="本池 UP 密探"><option v-for="agent in selectableAgents.filter(item => item.poolSlot)" :key="agent.id" :value="agent.id">{{ agent.name }}{{ agent.placeholder ? '（占位）' : '' }}</option></optgroup><optgroup label="图鉴绝密 / 已有记录"><option v-for="agent in selectableAgents.filter(item => !item.poolSlot)" :key="agent.id" :value="agent.id">{{ agent.name }}</option></optgroup></select></label>
              <div v-if="selectedAgent(row)" class="agent-preview"><OperatorAvatar :avatar="selectedAgent(row).avatar || ''" :name="selectedAgent(row).name" :rarity="5" /><span>{{ selectedAgent(row).name }}<small>{{ selectedAgent(row).placeholder ? '管理员占位，后续对应真实密探时记录继续继承' : selectedAgent(row).prof || '绝密密探' }}</small></span></div>
              <label v-if="countMode === 'window' && !event">窗口内位置<input v-model="row.position" type="number" inputmode="numeric" min="1" :max="windowLength" required :disabled="busy"></label>
              <label v-else>这次出货抽数<input v-model="row.pull_span" type="number" inputmode="numeric" min="1" placeholder="不知道可留空" :disabled="busy"></label>
              <div class="row-pair"><label>UP 状态<select v-model="row.up_status" :disabled="busy" @change="row.up_manual = true"><option value="unknown">未知</option><option value="up">UP</option><option value="non_up">非 UP</option></select></label><label>获得日期（可留未知）<input v-model="row.acquired_date" type="date" :disabled="busy" @input="row.auto_date = false; row.date_touched = true"></label></div>
              <label>备注<textarea v-model="row.note" maxlength="1000" rows="2" :disabled="busy"></textarea></label>
              <button v-if="rows.length > 1 && !event" type="button" :disabled="busy" @click="rows.splice(index, 1)">移除这一行</button>
            </fieldset>
            <button v-if="!event" type="button" :disabled="busy || rows.length >= 120" @click="addRow">再加一位绝密</button>
            <template v-if="!event && mode === 'current'">
              <p class="hint">卡池原进度：{{ selectedPool?.progress == null ? '未知，请先校正' : selectedPool.progress + ' 抽' }}。保存会消费已计入的旧进度，不再重复累计。</p>
              <label>最后一个绝密后又抽了多少次<input v-model="tail" type="number" inputmode="numeric" min="0" placeholder="不知道可留空" :disabled="busy"></label>
            </template>
            <p class="hint">每条出货抽数独立记录。以后删除一条，只减少该条计入的抽数；相邻记录和当前进度不变。</p>
            <p v-if="serverError" class="form-error" role="alert">{{ serverError }}</p>
          </div>
          <footer><button type="button" :disabled="busy" @click="$emit('close')">取消</button><button class="primary" type="submit" :disabled="busy || readOnly">{{ busy ? '保存中…' : '保存记录' }}</button></footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { blankEntry, entryInput, fromWindowPositions, integer } from './rules.js'
import { dateInZone } from '../../utils/businessDay.js'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { poolAgentOptions, recruitmentPoolCatalog } from './rules.js'
const props = defineProps({ open: Boolean, pools: { type: Array, default: () => [] }, agents: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, currentPoolId: String, event: Object, busy: Boolean, readOnly: Boolean, serverError: String, requestVersion: Number, initialMode: { type: String, default: 'current' } })
const emit = defineEmits(['close', 'save'])
const panel = ref(null), errorSummary = ref(null), error = ref(''), mode = ref('current'), poolId = ref(''), rows = ref([]), countMode = ref('spans'), extract = ref(false), totalPulls = ref(''), tail = ref('0'), windowLength = ref('120'), previousKnown = ref(false), precedingPulls = ref('0'), countWindow = ref(false)
let requestId = ''
let batchId = ''
const selectedPool = computed(() => props.pools.find(pool => pool.pool_id === poolId.value))
const selectableAgents = computed(() => {
  const values = poolAgentOptions(selectedPool.value, props.catalog, props.agents)
  if (props.event && !values.some(agent => agent.id === props.event.agent_snapshot.agent_id)) values.push({ id: props.event.agent_snapshot.agent_id, name: props.event.agent_snapshot.name })
  return values
})
const selectedAgent = row => selectableAgents.value.find(agent => agent.id === row.agent_id)
watch([() => rows.value.map(row => row.agent_id).join('|'), selectedPool, selectableAgents], () => {
  if (props.event) return
  const snapshot = recruitmentPoolCatalog(selectedPool.value, props.catalog) || selectedPool.value?.mapped_snapshot || selectedPool.value?.snapshot
  for (const row of rows.value) {
    const agent = selectedAgent(row)
    if (row.agent_id && !agent) { row.agent_id = ''; row.up_manual = false; row.up_status = 'unknown'; continue }
    if (row.up_manual) continue
    const identified = agent && ((!agent.temporary && !agent.id.startsWith('tmp_')) || agent.mapped_agent_id)
    const fixedUpKnown = snapshot?.up_status === 'verified' && snapshot.up_agent_ids?.length > 0 && !snapshot.unmapped_up_agent_names?.length
    row.up_status = agent?.poolSlot ? 'up' : fixedUpKnown && identified ? (snapshot.up_agent_ids.includes(agent.mapped_agent_id || row.agent_id) ? 'up' : 'non_up') : 'unknown'
  }
})
const today = () => dateInZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
function addRow() { const id = crypto.randomUUID(); rows.value.push({ ...blankEntry(), key: id, event_id: id, position: '', acquired_date: mode.value === 'current' ? today() : '', auto_date: mode.value === 'current', date_touched: false }) }
function changed() { requestId = '' }
watch([rows, mode, poolId, countMode, extract, totalPulls, tail, windowLength, previousKnown, precedingPulls, countWindow], changed, { deep: true, flush: 'sync' })
watch(() => props.requestVersion, changed)
watch(() => props.open, open => {
  if (!open) return
  error.value = ''; batchId = crypto.randomUUID(); mode.value = props.initialMode; poolId.value = props.event?.pool_id || props.currentPoolId || ''; countMode.value = 'spans'; extract.value = false; totalPulls.value = ''; tail.value = '0'; countWindow.value = false
  rows.value = props.event ? [{ key: props.event.event_id, agent_id: props.event.agent_snapshot.agent_id, pull_span: props.event.pull_span ?? '', up_status: props.event.up_status, acquired_date: props.event.acquired_date || '', note: props.event.note || '' }] : []
  if (!props.event) addRow()
}, { immediate: true })
watch(mode, value => {
  if (value === 'current' && countMode.value === 'window') countMode.value = 'spans'
  if (value === 'current') extract.value = false
  if (props.event) return
  for (const row of rows.value) {
    if (value === 'historical' && row.auto_date) { row.acquired_date = ''; row.auto_date = false }
    else if (value === 'current' && !row.acquired_date && !row.date_touched) { row.acquired_date = today(); row.auto_date = true }
  }
})
useModalFocus(computed(() => props.open), panel, { initialFocus: () => panel.value?.querySelector('select'), onEscape: () => { if (!props.busy) emit('close') } })
async function submit() {
  error.value = ''
  try {
    let entries = rows.value.map(entryInput), operation = 'event_create'
    if (props.event) {
      if (!requestId) requestId = crypto.randomUUID()
      emit('save', { operation: 'event_update', data: { event_id: props.event.event_id, entry: entries[0] }, requestId }); return
    }
    if (!poolId.value) throw new Error('请选择卡池')
    if (entries.some(entry => !selectableAgents.value.some(agent => agent.id === entry.agent_id))) throw new Error('请选择当前卡池的 UP 或图鉴绝密密探')
    const data = { pool_id: poolId.value, mode: mode.value, entries, extract_from_baseline: extract.value }
    if (countMode.value === 'window') {
      const converted = fromWindowPositions(rows.value, windowLength.value, previousKnown.value, precedingPulls.value)
      entries = converted.entries; data.entries = entries
      if (countWindow.value) {
        if (previousKnown.value && integer(precedingPulls.value, '窗口前已抽次数') > 0) throw new Error('首条含有窗口外抽数，不能同时按窗口总量保存批次。取消窗口总量计数，或只保留窗口内信息。')
        operation = 'batch_create'; data.total_pull_count = integer(windowLength.value, '窗口抽数', { positive: true })
      }
    } else if (countMode.value === 'batch') { operation = 'batch_create'; data.total_pull_count = integer(totalPulls.value, '批次总抽数', { positive: true }) }
    if (operation === 'batch_create') data.batch_id = batchId
    if (mode.value === 'current') {
      if (selectedPool.value?.progress == null) throw new Error('当前进度未知，请先校正卡池进度')
      data.tail_progress = integer(tail.value, '尾抽', { nullable: true })
      if (operation === 'event_create' && (entries.some(entry => entry.pull_span == null) || entries[0].pull_span <= selectedPool.value.progress)) throw new Error('接着当前进度记录时，每次出货抽数须已知，首条须大于旧进度；不确定可改为历史补录')
    }
    if (!requestId) requestId = crypto.randomUUID()
    emit('save', { operation, data, requestId })
  } catch (failure) { error.value = failure.message; await nextTick(); errorSummary.value?.focus() }
}
</script>

<style scoped>
.agent-preview{display:flex;align-items:center;gap:10px;margin:8px 0 14px;overflow-wrap:anywhere}.agent-preview span{min-width:0}.agent-preview small{display:block;font-size:12px;line-height:1.7;color:var(--ink-60)}.modal-mask{position:fixed;inset:0;z-index:var(--z-overlay-panel);background:rgba(73,59,44,.45);display:grid;place-items:center;padding:12px}.recruitment-editor{width:min(680px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;background:var(--surface);border-radius:18px;color:var(--ink);min-width:0}.recruitment-editor header,.recruitment-editor footer{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid var(--line)}h2{font-family:var(--font-s);font-size:22px;margin:0}form{display:flex;flex:1;flex-direction:column;min-height:0}.editor-body{min-height:0;flex:1;overflow-y:auto;padding:16px;scroll-padding:16px}label{min-width:0;overflow-wrap:anywhere;display:flex;flex-direction:column;gap:6px;margin-bottom:14px;font-weight:700;font-size:14px}select,input:not([type=checkbox]),textarea{width:100%;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:9px;background:var(--cream);color:var(--ink);font:inherit;min-width:0}fieldset{border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0;min-width:0}legend{font-weight:800}.check{flex-direction:row;align-items:flex-start;font-weight:500}.check input{margin-top:3px;flex:none}.row-pair{display:grid;grid-template-columns:1fr;gap:0}.hint{font-size:13px;line-height:1.7;color:var(--ink-60)}button{min-height:44px;border:1px solid var(--line);padding:9px 14px;border-radius:10px;background:var(--surface);color:var(--ink);font:inherit;cursor:pointer}.primary{background:var(--tea);color:var(--cream)}button:disabled{opacity:.5;cursor:not-allowed}.form-error{color:var(--rouge);line-height:1.7}footer{border-top:1px solid var(--line);border-bottom:0!important;padding-bottom:calc(16px + env(safe-area-inset-bottom))!important}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(min-width:430px){.row-pair{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}@media(max-width:430px){.modal-mask{padding:0}.recruitment-editor{height:100dvh;max-height:100dvh;border-radius:0;padding-top:env(safe-area-inset-top);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}}
</style>
