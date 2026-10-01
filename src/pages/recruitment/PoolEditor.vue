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
                <button
                  type="button"
                  class="add-record"
                  :disabled="busy || readOnly || recordsLoading || !initialized || !canRecord || newCount >= 120 || !!activeRow"
                  @click="add"
                >
                  <Plus :size="17" aria-hidden="true" />
                  登记出货
                </button>
              </div>

              <fieldset v-if="activeRow" class="entry-composer" :disabled="busy || readOnly || recordsLoading">
                <legend>{{ originals.has(activeRow.event_id) ? '修改这次出货' : '登记一次出货' }}</legend>
                <p class="composer-note">完成本条编辑后，仍需点击底部“保存修改”才会写入档案。</p>
                <div class="record-fields">
                  <label>
                    <span>抽中的密探</span>
                    <select ref="agentSelect" v-model="activeRow.agent_id" required :disabled="!canRecord && originals.has(activeRow.event_id)">
                      <option value="" disabled>选择密探</option>
                      <option v-for="agent in options" :key="agent.id" :value="agent.id">
                        {{ agent.name }}{{ agent.poolSlot ? ' · 本池 UP' : '' }}{{ agent.placeholder ? '（占位）' : '' }}
                      </option>
                    </select>
                  </label>
                  <label>
                    <span>多少抽出货</span>
                    <input v-model="activeRow.pull_span" type="number" inputmode="numeric" min="1" :max="MAX_PULLS" placeholder="不知道可留空">
                  </label>
                </div>
                <p v-if="activeRow.batch_id" class="composer-note">此记录属于已知总量批次；编辑或移除本条不会改变批次总抽数。</p>
                <div class="composer-actions">
                  <button type="button" @click="cancelEntry">取消编辑</button>
                  <button type="button" class="primary" @click="confirmRecord">
                    {{ originals.has(activeRow.event_id) ? '更新记录' : '加入抽卡记录' }}
                  </button>
                </div>
              </fieldset>

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
                    :aria-label="'编辑' + (selectedAgent(row)?.name || row.agent_id) + '，' + (row.pull_span === '' ? '抽数未知' : row.pull_span + '抽出货')"
                    @click="edit(row)"
                  >
                    <span class="record-primary">
                      <span class="record-identity">
                        <strong>{{ selectedAgent(row)?.name || row.agent_id }}</strong>
                        <span class="record-meta">
                          <small v-if="row.up_status === 'non_up'" class="status-pill is-non-up">歪</small>
                          <small v-else-if="selectedAgent(row)?.poolSlot || row.up_status === 'up'" class="status-pill">UP</small>
                          <small v-if="row.batch_id" class="status-pill is-neutral">批次记录</small>
                          <small v-if="row.acquired_date">{{ row.acquired_date }}</small>
                          <small v-if="isChanged(row)" class="pending-mark">待保存</small>
                        </span>
                      </span>
                      <span class="pull-result">
                        <b>{{ row.pull_span === '' ? '—' : row.pull_span }}</b>
                        <small>{{ row.pull_span === '' ? '抽数未知' : '抽' }}</small>
                      </span>
                    </span>

                    <span class="record-visual" aria-hidden="true">
                      <span class="record-track">
                        <span class="record-bar" :class="barClass(row)" :style="{ width: spanWidth(row) }"></span>
                      </span>
                      <Pencil :size="14" />
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
                <p>点击“登记出货”，选择密探并填写这次绝密前的抽数即可。</p>
              </div>

              <div class="records-tail">
                <p v-if="rows.length" class="bar-legend">色条按 40 抽刻度辅助比较间隔；绿色 ≤20、金色 21–30、红色 ≥31，实际抽数始终以右侧数字为准。</p>
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
import { CircleHelp, Pencil, Plus, Trash2, X } from '@lucide/vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { entryInput, MAX_PULLS, poolAgentOptions, progressFromRemaining, recruitmentPoolCatalog, resolveRecruitmentAgent } from './rules.js'

const props = defineProps({ open: Boolean, pool: Object, records: { type: Array, default: () => [] }, recordsLoading: Boolean, recordsError: String, recordsRevision: Number, hasMore: Boolean, agents: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, busy: Boolean, readOnly: Boolean, canRecord: Boolean, serverError: String, requestVersion: Number })
const emit = defineEmits(['close', 'save', 'load-more', 'retry'])
const panel = ref(null), errorSummary = ref(null), error = ref(''), rows = ref([]), remaining = ref(''), initialRemaining = ref(''), activeRow = ref(null), agentSelect = ref(null), remainingInput = ref(null), initialized = ref(false), deletedIds = ref([])
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
const pendingCount = computed(() => rows.value.filter(row => isChanged(row)).length + deletedIds.value.length + (remaining.value !== initialRemaining.value ? 1 : 0))
function focusEntry() { nextTick(() => agentSelect.value?.focus()) }
function add() { error.value = ''; activeRow.value = { event_id: crypto.randomUUID(), agent_id: '', pull_span: '', up_status: 'unknown', acquired_date: null, note: null }; focusEntry() }
function edit(row) { error.value = ''; activeRow.value = { ...row }; focusEntry() }
function cancelEntry() { activeRow.value = null; nextTick(() => panel.value?.querySelector('.add-record')?.focus()) }
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
    nextTick(() => (panel.value?.querySelector('.gacha-record .record-detail') || panel.value?.querySelector('.add-record'))?.focus())
    return true
  } catch (err) { error.value = err.message; nextTick(() => errorSummary.value?.focus()); return false }
}
function remove(row) { if (activeRow.value?.event_id === row.event_id) activeRow.value = null; if (originals.has(row.event_id)) deletedIds.value.push(row.event_id); rows.value = rows.value.filter(item => item !== row); nextTick(() => (panel.value?.querySelector('.gacha-record .record-detail') || panel.value?.querySelector('.add-record'))?.focus()) }
watch(() => props.open, open => {
  if (!open) return
  rows.value = []; activeRow.value = null; deletedIds.value = []; originals.clear(); initialized.value = false; error.value = ''; requestId = ''
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

.entry-composer {
  min-width: 0;
  margin: 0 0 14px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--line));
  border-radius: 14px;
  background: var(--cream);
  scroll-margin: 20px;
}

.entry-composer legend {
  padding: 0 6px;
  font: 800 15px/1.5 var(--font-s);
}

.composer-note {
  margin-bottom: 12px;
  color: var(--ink-60);
  font-size: 11px;
  line-height: 1.7;
}

.record-fields {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(150px, .8fr);
  gap: 12px;
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
  margin-top: 14px;
}

.record-feed {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gacha-record {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 11px 10px 11px 12px;
  border: 1px solid transparent;
  border-radius: 13px;
  background: color-mix(in srgb, var(--cream) 60%, transparent);
  transition: border-color 180ms ease, background-color 180ms ease;
}

.gacha-record:hover {
  border-color: var(--line);
  background: var(--cream);
}

.record-avatar {
  flex: none;
}

.record-detail {
  display: flex;
  min-width: 0;
  min-height: 62px;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 9px;
  overflow: hidden;
  padding: 2px 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
}

.record-detail:not(:disabled):hover {
  border-color: transparent;
  background: transparent;
}

.record-primary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
}

.record-identity {
  min-width: 0;
}

.record-identity > strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 800;
}

.record-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
  color: var(--ink-60);
  font-size: 10px;
}

.record-meta small {
  font-size: 10px;
}

.status-pill,
.pending-mark {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  line-height: 1.4;
}

.status-pill {
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
  color: var(--accent-strong);
}

.status-pill.is-non-up {
  border-color: color-mix(in srgb, var(--rouge) 55%, var(--line));
  color: var(--rouge);
}

.status-pill.is-neutral {
  border-color: var(--line);
  color: var(--ink-60);
}

.pending-mark {
  background: var(--yellow);
  color: var(--tea);
  font-weight: 700;
}

.pull-result {
  display: flex;
  flex: none;
  align-items: baseline;
  gap: 5px;
  min-width: 66px;
  justify-content: flex-end;
}

.pull-result b {
  font: 700 25px/1 var(--font-d);
}

.pull-result small {
  color: var(--ink-60);
  font-size: 11px;
}

.record-visual {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-60);
}

.record-track {
  height: 6px;
  border-radius: 999px;
}

.record-bar {
  --bar-color: var(--accent-strong);
  display: block;
  min-width: 14px;
  max-width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--bar-color);
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
  opacity: .45;
}

.delete-record {
  display: grid;
  flex: none;
  place-items: center;
  padding: 9px;
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

  .record-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .records-heading {
    align-items: center;
  }

  .add-record {
    padding-inline: 12px;
  }

  .gacha-record {
    gap: 9px;
    padding-inline: 9px 7px;
  }

  .record-primary {
    gap: 8px;
  }

  .pull-result {
    min-width: 55px;
  }

  .pull-result b {
    font-size: 22px;
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

  .record-meta {
    gap: 4px;
  }

  .delete-record {

    padding-inline: 7px;
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

  .add-record {
    width: 100%;
  }

  .gacha-record {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .delete-record {
    grid-column: 2;
    justify-self: end;

    margin-top: -4px;
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
