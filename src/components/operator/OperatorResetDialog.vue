<template>
  <Teleport to="body">
    <div class="modal-mask is-raised reset-mask" @click.self="close">
      <section ref="panel" class="reset-panel" role="dialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-help" :aria-busy="busy" tabindex="-1">
        <header><h2 id="reset-title">{{ entry.name || entry.id }} · 鞭子重置</h2><button type="button" :disabled="busy" @click="close">关闭</button></header>
        <p id="reset-help">账号「{{ accountName }}」· {{ game }}。记录游戏内已完成的重置，不统计或扣除鞭子。</p>
        <p class="hint">只给尚未包含本次返还的库存加材料；如果已重新采集或盘点，请先核对，避免重复入库。</p>
        <p v-if="busy" role="status">{{ pending ? '正在提交，请稍候…' : '正在读取预览…' }}</p>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <form v-if="data" @submit.prevent="submit">
          <p v-for="(growth, id) in data.before" :key="id"><strong>{{ operatorName(id) }}</strong>：{{ growth.level }}级 / 修为+{{ growth.elite }} → {{ undoing ? restoreGrowth(id) : '1级 / 修为+1，未突破' }}</p>
          <p class="hint">星级、觉醒、命盘、奇闻、星石和养成目标保留。</p>
          <label v-if="needsStage && !undoing" class="stage-field">当前等级是否已突破
            <select v-model="stage" :disabled="locked" @change="confirmed = false"><option value="">请按游戏核对</option><option :value="String(Math.floor(sourceGrowth.level / 10) - 1)">尚未突破</option><option :value="String(Math.floor(sourceGrowth.level / 10))">已经突破</option></select>
          </label>
          <p v-if="!undoing" class="hint">数量是参考值，请按游戏重置预览逐项核对；未记录的等级经验零头不会自动补入。{{ data.experience == null ? '兵书经验未核实，请填写游戏显示的实际数量。' : '' }}</p>
          <div class="resource-list">
            <div v-for="row in data.resources" :key="row.id" class="resource-row">
              <span v-if="undoing">{{ itemName(row.id) }}</span>
              <label v-else :for="'reset-count-' + row.id">{{ itemName(row.id) }}</label>
              <strong v-if="undoing">{{ row.count }}</strong>
              <input v-else :id="'reset-count-' + row.id" v-model="quantities[row.id]" type="number" inputmode="numeric" min="0" max="2147483647" step="1" :disabled="locked" @focus="$event.target.select()" @input="confirmed = false" />
              <span class="hint">库存 {{ row.balance_before ?? '未知' }} → {{ changed ? '待预览' : (row.balance_after ?? '未知') }}</span>
            </div>
          </div>
          <p v-if="!undoing" class="hint">五铢钱参考返还 {{ data.money?.toLocaleString() ?? '—' }}，不计入库存。</p>
          <p v-for="blocker in data.blockers" :key="blocker" role="alert" class="error">{{ readable(blocker) }}</p>
          <p v-if="changed" role="status">清单有修改，请先更新预览。</p>
          <label v-if="!undoing" class="confirmation"><input v-model="confirmed" type="checkbox" :disabled="locked || changed || !!data.blockers.length" />我已核对游戏返还清单，当前库存尚未包含这次返还</label>
          <p v-else>撤销会恢复原练度，并从当前库存扣回上列材料；后续数据有冲突时整笔停止。</p>
          <div class="actions">
            <button v-if="!undoing" type="button" :disabled="locked || !validQuantities" @click="updatePreview">更新预览</button>
            <button v-else type="button" :disabled="locked" @click="cancelUndo">返回返还记录</button>
            <button v-if="previewInvalid && !undoing" type="button" :disabled="locked" @click="load">放弃清单并重新读取</button>
            <button class="primary" type="submit" :disabled="!canSubmit">{{ pending ? '原样重试' : undoing ? '确认撤销本次重置' : '确认记录并增加库存' }}</button>
          </div>
        </form>
        <p v-if="pending && !busy" role="status">结果尚未确认，清单已锁定。请原样重试；关闭后也可从重置记录核对结果。</p>
        <section class="history" aria-labelledby="reset-history-title">
          <h3 id="reset-history-title">重置记录</h3>
          <p v-if="historyBusy" role="status">正在读取重置记录…</p>
          <p v-if="historyError" role="alert" class="error">{{ historyError }} <button type="button" :disabled="busy" @click="loadHistory()">重试读取记录</button></p>
          <p v-else-if="historyLoaded && !history.length">暂无重置记录</p>
          <article v-for="record in history" :key="record.id">
            <p>{{ new Date(record.created_at).toLocaleString() }} · {{ record.undone_at ? '已撤销' : '已记录重置' }}</p>
            <p class="hint">{{ Object.entries(record.refunds).map(([id, count]) => itemName(id) + ' ×' + count).join('、') || '未增加库存材料' }}</p>
            <button v-if="!record.undone_at" type="button" :disabled="busy || !!pending" @click="openUndo(record)">撤销本次重置</button>
          </article>
          <button v-if="nextCursor" type="button" :disabled="busy || historyBusy" @click="loadHistory(nextCursor)">更早记录</button>
        </section>
        <button v-if="!data && !busy && !pending" type="button" @click="load">重新读取重置预览</button>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue'
import { previewOperatorReset, executeOperatorReset, listOperatorResets, previewOperatorResetUndo, undoOperatorReset } from '../../api/operatorResets.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'
import { useModalFocus } from '../../composables/useModalFocus.js'

const props = defineProps({ entry: { type: Object, required: true }, accountId: { type: String, required: true }, accountName: { type: String, required: true }, game: { type: String, required: true }, userId: { type: String, required: true }, operators: { type: Array, default: () => [] } })
const emit = defineEmits(['close', 'updated'])
const panel = ref(null), data = ref(null), quantities = ref({}), stage = ref(''), confirmed = ref(false), busy = ref(false), error = ref(''), notice = ref(''), undoing = ref(null), pending = ref(null), previewInvalid = ref(false)
const history = ref([]), nextCursor = ref(null), historyError = ref(''), historyLoaded = ref(false), historyBusy = ref(false)
const context = [props.userId, props.accountId, props.game, props.entry.id]
let active = true, acceptedSignature = '', historySeq = 0
const current = () => active && context.every((value, index) => value === [props.userId, props.accountId, props.game, props.entry.id][index])
watch(() => [props.userId, props.accountId, props.game, props.entry.id], () => { active = false; emit('close') }, { flush: 'sync' })
onScopeDispose(() => { active = false })
const names = new Map(ITEM_CATALOG.map(item => [item.id, item.name]))
const itemName = id => names.get(id) || id
const readable = message => [...names].reduce((text, [id, name]) => text.replaceAll(id, name), message)
const operatorName = id => props.operators.find(op => op.id === id)?.name || (id === props.entry.id ? props.entry.name : id)
const sourceGrowth = computed(() => Object.values(data.value?.before || {})[0] || {})
const needsStage = computed(() => sourceGrowth.value.level_breakthrough_stage == null && sourceGrowth.value.level % 10 === 0 && sourceGrowth.value.level < 100)
const signature = () => JSON.stringify([quantities.value, stage.value])
const changed = computed(() => !!data.value && !undoing.value && signature() !== acceptedSignature)
const validQuantities = computed(() => Object.values(quantities.value).every(value => /^\d+$/.test(String(value)) && Number(value) <= 2147483647) && (!needsStage.value || stage.value !== ''))
const locked = computed(() => busy.value || !!pending.value)
const canSubmit = computed(() => current() && !busy.value && !!data.value && (!!pending.value || (!previewInvalid.value && !changed.value && !data.value.blockers.length && (undoing.value || confirmed.value && validQuantities.value))))
const accountBody = () => ({ account_id: context[1], game: context[2] })
const restoreGrowth = id => { const value = undoing.value?.before[id]; return value ? value.level + '级 / 修为+' + value.elite : '原练度' }
function close() { if (!busy.value) emit('close') }
useModalFocus(() => true, panel, { initialFocus: () => panel.value, onEscape: close, blocking: true, preventRestoreScroll: true })

function accept(value, initial = false) {
  data.value = value
  previewInvalid.value = false
  if (!undoing.value) {
    quantities.value = Object.fromEntries(value.resources.map(row => [row.id, initial && value.experience == null && ['bingshuquanjuan', 'bingshucanjuan', 'liutaobingshu'].includes(row.id) ? '' : String(row.count)]))
    if (initial) stage.value = ''
  }
  acceptedSignature = signature()
  confirmed.value = false
}
async function loadHistory(cursor) {
  if (!current() || cursor && historyBusy.value) return
  const seq = ++historySeq
  historyBusy.value = true; historyError.value = ''
  try {
    const result = await listOperatorResets(context[1], context[2], context[3], context[0], cursor)
    if (!current() || seq !== historySeq) return
    history.value = cursor ? [...history.value, ...result.items] : result.items
    nextCursor.value = result.next_cursor; historyLoaded.value = true
  } catch (err) { if (current() && seq === historySeq) historyError.value = err.message || '读取重置记录失败' }
  finally { if (current() && seq === historySeq) historyBusy.value = false }
}
async function load() {
  if (!current() || locked.value) return
  busy.value = true; error.value = ''; undoing.value = null
  try { const result = await previewOperatorReset({ ...accountBody(), operator_id: context[3] }, context[0]); if (current()) accept(result, true) }
  catch (err) { if (current()) { data.value = null; error.value = err.message || '读取重置预览失败' } }
  finally { if (current()) busy.value = false }
}
async function updatePreview() {
  if (!current() || locked.value || !validQuantities.value) return
  busy.value = true; error.value = ''
  const body = { ...accountBody(), operator_id: context[3], refunds: Object.fromEntries(Object.entries(quantities.value).map(([id, value]) => [id, Number(value)])) }
  if (stage.value !== '') body.level_breakthrough_stage = Number(stage.value)
  try { const result = await previewOperatorReset(body, context[0]); if (current()) accept(result) }
  catch (err) { if (current()) { confirmed.value = false; error.value = err.message || '更新预览失败' } }
  finally { if (current()) busy.value = false }
}
async function openUndo(record) {
  if (!current() || locked.value) return
  busy.value = true; error.value = ''; notice.value = ''; confirmed.value = false
  try {
    const result = await previewOperatorResetUndo(record.id, accountBody(), context[0])
    if (current()) { undoing.value = record; accept(result); panel.value?.scrollTo?.({ top: 0, behavior: 'auto' }); panel.value?.focus() }
  } catch (err) { if (current()) error.value = err.message || '读取撤销预览失败' }
  finally { if (current()) busy.value = false }
}
function cancelUndo() { if (!locked.value) { data.value = null; undoing.value = null; error.value = '' } }
async function submit() {
  if (!canSubmit.value) return
  if (!pending.value) pending.value = { body: { ...accountBody(), preview_token: data.value.preview_token, ...(!undoing.value ? { confirmed_game_preview: true } : {}) }, id: undoing.value?.id, key: crypto.randomUUID() }
  const operation = pending.value
  busy.value = true; error.value = ''
  try {
    const result = operation.id ? await undoOperatorReset(operation.id, operation.body, context[0]) : await executeOperatorReset(operation.body, operation.key, context[0])
    if (!current()) return
    pending.value = null; data.value = null; undoing.value = null
    notice.value = result.undone_at ? '已撤销重置，原练度已恢复，本次返还材料已扣回。' : '已记录重置并增加库存，可在下方撤销本次操作。'
    emit('updated')
    await loadHistory()
  } catch (err) {
    if (!current()) return
    error.value = readable(err.message || '提交结果尚未确认，请原样重试')
    if (err.status === 409 || err.status === 422) { pending.value = null; confirmed.value = false; previewInvalid.value = true }
  } finally { if (current()) busy.value = false }
}
load(); loadHistory()
</script>

<style scoped>
.reset-mask { display: grid; place-items: center; padding: 12px; }
.reset-panel { box-sizing: border-box; width: min(100%, 680px); max-height: calc(100dvh - 24px); overflow-y: auto; overscroll-behavior: contain; padding: 24px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); }
header, .actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
h2 { margin: 0; font: 800 22px/1.5 var(--font-s); overflow-wrap: anywhere; }
p, label, input, select, button { font: 14px/1.6 var(--font-b); }
button, input, select { border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; background: var(--cream); color: var(--ink); }
button { cursor: pointer; }
button:disabled { opacity: .55; cursor: default; }
.primary { background: var(--tea); color: var(--on-strong); }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.hint { color: var(--ink-60); overflow-wrap: anywhere; }
.error { color: var(--theme-danger-text, var(--rouge)); }
.resource-list { margin: 16px 0; }
.resource-row { display: grid; grid-template-columns: minmax(0, 1fr) 110px minmax(0, 1fr); gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
.resource-row input { min-width: 0; width: 100%; box-sizing: border-box; }
.stage-field, .confirmation { display: flex; gap: 8px; align-items: center; margin: 16px 0; }
.confirmation input { flex-shrink: 0; }
.history { border-top: 1px solid var(--line); margin-top: 24px; }
article { border-bottom: 1px solid var(--line); padding-bottom: 12px; }
@media (max-width: 640px) {
  .reset-panel { padding: 18px; }
  .resource-row { grid-template-columns: minmax(0, 1fr) 110px; }
  .resource-row .hint { grid-column: 1 / -1; }
  input, select { font-size: 16px; }
  .actions .primary { width: 100%; }
}
</style>
