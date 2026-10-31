<template>
  <Teleport to="body">
    <div class="modal-mask is-raised reset-mask" :style="viewportStyle" @click.self="close">
      <section ref="panel" class="reset-panel" :class="{ 'is-short': shortViewport }" role="dialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-help" :aria-busy="busy" tabindex="-1" @focusin="revealFocusedControl">
        <header class="reset-header">
          <button v-if="view === 'undo' || view === 'history' && (!historyOnly || pending || resultRecord)" type="button" class="icon-button" :aria-label="view === 'undo' ? '返回重置记录' : pending ? '返回原操作' : resultRecord ? '返回操作结果' : '返回重置核对'" :disabled="busy" @click="back"><ArrowLeft aria-hidden="true" /></button>
          <div class="identity">
            <h2 id="reset-title">{{ view === 'history' ? '重置记录' : view === 'undo' ? '撤销预览' : (entry.name || entry.id) + ' · 鞭子重置' }}</h2>
            <p id="reset-help">账号「{{ accountName }}」· {{ game }}<span v-if="view === 'history' || view === 'undo'"> · {{ entry.name || entry.id }}</span></p>
          </div>
          <button v-if="view === 'reset' || view === 'success'" type="button" class="history-entry" :disabled="busy" @click="showHistory"><History :size="16" aria-hidden="true" />重置记录</button>
          <button type="button" class="icon-button" aria-label="关闭" :disabled="busy" @click="close"><X aria-hidden="true" /></button>
        </header>

        <div v-if="closeRequested" class="discard-warning" role="alert">
          <p>尚未记录的返还数量会丢失，确定关闭？</p>
          <button type="button" :disabled="busy" @click="closeRequested = false">继续核对</button>
          <button type="button" :disabled="busy" @click="close(true)">放弃编辑并关闭</button>
        </div>

        <form v-if="view === 'reset' || view === 'undo'" class="reset-form" @submit.prevent="submit">
          <div ref="scrollBody" class="reset-body">
            <p v-if="view === 'reset'" class="hint intro">记录游戏内已完成的重置，不统计或扣除鞭子。仅返还本次重置的养成材料。</p>
            <p v-else class="hint intro">确认撤销后，将恢复原练度，并从库存扣回本次返还材料。</p>
            <p v-if="busy" role="status">{{ pending ? '正在提交，请稍候…' : '正在读取预览…' }}</p>
            <p v-if="visibleError" role="alert" class="error">{{ visibleError }}</p>
            <template v-if="displayData">
              <section class="growth-panel" aria-labelledby="growth-title">
                <div class="growth-summary">
                  <h3 id="growth-title">{{ view === 'undo' ? '原练度（撤销后恢复）' : '重置后的密探状态' }}</h3>
                  <div v-for="(growth, id) in displayData.before" :key="id" class="growth-member">
                    <strong v-if="Object.keys(displayData.before).length > 1" class="member-name">{{ operatorName(id) }}</strong>
                    <div class="growth-change">
                      <div><strong>{{ growth.level }}级</strong><span>修为 +{{ growth.elite }}</span><small>{{ stageLabel(growth, view === 'reset' ? stage : '') }}</small></div>
                      <ArrowRight :size="22" aria-hidden="true" />
                      <div class="growth-after"><strong>{{ view === 'undo' ? undoing.before[id]?.level + '级' : '1级' }}</strong><span>修为 +{{ view === 'undo' ? undoing.before[id]?.elite : 1 }}</span><small>{{ view === 'undo' ? stageLabel(undoing.before[id]) : '未突破' }}</small></div>
                    </div>
                  </div>
                </div>
                <div v-if="needsStage && view === 'reset'" class="stage-field">
                  <label for="reset-stage">当前等级是否已突破？</label>
                  <p class="hint">已保存的资料尚未记录此状态，请按游戏实际情况补充核对。</p>
                  <select id="reset-stage" v-model="stage" :disabled="locked" :aria-invalid="stage === ''" :aria-describedby="stage === '' ? 'stage-hint' : undefined" @change="updatePreview">
                    <option value="">请按游戏核对</option><option :value="String(Math.floor(sourceGrowth.level / 10) - 1)">尚未突破</option><option :value="String(Math.floor(sourceGrowth.level / 10))">已经突破</option>
                  </select>
                  <p v-if="stage === ''" id="stage-hint" class="error">请选择当前等级是否已突破。</p>
                </div>
                <p v-else-if="view === 'reset' && sourceGrowth.level % 10 === 0 && sourceGrowth.level < 100" class="hint">突破状态已读取已保存的密探资料，无需重复填写。</p>
                <p v-if="view === 'reset'" class="hint preserved">星级、觉醒、命盘、奇闻、星石和养成目标保持不变。</p>
              </section>

              <div class="section-heading"><h3>{{ view === 'undo' ? '需要扣回的材料' : '返还材料明细' }}</h3><span v-if="view === 'reset'" class="hint">数量为参考值，可按游戏实际返还修改。</span></div>
              <p v-if="view === 'reset' && data.experience == null" class="hint">兵书经验未核实，请填写游戏显示的实际数量；未记录的等级经验零头不会自动补入。</p>
              <p v-else-if="view === 'reset'" class="hint experience-hint">兵书按等级累计经验预填，全卷优先、余数换残卷；未记录的溢出经验不会自动补入，请按游戏返还清单核对。</p>
              <p v-if="view === 'reset' && (previewBusy || previewInvalid || changed)" class="preview-status" role="status">{{ previewBusy ? '正在更新返还预览…' : !validQuantities ? '请先核对突破状态与材料数量，再自动更新预览。' : error ? '预览未更新，请重试。' : '清单有修改，正在等待自动更新预览…' }}</p>
              <p class="mobile-resource-help hint">每项下方为库存变化（当前 → {{ view === 'undo' ? '撤销后' : '返还后' }}）</p>
              <div class="resource-list" :aria-busy="previewBusy && view === 'reset'">
                <div class="resource-head" aria-hidden="true"><span>材料名称</span><span>{{ view === 'undo' ? '扣回数量' : '本次返还数量' }}</span><span>库存变化（当前 → {{ view === 'undo' ? '撤销后' : '返还后' }}）</span></div>
                <div v-for="row in displayData.resources" :key="row.id" class="resource-row">
                  <span v-if="view === 'undo'" class="resource-name">
                    <img v-if="!failedIcons.has(row.id)" :src="itemIcon(row.id)" alt="" width="32" height="32" @error="failedIcons.add(row.id)" />
                    <span>{{ itemName(row.id) }}</span>
                  </span>
                  <label v-else class="resource-name" :for="'reset-count-' + row.id">
                    <img v-if="!failedIcons.has(row.id)" :src="itemIcon(row.id)" alt="" width="32" height="32" @error="failedIcons.add(row.id)" />
                    <span>{{ itemName(row.id) }}</span>
                  </label>
                  <strong v-if="view === 'undo'" class="resource-count">{{ Math.abs(row.count) }}</strong>
                  <div v-else class="quantity-field">
                    <input :id="'reset-count-' + row.id" v-model="quantities[row.id]" type="number" inputmode="numeric" min="0" max="2147483647" step="1" :aria-label="itemName(row.id) + '本次返还数量'" :aria-invalid="quantities[row.id] !== '' && !validCount(quantities[row.id])" :aria-describedby="!validCount(quantities[row.id]) ? 'reset-error-' + row.id : undefined" :disabled="locked" @input="manualQuantities[row.id] = $event.target.value" @focus="$event.target.select()" @blur="flushPreview" />
                    <span v-if="quantities[row.id] === ''" :id="'reset-error-' + row.id" class="hint field-error">待核对，请按游戏填写实际数量</span>
                    <span v-else-if="!validCount(quantities[row.id])" :id="'reset-error-' + row.id" class="error field-error">请填 0–2147483647 的整数</span>
                  </div>
                  <span class="balance hint">{{ view === 'reset' && !validCount(quantities[row.id]) ? '数量待核对' : staleDisplay ? (previewBusy ? '正在更新…' : '待更新预览') : (row.balance_before ?? '未知') + ' → ' + (row.balance_after ?? '未知') }}</span>
                </div>
              </div>
              <p v-if="view === 'reset' && inactiveManualQuantities.length" class="hint">以下手填材料不属于当前突破状态的返还清单，暂不计入：{{ inactiveManualQuantities.map(([id, count]) => itemName(id) + ' ×' + count).join('、') }}。切换回对应状态会保留填写值。</p>
              <p v-if="view === 'reset'" class="money">五铢钱参考返还：{{ staleDisplay ? '待更新预览' : (data.money?.toLocaleString() ?? '未知') }}（不计入库存）</p>
              <div v-if="!staleDisplay && displayData.blockers.length" class="blockers"><p v-for="blocker in displayData.blockers" :key="blocker" role="alert" class="error">{{ readable(blocker) }}</p></div>
              <p v-if="view === 'undo'" class="undo-warning">撤销将整笔恢复原练度并扣回材料；若材料已使用、后续练度或库存盘点有冲突，将无法撤销。</p>
            </template>
            <p v-if="pending && !busy" role="status" class="undo-warning">结果尚未确认，清单已锁定。请原样重试，或查看重置记录核对结果。关闭或刷新后，在当前标签页重新打开仍可继续原操作。</p>
            <div class="recovery">
              <button v-if="view === 'reset' && data && !pending && (error || previewInvalid && !changed && !previewBusy || !staleDisplay && data.blockers.length)" type="button" :disabled="locked || previewBusy || !validQuantities" @click="updatePreview">重新读取预览</button>
              <button v-if="view === 'reset' && !data && !busy" type="button" @click="load">重新读取重置预览</button>
              <button v-if="view === 'undo' && !pending && (undoError || undoInvalid)" type="button" :disabled="busy" @click="openUndo(undoing)">重新读取撤销预览</button>
              <button v-if="pending && !busy" type="button" @click="showHistory">查看重置记录核对结果</button>
            </div>
          </div>
          <footer class="reset-footer">
            <label v-if="view === 'reset' && data" class="confirmation"><input v-model="confirmed" type="checkbox" :disabled="locked || previewBusy || previewInvalid || changed || !validQuantities || !!data.blockers.length" />我已核对游戏返还清单，确认当前库存尚未包含这次返还。</label>
            <p v-if="view === 'reset' && canConfirm && !confirmed" class="hint confirm-hint">核对完成后，请勾选确认再记录。</p>
            <div class="actions"><button type="button" :disabled="busy" @click="view === 'undo' ? cancelUndo() : close()">{{ view === 'undo' ? '返回重置记录' : '取消' }}</button><button class="primary" type="submit" :disabled="!canSubmit">{{ busy && pending ? '正在提交…' : pending ? '原样重试' : view === 'undo' ? '确认撤销' : '确认记录并增加库存' }}</button></div>
          </footer>
        </form>

        <div v-show="view === 'history'" ref="historyBody" class="reset-body history" tabindex="-1">
          <p class="hint intro">查看该账号、该游戏、该密探的历史重置及撤销状态。</p>
          <p class="action-feedback" v-if="notice" role="status">{{ notice }}</p>
          <p v-if="pending" class="undo-warning">上次提交结果尚未确认。请核对记录，或返回原操作原样重试。</p>
          <p v-if="historyBusy" role="status">正在读取重置记录…</p>
          <p v-if="historyError" role="alert" class="error">{{ historyError }} <button type="button" :disabled="historyBusy" @click="loadHistory(failedCursor)">重试读取记录</button></p>
          <div v-else-if="historyLoaded && !historyBusy && !history.length" class="empty-history"><ScrollText :size="44" aria-hidden="true" /><h3>暂无重置记录</h3><p class="hint">目前没有已记录的鞭子重置。</p></div>
          <article v-for="record in history" :key="record.id" :class="{ 'current-record': record.id === resultRecord?.id }">
            <div class="record-heading"><strong>{{ new Date(record.created_at).toLocaleString() }}</strong><span>{{ record.undone_at ? '已撤销' : '已记录重置' }}</span></div>
            <p class="hint">{{ Object.entries(record.refunds).map(([id, count]) => itemName(id) + ' ×' + count).join('、') || '未增加库存材料' }}</p>
            <button v-if="!record.undone_at" type="button" :disabled="busy || !!pending" @click="openUndo(record)">查看撤销预览</button>
          </article>
          <button v-if="nextCursor" type="button" :disabled="busy || historyBusy" @click="loadHistory(nextCursor)">更早记录</button>
          <aside class="history-help"><h3>记录说明</h3><p>仅记录已在游戏内完成的重置。可查看完整返还材料；符合库存与数据条件时，可整笔撤销。后续盘点或练度修改可能使记录无法撤销。</p></aside>
        </div>
        <footer v-if="view === 'history'" class="reset-footer actions"><button type="button" :disabled="busy" @click="historyOnly && !pending && !resultRecord ? close() : back()">{{ pending ? '返回原操作' : resultRecord ? '返回操作结果' : historyOnly ? '完成并返回密探编辑' : '返回重置核对' }}</button><button type="button" :disabled="historyBusy" @click="loadHistory()">刷新记录</button></footer>

        <div v-if="view === 'success'" class="reset-body success" role="status"><CheckCircle2 :size="38" aria-hidden="true" /><h3>{{ notice }}</h3><p class="hint">可从重置记录查看本次材料返还与撤销状态。</p></div>
        <footer v-if="view === 'success'" class="reset-footer actions"><button type="button" @click="showHistory">查看本次重置记录</button><button type="button" class="primary" @click="close">完成并返回密探编辑</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, CheckCircle2, History, ScrollText, X } from '@lucide/vue'
import { previewOperatorReset, executeOperatorReset, listOperatorResets, previewOperatorResetUndo, undoOperatorReset } from '../../api/operatorResets.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'
import { readResetRecovery, saveResetRecovery, clearResetRecovery } from '../../utils/operatorResetRecovery.js'

const props = defineProps({ entry: { type: Object, required: true }, accountId: { type: String, required: true }, accountName: { type: String, required: true }, game: { type: String, required: true }, userId: { type: String, required: true }, operators: { type: Array, default: () => [] }, currentGrowth: { type: Object, default: null } })
const emit = defineEmits(['close', 'updated'])
const historyOnly = props.currentGrowth?.level === 1 && props.currentGrowth?.elite === 1
const panel = ref(null), scrollBody = ref(null), historyBody = ref(null), view = ref(historyOnly ? 'history' : 'reset')
const data = ref(null), quantities = ref({}), stage = ref(''), confirmed = ref(false), busy = ref(false), error = ref(''), notice = ref(''), pending = ref(null), previewInvalid = ref(false), previewBusy = ref(false)
const undoing = ref(null), undoData = ref(null), undoError = ref(''), undoInvalid = ref(false), resultRecord = ref(null), closeRequested = ref(false)
const history = ref([]), nextCursor = ref(null), historyError = ref(''), historyLoaded = ref(false), historyBusy = ref(false), failedCursor = ref(null)
const acceptedSignature = ref('')
const manualQuantities = ref({})
let acceptedStage = ''
const inactiveManualQuantities = computed(() => Object.entries(manualQuantities.value).filter(([id]) => !data.value?.resources.some(row => row.id === id)))
const context = [props.userId, props.accountId, props.game, props.entry.id]
const recoveryContext = [...context.slice(0, 3), props.entry.spOf || props.entry.sp_of || props.entry.id]
let active = true, applying = false, initialSignature = '', historySeq = 0, previewSeq = 0, previewTimer, resetScroll = 0, historyScroll = 0
const current = () => active && context.every((value, index) => value === [props.userId, props.accountId, props.game, props.entry.id][index])
function invalidateRequest() { clearTimeout(previewTimer); previewSeq++; previewBusy.value = false }
watch(() => [props.userId, props.accountId, props.game, props.entry.id], () => { active = false; invalidateRequest(); emit('close') }, { flush: 'sync' })
onScopeDispose(() => { active = false; invalidateRequest() })
const names = new Map(ITEM_CATALOG.map(item => [item.id, item.name]))
const itemName = id => names.get(id) || id
const itemIcon = id => `${import.meta.env.BASE_URL}inventory-icons/items/${encodeURIComponent(id)}.png`
const failedIcons = ref(new Set())
const readable = message => [...names].reduce((text, [id, name]) => text.replaceAll(id, name), message)
const operatorName = id => props.operators.find(op => op.id === id)?.name || (id === props.entry.id ? props.entry.name : id)
const sourceGrowth = computed(() => data.value?.before[props.entry.id] || Object.values(data.value?.before || {})[0] || {})
const needsStage = computed(() => sourceGrowth.value.level_breakthrough_stage == null && sourceGrowth.value.level % 10 === 0 && sourceGrowth.value.level < 100)
const signature = () => JSON.stringify([quantities.value, stage.value])
const changed = computed(() => !!data.value && signature() !== acceptedSignature.value)
const validCount = value => /^\d+$/.test(String(value)) && Number(value) <= 2147483647
const validQuantities = computed(() => Object.values(quantities.value).every(validCount) && (!needsStage.value || stage.value !== ''))
const locked = computed(() => busy.value || !!pending.value)
const displayData = computed(() => view.value === 'undo' ? undoData.value : data.value)
const staleDisplay = computed(() => view.value === 'undo' ? undoInvalid.value : previewBusy.value || previewInvalid.value || changed.value)
const visibleError = computed(() => view.value === 'undo' ? undoError.value : error.value)
const canConfirm = computed(() => !!data.value?.preview_token && !locked.value && !previewBusy.value && !previewInvalid.value && !changed.value && !data.value.blockers.length && validQuantities.value)
const canSubmit = computed(() => current() && !busy.value && (view.value === 'reset' || view.value === 'undo') && (!!pending.value || (view.value === 'undo' ? !!undoData.value?.preview_token && !undoInvalid.value && !undoData.value.blockers.length : canConfirm.value && confirmed.value)))
const accountBody = () => ({ account_id: context[1], game: context[2] })
const stageLabel = (growth, selected = '') => {
  const value = growth?.level_breakthrough_stage ?? (selected === '' ? null : Number(selected))
  return value == null ? '突破待核对' : growth.level % 10 === 0 && growth.level < 100 ? (value >= growth.level / 10 ? '已突破' : '未突破') : ''
}
function close(discard = false) {
  if (busy.value) return
  if (discard !== true && !pending.value && !resultRecord.value && data.value && signature() !== initialSignature) { closeRequested.value = true; return }
  emit('close')
}
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(() => true, scrollBody, panel)
useModalFocus(() => true, panel, { initialFocus: () => panel.value, onEscape: close, blocking: true, preventRestoreScroll: true })
const viewScroller = (target = view.value) => shortViewport.value ? panel.value : target === 'history' ? historyBody.value : scrollBody.value

function accept(value, initial = false) {
  applying = true
  data.value = value
  quantities.value = Object.fromEntries(value.resources.map(row => [row.id, initial && value.experience == null && ['bingshuquanjuan', 'bingshucanjuan', 'liutaobingshu'].includes(row.id) ? '' : String(row.count)]))
  if (initial) { stage.value = ''; manualQuantities.value = {} }
  acceptedStage = stage.value
  acceptedSignature.value = signature()
  if (initial) initialSignature = signature()
  previewInvalid.value = false; confirmed.value = false
  applying = false
}
watch(signature, () => {
  if (applying || !data.value || pending.value || !current()) return
  invalidateRequest(); previewInvalid.value = true; confirmed.value = false; error.value = ''; closeRequested.value = false
  if (validQuantities.value) previewTimer = setTimeout(updatePreview, 450)
}, { flush: 'sync' })
function flushPreview() { if (changed.value && !previewBusy.value) updatePreview() }
async function moveTo(next, scroll = 0) {
  view.value = next
  await nextTick()
  const body = viewScroller(next)
  if (body) body.scrollTop = scroll
  panel.value?.focus({ preventScroll: true })
}
function showHistory() {
  if (busy.value) return
  if (view.value === 'reset') resetScroll = viewScroller()?.scrollTop || 0
  moveTo('history', historyScroll)
  if (pending.value || !historyLoaded.value && !historyBusy.value) loadHistory()
}
function back() {
  if (view.value === 'undo') return cancelUndo()
  historyScroll = viewScroller()?.scrollTop || 0
  moveTo(pending.value?.id ? 'undo' : resultRecord.value ? 'success' : 'reset', resetScroll)
}
async function loadHistory(cursor) {
  if (!current() || cursor && historyBusy.value) return
  const seq = ++historySeq
  historyBusy.value = true; historyError.value = ''; failedCursor.value = cursor || null
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
  busy.value = true; error.value = ''
  try {
    const saved = readResetRecovery(recoveryContext)
    if (saved) {
      pending.value = saved.operation
      if (saved.operation.id) { undoing.value = saved.undoRecord; undoData.value = saved.preview; view.value = 'undo' }
      else {
        accept(saved.preview, true); stage.value = saved.stage
        manualQuantities.value = saved.manualQuantities ?? Object.fromEntries(saved.preview.resources.map(row => [row.id, String(row.count)]))
        acceptedStage = stage.value; acceptedSignature.value = signature(); initialSignature = signature()
        view.value = 'reset'
      }
      return
    }
    if (historyOnly) { view.value = 'history'; return }
    const result = await previewOperatorReset({ ...accountBody(), operator_id: context[3] }, context[0])
    if (current()) accept(result, true)
  }
  catch (err) { if (current()) { data.value = null; view.value = 'reset'; error.value = err.message || '读取重置预览失败' } }
  finally { if (current()) busy.value = false }
}
async function updatePreview() {
  clearTimeout(previewTimer)
  if (!current() || locked.value || !data.value || !validQuantities.value) return
  const seq = ++previewSeq, requestedSignature = signature()
  previewBusy.value = true; previewInvalid.value = true; confirmed.value = false; error.value = ''
  const body = { ...accountBody(), operator_id: context[3] }
  if (stage.value !== '') body.level_breakthrough_stage = Number(stage.value)
  const stageChanged = stage.value !== acceptedStage
  const edits = { ...manualQuantities.value }
  if (!stageChanged) body.refunds = Object.fromEntries(Object.entries(quantities.value).map(([id, value]) => [id, Number(value)]))
  const isLatest = () => current() && seq === previewSeq && requestedSignature === signature()
  try {
    let result = await previewOperatorReset(body, context[0])
    if (!isLatest()) return
    // A different breakthrough can change both material IDs and counts; get server defaults before applying manual edits.
    if (stageChanged && result.resources.some(row => Object.hasOwn(edits, row.id) && Number(edits[row.id]) !== row.count)) {
      const refunds = Object.fromEntries(result.resources.map(row => [row.id, Object.hasOwn(edits, row.id) ? Number(edits[row.id]) : row.count]))
      result = await previewOperatorReset({ ...body, refunds }, context[0])
    }
    if (isLatest()) accept(result)
  } catch (err) { if (current() && seq === previewSeq) error.value = readable(err.message || '更新预览失败，请重试') }
  finally { if (current() && seq === previewSeq) previewBusy.value = false }
}
async function openUndo(record) {
  if (!current() || locked.value) return
  if (view.value === 'history') historyScroll = viewScroller()?.scrollTop ?? historyScroll
  invalidateRequest()
  if (changed.value) previewInvalid.value = true
  undoing.value = record; undoData.value = null; undoError.value = ''; undoInvalid.value = true
  busy.value = true
  moveTo('undo')
  try {
    const result = await previewOperatorResetUndo(record.id, accountBody(), context[0])
    if (current()) { undoData.value = result; undoInvalid.value = false }
  } catch (err) { if (current()) undoError.value = readable(err.message || '读取撤销预览失败') }
  finally { if (current()) busy.value = false }
}
function cancelUndo() {
  if (busy.value) return
  if (pending.value) return showHistory()
  undoing.value = null; undoData.value = null; undoError.value = ''
  moveTo('history', historyScroll)
  if (previewInvalid.value && validQuantities.value && data.value) previewTimer = setTimeout(updatePreview, 450)
}
async function submit() {
  if (!canSubmit.value) return
  if (!pending.value) {
    const operation = { body: { ...accountBody(), preview_token: displayData.value.preview_token, ...(view.value === 'reset' ? { confirmed_game_preview: true } : {}) }, id: view.value === 'undo' ? undoing.value.id : undefined, key: crypto.randomUUID() }
    try { saveResetRecovery(recoveryContext, { operation, preview: displayData.value, undoRecord: undoing.value, stage: stage.value, manualQuantities: manualQuantities.value }) }
    catch (err) { if (view.value === 'undo') undoError.value = err.message; else error.value = err.message; return }
    pending.value = operation
  }
  const operation = pending.value
  busy.value = true; closeRequested.value = false
  if (operation.id) undoError.value = ''; else error.value = ''
  try {
    const result = operation.id ? await undoOperatorReset(operation.id, operation.body, context[0]) : await executeOperatorReset(operation.body, operation.key, context[0])
    clearResetRecovery(recoveryContext, operation)
    if (!current()) return
    invalidateRequest()
    pending.value = null; data.value = null; undoing.value = null; undoData.value = null; resultRecord.value = result; closeRequested.value = false
    notice.value = result.undone_at ? '已撤销重置，原练度已恢复，本次返还材料已扣回。' : '已记录重置并增加库存'
    emit('updated')
    moveTo('success')
    loadHistory()
  } catch (err) {
    if (err.status === 409 || err.status === 422) clearResetRecovery(recoveryContext, operation)
    if (!current()) return
    const message = readable(err.message || '提交结果尚未确认，请原样重试')
    if (operation.id) undoError.value = message; else error.value = message
    if (err.status === 409 || err.status === 422) {
      pending.value = null; confirmed.value = false
      if (operation.id) undoInvalid.value = true; else previewInvalid.value = true
    }
  } finally { if (current()) busy.value = false }
}
load(); loadHistory()
</script>

<style scoped>
.reset-mask { display: grid; place-items: center; padding: 16px; box-sizing: border-box; }
.reset-panel { display: flex; flex-direction: column; box-sizing: border-box; width: min(100%, 820px); max-height: calc(var(--modal-viewport-height, 100dvh) - 32px); min-height: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); box-shadow: 0 16px 48px #493b2c29; }
.reset-header { display: flex; align-items: flex-start; gap: 10px; padding: 20px 24px 8px; flex-shrink: 0; }
.identity { flex: 1; min-width: 0; }
h2 { margin: 0; font: 800 23px/1.5 var(--font-s); overflow-wrap: anywhere; }
h3 { margin: 0; font: 700 15px/1.6 var(--font-b); }
p { margin: 6px 0; }
p, label, input, select, button, span, strong { font-size: 14px; line-height: 1.6; }
p, label, input, select, button { font-family: var(--font-b); }
#reset-help { color: var(--ink-60); overflow-wrap: anywhere; }
button, input, select { border: 1px solid var(--line); border-radius: 7px; padding: 7px 12px; background: var(--cream); color: var(--ink); }
button { cursor: pointer; }
button:disabled { opacity: .55; cursor: default; }
button:hover:not(:disabled) { border-color: var(--tea); }
.primary { background: var(--tea); color: var(--on-strong); font-weight: 700; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.icon-button { flex: 0 0 auto; padding: 7px; border-color: transparent; background: transparent; display: inline-flex; }
.icon-button svg { width: 21px; height: 21px; }
.history-entry { display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin-top: 3px; white-space: nowrap; }
.hint { color: var(--ink-60); overflow-wrap: anywhere; }
.error { color: var(--theme-danger-text, var(--rouge)); overflow-wrap: anywhere; }
.reset-form { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.reset-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px 16px; scroll-padding-block: 16px; }
.reset-form > .reset-body { flex: 1; }
.intro { margin-bottom: 14px; }
.growth-panel { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px 20px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 9px; background: var(--cream); }
.growth-summary:only-child { grid-column: 1 / -1; }
.growth-member + .growth-member { margin-top: 10px; }
.member-name { display: block; margin-bottom: 5px; }
.growth-change { display: flex; align-items: center; gap: 16px; margin-top: 8px; }
.growth-change > div { flex: 1; min-width: 0; text-align: center; border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; background: var(--surface); }
.growth-change strong { font-size: 20px; }
.growth-change span, .growth-change small { display: block; }
.growth-change small { font-size: 12px; color: var(--ink-60); }
.growth-change svg { flex-shrink: 0; color: var(--theme-accent-text, var(--accent)); }
.stage-field { min-width: 0; }
.stage-field label { font-weight: 700; }
.stage-field select { width: 100%; box-sizing: border-box; }
.stage-field .hint { font-size: 13px; }
.preserved { grid-column: 1 / -1; margin: 0; font-size: 13px; }
.section-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; margin: 16px 0 6px; }
.section-heading .hint, .experience-hint { font-size: 13px; }
.resource-list { margin: 8px 0; border: 1px solid var(--line); border-radius: 8px; }
.resource-head, .resource-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(140px, .85fr) minmax(0, 1.3fr); gap: 12px; align-items: center; padding: 6px 14px; }
.resource-head { background: var(--cream); color: var(--ink-60); border-radius: 8px 8px 0 0; }
.resource-head span { font-size: 12px; }
.resource-row { border-top: 1px solid var(--line); min-height: 38px; }
.resource-name, .quantity-field { min-width: 0; overflow-wrap: anywhere; }
.resource-name { display: flex; align-items: center; gap: 8px; }
.resource-name img { flex: 0 0 32px; width: 32px; height: 32px; object-fit: contain; }
.resource-name > span { min-width: 0; }
.resource-row input { min-width: 0; width: 100%; box-sizing: border-box; padding: 4px 9px; text-align: right; font-variant-numeric: tabular-nums; }
.balance { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.resource-count { text-align: right; }
.field-error { display: block; font-size: 12px; }
.mobile-resource-help { display: none; }
.money, .history-help { padding: 9px 12px; background: var(--cream); border-radius: 7px; }
.money { color: var(--ink-60); }
.preview-status { color: var(--ink); }
.reset-footer { flex-shrink: 0; padding: 14px 24px max(16px, env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--surface); }
.confirmation { display: flex; align-items: flex-start; gap: 8px; }
.confirmation input { flex-shrink: 0; margin-top: 4px; accent-color: var(--tea); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.confirmation + .actions, .confirm-hint + .actions { margin-top: 12px; }
.confirm-hint { margin-left: 22px; font-size: 12px; }
.undo-warning, .discard-warning { padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); }
.discard-warning { margin: 6px 24px; }
.discard-warning button + button { margin-left: 8px; }
.recovery { display: flex; gap: 8px; flex-wrap: wrap; }
.history { flex: 1; }
.empty-history { display: grid; justify-items: center; padding: 36px 12px; margin: 12px 0; border: 1px solid var(--line); border-radius: 9px; text-align: center; }
.empty-history svg { color: var(--ink-60); margin-bottom: 12px; }
.history article { padding: 14px 0; border-bottom: 1px solid var(--line); }
.record-heading { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.record-heading span { color: var(--ink-60); }
.current-record { background: var(--cream); }
.history-help { margin-top: 16px; }
.success { text-align: center; padding-block: 32px; }
.success svg { color: var(--tea); margin-bottom: 10px; }
.is-short { overflow-y: auto; }
.is-short .reset-form, .is-short .reset-body { flex: none; overflow: visible; }
.is-short .reset-header, .is-short .reset-footer { position: sticky; z-index: 1; background: var(--surface); }
.is-short .reset-header { top: 0; }
.is-short .reset-footer { bottom: 0; }
@media (max-width: 640px) {
  .reset-mask { padding: 0; }
  .reset-panel { width: 100%; height: var(--modal-viewport-height, 100dvh); max-height: var(--modal-viewport-height, 100dvh); border-radius: 0; }
  .reset-header { padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 6px max(12px, env(safe-area-inset-left)); gap: 4px; flex-wrap: wrap; }
  h2 { font-size: 19px; }
  .identity { flex-basis: calc(100% - 90px); }
  .history-entry { order: 1; margin-bottom: 6px; }
  .reset-body { padding: 0 max(12px, env(safe-area-inset-right)) 12px max(12px, env(safe-area-inset-left)); }
  .growth-panel { grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 12px; }
  .growth-change { gap: 14px; }
  .growth-change > div { max-width: 160px; }
  .resource-head { display: none; }
  .resource-row { grid-template-columns: minmax(0, 1fr) minmax(140px, 1fr); gap: 3px 12px; padding: 8px 10px; }
  .resource-row:first-of-type { border-top: 0; }
  .balance { grid-column: 1 / -1; text-align: right; font-size: 13px; }
  .mobile-resource-help { display: block; font-size: 12px; }
  input, select { font-size: 16px; }
  .reset-footer { padding: 10px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); }
  .actions { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; }
  .actions button { padding: 9px 10px; }
  .confirmation { font-size: 13px; }
  .discard-warning { margin-inline: 12px; }
}
</style>
