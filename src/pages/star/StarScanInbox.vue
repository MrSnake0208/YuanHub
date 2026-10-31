<template>
  <section class="scan-inbox" aria-label="MaaYuan 星石识别结果">
    <div class="scan-heading">
      <h2>MaaYuan 本地识别</h2>
      <button type="button" class="btn ghost" :disabled="busy" @click="refresh">刷新待核对结果</button>
    </div>
    <p>采集端只上传识别数据。请对照游戏核对；确认对应旧星石后，可保留其养成计划、佩戴和有效突破状态。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p class="action-feedback" v-if="notice" role="status">{{ notice }}</p>
    <button v-if="retryCommand" type="button" class="btn" :disabled="busy" @click="submit">重试确认同一份导入结果</button>
    <p v-if="!pending.length && !review && !busy">暂无待核对结果。可在 MaaYuan 开启星石同步后采集。</p>
    <ul v-if="!review && pending.length" class="scan-pending">
      <li v-for="item in pending" :key="item.record_id">
        <span>{{ new Date(item.captured_at).toLocaleString() }} · {{ item.entry_count }} 颗 · {{ item.game }}</span>
        <button type="button" class="btn" :disabled="busy || disabled" @click="open(item.record_id)">核对</button>
      </li>
    </ul>
    <form v-if="review" ref="reviewForm" @submit.prevent="submit">
      <p>本次识别 {{ rows.length }} 颗。重复星石或等级发生变化时，请选择它对应的旧星石；误识别的条目可取消勾选。</p>
      <p v-if="rowProblems.size" role="status">还有 {{ rowProblems.size }} 颗星石需要补填或修正。
        <button type="button" class="btn ghost" :disabled="busy" @click="focusFirstProblem">定位第一处</button>
      </p>
      <p v-for="warning in review.report.warnings" :key="warning" class="scan-warning">{{ warning }}</p>
      <fieldset :disabled="busy || disabled || !!retryCommand" class="scan-fields">
        <legend class="sr-only">核对识别结果</legend>
        <div class="scan-rows">
          <fieldset v-for="(row, i) in rows" :key="row.observation_id" class="scan-row" :class="{ 'scan-row-invalid': rowProblems.has(row.observation_id) }" :data-observation-id="row.observation_id">
            <legend>{{ i + 1 }} · {{ row.kind === 'main' ? '主星' : '辅星' }} · {{ row.source }}</legend>
            <label><input v-model="row.included" type="checkbox">保留此条</label>
            <label>名称<select v-model="row.name" data-field="name" :aria-invalid="rowProblems.get(row.observation_id)?.field === 'name'" :disabled="!row.included" @change="row.existing_instance_id = ''">
              <option :value="null">请选择</option><option v-for="name in scanNames(row.kind)" :key="name">{{ name }}</option>
            </select></label>
            <label>品质<select v-model="row.quality" data-field="quality" :aria-invalid="rowProblems.get(row.observation_id)?.field === 'quality'" :disabled="!row.included" @change="row.existing_instance_id = ''">
              <option :value="null">请选择</option><option v-for="(label, value) in SCAN_QUALITIES" :key="value" :value="value">{{ label }}</option>
            </select></label>
            <label>等级<input v-model.number="row.level" data-field="level" :aria-invalid="rowProblems.get(row.observation_id)?.field === 'level'" :disabled="!row.included" type="number" min="1" max="60" step="1"></label>
            <label class="scan-match">对应旧星石<select v-model="row.existing_instance_id" :disabled="!row.included">
              <option value="">作为新增星石</option>
              <option v-for="old in matchingStars(row, review.state.inventory)" :key="old.instance_id" :value="old.instance_id">{{ oldLabel(old) }}</option>
            </select></label>
            <small v-if="row.raw_text">原识别：{{ row.raw_text }}</small>
            <small v-if="rowProblems.has(row.observation_id)" class="scan-warning">{{ rowProblems.get(row.observation_id).message }}</small>
          </fieldset>
        </div>
        <div class="scan-counts">
          <label v-for="(label, key) in experienceLabels" :key="key">{{ label }}<input v-model.number="experience[key]" type="number" min="0" placeholder="保留原值"></label>
          <label>背包数量<input v-model.number="bag.current_count" type="number" min="0" placeholder="保留原值"></label>
          <label>背包容量<input v-model.number="bag.capacity" type="number" min="1" placeholder="保留原值"></label>
        </div>
        <details v-if="removed.length" class="scan-removals">
          <summary>{{ removed.length }} 颗旧星石没有对应，将移除；点击查看</summary>
          <ul><li v-for="old in removed" :key="old.instance_id">{{ oldLabel(old) }}</li></ul>
        </details>
        <label v-if="removed.length" class="scan-confirm"><input v-model="confirmRemovals" type="checkbox">我已核对，同意移除以上旧星石及其计划、佩戴关系</label>
        <p>应用前会保存恢复点。空白数量沿用现有值；突破状态无法确定时仍需手动补录。</p>
        <div class="scan-actions"><button type="submit" class="btn primary">确认核对并导入</button><button type="button" class="btn ghost" @click="review = null">稍后核对</button><button type="button" class="btn ghost" @click="discard">放弃这批结果</button></div>
      </fieldset>
    </form>
    <p v-if="busy" role="status">{{ applying ? '正在导入，请勿关闭页面…' : '正在读取…' }}</p>
    <p v-if="disabled">请先完成当前背包操作并等待同步，再核对导入。</p>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { discardStarScan, getStarScan, listStarScans } from '../../api/starScans.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'
import { AGENT_CATALOG } from '../../data/inventory/catalog.js'
import { matchingStars, scanApplyBody, scanNames, scanRemovals, scanReviewRows, scanRowProblem, SCAN_QUALITIES } from './starScanReview.js'

const props = defineProps({ accountId: { type: String, required: true }, disabled: Boolean, apply: { type: Function, required: true } })
const pending = ref([]), review = ref(null), rows = ref([]), experience = ref({}), bag = ref({})
const busy = ref(false), applying = ref(false), error = ref(''), notice = ref(''), confirmRemovals = ref(false)
const retryCommand = ref(null)
const reviewForm = ref(null)
const rowProblems = computed(() => new Map(rows.value.map(row => [row.observation_id, scanRowProblem(row)]).filter(([, problem]) => problem)))
watch(rowProblems, () => { error.value = '' })
const operatorNames = new Map(AGENT_CATALOG.map(item => [item.id, item.name]))
const slotLabel = slot => slot.replace(/^(main|assist|support)([123])$/, (_value, kind, index) => `${kind === 'main' ? '主星' : '辅星'} ${index}`)
const experienceLabels = { orange: '橙色经验星曜', purple: '紫色经验星曜', white: '白色经验星曜' }
let alive = true, sequence = 0, stopEvents
const removed = computed(() => review.value ? scanRemovals(rows.value, review.value.state.inventory) : [])
watch(() => removed.value.map(old => old.instance_id).join(','), () => { confirmRemovals.value = false })
async function run(action) {
  if (busy.value) return
  const token = ++sequence, account = props.accountId
  const current = () => alive && token === sequence && account === props.accountId
  busy.value = true; error.value = ''
  try { await action(account, current) } catch (failure) {
    if (current()) {
      error.value = failure.message || '操作失败，请重试。'
      if (failure.observationId) void nextTick(() => { if (current()) focusProblem(failure.observationId, failure.field) })
    }
  }
  finally { if (current()) busy.value = false }
}
function focusProblem(id, field) {
  const row = [...(reviewForm.value?.querySelectorAll('[data-observation-id]') || [])].find(element => element.dataset.observationId === id)
  row?.scrollIntoView?.({ block: 'center' })
  row?.querySelector(`[data-field="${field}"]`)?.focus({ preventScroll: true })
}
function focusFirstProblem() {
  const [id, problem] = rowProblems.value.entries().next().value || []
  if (id) focusProblem(id, problem.field)
}
function refresh() { return run(async (account, current) => { const result = await listStarScans(account); if (current()) pending.value = result }) }
function open(id) {
  return run(async (account, current) => {
    const result = await getStarScan(account, id)
    if (!current()) return
    if (result.status !== 'needs_review') throw new Error('本批结果已经处理，请刷新列表。')
    review.value = result; rows.value = scanReviewRows(result)
    experience.value = { ...result.report.experience }; bag.value = { ...result.report.bag }
    confirmRemovals.value = false; notice.value = ''
  })
}
function oldLabel(old) {
  const target = review.value.state.plan_targets[old.instance_id]
  const assignments = review.value.assignments.filter(item => item.instance_id === old.instance_id)
  return `${old.name} · ${SCAN_QUALITIES[old.quality]} · Lv.${old.level} · ${old.instance_id.slice(-8)}` +
    (target != null ? ` · 计划 ${target}` : '') + (old.breakthrough_stage != null ? ` · 突破 ${old.breakthrough_stage}` : '') +
    assignments.map(item => ` · ${operatorNames.get(item.operator_id) || item.operator_id}/${slotLabel(item.slot)}`).join('')
}
function submit() {
  if (props.disabled) return
  return run(async (_account, current) => {
    const body = retryCommand.value?.body || scanApplyBody(review.value, rows.value, experience.value, bag.value, confirmRemovals.value)
    const id = retryCommand.value?.id || review.value.report.record_id
    applying.value = true
    try { await props.apply(id, body) }
    catch (failure) {
      if (current() && ![400, 401, 403, 404, 409, 422].includes(failure.status)) {
        retryCommand.value = { id, body }
        throw new Error('网络中断，导入结果尚未确认。请重试同一份结果，或返回背包查看云端数据。')
      }
      if (current()) retryCommand.value = null
      throw failure
    } finally { if (current()) applying.value = false }
    if (!current()) return
    retryCommand.value = null
    pending.value = pending.value.filter(item => item.record_id !== id); review.value = null
    notice.value = '已导入。返回星石背包即可查看更新后的数据。'
  })
}
function discard() {
  return run(async (account, current) => {
    const id = review.value.report.record_id
    await discardStarScan(account, id)
    if (current()) { pending.value = pending.value.filter(item => item.record_id !== id); review.value = null; notice.value = '已放弃这批结果，原背包未改动。' }
  })
}
onMounted(() => {
  void refresh()
  stopEvents = subscribeAccountEvents(message => {
    if (message.data?.account_id === props.accountId && ['star_scan_ready', 'star_scan_applied', 'account_stream_open'].includes(message.event) && !review.value) void refresh()
  })
})
onBeforeUnmount(() => { alive = false; ++sequence; stopEvents?.() })
</script>

<style scoped>
.scan-inbox { margin-block: 1rem; padding: 1rem; border: 1px solid var(--border-color, #d8d0c3); border-radius: 8px; background: var(--paper, #fffdf8); color: var(--ink, #302b24); }
.scan-heading, .scan-pending li, .scan-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; justify-content: space-between; }
h2 { margin: 0; font-size: 1.1rem; }
p { font-size: .9rem; line-height: 1.6; }
.scan-fields { border: 0; margin: 0; padding: 0; min-width: 0; }
.scan-pending { padding: 0; list-style: none; }.scan-pending li { padding-block: .5rem; }
.scan-rows { max-height: 60vh; overflow: auto; }.scan-row { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; margin: .5rem 0; padding: .75rem; min-width: 0; border: 1px solid var(--border-color, #d8d0c3); }
.scan-row legend { font-size: .8rem; }.scan-row small { flex-basis: 100%; overflow-wrap: anywhere; }
label { display: flex; align-items: center; gap: .4rem; font-size: .9rem; }input, select { min-height: 44px; padding: .35rem; background: var(--paper, #fffdf8); color: inherit; border: 1px solid var(--border-color, #d8d0c3); border-radius: 4px; }
input[type=number] { width: 6rem; }input[type=checkbox] { min-height: 24px; width: 20px; }
.scan-match { flex: 1 1 260px; min-width: 0; }.scan-match select { width: 100%; min-width: 0; }.scan-counts { display: flex; flex-wrap: wrap; gap: .75rem; margin-block: 1rem; }
.scan-removals { margin-block: 1rem; }.scan-confirm { align-items: flex-start; line-height: 1.6; }.scan-actions { justify-content: flex-start; }.scan-warning, [role=alert] { color: var(--danger, #9b312c); }
.scan-row-invalid, [aria-invalid=true] { border-color: var(--danger, #9b312c); }
@media (max-width: 600px) { .scan-heading { align-items: flex-start; }.scan-match { flex-basis: 100%; }.scan-row { gap: .5rem; }.scan-counts label { flex: 1 1 160px; justify-content: space-between; } }
</style>
