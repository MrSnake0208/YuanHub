<template>
  <Teleport to="body">
    <div v-if="open && pool" class="modal-mask" @click.self="close">
      <section ref="panel" class="pool-editor" role="dialog" aria-modal="true" aria-labelledby="pool-editor-title" tabindex="-1">
        <header class="editor-header">
          <div class="editor-title">
            <span class="editor-eyebrow">招募档案</span>
            <h2 id="pool-editor-title">{{ poolName }}</h2>
          </div>
          <button type="button" class="close-button" aria-label="关闭卡池编辑" :disabled="busy" @click="close">
            <X :size="20" aria-hidden="true" />
          </button>
        </header>

        <form @submit.prevent="submit">
          <div class="editor-body">
            <p v-if="readOnly" class="state-note">当前档案只可查看，暂不能修改。</p>
            <p v-else-if="!canRecord" class="state-note">此卡池已停用或目录暂不可用。可以修改已有记录与保底，暂不能新增出货。</p>

            <p v-if="error" ref="errorSummary" class="form-error" role="alert" tabindex="-1">{{ error }}</p>
            <p v-if="recordsLoading" class="state-note" role="status">正在读取本池出货记录…</p>
            <div v-if="recordsError" class="form-error" role="alert">
              {{ recordsError }}
              <button type="button" class="inline-action" :disabled="busy || recordsLoading" @click="$emit('retry')">重新读取</button>
            </div>

            <section class="progress-card" aria-labelledby="current-progress-title">
              <div class="progress-copy">
                <span class="section-kicker">当前进度</span>
                <h3 id="current-progress-title">保底进度</h3>
                <p>当前卡池按 40 抽口径记录，修改后会和出货记录一起保存。</p>
              </div>

              <div class="progress-overview">
                <div class="progress-number" aria-live="polite">
                  <span>已垫</span>
                  <div><strong>{{ tailProgress == null ? '—' : tailProgress }}</strong><small>/ 40 抽</small></div>
                </div>
                <div class="progress-rail" aria-hidden="true">
                  <span :style="{ width: tailProgress == null ? '0%' : Math.min(tailProgress / 40, 1) * 100 + '%' }"></span>
                </div>
              </div>

              <label class="remaining-field">
                <span>距离下次保底</span>
                <span class="remaining-input">
                  <input
                    ref="remainingInput"
                    v-model="remaining"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="40"
                    required
                    placeholder="1–40"
                    :disabled="busy || readOnly || recordsLoading"
                  >
                  <span>抽</span>
                </span>
              </label>
            </section>

            <details class="entry-guide">
              <summary><CircleHelp :size="16" aria-hidden="true" />抽数怎么填写？</summary>
              <p>每条记录代表一次绝密出货；“出货抽数”指从上一次绝密到这一次绝密之间又抽了多少次，不是卡池累计抽数。同一密探可以重复记录，不知道抽数时可以留空。</p>
            </details>

            <section class="records-section" aria-labelledby="records-title">
              <div class="records-heading">
                <div>
                  <span class="section-kicker">抽卡档案</span>
                  <h3 id="records-title">本池抽卡记录</h3>
                  <p>{{ rows.length }} 条{{ hasMore ? ' · 还有更早记录' : '' }}</p>
                </div>
                <div class="entry-shortcuts" role="group" aria-label="快速登记出货">
                  <button
                    v-for="agent in quickUpAgents"
                    :key="agent.id"
                    type="button"
                    class="quick-up-button"
                    :data-agent-id="agent.id"
                    :aria-label="'快速登记 ' + agent.name + ' 的出货'"
                    :title="'快速登记 ' + agent.name"
                    :aria-pressed="activeRow?.agent_id === agent.id"
                    :class="{ 'is-selected': activeRow?.agent_id === agent.id }"
                    :disabled="busy || readOnly || recordsLoading || !initialized || (!canRecord && (!activeRow || originals.has(activeRow.event_id))) || (!activeRow && newCount >= 120)"
                    @click="add(agent.id)"
                  >
                    <OperatorAvatar class="quick-up-avatar" :avatar="agent.avatar || ''" :name="agent.name" :rarity="5" aria-hidden="true" />
                    <span class="quick-up-mark" aria-hidden="true">UP</span>
                  </button>
                  <button
                    type="button"
                    class="add-record"
                    :aria-pressed="choosingAgent"
                    :class="{ 'is-selected': choosingAgent }"
                    :disabled="busy || readOnly || recordsLoading || !initialized || (!canRecord && (!activeRow || originals.has(activeRow.event_id))) || (!activeRow && newCount >= 120)"
                    @click="add()"
                  >
                    <Plus :size="17" aria-hidden="true" />
                    {{ quickUpAgents.length ? '其他密探' : '登记出货' }}
                  </button>
                </div>
              </div>

              <div
                v-if="activeRow"
                class="entry-composer"
                role="group"
                :aria-label="originals.has(activeRow.event_id) ? '编辑抽卡记录' : '添加抽卡记录'"
              >
                <div v-if="choosingAgent" class="agent-picker">
                  <div class="agent-picker-results" role="group" aria-label="选择密探">
                    <button
                      v-for="agent in options"
                      :key="agent.id"
                      type="button"
                      class="agent-choice"
                      :data-agent-id="agent.id"
                      :aria-label="'选择 ' + agent.name"
                      :disabled="busy || readOnly || recordsLoading"
                      @click="chooseOtherAgent(agent.id)"
                    >
                      <OperatorAvatar class="agent-choice-avatar" :avatar="agent.avatar || ''" :name="agent.name" :rarity="5" aria-hidden="true" />
                      <span>{{ agent.name }}</span>
                    </button>
                    <p v-if="!options.length" class="agent-picker-empty">暂无可选密探</p>
                  </div>
                </div>
                <div v-if="activeRow.agent_id" class="compact-entry-row">
                  <label class="pull-count-field">
                    <span>招募次数</span>
                    <input ref="pullSpanInput" v-model="activeRow.pull_span" type="number" inputmode="numeric" min="1" :max="MAX_EVENT_PULLS" step="1" placeholder="1–40" :disabled="busy || readOnly || recordsLoading" @input="limitPullSpan">
                  </label>
                  <div class="composer-actions">
                    <button type="button" :disabled="busy" @click="cancelEntry">取消</button>
                    <button type="button" class="primary" :aria-label="originals.has(activeRow.event_id) ? '确认修改' : '确认添加'" :disabled="busy || readOnly || recordsLoading" @click="confirmRecord">确认</button>
                  </div>
                </div>
                <p v-if="activeRow.batch_id" class="composer-note">批次记录：修改本条不会改变批次总抽数。</p>
              </div>

              <ol v-if="displayRows.length" class="record-feed">
                <li v-for="row in displayRows" :key="row.event_id" class="gacha-record">
                  <OperatorAvatar
                    class="record-avatar"
                    :avatar="selectedAgent(row)?.avatar || ''"
                    :name="selectedAgent(row)?.name || row.agent_id"
                    :rarity="5"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    class="record-detail"
                    :disabled="busy || readOnly || recordsLoading || !!activeRow"
                    :aria-label="recordLabel(row)"
                    @click="edit(row)"
                  >
                    <span class="record-track">
                      <span class="record-bar" :class="barClass(row)" :style="{ width: spanWidth(row) }">
                        <span class="pull-result">
                          <b>{{ row.pull_span === '' ? '未知' : row.pull_span }}</b>
                          <small>{{ row.pull_span === '' ? '抽数' : '抽' }}</small>
                        </span>
                      </span>
                      <span v-if="row.up_status === 'non_up'" class="non-up-stamp" aria-hidden="true">歪</span>
                      <span v-if="row.batch_id" class="status-pill is-neutral" aria-hidden="true">批次</span>
                      <span v-if="isChanged(row)" class="pending-mark" aria-hidden="true">待保存</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    class="delete-record"
                    :aria-label="'移除' + (selectedAgent(row)?.name || row.agent_id) + '这条出货'"
                    :disabled="busy || readOnly || recordsLoading"
                    @click="remove(row)"
                  >
                    <Trash2 :size="17" aria-hidden="true" />
                  </button>
                </li>
              </ol>

              <div v-else-if="initialized && !recordsLoading" class="records-empty">
                <strong>还没有抽卡记录</strong>
                <p>{{ quickUpAgents.length ? '点击上方 UP 头像快速登记；歪卡或其他密探使用“其他密探”。' : '点击“登记出货”，选择密探并填写这次绝密前的抽数即可。' }}</p>
              </div>

              <div class="records-tail">
                <p v-if="rows.length" class="bar-legend">色条按 40 抽刻度辅助比较间隔；绿色 ≤20、金色 21–30、红色 ≥31，实际抽数始终以色条内数字为准。</p>
                <button v-if="hasMore" type="button" class="load-more" :disabled="busy || recordsLoading" @click="$emit('load-more')">加载更早记录</button>
              </div>
            </section>

            <p v-if="deletedIds.length" class="change-note">保存后将移除 {{ deletedIds.length }} 条已有出货；独立记录会减去该条已知抽数，相邻记录与批次总量不变。</p>
            <p v-if="serverError" class="form-error" role="alert">{{ serverError }}</p>
          </div>

          <footer>
            <p class="footer-state" aria-live="polite">
              <template v-if="activeRow">{{ originals.has(activeRow.event_id) ? '正在编辑一条记录' : '正在登记一条记录' }}</template>
              <template v-else-if="pendingCount">{{ pendingCount }} 项修改尚未保存</template>
              <template v-else>修改将在保存后生效</template>
            </p>
            <div class="footer-actions">
              <button type="button" :disabled="busy" @click="close">取消</button>
              <button class="primary" type="submit" :disabled="busy || readOnly || recordsLoading || !!recordsError || !initialized">
                {{ busy ? '保存中…' : '保存修改' }}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { CircleHelp, Plus, Trash2, X } from '@lucide/vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { entryInput, MAX_EVENT_PULLS, poolAgentOptions, progressFromRemaining, recruitmentPoolCatalog, resolveRecruitmentAgent } from './rules.js'

const props = defineProps({ open: Boolean, pool: Object, records: { type: Array, default: () => [] }, recordsLoading: Boolean, recordsError: String, recordsRevision: Number, hasMore: Boolean, agents: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, busy: Boolean, readOnly: Boolean, canRecord: Boolean, serverError: String, requestVersion: Number })
const emit = defineEmits(['close', 'save', 'load-more', 'retry'])
const panel = ref(null), errorSummary = ref(null), error = ref(''), rows = ref([]), remaining = ref(''), initialRemaining = ref(''), activeRow = ref(null), choosingAgent = ref(false), pullSpanInput = ref(null), remainingInput = ref(null), initialized = ref(false), deletedIds = ref([])
const originals = reactive(new Map())
let requestId = ''
const poolName = computed(() => recruitmentPoolCatalog(props.pool, props.catalog)?.name || props.pool?.mapped_snapshot?.name || props.pool?.snapshot.name)
const options = computed(() => {
  const values = poolAgentOptions(props.pool, props.catalog, props.agents)
  for (const event of props.records) if (!values.some(agent => agent.id === event.agent_snapshot.agent_id)) values.push(resolveRecruitmentAgent(event, props.pool, props.catalog, props.agents))
  return values
})
const selectedAgent = row => options.value.find(agent => agent.id === row.agent_id)
const quickUpAgents = computed(() => options.value.filter(agent => agent.poolSlot))
const newCount = computed(() => rows.value.filter(row => !originals.has(row.event_id)).length)
function close() { if (!props.busy) emit('close') }
const displayRows = computed(() => rows.value.filter(row => originals.has(row.event_id)).concat(rows.value.filter(row => !originals.has(row.event_id))).reverse())
const tailProgress = computed(() => Number.isInteger(Number(remaining.value)) && Number(remaining.value) >= 1 && Number(remaining.value) <= 40 ? 40 - Number(remaining.value) : null)
const barClass = row => row.pull_span === '' ? 'bar-unknown' : Number(row.pull_span) <= 20 ? 'bar-low' : Number(row.pull_span) <= 30 ? 'bar-mid' : 'bar-high'
const spanWidth = row => row.pull_span === '' ? '100%' : Math.min(Number(row.pull_span) / 40, 1) * 100 + '%'
const isChanged = row => JSON.stringify(entryInput(row)) !== originals.get(row.event_id)
function recordLabel(row) {
  const agent = selectedAgent(row)
  const pulls = row.pull_span === '' ? '抽数未知' : row.pull_span + '抽出货'
  const status = row.up_status === 'non_up' ? '，非UP' : (agent?.poolSlot || row.up_status === 'up') ? '，UP' : ''
  return '编辑' + (agent?.name || row.agent_id) + '，' + pulls + status + (row.batch_id ? '，批次记录' : '')
}
const pendingCount = computed(() => rows.value.filter(row => isChanged(row)).length + deletedIds.value.length + (remaining.value !== initialRemaining.value ? 1 : 0))
function focusEntry(preferPulls = false) { nextTick(() => (preferPulls ? pullSpanInput.value : panel.value?.querySelector('.agent-choice'))?.focus()) }
function add(agentId = '') {
  error.value = ''
  if (!activeRow.value) activeRow.value = { event_id: crypto.randomUUID(), agent_id: '', pull_span: '', up_status: 'unknown', acquired_date: null, note: null }
  if (agentId) {
    activeRow.value.agent_id = agentId
    choosingAgent.value = false
    focusEntry(true)
    return
  }
  activeRow.value.agent_id = ''
  choosingAgent.value = true
  focusEntry(false)
}
function chooseOtherAgent(agentId) {
  if (!activeRow.value) return
  activeRow.value.agent_id = agentId
  choosingAgent.value = false
  focusEntry(true)
}
function edit(row) { error.value = ''; activeRow.value = { ...row }; choosingAgent.value = false; focusEntry(true) }
function limitPullSpan(event) {
  if (!activeRow.value) return
  const raw = event.target.value
  if (raw === '') return
  const number = Number(raw)
  if (!Number.isFinite(number) || (number >= 1 && number <= MAX_EVENT_PULLS)) return
  const limited = number > MAX_EVENT_PULLS ? MAX_EVENT_PULLS : 1
  event.target.value = String(limited)
  activeRow.value.pull_span = String(limited)
}
function cancelEntry() { activeRow.value = null; choosingAgent.value = false; nextTick(() => panel.value?.querySelector('.add-record')?.focus()) }
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
    choosingAgent.value = false
    nextTick(() => (panel.value?.querySelector('.gacha-record .record-detail') || panel.value?.querySelector('.add-record'))?.focus())
    return true
  } catch (err) { error.value = err.message; nextTick(() => errorSummary.value?.focus()); return false }
}
function remove(row) { if (activeRow.value?.event_id === row.event_id) activeRow.value = null; if (originals.has(row.event_id)) deletedIds.value.push(row.event_id); rows.value = rows.value.filter(item => item !== row); nextTick(() => (panel.value?.querySelector('.gacha-record .record-detail') || panel.value?.querySelector('.add-record'))?.focus()) }
watch(() => props.open, open => {
  if (!open) return
  rows.value = []; activeRow.value = null; choosingAgent.value = false; deletedIds.value = []; originals.clear(); initialized.value = false; error.value = ''; requestId = ''
  const progress = props.pool?.progress
  remaining.value = Number.isInteger(progress) && progress >= 0 && progress < 40 ? String(40 - progress) : ''
  initialRemaining.value = remaining.value
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
.modal-mask {
  z-index: var(--z-overlay-panel);
  padding: 12px;
}

.pool-editor {
  display: flex;
  flex-direction: column;
  width: min(780px, 100%);
  max-height: calc(100dvh - 24px);
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface);
  color: var(--ink);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--line);
  background: var(--cream);
}

.editor-title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.editor-eyebrow,
.section-kicker {
  display: block;
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .14em;
}

h2,
h3,
p {
  margin: 0;
}

h2 {
  margin-top: 5px;
  font: 900 25px/1.45 var(--font-s);
}

.pool-editor form {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.editor-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 22px 24px;
}

.state-note,
.change-note {
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--cream);
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.7;
}

.change-note {
  margin-top: 18px;
}

.progress-card {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(160px, .8fr) minmax(170px, .8fr);
  align-items: center;
  gap: 18px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  border-radius: 16px;
  background: linear-gradient(145deg, var(--cream), var(--surface));
}

.progress-copy h3,
.records-heading h3 {
  margin-top: 4px;
  font: 800 18px/1.45 var(--font-s);
}

.progress-copy p {
  margin-top: 7px;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.7;
}

.progress-overview {
  min-width: 0;
}

.progress-number > span {
  color: var(--ink-60);
  font-size: 11px;
}

.progress-number > div {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
}

.progress-number strong {
  font: 700 30px/1 var(--font-d);
}

.progress-number small {
  color: var(--ink-60);
  font-size: 12px;
}

.progress-rail,
.record-track {
  overflow: hidden;
  width: 100%;
  background: color-mix(in srgb, var(--line) 62%, transparent);
}

.progress-rail {
  height: 7px;
  margin-top: 10px;
  border-radius: 999px;
}

.progress-rail > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 180ms ease;
}

.remaining-field {
  display: block;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}

.remaining-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.remaining-input input {
  margin: 0;
  font-family: var(--font-d);
  font-size: 20px;
  text-align: center;
}

.remaining-input > span {
  flex: none;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 600;
}

.entry-guide {
  margin: 12px 2px 20px;
  color: var(--ink-60);
  font-size: 12px;
}

.entry-guide summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  color: var(--ink-60);
  font-weight: 700;
  cursor: pointer;
}

.entry-guide p {
  max-width: 62ch;
  padding: 2px 0 0 22px;
  line-height: 1.8;
}

.records-section {
  min-width: 0;
}

.records-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.records-heading p {
  margin-top: 3px;
  color: var(--ink-60);
  font-size: 11px;
}

button {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 9px 14px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
  transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease, opacity 180ms ease;
}

button:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  background: var(--cream);
}

.close-button {
  display: grid;
  flex: none;
  place-items: center;
  padding: 9px;
  border-radius: 50%;
}

.add-record {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-color: color-mix(in srgb, var(--tea) 32%, var(--line));
  font-size: 13px;
  font-weight: 800;
}

.entry-shortcuts {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 7px;
}

.quick-up-button {
  position: relative;
  display: grid;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  place-items: center;
  padding: 1px;
  border-color: color-mix(in srgb, var(--accent) 52%, var(--line));
  border-radius: 12px;
  background: var(--cream);
}

.quick-up-button.is-selected,
.add-record.is-selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--yellow) 35%, var(--surface));
  box-shadow: inset 0 0 0 1px var(--accent);
}

.quick-up-avatar {
  width: 38px;
  height: 38px;
}

.quick-up-mark {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  min-width: 20px;
  height: 16px;
  place-items: center;
  padding-inline: 4px;
  border: 1px solid var(--surface);
  border-radius: 999px;
  background: var(--tea);
  color: var(--cream);
  font: 800 8px/1 var(--font-d);
  pointer-events: none;
}

.entry-composer {
  min-width: 0;
  margin: 0 0 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
  border-radius: 12px;
  background: color-mix(in srgb, var(--cream) 70%, var(--surface));
  scroll-margin: 16px;
}

.agent-picker {
  margin-bottom: 10px;
}

.agent-picker-results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
  max-height: min(42dvh, 340px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2px 3px 4px 2px;
}

.agent-choice {
  display: flex;
  min-width: 0;
  min-height: 84px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 5px;
  overflow: hidden;
  text-align: center;
}

.agent-choice-avatar {
  width: 44px;
  height: 44px;
}

.agent-choice > span {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-picker-empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 14px 4px;
  color: var(--ink-60);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}

.compact-entry-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 10px 12px;
}

.pull-count-field {
  display: grid;
  grid-template-columns: max-content 96px;
  align-items: center;
  gap: 9px;
  flex: none;
}

.pull-count-field input {
  width: 96px;
  margin-top: 0;
  padding-inline: 8px;
  font-family: var(--font-d);
  font-size: 18px;
  text-align: center;
}

.pull-count-field > span {
  white-space: nowrap;
}

.composer-note {
  margin-top: 8px;
  color: var(--ink-60);
  font-size: 11px;
  line-height: 1.6;
}

label {
  display: block;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
}

input,
select {
  width: 100%;
  min-width: 0;
  min-height: 46px;
  margin-top: 7px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}

.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
}

.composer-actions button {
  min-width: 64px;
  padding-inline: 14px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.record-feed {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
  list-style: none;
}

.gacha-record {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border-bottom: 1px solid var(--line);
  transition: background-color 180ms ease;
}

.gacha-record:hover {
  background: color-mix(in srgb, var(--cream) 58%, transparent);
}

.record-avatar {
  width: 40px;
  height: 40px;
}

.record-detail {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: left;
}

.record-detail:not(:disabled):hover {
  border-color: transparent;
  background: transparent;
}

.record-track {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  min-height: 36px;
  overflow: hidden;
}

.record-bar {
  --bar-color: var(--accent-strong);
  display: flex;
  flex: none;
  align-items: center;
  min-width: 72px;
  max-width: calc(100% - 48px);
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--surface);
  background-color: var(--bar-color);
  background-image: repeating-linear-gradient(115deg, transparent 0 14px, rgba(255, 255, 255, .12) 14px 27px);
}

.record-bar.bar-low {
  --bar-color: #367447;
}

.record-bar.bar-mid {
  --bar-color: var(--accent-strong);
}

.record-bar.bar-high {
  --bar-color: var(--rouge);
}

.record-bar.bar-unknown {
  --bar-color: var(--slate-deep);
}

.pull-result {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  white-space: nowrap;
}

.pull-result b {
  font: 700 20px/1 var(--font-d);
}

.pull-result small {
  color: color-mix(in srgb, var(--surface) 88%, transparent);
  font-size: 12px;
  font-weight: 700;
}

.status-pill,
.pending-mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.status-pill {
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  color: var(--accent-strong);
}

.status-pill.is-neutral {
  border-color: var(--line);
  color: var(--ink-60);
}

.non-up-stamp {
  display: grid;
  flex: none;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 2px solid var(--rouge);
  border-radius: 50%;
  color: var(--rouge);
  font: 800 17px/1 var(--font-s);
  transform: rotate(-12deg);
}

.pending-mark {
  background: var(--yellow);
  color: var(--tea);
}

.delete-record {
  display: grid;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  place-items: center;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--rouge);
}

.delete-record:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--rouge) 30%, transparent);
  background: color-mix(in srgb, var(--rouge) 7%, transparent);
}

.records-empty {
  padding: 22px 18px;
  border: 1px dashed var(--line);
  border-radius: 13px;
  background: color-mix(in srgb, var(--cream) 50%, transparent);
  text-align: center;
}

.records-empty strong {
  font: 800 15px/1.5 var(--font-s);
}

.records-empty p {
  margin-top: 5px;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.7;
}

.records-tail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 10px;
}

.bar-legend {
  max-width: 62ch;
  color: var(--ink-60);
  font-size: 10px;
  line-height: 1.7;
}

.load-more {
  flex: none;

  font-size: 12px;
}

.primary {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--cream);
}

.primary:not(:disabled):hover {
  border-color: var(--tea);
  background: color-mix(in srgb, var(--tea) 90%, var(--surface));
}

.inline-action {


  margin-left: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--line);
  padding: 14px 20px;
  padding-bottom: max(14px, env(safe-area-inset-bottom));
  background: var(--cream);
}

.footer-state {
  min-width: 0;
  color: var(--ink-60);
  font-size: 11px;
  line-height: 1.5;
}

.footer-actions {
  display: flex;
  flex: none;
  gap: 9px;
}

.form-error {
  margin: 10px 0 14px;
  color: var(--rouge);
  font-size: 13px;
  line-height: 1.8;
}

button:disabled,
input:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: .55;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

@media (max-width: 720px) {
  .progress-card {
    grid-template-columns: minmax(0, 1fr) minmax(145px, .72fr);
  }

  .progress-copy {
    grid-column: 1 / -1;
  }
}

@media (max-width: 520px) {
  .editor-header {
    padding: 18px 16px;
  }

  .editor-body {
    padding: 17px 16px 22px;
  }

  h2 {
    font-size: 22px;
  }

  .progress-card {
    grid-template-columns: minmax(0, 1fr) minmax(132px, .9fr);
    gap: 14px;
    padding: 15px;
  }

  .compact-entry-row {
    gap: 8px 10px;
  }

  .agent-picker-results {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    max-height: 44dvh;
  }

  .records-heading {
    align-items: center;
  }

  .add-record {
    padding-inline: 12px;
  }

  .gacha-record {
    gap: 8px;
  }

  .record-bar {
    min-width: 68px;
    max-width: calc(100% - 42px);
    padding-inline: 9px;
  }

  .pull-result b {
    font-size: 20px;
  }

  .records-tail {
    align-items: flex-start;
    flex-direction: column;
  }

  footer {
    align-items: stretch;
    flex-direction: column;
    gap: 9px;
    padding-inline: 16px;
  }

  .footer-actions {
    display: grid;
    grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr);
  }
}

@media (max-width: 430px) {
  .modal-mask {
    padding: 0;
  }

  .pool-editor {
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    padding-top: env(safe-area-inset-top);
    padding-right: env(safe-area-inset-right);
    padding-left: env(safe-area-inset-left);
    border-radius: 0;
  }

  .progress-card {
    grid-template-columns: minmax(0, 1fr) minmax(122px, .85fr);
  }

  .progress-number strong {
    font-size: 27px;
  }

  .record-track {
    gap: 6px;
  }
}

@media (max-width: 360px) {
  .progress-card {
    grid-template-columns: minmax(0, 1fr);
  }

  .remaining-field {
    max-width: 180px;
  }

  .records-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .entry-shortcuts {
    width: 100%;
    justify-content: flex-start;
  }

  .entry-shortcuts .add-record {
    flex: 1 1 120px;
    width: auto;
  }

  .gacha-record {
    grid-template-columns: 40px minmax(0, 1fr) 44px;
    gap: 7px;
  }

  .record-avatar {
    width: 40px;
    height: 40px;
  }

  .record-bar {
    min-width: 64px;
    padding-inline: 8px;
  }

  .status-pill.is-neutral {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .progress-rail > span,
  button,
  .gacha-record {
    transition: none;
  }
}
</style>
